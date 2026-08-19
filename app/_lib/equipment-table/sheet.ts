import { EquipmentRow } from './types';

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
