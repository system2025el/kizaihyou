export type EquipmentColumn = {
  id: string;
  label: string;
};

export type EquipmentRow = {
  id: string;
  kind: string;
  name: string;
  remark: string;
  spare: string;
  qty: Record<string, string>;
};
