'use server';

import { EquipmentTableSnapshot } from '../../equipment-table/types';
import pool from '../postgres';
import { SCHEMA } from '../schema';
import { createClient } from '../supabase-server';

/** 一覧・詳細で共通して取得するヘッダの列（ステータス名も一緒に引く） */
const HEAD_COLUMNS = `
  kizaihyou_id, kizaihyou_cod, koen_nam, basho_nam, kokyaku_nam,
  shukko_dat, nyuko_dat, sts_cod, tanto_nam,
  shinsei_nam, shinsei_his_id, mem, add_dat, upd_dat,
  m_kizaihyou_sts ( sts_nam, chip_color ),
  t_kizaihyou_tanto ( user_id, user_nam, dsp_ord_num )
`;

/**
 * 機材表ヘッダを一覧取得する関数（削除済みは除く）
 * @returns 更新日時の新しい順に並んだ機材表ヘッダ
 */
export const selectKizaihyouList = async () => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou')
      .select(HEAD_COLUMNS)
      .eq('del_flg', 0)
      .order('upd_dat', { ascending: false });
  } catch (e) {
    throw new Error('[selectKizaihyouList] DBエラー:', { cause: e });
  }
};

/**
 * 機材表ヘッダを1件取得する関数
 * @param kizaihyouId 探すkizaihyou_id
 * @returns 機材表ヘッダ（見つからなければdataはnull）
 */
export const selectKizaihyouHead = async (kizaihyouId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou')
      .select(HEAD_COLUMNS)
      .eq('kizaihyou_id', kizaihyouId)
      .eq('del_flg', 0)
      .maybeSingle();
  } catch (e) {
    throw new Error('[selectKizaihyouHead] DBエラー:', { cause: e });
  }
};

/**
 * 機材表の列を表示順に取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 表示順に並んだ列
 */
export const selectKizaihyouColumns = async (kizaihyouId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_column')
      .select('column_id, column_nam, dsp_ord_num')
      .eq('kizaihyou_id', kizaihyouId)
      .order('dsp_ord_num');
  } catch (e) {
    throw new Error('[selectKizaihyouColumns] DBエラー:', { cause: e });
  }
};

/**
 * 機材表の行を表示順に取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 表示順に並んだ行
 */
export const selectKizaihyouRows = async (kizaihyouId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_row')
      .select('row_id, kizai_kind, kizai_id, kizai_nam, mem, spare_qty, dsp_ord_num')
      .eq('kizaihyou_id', kizaihyouId)
      .order('dsp_ord_num');
  } catch (e) {
    throw new Error('[selectKizaihyouRows] DBエラー:', { cause: e });
  }
};

/**
 * 機材表の数量セルを取得する関数
 * @param rowIds 対象の行のrow_id
 * @returns 数量セル（空セルは行が無い）
 */
export const selectKizaihyouQty = async (rowIds: number[]) => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('t_kizaihyou_qty').select('row_id, column_id, qty').in('row_id', rowIds);
  } catch (e) {
    throw new Error('[selectKizaihyouQty] DBエラー:', { cause: e });
  }
};

/** 機材表ヘッダの登録・更新で受け取る値 */
export type KizaihyouHeadInput = {
  koenNam: string;
  bashoNam: string;
  kokyakuNam: string;
  shukkoDat: string | null;
  nyukoDat: string | null;
  mem: string | null;
};

/**
 * 機材表ヘッダを新規登録する関数（ステータスは「作成中」、kizaihyou_codは自動採番）。
 * 受注部担当者（tanto_nam・tanto_user_id）は申請時に決まるので、ここでは入れない。
 *
 * @param head 登録する値
 * @param addUser 作成者名
 * @param copyFromId コピー元のkizaihyou_id（コピー作成でない場合はnull）
 * @returns 登録した機材表ヘッダ
 */
export const insertKizaihyou = async (head: KizaihyouHeadInput, addUser: string, copyFromId: number | null) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou')
      .insert({
        koen_nam: head.koenNam,
        basho_nam: head.bashoNam,
        kokyaku_nam: head.kokyakuNam,
        shukko_dat: head.shukkoDat,
        nyuko_dat: head.nyukoDat,
        mem: head.mem,
        copy_from_id: copyFromId,
        add_user: addUser,
        upd_user: addUser,
      })
      .select('kizaihyou_id, kizaihyou_cod')
      .single();
  } catch (e) {
    throw new Error('[insertKizaihyou] DBエラー:', { cause: e });
  }
};

/**
 * 機材表の状態ステータスを更新する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param stsCod 更新後のsts_cod
 * @param updUser 更新者名
 */
export const updateKizaihyouSts = async (kizaihyouId: number, stsCod: number, updUser: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou')
      .update({ sts_cod: stsCod, upd_user: updUser })
      .eq('kizaihyou_id', kizaihyouId);
  } catch (e) {
    throw new Error('[updateKizaihyouSts] DBエラー:', { cause: e });
  }
};

/** 申請時に受け取る値 */
export type KizaihyouRequestInput = {
  kizaihyouId: number;
  /** 更新後のsts_cod（申請中） */
  stsCod: number;
  /** 受注部担当者名（表示用。複数なら「、」で連結したもの） */
  tantoNam: string;
  /** 申請先に選んだ受注部担当者。この誰か1人が承認すれば承認済になる */
  tanto: { userId: string; userNam: string }[];
  /** 申請者（依頼者）名（表示用スナップショット） */
  shinseiNam: string;
  shinseiUserId: string;
  /** 履歴に残す操作内容 */
  actNam: string;
  /** 申請コメント */
  mem: string | null;
  /** 申請時点の機材表の内容 */
  snapshot: EquipmentTableSnapshot;
};

/**
 * 機材表を申請する関数。
 *
 * 申請の操作履歴（申請時点のスナップショット付き）を残し、ヘッダのステータス・
 * 申請者・申請履歴への参照と、申請先（受注部担当者、複数可）をまとめて更新する。
 * 機材表承認画面はここで残した履歴のスナップショットを表示するので、履歴だけ入って
 * ヘッダが指せていない状態を作らないよう、Supabase-jsではなくpg Poolの
 * トランザクションで行う。
 *
 * 申請先は差戻し後の再申請で選び直せるよう、毎回入れ直す。
 *
 * @param input 申請の内容
 * @returns 残した操作履歴のhis_id
 */
export const requestKizaihyou = async (input: KizaihyouRequestInput) => {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');

    const his = await connection.query<{ his_id: string }>(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_his (kizaihyou_id, act_nam, user_id, user_nam, mem, snapshot)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING his_id`,
      [
        input.kizaihyouId,
        input.actNam,
        input.shinseiUserId,
        input.shinseiNam,
        input.mem,
        JSON.stringify(input.snapshot),
      ]
    );
    const hisId = Number(his.rows[0].his_id);

    await connection.query(
      `UPDATE ${SCHEMA}.t_kizaihyou
          SET sts_cod = $2, tanto_nam = $3,
              shinsei_nam = $4, shinsei_user_id = $5, shinsei_his_id = $6, upd_user = $4
        WHERE kizaihyou_id = $1`,
      [input.kizaihyouId, input.stsCod, input.tantoNam, input.shinseiNam, input.shinseiUserId, hisId]
    );

    await connection.query(`DELETE FROM ${SCHEMA}.t_kizaihyou_tanto WHERE kizaihyou_id = $1`, [input.kizaihyouId]);
    await connection.query(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_tanto (kizaihyou_id, user_id, user_nam, dsp_ord_num)
       SELECT $1, user_id, user_nam, ord
         FROM unnest($2::uuid[], $3::text[], $4::int[]) AS t(user_id, user_nam, ord)`,
      [
        input.kizaihyouId,
        input.tanto.map((tanto) => tanto.userId),
        input.tanto.map((tanto) => tanto.userNam),
        input.tanto.map((_tanto, index) => index + 1),
      ]
    );

    await connection.query('COMMIT');
    return hisId;
  } catch (e) {
    await connection.query('ROLLBACK');
    throw new Error('[requestKizaihyou] DBエラー:', { cause: e });
  } finally {
    connection.release();
  }
};

/**
 * 既存の機材表をコピーして新しい機材表を作る関数。
 *
 * ヘッダのコピーと列・行・数量の複製を1トランザクションで行う。
 * 数量セルの新旧の対応付けは、列・行のdsp_ord_num（表示順）で行う。
 * ステータスは「作成中」に戻り、出庫日・入庫日・受注部担当者は引き継がない
 * （受注部担当者は申請時に選び直す）。
 *
 * @param sourceId コピー元のkizaihyou_id
 * @param addUser 作成者名
 * @returns 作成した機材表のkizaihyou_idとkizaihyou_cod
 */
export const copyKizaihyou = async (sourceId: number, addUser: string) => {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');

    const head = await connection.query<{ kizaihyou_id: string; kizaihyou_cod: string }>(
      `INSERT INTO ${SCHEMA}.t_kizaihyou
              (koen_nam, basho_nam, kokyaku_nam, mem, copy_from_id, add_user, upd_user)
       SELECT koen_nam, basho_nam, kokyaku_nam, mem, kizaihyou_id, $2, $2
         FROM ${SCHEMA}.t_kizaihyou
        WHERE kizaihyou_id = $1
    RETURNING kizaihyou_id, kizaihyou_cod`,
      [sourceId, addUser]
    );
    if (!head.rows.length) throw new Error(`コピー元の機材表が見つかりません (kizaihyou_id=${sourceId})`);
    const newId = Number(head.rows[0].kizaihyou_id);

    await connection.query(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_column (kizaihyou_id, column_nam, dsp_ord_num)
       SELECT $2, column_nam, dsp_ord_num FROM ${SCHEMA}.t_kizaihyou_column WHERE kizaihyou_id = $1`,
      [sourceId, newId]
    );
    await connection.query(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_row
              (kizaihyou_id, kizai_kind, kizai_id, kizai_nam, mem, spare_qty, dsp_ord_num)
       SELECT $2, kizai_kind, kizai_id, kizai_nam, mem, spare_qty, dsp_ord_num
         FROM ${SCHEMA}.t_kizaihyou_row WHERE kizaihyou_id = $1`,
      [sourceId, newId]
    );
    await connection.query(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_qty (row_id, column_id, qty)
       SELECT new_row.row_id, new_col.column_id, q.qty
         FROM ${SCHEMA}.t_kizaihyou_qty q
         JOIN ${SCHEMA}.t_kizaihyou_row    old_row ON old_row.row_id = q.row_id AND old_row.kizaihyou_id = $1
         JOIN ${SCHEMA}.t_kizaihyou_column old_col ON old_col.column_id = q.column_id AND old_col.kizaihyou_id = $1
         JOIN ${SCHEMA}.t_kizaihyou_row    new_row ON new_row.kizaihyou_id = $2
                                                  AND new_row.dsp_ord_num = old_row.dsp_ord_num
         JOIN ${SCHEMA}.t_kizaihyou_column new_col ON new_col.kizaihyou_id = $2
                                                  AND new_col.dsp_ord_num = old_col.dsp_ord_num`,
      [sourceId, newId]
    );

    await connection.query('COMMIT');
    return { kizaihyouId: newId, kizaihyouCod: head.rows[0].kizaihyou_cod };
  } catch (e) {
    await connection.query('ROLLBACK');
    throw new Error('[copyKizaihyou] DBエラー:', { cause: e });
  } finally {
    connection.release();
  }
};

/** 機材表の内容（列・行・数量）の保存で受け取る値 */
export type KizaihyouContentInput = {
  columns: { columnNam: string }[];
  rows: {
    kizaiKind: string;
    kizaiId: number | null;
    kizaiNam: string;
    mem: string;
    spareQty: number;
    /** columnsと同じ並びの数量。未入力はnull */
    qty: (number | null)[];
  }[];
};

/**
 * 機材表のヘッダと内容（列・行・数量）をまとめて保存する関数。
 *
 * 画面はシート全体を一括で編集するため、列・行は毎回作り直す
 * （列を消せば数量セルはcascadeで消える）。ID採番が変わるので、
 * 呼び出し元は保存後に読み直すこと。
 *
 * 複数テーブルにまたがる更新なので、Supabase-jsではなくpg Poolの
 * トランザクションで行う。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param head 更新するヘッダの値
 * @param content 保存する列・行・数量
 * @param updUser 更新者名
 */
export const saveKizaihyouContent = async (
  kizaihyouId: number,
  head: KizaihyouHeadInput,
  content: KizaihyouContentInput,
  updUser: string
) => {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');

    await connection.query(
      `UPDATE ${SCHEMA}.t_kizaihyou
          SET koen_nam = $2, basho_nam = $3, kokyaku_nam = $4,
              shukko_dat = $5, nyuko_dat = $6, mem = $7, upd_user = $8
        WHERE kizaihyou_id = $1`,
      [kizaihyouId, head.koenNam, head.bashoNam, head.kokyakuNam, head.shukkoDat, head.nyukoDat, head.mem, updUser]
    );

    await connection.query(`DELETE FROM ${SCHEMA}.t_kizaihyou_column WHERE kizaihyou_id = $1`, [kizaihyouId]);
    await connection.query(`DELETE FROM ${SCHEMA}.t_kizaihyou_row WHERE kizaihyou_id = $1`, [kizaihyouId]);

    // unnestで列・行をまとめてINSERTする。RETURNINGの並び順は保証されないため、
    // dsp_ord_numも一緒に受け取って画面の並び（配列のindex）に対応付ける。
    const byOrder = <T extends { dsp_ord_num: number }>(rows: T[]) =>
      [...rows].sort((a, b) => a.dsp_ord_num - b.dsp_ord_num);

    const columnIds = content.columns.length
      ? byOrder(
          (
            await connection.query<{ column_id: string; dsp_ord_num: number }>(
              `INSERT INTO ${SCHEMA}.t_kizaihyou_column (kizaihyou_id, column_nam, dsp_ord_num)
               SELECT $1, nam, ord
                 FROM unnest($2::text[], $3::int[]) AS t(nam, ord)
            RETURNING column_id, dsp_ord_num`,
              [kizaihyouId, content.columns.map((c) => c.columnNam), content.columns.map((_, i) => i + 1)]
            )
          ).rows
        ).map((r) => Number(r.column_id))
      : [];

    const rowIds = content.rows.length
      ? byOrder(
          (
            await connection.query<{ row_id: string; dsp_ord_num: number }>(
              `INSERT INTO ${SCHEMA}.t_kizaihyou_row
                      (kizaihyou_id, kizai_kind, kizai_id, kizai_nam, mem, spare_qty, dsp_ord_num)
               SELECT $1, kind, kizai_id, nam, mem, spare, ord
                 FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::int[], $7::int[])
                      AS t(kind, kizai_id, nam, mem, spare, ord)
            RETURNING row_id, dsp_ord_num`,
              [
                kizaihyouId,
                content.rows.map((r) => r.kizaiKind),
                content.rows.map((r) => r.kizaiId),
                content.rows.map((r) => r.kizaiNam),
                content.rows.map((r) => r.mem),
                content.rows.map((r) => r.spareQty),
                content.rows.map((_, i) => i + 1),
              ]
            )
          ).rows
        ).map((r) => Number(r.row_id))
      : [];

    // 空セルはレコードを作らない
    const qtyRowIds: number[] = [];
    const qtyColumnIds: number[] = [];
    const qtyValues: number[] = [];
    content.rows.forEach((row, rowIndex) => {
      row.qty.forEach((value, columnIndex) => {
        if (value === null || columnIds[columnIndex] === undefined) return;
        qtyRowIds.push(rowIds[rowIndex]);
        qtyColumnIds.push(columnIds[columnIndex]);
        qtyValues.push(value);
      });
    });

    if (qtyRowIds.length) {
      await connection.query(
        `INSERT INTO ${SCHEMA}.t_kizaihyou_qty (row_id, column_id, qty)
         SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::int[])`,
        [qtyRowIds, qtyColumnIds, qtyValues]
      );
    }

    await connection.query('COMMIT');
  } catch (e) {
    await connection.query('ROLLBACK');
    throw new Error('[saveKizaihyouContent] DBエラー:', { cause: e });
  } finally {
    connection.release();
  }
};
