export type EquipmentOrderRow = {
  id: string;
  /** kikikanのm_kizai.kizai_id。手入力の名称はnullで、在庫を引けない */
  kizaiId: number | null;
  /** 前回の申請と行を突き合わせるキー（差分の印に使う） */
  diffKey: string;
  /** 前回の申請にあって今回は無くなった機材か（数量0で並べる） */
  removed: boolean;
  kizaiName: string;
  mem: string;
  mem2: string;
  orderedQty: number;
  spareQty: number;
};

/**
 * kikikanから取得した機材1点の在庫。
 * この機材表の要求数はkikikanの受注に入っていないので含まれていない
 * （画面側で出庫日〜入庫日の分を差し引いて表示する）。
 */
export type EquipmentStock = {
  /** 保有数。引き当てが無い日の在庫数 */
  kizaiQty: number;
  /** YYYY-MM-DD → 在庫数。引き当てが無い日はキーが無い */
  stockByDate: Record<string, number>;
};

/** 機材ID → 在庫 */
export type EquipmentStockMap = Record<number, EquipmentStock>;
