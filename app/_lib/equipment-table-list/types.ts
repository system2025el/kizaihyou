import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';

export type EquipmentTableStatus = '作成中' | '申請中' | '差戻し' | '承認済';

export type EquipmentTableHistoryEntry = {
  at: string;
  user: string;
  action: string;
};

export type EquipmentTableContent = {
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

export type EquipmentTableListRow = {
  id: string;
  eventName: string;
  place: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  returnedAt: string | null;
  status: EquipmentTableStatus;
  salesStaffName: string;
  history: EquipmentTableHistoryEntry[];
  content: EquipmentTableContent;
};
