import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';

export type EquipmentTableStatus = '作成中' | '申請中' | '差戻し' | '承認済' | '取下げ';

/** m_kizaihyou_sts.sts_cod。DBのマスタと一致させること */
export const KIZAIHYOU_STS: Record<EquipmentTableStatus, number> = {
  作成中: 1,
  申請中: 2,
  差戻し: 3,
  承認済: 4,
  取下げ: 5,
};

/** m_kizaihyou_sts.chip_colorが取りうる値（MUIのChip color） */
export type EquipmentTableStatusColor = 'default' | 'info' | 'error' | 'success' | 'warning';

/** 申請時に選ぶ受注部担当者の候補（m_userのうち受注部担当者権限を持つ人） */
export type JuchuTantoOption = {
  userId: string;
  userNam: string;
};

export type EquipmentTableHistoryEntry = {
  /** t_kizaihyou_his.his_id（スナップショット閲覧ページのURLに使う） */
  hisId: number;
  at: string;
  user: string;
  action: string;
  /** 申請・承認・差戻し時のコメント、または自由コメント */
  comment: string;
  /** その時点の機材表（スナップショット）を持つ履歴か */
  hasSnapshot: boolean;
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
  /** 受注部担当者名（申請先） */
  salesStaffName: string;
  /** 依頼者名（申請した人）。未申請なら空文字 */
  requesterName: string;
  /** 申請先の受注部担当者のuser_id。この誰か1人が承認すれば承認済になる */
  tantoUserIds: string[];
  /**
   * 申請時点のスナップショットを持つ操作履歴のhis_id。
   * 承認済ならこれが「承認された内容」、申請中なら「申請した内容」。
   * 申請していない・スナップショットが無い場合はnull。
   */
  shinseiHisId: number | null;
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
  /** 機材表全体の備考（行ごとの備考とは別物） */
  memo: string;
};
