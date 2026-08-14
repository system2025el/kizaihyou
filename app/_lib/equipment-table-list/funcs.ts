'use server';

import { requireCurrentUser } from '../auth/funcs';
import { copyKizaihyou, selectKizaihyouList, updateKizaihyouSts } from '../db/tables/t-kizaihyou';
import { insertKizaihyouHis, selectKizaihyouHisList } from '../db/tables/t-kizaihyou-his';
import { formatDate, formatDateTime } from '../format';
import {
  EquipmentTableHistoryEntry,
  EquipmentTableListRow,
  EquipmentTableStatus,
  EquipmentTableStatusColor,
  KIZAIHYOU_STS,
} from './types';

const STATUS_NAMES: EquipmentTableStatus[] = ['作成中', '申請中', '差戻し', '承認済'];
const STATUS_COLORS: EquipmentTableStatusColor[] = ['default', 'info', 'error', 'success'];

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
      at: formatDateTime(his.act_dat),
      user: his.user_nam,
      action: his.act_nam,
      comment: his.mem ?? '',
    });
    historyByKizaihyou.set(his.kizaihyou_id, entries);
  }

  return data.map((head) => ({
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
    history: historyByKizaihyou.get(head.kizaihyou_id) ?? [],
  }));
};

/**
 * 既存の機材表をコピーして新規作成する関数
 * @param sourceId コピー元のkizaihyou_id
 * @param sourceCod コピー元の機材表ID（履歴に残す表示用の値）
 * @returns 作成した機材表のkizaihyou_id
 */
export const copyEquipmentTable = async (sourceId: number, sourceCod: string): Promise<number> => {
  const user = await requireCurrentUser();
  const { kizaihyouId } = await copyKizaihyou(sourceId, user.userNam, user.userId);

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
 * 機材表を申請する関数
 * @param kizaihyouId 対象のkizaihyou_id
 */
export const requestEquipmentTable = async (kizaihyouId: number) => {
  await changeStatus(kizaihyouId, '申請中', '申請', null);
};

/**
 * 機材表の申請を承認する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 承認コメント
 */
export const approveEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await changeStatus(kizaihyouId, '承認済', '承認', comment || null);
};

/**
 * 機材表の申請を差し戻す関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 差戻しコメント
 */
export const rejectEquipmentTable = async (kizaihyouId: number, comment: string) => {
  await changeStatus(kizaihyouId, '差戻し', '差戻し', comment || null);
};
