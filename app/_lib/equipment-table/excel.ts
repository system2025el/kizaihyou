import fs from 'node:fs/promises';
import path from 'node:path';

import { unzipSync, zipSync } from 'fflate';

import { EquipmentTableHead } from '../equipment-table-list/types';
import { buildKizaihyouFileName } from './sheet';
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

const colIndex = (letters: string) => letters.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const colLetters = (index: number) => {
  let n = index;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

/** 「A1」「A1:B2」形式の範囲を、残す行・列に収まるよう切り詰める。範囲外ならnull */
const clipRange = (range: string, lastRow: number, lastCol: number) => {
  const cells = range.split(':');
  const parsed = cells.map((cell) => cell.match(/^\$?([A-Z]+)\$?(\d+)$/));
  if (parsed.some((p) => !p)) return range; // 行全体・列全体の指定などはそのまま
  const [start, end = start] = parsed as RegExpMatchArray[];
  if (colIndex(start[1]) > lastCol || Number(start[2]) > lastRow) return null;
  const endCol = Math.min(colIndex(end[1]), lastCol);
  const endRow = Math.min(Number(end[2]), lastRow);
  const startRef = `${start[1]}${start[2]}`;
  const endRef = `${colLetters(endCol)}${endRow}`;
  return startRef === endRef ? (cells.length === 1 ? startRef : null) : `${startRef}:${endRef}`;
};

/**
 * 雛形は空の行・列にも罫線が引いてあるため、実データの範囲だけを残して切り詰める。
 * 併せて結合セル・条件付き書式・改ページ・印刷範囲も同じ範囲に合わせる。
 */
const trimSheet = (xml: string, lastRow: number, lastCol: number) => {
  const lastColLetters = colLetters(lastCol);

  // 1行目右端の作成日（TODAY()）は切り詰めで消えるため、退避して最終列に置き直す
  const dateCell = ['AJ1', 'AI1']
    .map((ref) => xml.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`))?.[0])
    .find((cell) => cell?.includes('TODAY()'));
  const dateCellRef = dateCell?.match(/r="([A-Z]+)\d+"/)?.[1];
  const moveDate = dateCell && dateCellRef && colIndex(dateCellRef) > lastCol;

  // 行の切り詰めと、各行の列の切り詰め
  let trimmed = xml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (whole, attrs: string, body: string) => {
    if (Number(attrs.match(/r="(\d+)"/)![1]) > lastRow) return '';
    const keptCells = body.replace(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (cell, cellAttrs: string) => {
      const col = cellAttrs.match(/r="([A-Z]+)\d+"/)?.[1];
      return col && colIndex(col) > lastCol ? '' : cell;
    });
    return `<row${attrs.replace(/\s*spans="[^"]*"/, '')}>${keptCells}</row>`;
  });

  if (moveDate) {
    const movedRef = `${lastColLetters}1`;
    const moved = dateCell.replace(/r="[A-Z]+\d+"/, `r="${movedRef}"`);
    const existing = new RegExp(`<c r="${movedRef}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
    trimmed = existing.test(trimmed)
      ? trimmed.replace(existing, moved)
      : trimmed.replace(/(<row[^>]*r="1"[^>]*>[\s\S]*?)(<\/row>)/, `$1${moved}$2`);
  }

  // 結合セル
  trimmed = trimmed.replace(/<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/, (whole, body: string) => {
    const kept = [...body.matchAll(/<mergeCell ref="([^"]+)"\s*\/>/g)]
      .map((m) => clipRange(m[1], lastRow, lastCol))
      .filter((ref): ref is string => ref !== null && ref.includes(':'));
    if (!kept.length) return '';
    return `<mergeCells count="${kept.length}">${kept.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
  });

  // 条件付き書式（選択行・列のハイライトとTOTALのマイナス表示）
  trimmed = trimmed.replace(
    /<conditionalFormatting([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g,
    (whole, attrs: string, body: string) => {
      const sqref = attrs.match(/sqref="([^"]+)"/)?.[1];
      if (!sqref) return whole;
      const kept = sqref
        .split(/\s+/)
        .map((range) => clipRange(range, lastRow, lastCol))
        .filter((range): range is string => range !== null);
      if (!kept.length) return '';
      return `<conditionalFormatting${attrs.replace(/sqref="[^"]+"/, `sqref="${kept.join(' ')}"`)}>${body}</conditionalFormatting>`;
    }
  );

  // 改ページ（データより後ろのものは不要）
  trimmed = trimmed.replace(/<rowBreaks[^>]*>([\s\S]*?)<\/rowBreaks>/, (whole, body: string) => {
    const kept = [...body.matchAll(/<brk[^>]*id="(\d+)"[^>]*\/>/g)].filter((m) => Number(m[1]) < lastRow);
    if (!kept.length) return '';
    return `<rowBreaks count="${kept.length}" manualBreakCount="${kept.length}">${kept.map((m) => m[0]).join('')}</rowBreaks>`;
  });

  return trimmed.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastColLetters}${lastRow}"/>`);
};

/**
 * calcChain.xml（数式の計算順キャッシュ）を取り除く。
 *
 * 削除したセルを参照したまま残ると、Excelが開くときに
 * 「削除されたレコード: /xl/calcChain.xml パーツ内の数式」と修復を促してしまう。
 * Excelが自動で作り直すパーツなので、消しておくのが確実。
 */
const dropCalcChain = (files: Record<string, Uint8Array>) => {
  if (!files['xl/calcChain.xml']) return;
  delete files['xl/calcChain.xml'];

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  files['[Content_Types].xml'] = encoder.encode(
    decoder.decode(files['[Content_Types].xml']).replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '')
  );
  files['xl/_rels/workbook.xml.rels'] = encoder.encode(
    decoder.decode(files['xl/_rels/workbook.xml.rels']).replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, '')
  );
};

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

  // 雛形は空の行・列にも罫線が引いてあるので、実データの範囲だけに切り詰める
  const lastRow = rows.length ? FIRST_DATA_ROW + rows.length - 1 : FIRST_DATA_ROW - 1;
  const lastCol = colIndex('H') + columns.length;
  xml = trimSheet(xml, lastRow, lastCol);
  files['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(xml);
  dropCalcChain(files);

  // 印刷範囲も切り詰めた範囲に合わせる
  const decoder = new TextDecoder();
  const workbook = decoder.decode(files['xl/workbook.xml']);
  files['xl/workbook.xml'] = new TextEncoder().encode(
    workbook.replace(
      /(<definedName name="_xlnm.Print_Area"[^>]*>)([^<]*)(<\/definedName>)/,
      (whole, open: string, value: string, close: string) => {
        const sheetName = value.split('!')[0];
        return `${open}${sheetName}!$B$1:$${colLetters(lastCol)}$${lastRow}${close}`;
      }
    )
  );

  return zipSync(files, { level: 6 });
};

/**
 * ダウンロード時のファイル名を組み立てる関数
 * @param kizaihyouCod 機材表ID（KZ-0001形式）
 * @param eventName 公演名
 * @returns ファイル名
 */
export const buildKizaihyouExcelFileName = (kizaihyouCod: string, eventName: string) =>
  buildKizaihyouFileName(kizaihyouCod, eventName, 'xlsm');
