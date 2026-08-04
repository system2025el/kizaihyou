export type EquipmentOrderRow = {
  id: string;
  kizaiName: string;
  mem: string;
  mem2: string;
  orderedQty: number;
  spareQty: number;
  // このオーダー自体の予約分を除いた基準在庫数（オーダー期間外の表示値）
  baseStock: number;
};
