import { EquipmentRow } from './types';

/**
 * 機材名の前に付けるインデント文字。kikikanのm_dic（dic_id = 1）と同じ文字を使う。
 * 直前の機材とセットで使うもの（付属ケーブル等）を表す。
 */
export const INDENT_CHARA = ' ┗ ';

/** 表示・出力に使う機材名。インデントが付いている行は先頭に「 ┗ 」を足す */
export const getIndentedName = (row: EquipmentRow) =>
  row.name ? `${INDENT_CHARA.repeat(row.indent)}${row.name}` : row.name;

/** ACTIVE（各ポジションの数量の合計） */
export const getActiveSum = (row: EquipmentRow) =>
  Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0);

/** TOTAL（ACTIVE合計 + SPARE） */
export const getTotal = (row: EquipmentRow) => getActiveSum(row) + (Number(row.spare) || 0);

/**
 * 何か入力されている行かを判定する関数。
 * 画面の空行はそのまま保存されるので、閲覧・出力では空行を落とすのに使う。
 */
export const hasEquipmentRowContent = (row: EquipmentRow) =>
  Boolean(row.kind || row.name || row.remark || row.spare) || Object.values(row.qty).some((value) => value !== '');

/**
 * ダウンロードするファイル名を組み立てる関数
 * @param kizaihyouCod 機材表ID（KZ-0001形式）
 * @param eventName 公演名
 * @param extension 拡張子（ドット無し）
 * @returns 「KZ-0001_公演名_機材表.xlsm」形式のファイル名
 */
export const buildKizaihyouFileName = (kizaihyouCod: string, eventName: string, extension: string) => {
  // Windowsでファイル名に使えない文字を除く
  const safeName = eventName.replace(/[\/:*?"<>|]/g, '_').trim();
  return `${kizaihyouCod}${safeName ? `_${safeName}` : ''}_機材表.${extension}`;
};
