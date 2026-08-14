import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';

export type EquipmentTableStatus = '作成中' | '申請中' | '差戻し' | '承認済';

/** m_kizaihyou_sts.sts_cod。DBのマスタと一致させること */
export const KIZAIHYOU_STS: Record<EquipmentTableStatus, number> = {
  作成中: 1,
  申請中: 2,
  差戻し: 3,
  承認済: 4,
};

/** m_kizaihyou_sts.chip_colorが取りうる値（MUIのChip color） */
export type EquipmentTableStatusColor = 'default' | 'info' | 'error' | 'success';

export type EquipmentTableHistoryEntry = {
  at: string;
  user: string;
  action: string;
  /** 承認・差戻し時のコメント */
  comment: string;
};

export type EquipmentTableContent = {
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

export type EquipmentTableListRow = {
  id: number;
  /** 画面表示用の機材表ID（KZ-0001形式） */
  cod: string;
  eventName: string;
  place: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  returnedAt: string | null;
  status: EquipmentTableStatus;
  statusColor: EquipmentTableStatusColor;
  salesStaffName: string;
  history: EquipmentTableHistoryEntry[];
};

/** 機材表画面が扱うヘッダ情報 */
export type EquipmentTableHead = {
  eventName: string;
  place: string;
  clientName: string;
  /** YYYY-MM-DD */
  shippedAt: string;
  /** YYYY-MM-DD */
  returnedAt: string;
};
