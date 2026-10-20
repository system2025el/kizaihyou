import { EquipmentTableHead } from '@/app/_lib/equipment-table-list/types';

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
  /**
   * 機材名のインデント段数。0＝通常、1＝直前の機材とセット（「 ┗ 」を前置して表示）。
   * kikikanのt_juchu_kizai_meisai.indent_numにそのまま渡る。
   * 親子を連動させる仕組みは持たず、並び替えても付いてこない（見た目だけの扱い）。
   */
  indent: number;
  /** 列id → 数量 */
  qty: Record<string, string>;
};

/**
 * 保存・申請時点の機材表の内容。`t_kizaihyou_his.snapshot`にJSONで入る。
 * 閲覧専用ページで表示するだけなので、行・列のidは保存時のものをそのまま持つ。
 */
export type EquipmentTableSnapshot = {
  head: EquipmentTableHead;
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

/** 「名称」欄の候補（kikikanの機材マスタ由来） */
export type KizaiOption = {
  kizaiId: number;
  kizaiNam: string;
  /** kikikanのm_kizai.bumon_id。「種類」で候補を絞るのに使う */
  bumonId: number | null;
  /** 在庫場所の名前（KICS / YARD など）。機材追加ダイアログに出す */
  shozokuNam: string;
  /** kikikanのkizai_grp_cod。機材追加ダイアログでグループの区切り線を引くのに使う */
  kizaiGrpCod: number | null;
};

/** 機材追加ダイアログで選べるセットオプション（付属品）1件 */
export type KizaiSetOption = {
  kizaiId: number;
  kizaiNam: string;
  bumonId: number | null;
  shozokuNam: string;
  /** kikikanのkizai_grp_cod。ダイアログでグループの区切り線を引くのに使う */
  kizaiGrpCod: number | null;
};

/** 「種類」欄の候補（kikikanの部門マスタ由来） */
export type BumonOption = {
  bumonId: number;
  bumonNam: string;
};
