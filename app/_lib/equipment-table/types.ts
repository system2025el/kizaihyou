export type EquipmentColumn = {
  id: string;
  label: string;
};

export type EquipmentRow = {
  id: string;
  kind: string;
  /** kikikanのm_kizai.kizai_id。手入力の名称はnull */
  kizaiId: number | null;
  name: string;
  remark: string;
  spare: string;
  /** 列id → 数量 */
  qty: Record<string, string>;
};

/** 「名称」欄の候補（kikikanの機材マスタ由来） */
export type KizaiOption = {
  kizaiId: number;
  kizaiNam: string;
};
