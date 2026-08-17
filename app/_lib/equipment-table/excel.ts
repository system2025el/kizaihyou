import fs from 'node:fs/promises';
import path from 'node:path';

import { unzipSync, zipSync } from 'fflate';

import { EquipmentTableHead } from '../equipment-table-list/types';
import { EquipmentColumn, EquipmentRow } from './types';

/**
 * 機材表のExcel(.xlsm)出力。
 *
 * 罫線・色・列幅・印刷設定・数式・マクロを再現せずに済むよう、実際に運用されている
 * 機材表から作った空の雛形（resources/kizaihyou-template.xlsm）に値だけを差し込む。
 * 雛形の作り直しは scripts/build-excel-template.mjs を参照。
 *
 * 雛形のセル配置（xl/worksheets/sheet1.xml）:
 *   C1=公演名 / C2=顧客名 / E2=場所 / G3=出庫日 / G4=返却日 / C4=備考(機材表全体)
 *   5行目 I〜AJ=ポジション見出し
 *   7行目以降 B=種類 / C=名称 / D=備考(行ごと) / H=SPARE / I〜AJ=数量
 *   F=TOTAL、G=ACTIVE は雛形側の数式がそのまま計算する
 */
const TEMPLATE_PATH = path.join(process.cwd(), 'resources/kizaihyou-template.xlsm');

/** 数量を書ける列（I〜AJ）。雛形の書式が用意されている範囲 */
const POSITION_COLUMNS = [
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  'AA',
  'AB',
  'AC',
  'AD',
  'AE',
  'AF',
  'AG',
  'AH',
  'AI',
  'AJ',
];
/** 機材の1行目 */
const FIRST_DATA_ROW = 7;
/** 雛形に書式が用意されている最終行 */
const LAST_DATA_ROW = 411;

export const MAX_EXPORT_COLUMNS = POSITION_COLUMNS.length;
export const MAX_EXPORT_ROWS = LAST_DATA_ROW - FIRST_DATA_ROW + 1;

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** YYYY-MM-DD を Excel のシリアル値（1899-12-30 起点）に変換する */
const toSerialDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
};

type CellValue = { text: string } | { number: number };

/**
 * シートXMLの指定セルに値を書き込む。
 * 雛形にあるセルの `s`（書式）はそのまま活かし、値と型だけ差し替える。
 */
const writeCell = (xml: string, ref: string, value: CellValue | null) => {
  const pattern = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const match = xml.match(pattern);
  if (!match) return xml; // 雛形に無いセルは対象外（列・行の上限を超えた場合など）
  if (!value) return xml;

  const attrs = match[1].replace(/\s*t="[^"]*"/, '').replace(/\/\s*$/, '');
  const body =
    'text' in value
      ? ` t="inlineStr"><is><t xml:space="preserve">${escapeXml(value.text)}</t></is>`
      : `><v>${value.number}</v>`;
  return xml.replace(pattern, `<c r="${ref}"${attrs}${body}</c>`);
};

const textCell = (value: string): CellValue | null => (value.trim() ? { text: value } : null);

export type ExcelExportInput = {
  head: EquipmentTableHead;
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

/**
 * 機材表の内容を雛形に差し込んで.xlsmのバイト列を作る関数
 * @param input 出力する機材表の内容
 * @returns .xlsmのバイト列
 */
export const buildKizaihyouExcel = async (input: ExcelExportInput): Promise<Uint8Array> => {
  const { head, columns, rows } = input;
  if (columns.length > MAX_EXPORT_COLUMNS) {
    throw new Error(`列が多すぎます（Excelの雛形は${MAX_EXPORT_COLUMNS}列まで。現在${columns.length}列）`);
  }
  if (rows.length > MAX_EXPORT_ROWS) {
    throw new Error(`行が多すぎます（Excelの雛形は${MAX_EXPORT_ROWS}行まで。現在${rows.length}行）`);
  }

  const files = unzipSync(new Uint8Array(await fs.readFile(TEMPLATE_PATH)));
  let xml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);

  // ヘッダ
  xml = writeCell(xml, 'C1', textCell(head.eventName));
  xml = writeCell(xml, 'C2', textCell(head.clientName));
  xml = writeCell(xml, 'E2', textCell(head.place));
  xml = writeCell(xml, 'C4', textCell(head.memo));
  const shukko = head.shippedAt ? toSerialDate(head.shippedAt) : null;
  const nyuko = head.returnedAt ? toSerialDate(head.returnedAt) : null;
  if (shukko) xml = writeCell(xml, 'G3', { number: shukko });
  if (nyuko) xml = writeCell(xml, 'G4', { number: nyuko });

  // ポジション見出し
  columns.forEach((column, index) => {
    xml = writeCell(xml, `${POSITION_COLUMNS[index]}5`, textCell(column.label));
  });

  // 機材の行
  rows.forEach((row, index) => {
    const rowNum = FIRST_DATA_ROW + index;
    xml = writeCell(xml, `B${rowNum}`, textCell(row.kind));
    xml = writeCell(xml, `C${rowNum}`, textCell(row.name));
    xml = writeCell(xml, `D${rowNum}`, textCell(row.remark));
    const spare = Number(row.spare);
    if (row.spare && !Number.isNaN(spare) && spare !== 0) {
      xml = writeCell(xml, `H${rowNum}`, { number: spare });
    }
    columns.forEach((column, columnIndex) => {
      const qty = Number(row.qty[column.id]);
      if (!row.qty[column.id] || Number.isNaN(qty) || qty === 0) return;
      xml = writeCell(xml, `${POSITION_COLUMNS[columnIndex]}${rowNum}`, { number: qty });
    });
  });

  files['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(xml);
  return zipSync(files, { level: 6 });
};

/**
 * ダウンロード時のファイル名を組み立てる関数
 * @param kizaihyouCod 機材表ID（KZ-0001形式）
 * @param eventName 公演名
 * @returns ファイル名
 */
export const buildKizaihyouExcelFileName = (kizaihyouCod: string, eventName: string) => {
  // Windowsでファイル名に使えない文字を除く
  const safeName = eventName.replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${kizaihyouCod}${safeName ? `_${safeName}` : ''}_機材表.xlsm`;
};
