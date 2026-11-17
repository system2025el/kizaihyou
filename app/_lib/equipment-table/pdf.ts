import fs from 'node:fs/promises';
import path from 'node:path';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

import { EquipmentTableHead } from '../equipment-table-list/types';
import { formatDate } from '../format';
import { buildKizaihyouFileName, getActiveSum, getIndentedName, getTotal, hasEquipmentRowContent } from './sheet';
import { EquipmentColumn, EquipmentRow } from './types';

/**
 * 機材表のPDF出力。
 *
 * Excel出力（excel.ts）は雛形に値を差し込む方式だが、PDFには雛形が無いので
 * pdf-libで表を組み立てる。日本語はIPAexゴシックを埋め込む（kikikanと同じフォント。
 * 標準14フォントでは日本語が出ないため）。Excelと同じくServer Actionから呼ぶ。
 */
const FONT_PATH = path.join(process.cwd(), 'resources/fonts/ipaexg.ttf');

/** ページサイズ（pt）。ポジション列が多くてA4に収まらないときはA3に切り替える */
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const A3_LANDSCAPE = { width: 1190.55, height: 841.89 };

const MARGIN = 28;
const FONT_SIZE = 8;
const INFO_FONT_SIZE = 9;
const TITLE_FONT_SIZE = 13;
const ROW_HEIGHT = 13;
const HEADER_ROW_HEIGHT = 16;
const INFO_LINE_HEIGHT = 12;
/** ポジション列がこれより狭くなるならA3にする */
const MIN_POSITION_WIDTH = 24;
/** ポジション列が少ないときに間延びしないよう上限を設ける */
const MAX_POSITION_WIDTH = 56;

const LINE_COLOR = rgb(0.6, 0.6, 0.6);
const HEADER_FILL = rgb(0.93, 0.93, 0.93);

/**
 * 機材ごとの固定列（ポジション列の左側）。
 * 名称の幅は実際の機材名の長さに合わせて`NAME_MIN_WIDTH`〜`NAME_MAX_WIDTH`で決める（`measureNameWidth`）。
 * 機材名が切れて読めないという要望（課題A-12）への対応で、短い名前ばかりの機材表では
 * ポジション列に幅を回せるよう、常に広く取ることはしない。
 */
const NAME_COLUMN_INDEX = 1;
const NAME_MIN_WIDTH = 150;
const NAME_MAX_WIDTH = 260;
const FIXED_COLUMNS = [
  { label: '種類', width: 80, align: 'left' },
  { label: '名称', width: NAME_MIN_WIDTH, align: 'left' },
  { label: '備考', width: 100, align: 'left' },
  { label: 'TOTAL', width: 38, align: 'right' },
  { label: 'ACTIVE', width: 40, align: 'right' },
  { label: 'SPARE', width: 38, align: 'right' },
] as const;

const CELL_PADDING = 3;
/**
 * 名称・種類が列に収まらないときは、末尾を省略する前にこの大きさまで文字を縮める。
 * 機材名は末尾（長さ・本数など）が大事なことが多く、省略すると別の機材と見分けられないため。
 */
const MIN_SHRINK_FONT_SIZE = 6;

/** 名称の列幅。一番長い機材名が収まる幅にする（上下限あり） */
const measureNameWidth = (names: string[], font: PDFFont) => {
  const longest = names.reduce((max, name) => Math.max(max, font.widthOfTextAtSize(name, FONT_SIZE)), 0);
  return Math.min(NAME_MAX_WIDTH, Math.max(NAME_MIN_WIDTH, Math.ceil(longest + CELL_PADDING * 2)));
};

/** pdf-libは折り返しをしないので、収まらない文字列は末尾を省略する */
const fitText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const single = text.replace(/\r?\n/g, ' ');
  if (!single || font.widthOfTextAtSize(single, size) <= maxWidth) return single;

  let cut = single;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
};

type DrawCellParams = {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  width: number;
  align: 'left' | 'right';
  /** 収まらないとき、省略する前に文字を縮めるか */
  shrink?: boolean;
};

const drawCellText = ({ page, font, text, x, y, width, align, shrink = false }: DrawCellParams) => {
  const maxWidth = width - CELL_PADDING * 2;
  const single = text.replace(/\r?\n/g, ' ');
  if (!single) return;

  // 縮めて収まるなら縮める。下限まで縮めても収まらなければ、下限の大きさで末尾を省略する
  const fullWidth = font.widthOfTextAtSize(single, FONT_SIZE);
  const size =
    shrink && fullWidth > maxWidth
      ? Math.max(MIN_SHRINK_FONT_SIZE, Math.floor(((FONT_SIZE * maxWidth) / fullWidth) * 10) / 10)
      : FONT_SIZE;
  const fitted = fitText(single, font, size, maxWidth);

  const textX = align === 'right' ? x + width - CELL_PADDING - font.widthOfTextAtSize(fitted, size) : x + CELL_PADDING;
  page.drawText(fitted, { x: textX, y, size, font, color: rgb(0, 0, 0) });
};

/** 1ページ目に出す公演情報の行（2ページ目以降は出さない） */
const buildInfoLines = (head: EquipmentTableHead) => {
  const lines = [
    `公演名：${head.eventName || '―'}　　顧客名：${head.clientName || '―'}　　場所：${head.place || '―'}`,
    `出庫日：${formatDate(head.shippedAt) ?? '―'}　　入庫日：${formatDate(head.returnedAt) ?? '―'}`,
  ];
  if (head.memo) lines.push(`備考：${head.memo}`);
  return lines;
};

export type KizaihyouPdfInput = {
  kizaihyouCod: string;
  head: EquipmentTableHead;
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

/**
 * 機材表のPDFを組み立てる関数
 * @param input 機材表ID・ヘッダ・列・行
 * @returns PDFのバイト列
 */
export const buildKizaihyouPdf = async ({ kizaihyouCod, head, columns, rows }: KizaihyouPdfInput) => {
  const dataRows = rows.filter(hasEquipmentRowContent);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${kizaihyouCod} ${head.eventName}`.trim());
  pdfDoc.registerFontkit(fontkit);
  // 名称の列幅を文字の幅から決めるので、レイアウトより先にフォントを読み込む
  const font = await pdfDoc.embedFont(await fs.readFile(FONT_PATH), { subset: true });

  const fixedWidths = FIXED_COLUMNS.map((column, index) =>
    index === NAME_COLUMN_INDEX ? measureNameWidth(dataRows.map(getIndentedName), font) : column.width
  );
  const fixedWidth = fixedWidths.reduce((sum, width) => sum + width, 0);

  // ポジション列の幅からページサイズを決める
  const positionWidthOn = (pageWidth: number) =>
    columns.length ? Math.min(MAX_POSITION_WIDTH, (pageWidth - MARGIN * 2 - fixedWidth) / columns.length) : 0;
  const page = columns.length && positionWidthOn(A4_LANDSCAPE.width) < MIN_POSITION_WIDTH ? A3_LANDSCAPE : A4_LANDSCAPE;
  const positionWidth = positionWidthOn(page.width);

  const widths = [...fixedWidths, ...columns.map(() => positionWidth)];
  const aligns: ('left' | 'right')[] = [
    ...FIXED_COLUMNS.map((column) => column.align),
    ...columns.map(() => 'right' as const),
  ];
  const headers = [...FIXED_COLUMNS.map((column) => column.label), ...columns.map((column) => column.label)];

  // 各列の左端x座標と表の右端
  const columnX: number[] = [];
  const tableRight = widths.reduce((x, width) => {
    columnX.push(x);
    return x + width;
  }, MARGIN);

  // 1ページ目は公演情報がある分だけ表が短くなるので、ページ数を先に出す
  const infoLines = buildInfoLines(head);
  const titleBlock = MARGIN + TITLE_FONT_SIZE + 16;
  const firstTableTop = page.height - titleBlock - infoLines.length * INFO_LINE_HEIGHT - 4;
  const otherTableTop = page.height - titleBlock - 4;
  const capacityOf = (top: number) => Math.max(1, Math.floor((top - MARGIN - HEADER_ROW_HEIGHT) / ROW_HEIGHT));
  const firstCapacity = capacityOf(firstTableTop);
  const otherCapacity = capacityOf(otherTableTop);
  const pageCount =
    dataRows.length <= firstCapacity ? 1 : 1 + Math.ceil((dataRows.length - firstCapacity) / otherCapacity);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pdfPage = pdfDoc.addPage([page.width, page.height]);
    const isFirst = pageIndex === 0;

    // タイトルとページ番号
    const titleY = page.height - MARGIN - TITLE_FONT_SIZE;
    pdfPage.drawText(`機材表 ${kizaihyouCod}`, { x: MARGIN, y: titleY, size: TITLE_FONT_SIZE, font });
    const pageLabel = `${pageIndex + 1} / ${pageCount}`;
    pdfPage.drawText(pageLabel, {
      x: page.width - MARGIN - font.widthOfTextAtSize(pageLabel, INFO_FONT_SIZE),
      y: titleY,
      size: INFO_FONT_SIZE,
      font,
    });

    if (isFirst) {
      infoLines.forEach((line, index) => {
        pdfPage.drawText(fitText(line, font, INFO_FONT_SIZE, page.width - MARGIN * 2), {
          x: MARGIN,
          y: page.height - titleBlock - index * INFO_LINE_HEIGHT,
          size: INFO_FONT_SIZE,
          font,
        });
      });
    }

    const top = isFirst ? firstTableTop : otherTableTop;
    const start = isFirst ? 0 : firstCapacity + (pageIndex - 1) * otherCapacity;
    const pageRows = dataRows.slice(start, start + (isFirst ? firstCapacity : otherCapacity));
    const bottom = top - HEADER_ROW_HEIGHT - pageRows.length * ROW_HEIGHT;

    // 見出し行
    pdfPage.drawRectangle({
      x: MARGIN,
      y: top - HEADER_ROW_HEIGHT,
      width: tableRight - MARGIN,
      height: HEADER_ROW_HEIGHT,
      color: HEADER_FILL,
    });
    headers.forEach((label, index) => {
      drawCellText({
        page: pdfPage,
        font,
        text: label,
        x: columnX[index],
        y: top - HEADER_ROW_HEIGHT + 5,
        width: widths[index],
        align: aligns[index],
      });
    });

    // 機材の行
    pageRows.forEach((row, rowIndex) => {
      const total = getTotal(row);
      const active = getActiveSum(row);
      const values = [
        row.kind,
        getIndentedName(row),
        row.remark,
        total ? String(total) : '',
        active ? String(active) : '',
        row.spare,
        ...columns.map((column) => row.qty[column.id] ?? ''),
      ];
      const y = top - HEADER_ROW_HEIGHT - (rowIndex + 1) * ROW_HEIGHT + 4;
      values.forEach((value, index) => {
        drawCellText({
          page: pdfPage,
          font,
          text: value,
          x: columnX[index],
          y,
          width: widths[index],
          align: aligns[index],
          // 種類・名称は切れると機材が分からなくなるので、まず縮めて収める
          shrink: index <= NAME_COLUMN_INDEX,
        });
      });
    });

    // 罫線（見出しの上端から各行の下端まで）
    for (let line = 0; line <= pageRows.length + 1; line += 1) {
      const y = line === 0 ? top : top - HEADER_ROW_HEIGHT - (line - 1) * ROW_HEIGHT;
      pdfPage.drawLine({ start: { x: MARGIN, y }, end: { x: tableRight, y }, thickness: 0.4, color: LINE_COLOR });
    }
    [...columnX, tableRight].forEach((x) => {
      pdfPage.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.4, color: LINE_COLOR });
    });
  }

  return pdfDoc.save();
};

/**
 * PDFのファイル名を組み立てる関数
 * @param kizaihyouCod 機材表ID（KZ-0001形式）
 * @param eventName 公演名
 * @returns 「KZ-0001_公演名_機材表.pdf」形式のファイル名
 */
export const buildKizaihyouPdfFileName = (kizaihyouCod: string, eventName: string) =>
  buildKizaihyouFileName(kizaihyouCod, eventName, 'pdf');
