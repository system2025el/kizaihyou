'use server';

import { DatabaseError } from 'pg';

import {
  KIKIKAN_BASHO_ID,
  KIKIKAN_HONBANBI_SHUBETU_ID,
  KIKIKAN_JUCHU_KIZAI_HEAD_KBN,
  KIKIKAN_NYUSHUKO_SHUBETU_ID,
  KIKIKAN_SAGYO_KBN_ID,
} from './constants';
import { KIKIKAN_SCHEMA, kikikanPool } from './postgres-kikikan';

/** 明細1行分。数量は機材表の内容から作る */
export type KikikanJuchuKizaiRow = {
  kizaiId: number;
  /** 機材本来の所属（m_kizai.shozoku_id）。YARD以外なら移動伝票を作る */
  kizaiShozokuId: number;
  /** 単価（m_kizai.reg_amt） */
  tankaAmt: number;
  /** 受注数（機材表のACTIVE合計） */
  planKizaiQty: number;
  /** 予備数（機材表のSPARE） */
  planYobiQty: number;
  mem: string | null;
};

export type KikikanJuchuKizaiInput = {
  juchuHeadId: number;
  /** 受注機材ヘッダーの名前。機材表の公演名を入れる */
  headNam: string;
  /** 出庫日・入庫日（YYYY-MM-DD） */
  shukoDat: string;
  nyukoDat: string;
  /** 本番日数。機材表は本番日を持たないので0（kikikanも本番日が無ければ0になる） */
  honbanbiQty: number;
  addUser: string;
  rows: KikikanJuchuKizaiRow[];
};

const isUniqueViolation = (e: unknown) => e instanceof DatabaseError && e.code === '23505';
const RETRY_COUNT = 5;

/**
 * JSTの0時をtimestamptzにするSQL式。
 * kikikanは日付をJSTの0時として保存している（例: 出庫日9/1 → 2026-08-31T15:00:00Z）ので合わせる。
 */
const JST_MIDNIGHT = (param: string) => `(${param}::date::timestamp AT TIME ZONE 'Asia/Tokyo')`;

/**
 * kikikanに受注機材ヘッダーと機材明細一式を作る関数。
 *
 * kikikanのコピー作成（juchuMeisaiCopy）と同じ構成で、次を1トランザクションで入れる。
 *   1. t_juchu_kizai_head      受注機材ヘッダー
 *   2. t_juchu_kizai_nyushuko  入出庫（YARDの出庫日・入庫日）
 *   3. t_juchu_kizai_honbanbi  使用日カレンダー（**在庫の引き当てはこれで効く**）
 *   4. t_juchu_kizai_meisai    機材明細
 *   5. t_nyushuko_den          作業伝票（明細×3：出庫ピッキング/出庫最終確認/入庫カウント）
 *   6. t_ido_den_juchu         移動伝票（KICS所属の機材のみ×2：移動出庫/移動入庫）
 *
 * **出庫はYARD固定**。KICS所属の機材はYARDへ移動してから出す前提で、移動日は出庫日にする。
 * 実際にKICSから出す場合は、受注部がkikikanの機材明細画面で選び直す運用。
 *
 * @param input 受注機材ヘッダーと明細の内容
 * @returns 採番されたjuchu_kizai_head_id
 */
export const insertKikikanJuchuKizai = async (input: KikikanJuchuKizaiInput): Promise<number> => {
  for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
    const connection = await kikikanPool.connect();
    try {
      await connection.query('BEGIN');

      // 受注機材ヘッダーidは受注内の連番
      const maxHead = await connection.query<{ max_id: number | null }>(
        `SELECT max(juchu_kizai_head_id) AS max_id FROM ${KIKIKAN_SCHEMA}.t_juchu_kizai_head WHERE juchu_head_id = $1`,
        [input.juchuHeadId]
      );
      const juchuKizaiHeadId = Number(maxHead.rows[0].max_id ?? 0) + 1;

      // 1. 受注機材ヘッダー
      await connection.query(
        `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_kizai_head
                (juchu_head_id, juchu_kizai_head_id, juchu_kizai_head_kbn, head_nam,
                 juchu_honbanbi_qty, ht_kbn, oya_juchu_kizai_head_id, add_dat, add_user)
         VALUES ($1, $2, $3, $4, $5, 0, NULL, now(), $6)`,
        [
          input.juchuHeadId,
          juchuKizaiHeadId,
          KIKIKAN_JUCHU_KIZAI_HEAD_KBN.normal,
          input.headNam,
          input.honbanbiQty,
          input.addUser,
        ]
      );

      // 2. 入出庫（YARDのみ。KICSから出す場合は受注部がkikikan側で足す）
      await connection.query(
        `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_kizai_nyushuko
                (juchu_head_id, juchu_kizai_head_id, nyushuko_shubetu_id, nyushuko_basho_id, nyushuko_dat, add_dat, add_user)
         VALUES ($1, $2, $3, $5, ${JST_MIDNIGHT('$6')}, now(), $8),
                ($1, $2, $4, $5, ${JST_MIDNIGHT('$7')}, now(), $8)`,
        [
          input.juchuHeadId,
          juchuKizaiHeadId,
          KIKIKAN_NYUSHUKO_SHUBETU_ID.shuko,
          KIKIKAN_NYUSHUKO_SHUBETU_ID.nyuko,
          KIKIKAN_BASHO_ID.yard,
          input.shukoDat,
          input.nyukoDat,
          input.addUser,
        ]
      );

      // 3. 使用日カレンダー（種別1=出庫日〜入庫日の全日、2=出庫日、3=入庫日）
      await connection.query(
        `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_kizai_honbanbi
                (juchu_head_id, juchu_kizai_head_id, juchu_honbanbi_shubetu_id, juchu_honbanbi_dat,
                 juchu_honbanbi_add_qty, mem, add_dat, add_user)
         SELECT $1, $2, $3, d::date, 0, '', now(), $6
           FROM generate_series($4::date, $5::date, interval '1 day') AS d`,
        [
          input.juchuHeadId,
          juchuKizaiHeadId,
          KIKIKAN_HONBANBI_SHUBETU_ID.use,
          input.shukoDat,
          input.nyukoDat,
          input.addUser,
        ]
      );
      await connection.query(
        `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_kizai_honbanbi
                (juchu_head_id, juchu_kizai_head_id, juchu_honbanbi_shubetu_id, juchu_honbanbi_dat,
                 juchu_honbanbi_add_qty, mem, add_dat, add_user)
         VALUES ($1, $2, $3, $5::date, 0, '', now(), $7),
                ($1, $2, $4, $6::date, 0, '', now(), $7)`,
        [
          input.juchuHeadId,
          juchuKizaiHeadId,
          KIKIKAN_HONBANBI_SHUBETU_ID.shuko,
          KIKIKAN_HONBANBI_SHUBETU_ID.nyuko,
          input.shukoDat,
          input.nyukoDat,
          input.addUser,
        ]
      );

      if (input.rows.length) {
        const meisaiIds = input.rows.map((_row, index) => index + 1);
        const kizaiIds = input.rows.map((row) => row.kizaiId);
        const tankaAmts = input.rows.map((row) => row.tankaAmt);
        const kizaiQtys = input.rows.map((row) => row.planKizaiQty);
        const yobiQtys = input.rows.map((row) => row.planYobiQty);
        const mems = input.rows.map((row) => row.mem);
        const planQtys = input.rows.map((row) => row.planKizaiQty + row.planYobiQty);

        // 4. 機材明細。出庫元はYARD固定なのでshozoku_idはYARD
        await connection.query(
          `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_kizai_meisai
                  (juchu_head_id, juchu_kizai_head_id, juchu_kizai_meisai_id, kizai_id, kizai_tanka_amt,
                   plan_kizai_qty, plan_yobi_qty, mem, mem2, keep_qty, shozoku_id, dsp_ord_num, indent_num,
                   add_dat, add_user)
           SELECT $1, $2, t.meisai_id, t.kizai_id, t.tanka, t.kizai_qty, t.yobi_qty, t.mem, NULL, NULL,
                  $3, t.meisai_id, 0, now(), $4
             FROM unnest($5::int[], $6::int[], $7::numeric[], $8::int[], $9::int[], $10::text[])
                  AS t(meisai_id, kizai_id, tanka, kizai_qty, yobi_qty, mem)`,
          [
            input.juchuHeadId,
            juchuKizaiHeadId,
            KIKIKAN_BASHO_ID.yard,
            input.addUser,
            meisaiIds,
            kizaiIds,
            tankaAmts,
            kizaiQtys,
            yobiQtys,
            mems,
          ]
        );

        // 5. 作業伝票。出庫はYARDの出庫日、入庫はYARDの入庫日
        await connection.query(
          `INSERT INTO ${KIKIKAN_SCHEMA}.t_nyushuko_den
                  (juchu_head_id, juchu_kizai_head_id, juchu_kizai_meisai_id, sagyo_kbn_id, sagyo_den_dat,
                   sagyo_id, kizai_id, plan_qty, dsp_ord_num, indent_num, add_dat, add_user)
           SELECT $1, $2, t.meisai_id, k.sagyo_kbn_id,
                  CASE WHEN k.is_shuko THEN ${JST_MIDNIGHT('$6')} ELSE ${JST_MIDNIGHT('$7')} END,
                  $3, t.kizai_id, t.plan_qty, t.meisai_id, 0, now(), $4
             FROM unnest($8::int[], $9::int[], $10::int[]) AS t(meisai_id, kizai_id, plan_qty)
             CROSS JOIN (VALUES ($5::int, true), ($11::int, true), ($12::int, false))
                  AS k(sagyo_kbn_id, is_shuko)`,
          [
            input.juchuHeadId,
            juchuKizaiHeadId,
            KIKIKAN_BASHO_ID.yard,
            input.addUser,
            KIKIKAN_SAGYO_KBN_ID.shukoPicking,
            input.shukoDat,
            input.nyukoDat,
            meisaiIds,
            kizaiIds,
            planQtys,
            KIKIKAN_SAGYO_KBN_ID.shukoConfirmation,
            KIKIKAN_SAGYO_KBN_ID.nyukoCount,
          ]
        );

        // 6. 移動伝票。KICS所属の機材をYARDへ移してから出す（移動日は出庫日）
        const idoRows = input.rows.filter((row) => row.kizaiShozokuId === KIKIKAN_BASHO_ID.kics);
        if (idoRows.length) {
          const maxIdo = await connection.query<{ max_id: number | null }>(
            `SELECT max(ido_den_id) AS max_id FROM ${KIKIKAN_SCHEMA}.t_ido_den_juchu`
          );
          const firstIdoDenId = Number(maxIdo.rows[0].max_id ?? 0) + 1;

          await connection.query(
            `INSERT INTO ${KIKIKAN_SCHEMA}.t_ido_den_juchu
                    (ido_den_id, sagyo_den_dat, sagyo_siji_id, sagyo_id, sagyo_kbn_id,
                     kizai_id, plan_qty, juchu_head_id, juchu_kizai_head_id, add_dat, add_user)
             SELECT $1 + t.ord, $2::date, $3, k.sagyo_id, k.sagyo_kbn_id,
                    t.kizai_id, t.plan_qty, $4, $5, now(), $6
               FROM unnest($7::int[], $8::int[], $9::int[]) AS t(ord, kizai_id, plan_qty)
               CROSS JOIN (VALUES ($10::int, $11::int), ($12::int, $13::int))
                    AS k(sagyo_kbn_id, sagyo_id)`,
            [
              firstIdoDenId,
              input.shukoDat,
              KIKIKAN_BASHO_ID.kics, // sagyo_siji_id: 移動元＝KICS（1=KICS→YARD）
              input.juchuHeadId,
              juchuKizaiHeadId,
              input.addUser,
              idoRows.map((_row, index) => index),
              idoRows.map((row) => row.kizaiId),
              idoRows.map((row) => row.planKizaiQty + row.planYobiQty),
              KIKIKAN_SAGYO_KBN_ID.idoShuko,
              KIKIKAN_BASHO_ID.kics,
              KIKIKAN_SAGYO_KBN_ID.idoNyuko,
              KIKIKAN_BASHO_ID.yard,
            ]
          );
        }
      }

      await connection.query('COMMIT');
      return juchuKizaiHeadId;
    } catch (e) {
      await connection.query('ROLLBACK');
      // 採番が衝突しただけならやり直す
      if (isUniqueViolation(e) && attempt < RETRY_COUNT - 1) continue;
      throw new Error('[insertKikikanJuchuKizai] kikikanのDBエラー:', { cause: e });
    } finally {
      connection.release();
    }
  }

  throw new Error('[insertKikikanJuchuKizai] 採番が繰り返し衝突しました');
};

/** この機材表から機材管理に立てた引き当て（機材ごと・日付ごとの数量） */
export type KikikanAllocation = {
  kizaiId: number;
  /** 受注数＋予備数 */
  qty: number;
  /** 引き当てが効いている日（YYYY-MM-DD） */
  dats: string[];
};

/**
 * 指定した受注機材ヘッダーの引き当てを取得する関数（参照のみ）。
 *
 * 機材表承認画面の在庫は「機材管理の在庫 − 機材表の要求数」で出しているが、
 * 機材管理へ連携した後はあちらにも引き当てが立つので二重に引かれてしまう。
 * それを戻すために、この受注機材ヘッダーが持っている数量を機材ごとに返す。
 *
 * 日付は`t_juchu_kizai_honbanbi`の**種別を問わないDISTINCT**。
 * 機材管理の在庫ビュー（v_zaiko_qty）が同じ取り方をしているのに合わせる。
 *
 * @param juchuHeadId 受注番号
 * @param juchuKizaiHeadId 受注機材ヘッダーID
 * @returns 機材ごとの引き当て
 */
export const selectKikikanAllocation = async (
  juchuHeadId: number,
  juchuKizaiHeadId: number
): Promise<KikikanAllocation[]> => {
  try {
    const { rows } = await kikikanPool.query<{ kizai_id: number; qty: string; dats: string[] }>(
      `SELECT m.kizai_id,
              sum(coalesce(m.plan_kizai_qty, 0) + coalesce(m.plan_yobi_qty, 0))::text AS qty,
              (SELECT array_agg(DISTINCT to_char(b.juchu_honbanbi_dat, 'YYYY-MM-DD'))
                 FROM ${KIKIKAN_SCHEMA}.t_juchu_kizai_honbanbi b
                WHERE b.juchu_head_id = $1 AND b.juchu_kizai_head_id = $2) AS dats
         FROM ${KIKIKAN_SCHEMA}.t_juchu_kizai_meisai m
        WHERE m.juchu_head_id = $1 AND m.juchu_kizai_head_id = $2
        GROUP BY m.kizai_id`,
      [juchuHeadId, juchuKizaiHeadId]
    );
    return rows.map((row) => ({ kizaiId: row.kizai_id, qty: Number(row.qty), dats: row.dats ?? [] }));
  } catch (e) {
    throw new Error('[selectKikikanAllocation] kikikanのDBエラー:', { cause: e });
  }
};
