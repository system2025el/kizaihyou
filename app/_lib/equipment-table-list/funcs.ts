'use server';

import { requireCurrentUser } from '../auth/funcs';
import { hasPermission, PERMISSION } from '../auth/permission';
import { selectUserList } from '../db/tables/m-user';
import {
  copyKizaihyou,
  requestKizaihyou,
  selectKizaihyouHead,
  selectKizaihyouList,
  updateKizaihyouSts,
} from '../db/tables/t-kizaihyou';
import { insertKizaihyouHis, selectKizaihyouHisList } from '../db/tables/t-kizaihyou-his';
import { fetchEquipmentTable } from '../equipment-table/funcs';
import { formatDate, formatDateTime } from '../format';
import {
  EquipmentTableHistoryEntry,
  EquipmentTableListRow,
  EquipmentTableStatus,
  EquipmentTableStatusColor,
  JuchuTantoOption,
  KIZAIHYOU_STS,
} from './types';

const STATUS_NAMES: EquipmentTableStatus[] = ['作成中', '申請中', '差戻し', '承認済', '取下げ'];
const STATUS_COLORS: EquipmentTableStatusColor[] = ['default', 'info', 'error', 'success', 'warning'];

const toStatus = (value: string | undefined): EquipmentTableStatus =>
  STATUS_NAMES.find((name) => name === value) ?? '作成中';

const toStatusColor = (value: string | undefined): EquipmentTableStatusColor =>
  STATUS_COLORS.find((color) => color === value) ?? 'default';

/**
 * 機材表履歴一覧に表示する機材表を取得する関数
 * @returns 更新日時の新しい順に並んだ機材表（操作履歴つき）
 */
export const fetchEquipmentTableList = async (): Promise<EquipmentTableListRow[]> => {
  const { data, error } = await selectKizaihyouList();
  if (error) throw new Error(`[fetchEquipmentTableList] 機材表の取得に失敗しました: ${error.message}`);
  if (!data?.length) return [];

  const { data: histories, error: hisError } = await selectKizaihyouHisList(data.map((head) => head.kizaihyou_id));
  if (hisError) throw new Error(`[fetchEquipmentTableList] 操作履歴の取得に失敗しました: ${hisError.message}`);

  const historyByKizaihyou = new Map<number, EquipmentTableHistoryEntry[]>();
  for (const his of histories ?? []) {
    const entries = historyByKizaihyou.get(his.kizaihyou_id) ?? [];
    entries.push({
      hisId: his.his_id,
      at: formatDateTime(his.act_dat),
      user: his.user_nam,
      action: his.act_nam,
      comment: his.mem ?? '',
      hasSnapshot: his.snapshot_flg === 1,
    });
    historyByKizaihyou.set(his.kizaihyou_id, entries);
  }

  return data.map((head) => {
    // 申請の履歴にスナップショットがあるときだけ「申請/承認された内容」を開かせる
    const history = historyByKizaihyou.get(head.kizaihyou_id) ?? [];
    const shinseiHis = history.find((entry) => entry.hisId === head.shinsei_his_id);

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
      shinseiHisId: shinseiHis?.hasSnapshot ? shinseiHis.hisId : null,
      history,
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
  actNam: string,
  comment: string | null
) => {
  const user = await requireCurrentUser();

  const { error } = await updateKizaihyouSts(kizaihyouId, KIZAIHYOU_STS[status], user.userNam);
  if (error) throw new Error(`[changeStatus] ステータスの更新に失敗しました: ${error.message}`);

  const { error: hisError } = await insertKizaihyouHis(kizaihyouId, actNam, user.userId, user.userNam, comment);
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
  await changeStatus(kizaihyouId, '取下げ', '取り下げ', comment || null);
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
};

/**
 * 機材表の申請を承認する関数（申請先の受注部担当者のみ）
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 承認コメント
 */
export const approveEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await requireJuchuTanto(kizaihyouId);
  await changeStatus(kizaihyouId, '承認済', '承認', comment || null);
};

/**
 * 機材表の申請を差し戻す関数（申請先の受注部担当者のみ）
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 差戻しコメント
 */
export const rejectEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await requireJuchuTanto(kizaihyouId);
  await changeStatus(kizaihyouId, '差戻し', '差戻し', comment || null);
};
