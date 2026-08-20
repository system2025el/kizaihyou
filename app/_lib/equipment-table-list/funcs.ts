'use server';

import { requireCurrentUser } from '../auth/funcs';
import { hasPermission, PERMISSION } from '../auth/permission';
import { CurrentUser } from '../auth/types';
import {
  KIKIKAN_FIXED_KOKYAKU_ID,
  KIKIKAN_FIXED_NYURYOKU_USER,
  KIKIKAN_HONBANBI_QTY_DEFAULT,
  KIKIKAN_JUCHU_STS_NYURYOKU,
  KIKIKAN_ZEI_KBN_SOTOZEI,
} from '../db/kikikan/constants';
import { selectKikikanKizaiForJuchu } from '../db/kikikan/m-kizai';
import { insertKikikanJuchuHead, selectKikikanJuchuHead } from '../db/kikikan/t-juchu-head';
import { insertKikikanJuchuKizai, KikikanJuchuKizaiRow } from '../db/kikikan/t-juchu-kizai';
import { selectUserList } from '../db/tables/m-user';
import {
  copyKizaihyou,
  requestKizaihyou,
  selectKizaihyouHead,
  selectKizaihyouList,
  updateKizaihyouJuchuLink,
  updateKizaihyouSts,
} from '../db/tables/t-kizaihyou';
import { insertKizaihyouHis, selectKizaihyouHisSnapshotFlags } from '../db/tables/t-kizaihyou-his';
import { fetchEquipmentTable } from '../equipment-table/funcs';
import { getActiveSum } from '../equipment-table/sheet';
import { formatDate, formatDateTime, todayInJst } from '../format';
import {
  EquipmentTableListRow,
  EquipmentTableStatus,
  EquipmentTableStatusColor,
  JuchuTantoOption,
  KIZAIHYOU_ACT,
  KIZAIHYOU_STS,
} from './types';

const STATUS_NAMES: EquipmentTableStatus[] = ['作成中', '申請中', '差戻し', '承認済', '取下げ'];
const STATUS_COLORS: EquipmentTableStatusColor[] = ['default', 'info', 'error', 'success', 'warning'];

const toStatus = (value: string | undefined): EquipmentTableStatus =>
  STATUS_NAMES.find((name) => name === value) ?? '作成中';

const toStatusColor = (value: string | undefined): EquipmentTableStatusColor =>
  STATUS_COLORS.find((color) => color === value) ?? 'default';

/**
 * 機材表履歴一覧に表示する機材表を取得する関数。
 *
 * **操作履歴は含めない**。履歴は機材表1件あたり際限なく増えるので、全機材表分を
 * 先読みすると一覧を開くだけで重くなる（定期的に取り直すなら尚更）。
 * 履歴が要るのは履歴ダイアログを開いたときだけなので、そこで
 * `fetchEquipmentTableHistory`を呼ぶこと。
 *
 * @returns 更新日時の新しい順に並んだ機材表
 */
export const fetchEquipmentTableList = async (): Promise<EquipmentTableListRow[]> => {
  const { data, error } = await selectKizaihyouList();
  if (error) throw new Error(`[fetchEquipmentTableList] 機材表の取得に失敗しました: ${error.message}`);
  if (!data?.length) return [];

  // 「申請/承認された内容を開く」アイコンを出すかの判定に、申請履歴の分だけ有無を引く
  const shinseiHisIds = data.map((head) => head.shinsei_his_id).filter((hisId): hisId is number => hisId !== null);
  const { data: flags, error: flagError } = shinseiHisIds.length
    ? await selectKizaihyouHisSnapshotFlags(shinseiHisIds)
    : { data: [], error: null as null };
  if (flagError) throw new Error(`[fetchEquipmentTableList] 申請履歴の取得に失敗しました: ${flagError.message}`);

  const hasSnapshotByHisId = new Map((flags ?? []).map((flag) => [flag.his_id, flag.snapshot_flg === 1]));

  return data.map((head) => {
    return {
      id: head.kizaihyou_id,
      cod: head.kizaihyou_cod,
      eventName: head.koen_nam,
      place: head.basho_nam ?? '',
      clientName: head.kokyaku_nam ?? '',
      createdAt: formatDateTime(head.add_dat),
      updatedAt: formatDateTime(head.upd_dat),
      shippedAt: formatDate(head.shukko_dat),
      returnedAt: formatDate(head.nyuko_dat),
      status: toStatus(head.m_kizaihyou_sts?.sts_nam),
      statusColor: toStatusColor(head.m_kizaihyou_sts?.chip_color),
      salesStaffName: head.tanto_nam,
      requesterName: head.shinsei_nam,
      tantoUserIds: [...(head.t_kizaihyou_tanto ?? [])]
        .sort((a, b) => a.dsp_ord_num - b.dsp_ord_num)
        .map((tanto) => tanto.user_id),
      juchuHeadId: head.juchu_head_id,
      juchuLinked: head.juchu_kizai_head_id !== null,
      shinseiHisId:
        head.shinsei_his_id !== null && hasSnapshotByHisId.get(head.shinsei_his_id) ? head.shinsei_his_id : null,
    };
  });
};

/**
 * 既存の機材表をコピーして新規作成する関数
 * @param sourceId コピー元のkizaihyou_id
 * @param sourceCod コピー元の機材表ID（履歴に残す表示用の値）
 * @returns 作成した機材表のkizaihyou_id
 */
export const copyEquipmentTable = async (sourceId: number, sourceCod: string): Promise<number> => {
  const user = await requireCurrentUser();
  const { kizaihyouId } = await copyKizaihyou(sourceId, user.userNam);

  const { error } = await insertKizaihyouHis(
    kizaihyouId,
    KIZAIHYOU_ACT.新規作成,
    `${sourceCod}からコピーして新規作成`,
    user.userId,
    user.userNam,
    null
  );
  if (error) throw new Error(`[copyEquipmentTable] 操作履歴の登録に失敗しました: ${error.message}`);

  return kizaihyouId;
};

/**
 * 機材表のステータスを変更し、操作履歴を残す関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param status 変更後のステータス
 * @param actNam 履歴に残す操作内容
 * @param comment 承認・差戻し時のコメント
 */
const changeStatus = async (
  kizaihyouId: number,
  status: EquipmentTableStatus,
  actCod: number,
  actNam: string,
  comment: string | null
) => {
  const user = await requireCurrentUser();

  const { error } = await updateKizaihyouSts(kizaihyouId, KIZAIHYOU_STS[status], user.userNam);
  if (error) throw new Error(`[changeStatus] ステータスの更新に失敗しました: ${error.message}`);

  const { error: hisError } = await insertKizaihyouHis(kizaihyouId, actCod, actNam, user.userId, user.userNam, comment);
  if (hisError) throw new Error(`[changeStatus] 操作履歴の登録に失敗しました: ${hisError.message}`);
};

/**
 * 申請先に選べる受注部担当者を取得する関数。
 * 権限はビットマスクで、PostgRESTではビット演算ができないため、
 * 有効なユーザーを取得してからここで絞り込む。
 *
 * @returns 表示順に並んだ受注部担当者
 */
export const fetchJuchuTantoOptions = async (): Promise<JuchuTantoOption[]> => {
  const { data, error } = await selectUserList();
  if (error) throw new Error(`[fetchJuchuTantoOptions] ユーザーの取得に失敗しました: ${error.message}`);

  return (data ?? [])
    .filter((user) => hasPermission(user.permission, PERMISSION.juchu_tanto))
    .map((user) => ({ userId: user.user_id, userNam: user.user_nam }));
};

/**
 * 機材表を申請する関数。申請先の受注部担当者と申請者をヘッダに確定させ、
 * 申請時点のスナップショット付きで操作履歴を残す。
 *
 * 申請後も申請者は機材表を編集できるので、機材表承認画面はこのスナップショットを
 * 表示する（現在の内容を見せると承認した内容と申請された内容が食い違う）。
 *
 * 申請先は複数指定できる。**そのうち1人が承認すれば承認済**になる運用で、
 * 全員の承認は要らない（誰が承認したかは操作履歴に残る）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param tantoUserIds 申請先に選んだ受注部担当者のuser_id（1件以上）
 * @param comment 申請コメント
 */
export const requestEquipmentTable = async (kizaihyouId: number, tantoUserIds: string[], comment: string) => {
  const user = await requireCurrentUser();

  // 画面から渡ったuser_idをそのまま信用せず、権限のある人かを取り直して確かめる
  const options = await fetchJuchuTantoOptions();
  const tanto = options.filter((option) => tantoUserIds.includes(option.userId));
  if (!tanto.length) throw new Error('[requestEquipmentTable] 受注部担当者を1人以上選んでください');
  if (tanto.length !== new Set(tantoUserIds).size)
    throw new Error('[requestEquipmentTable] 受注部担当者として選べないユーザーが含まれています');

  // 呼び出し元が直前に保存しているので、画面から受け取り直さずDBから読み直す
  const detail = await fetchEquipmentTable(kizaihyouId);
  if (!detail) throw new Error('[requestEquipmentTable] 機材表が見つかりません');

  const tantoNam = tanto.map((option) => option.userNam).join('、');

  await requestKizaihyou({
    kizaihyouId,
    stsCod: KIZAIHYOU_STS['申請中'],
    tantoNam,
    tanto,
    shinseiNam: user.userNam,
    shinseiUserId: user.userId,
    actCod: KIZAIHYOU_ACT.申請,
    // 申請先はコメント欄ではなくact_namに残す（コピー作成の履歴と同じ書き方）
    actNam: `申請（受注部担当者：${tantoNam}）`,
    mem: comment || null,
    snapshot: { head: detail.head, columns: detail.columns, rows: detail.rows },
  });
};

/**
 * 申請者が自分の申請を取り下げる関数。
 * 差戻しと同じく編集できる状態に戻り、再申請もできる。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 取り下げコメント
 */
export const withdrawEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await changeStatus(kizaihyouId, '取下げ', KIZAIHYOU_ACT.取り下げ, '取り下げ', comment || null);
};

/**
 * 機材表申請依頼一覧に出す機材表を取得する関数。
 * 申請中のうち、**ログイン中のユーザーが申請先に含まれるものだけ**を返す。
 *
 * @returns 自分あてに申請されている機材表
 */
export const fetchApprovalRequestList = async (): Promise<EquipmentTableListRow[]> => {
  const user = await requireCurrentUser();
  const rows = await fetchEquipmentTableList();
  return rows.filter((row) => row.status === '申請中' && row.tantoUserIds.includes(user.userId));
};

/**
 * 承認・差戻しができるユーザーかを確かめる関数。
 *
 * 申請先には複数の受注部担当者を指定でき、そのうち1人が承認すれば承認済になる。
 * 逆に、申請先に入っていない人は承認も差戻しもできない。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 */
const requireJuchuTanto = async (kizaihyouId: number) => {
  const user = await requireCurrentUser();

  const { data, error } = await selectKizaihyouHead(kizaihyouId);
  if (error) throw new Error(`[requireJuchuTanto] 機材表の取得に失敗しました: ${error.message}`);
  if (!data) throw new Error('[requireJuchuTanto] 機材表が見つかりません');

  const isTanto = (data.t_kizaihyou_tanto ?? []).some((tanto) => tanto.user_id === user.userId);
  if (!isTanto) throw new Error('[requireJuchuTanto] 承認・差戻しができるのは申請先の受注部担当者だけです');

  return user;
};

/** 既存の受注番号に紐づけるときの照合結果 */
export type KikikanJuchuCheck = {
  /** その受注番号がkikikanにあるか */
  found: boolean;
  koenNam: string;
  koenbashoNam: string;
  kokyakuNam: string;
  nyuryokuUser: string;
  /** 機材表の内容と食い違う項目。**kikikan側は更新しない**ので、表示だけして判断してもらう */
  mismatches: { label: string; kizaihyou: string; kikikan: string }[];
};

/**
 * 既存の受注番号に機材明細を追加してよいかを照合する関数（参照のみ）。
 *
 * 公演名・場所・顧客名・入力者が機材表と食い違っていても**kikikan側は更新しない**。
 * 承認者が違いを見たうえで紐づけるか判断するための材料を返すだけ。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param juchuHeadId 紐づけ先の受注番号
 * @returns 照合結果
 */
export const checkKikikanJuchuLink = async (kizaihyouId: number, juchuHeadId: number): Promise<KikikanJuchuCheck> => {
  await requireJuchuTanto(kizaihyouId);

  const juchu = await selectKikikanJuchuHead(juchuHeadId);
  if (!juchu) {
    return { found: false, koenNam: '', koenbashoNam: '', kokyakuNam: '', nyuryokuUser: '', mismatches: [] };
  }

  const { data: head, error } = await selectKizaihyouHead(kizaihyouId);
  if (error) throw new Error(`[checkKikikanJuchuLink] 機材表の取得に失敗しました: ${error.message}`);
  if (!head) throw new Error('[checkKikikanJuchuLink] 機材表が見つかりません');

  // 顧客と入力者は機材表側が固定値なので、その固定値と比べる
  const pairs = [
    { label: '公演名', kizaihyou: head.koen_nam, kikikan: juchu.koenNam },
    { label: '公演場所', kizaihyou: head.basho_nam ?? '', kikikan: juchu.koenbashoNam },
    { label: '顧客名', kizaihyou: head.kokyaku_nam ?? '', kikikan: juchu.kokyakuNam },
    { label: '入力者', kizaihyou: KIKIKAN_FIXED_NYURYOKU_USER, kikikan: juchu.nyuryokuUser },
  ];

  return {
    found: true,
    koenNam: juchu.koenNam,
    koenbashoNam: juchu.koenbashoNam,
    kokyakuNam: juchu.kokyakuNam,
    nyuryokuUser: juchu.nyuryokuUser,
    mismatches: pairs.filter((pair) => pair.kizaihyou.trim() !== pair.kikikan.trim()),
  };
};

/** 承認の結果。kikikanへの連携は承認とは別トランザクションなので個別に返す */
export type ApproveResult = {
  /** kikikanに作った受注番号。既に連携済み・作成に失敗した場合はnull */
  juchuHeadId: number | null;
  /** kikikanに登録した機材明細の件数 */
  meisaiCount: number;
  /** 機材マスタに紐づかず連携できなかった行の数（手入力の名称） */
  skippedRowCount: number;
  /** kikikanへの連携に失敗した場合の理由（承認自体は成立している） */
  kikikanError: string | null;
};

/**
 * 承認した機材表からkikikanに受注ヘッダー（伝票）を作る関数。
 *
 * 顧客と入力者は運用が固まるまで固定値。既に連携済みなら何もしない。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userNam 承認者名（機材表側の更新者として記録する）
 * @returns 作成した受注番号。既に連携済みならnull
 */
const createKikikanJuchu = async (kizaihyouId: number, userNam: string): Promise<number | null> => {
  const { data: head, error } = await selectKizaihyouHead(kizaihyouId);
  if (error) throw new Error(`[createKikikanJuchu] 機材表の取得に失敗しました: ${error.message}`);
  if (!head) throw new Error('[createKikikanJuchu] 機材表が見つかりません');

  // 二重作成の防止。再承認などで既に伝票があるなら作らない
  if (head.juchu_head_id !== null) return null;

  const juchuHeadId = await insertKikikanJuchuHead({
    koenNam: head.koen_nam,
    koenbashoNam: head.basho_nam,
    kokyakuId: KIKIKAN_FIXED_KOKYAKU_ID,
    juchuDat: todayInJst(),
    juchuStrDat: head.shukko_dat,
    juchuEndDat: head.nyuko_dat,
    juchuSts: KIKIKAN_JUCHU_STS_NYURYOKU,
    zeiKbn: KIKIKAN_ZEI_KBN_SOTOZEI,
    nyuryokuUser: KIKIKAN_FIXED_NYURYOKU_USER,
    mem: head.mem,
  });

  const { error: linkError } = await updateKizaihyouJuchuLink(kizaihyouId, juchuHeadId, null, userNam);
  if (linkError) throw new Error(`[createKikikanJuchu] 受注との紐付けの保存に失敗しました: ${linkError.message}`);

  return juchuHeadId;
};

/**
 * 機材表の内容からkikikanに受注機材ヘッダーと機材明細一式を作る関数。
 *
 * 機材マスタから選んだ行（kizai_idがある行）だけが対象。手入力の名称は
 * kikikanの明細にできないので飛ばす。数量が0でも機材が選ばれていれば登録する。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param juchuHeadId 連携先の受注番号
 * @param userNam 承認者名
 * @returns 登録した明細の件数と、飛ばした行の数
 */
const createKikikanJuchuKizai = async (kizaihyouId: number, juchuHeadId: number, userNam: string) => {
  const detail = await fetchEquipmentTable(kizaihyouId);
  if (!detail) throw new Error('[createKikikanJuchuKizai] 機材表が見つかりません');
  if (!detail.head.shippedAt || !detail.head.returnedAt)
    throw new Error('[createKikikanJuchuKizai] 出庫日・入庫日が入っていないため連携できません');

  const namedRows = detail.rows.filter((row) => row.name.trim() !== '');
  const linkedRows = namedRows.filter((row) => row.kizaiId !== null);

  let meisaiCount = 0;
  if (linkedRows.length) {
    const { data: masters, error } = await selectKikikanKizaiForJuchu(
      Array.from(new Set(linkedRows.map((row) => row.kizaiId as number)))
    );
    if (error) throw new Error(`[createKikikanJuchuKizai] kikikanの機材マスタ取得に失敗しました: ${error.message}`);

    const masterById = new Map((masters ?? []).map((master) => [master.kizai_id, master]));
    const rows: KikikanJuchuKizaiRow[] = linkedRows.map((row) => {
      const master = masterById.get(row.kizaiId as number);
      return {
        kizaiId: row.kizaiId as number,
        kizaiShozokuId: master?.shozoku_id ?? 0,
        tankaAmt: master?.reg_amt ?? 0,
        planKizaiQty: getActiveSum(row),
        planYobiQty: Number(row.spare) || 0,
        mem: row.remark || null,
      };
    });

    const juchuKizaiHeadId = await insertKikikanJuchuKizai({
      juchuHeadId,
      headNam: detail.head.eventName,
      shukoDat: detail.head.shippedAt,
      nyukoDat: detail.head.returnedAt,
      honbanbiQty: KIKIKAN_HONBANBI_QTY_DEFAULT,
      addUser: userNam,
      rows,
    });
    meisaiCount = rows.length;

    const { error: linkError } = await updateKizaihyouJuchuLink(kizaihyouId, juchuHeadId, juchuKizaiHeadId, userNam);
    if (linkError)
      throw new Error(`[createKikikanJuchuKizai] 受注機材ヘッダーの紐付けの保存に失敗しました: ${linkError.message}`);
  }

  return { meisaiCount, skippedRowCount: namedRows.length - linkedRows.length };
};

/**
 * kikikanへの連携（伝票＋機材明細）をまとめて行う関数。
 *
 * 既にできているものは作らないので、**何度呼んでも安全**（再連携で使う）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userNam 操作者名
 * @returns 受注番号と、登録した明細件数・飛ばした行数
 */
const linkKikikanJuchu = async (kizaihyouId: number, userNam: string, existingJuchuHeadId: number | null = null) => {
  const { data: head } = await selectKizaihyouHead(kizaihyouId);

  // 既存の受注番号を指定された場合は伝票を作らず、その伝票に明細だけ足す
  if (head?.juchu_head_id === null && existingJuchuHeadId !== null) {
    const juchu = await selectKikikanJuchuHead(existingJuchuHeadId);
    if (!juchu) throw new Error(`kikikanに受注 ${existingJuchuHeadId} が見つかりません`);

    const { error } = await updateKizaihyouJuchuLink(kizaihyouId, existingJuchuHeadId, null, userNam);
    if (error) throw new Error(`受注との紐付けの保存に失敗しました: ${error.message}`);

    const { meisaiCount, skippedRowCount } = await createKikikanJuchuKizai(kizaihyouId, existingJuchuHeadId, userNam);
    return { juchuHeadId: existingJuchuHeadId, meisaiCount, skippedRowCount, alreadyLinked: false };
  }

  // 伝票がまだ無ければ作る
  const juchuHeadId = (await createKikikanJuchu(kizaihyouId, userNam)) ?? head?.juchu_head_id ?? null;
  if (juchuHeadId === null) throw new Error('連携先の受注番号が取得できませんでした');

  // 機材明細は伝票につき1度だけ作る
  if (head?.juchu_kizai_head_id) return { juchuHeadId, meisaiCount: 0, skippedRowCount: 0, alreadyLinked: true };

  const { meisaiCount, skippedRowCount } = await createKikikanJuchuKizai(kizaihyouId, juchuHeadId, userNam);
  return { juchuHeadId, meisaiCount, skippedRowCount, alreadyLinked: false };
};

/**
 * kikikanへの連携を試み、結果を操作履歴に残す関数。
 *
 * 承認とは別トランザクションなので、失敗しても承認は取り消さない。
 * 画面のアラートは閉じると消えてしまうため、成否を必ず履歴に積んで
 * 後から追えるようにする。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param user 操作者
 * @returns 連携の結果
 */
const tryLinkKikikanJuchu = async (
  kizaihyouId: number,
  user: CurrentUser,
  existingJuchuHeadId: number | null = null
): Promise<ApproveResult> => {
  try {
    const { juchuHeadId, meisaiCount, skippedRowCount, alreadyLinked } = await linkKikikanJuchu(
      kizaihyouId,
      user.userNam,
      existingJuchuHeadId
    );

    if (!alreadyLinked) {
      const skipped = skippedRowCount > 0 ? `／機材マスタに紐づかず連携しなかった行 ${skippedRowCount}件` : '';
      await insertKizaihyouHis(
        kizaihyouId,
        KIZAIHYOU_ACT.連携,
        `kikikan連携（受注 ${juchuHeadId}）`,
        user.userId,
        user.userNam,
        `機材明細 ${meisaiCount}件${skipped}`
      );
    }
    return { juchuHeadId, meisaiCount, skippedRowCount, kikikanError: null };
  } catch (e) {
    const kikikanError = e instanceof Error ? e.message : String(e);
    await insertKizaihyouHis(
      kizaihyouId,
      KIZAIHYOU_ACT.連携失敗,
      'kikikan連携失敗',
      user.userId,
      user.userNam,
      kikikanError
    );
    return { juchuHeadId: null, meisaiCount: 0, skippedRowCount: 0, kikikanError };
  }
};

/**
 * kikikanへの連携をやり直す関数（申請先の受注部担当者のみ）。
 *
 * 承認時に連携が失敗した場合の復旧に使う。既にできているものは作らない。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 連携の結果
 */
export const retryKikikanJuchu = async (kizaihyouId: number): Promise<ApproveResult> => {
  const user = await requireJuchuTanto(kizaihyouId);
  return tryLinkKikikanJuchu(kizaihyouId, user);
};

/**
 * 機材表の申請を承認する関数（申請先の受注部担当者のみ）。
 *
 * 承認したうえで、kikikanに受注ヘッダー（伝票）を作る。
 * **kizaihyouとkikikanは別Postgresインスタンスで単一トランザクションを組めない**ため、
 * 承認を先に確定させ、伝票の作成が失敗しても承認は取り消さない。
 * 紐付けが未設定のまま残るので、後から作り直せる。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 承認コメント
 * @param existingJuchuHeadId 既にある受注番号に機材明細だけ足す場合はその番号。新規に伝票を作るならnull
 * @returns 連携した受注番号と、kikikan側の失敗理由
 */
export const approveEquipmentTable = async (
  kizaihyouId: number,
  comment: string,
  existingJuchuHeadId: number | null = null
): Promise<ApproveResult> => {
  const user = await requireJuchuTanto(kizaihyouId);
  await changeStatus(kizaihyouId, '承認済', KIZAIHYOU_ACT.承認, '承認', comment || null);
  return tryLinkKikikanJuchu(kizaihyouId, user, existingJuchuHeadId);
};

/**
 * 機材表の申請を差し戻す関数（申請先の受注部担当者のみ）
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 差戻しコメント
 */
export const rejectEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await requireJuchuTanto(kizaihyouId);
  await changeStatus(kizaihyouId, '差戻し', KIZAIHYOU_ACT.差戻し, '差戻し', comment || null);
};
