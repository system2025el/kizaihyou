export type EquipmentTableStatus = '作成中' | '確定' | '出庫済' | '返却済';

export type EquipmentTableHistoryEntry = {
  at: string;
  user: string;
  action: string;
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
};
