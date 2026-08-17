/**
 * 機材表のExcel雛形（resources/kizaihyou-template.xlsm）を作り直すスクリプト。
 *
 *   node scripts/build-excel-template.mjs <元にする.xlsmのパス>
 *
 * 実際に運用されている機材表を読み込み、書式・数式・列幅・印刷設定・固定ペイン・
 * VBA（マクロ）はそのまま残したまま、入力値だけを消して空の雛形にする。
 * 罫線や色を作り直さずに現行の見た目を再現できるので、レイアウトを変えたい場合は
 * Excel上で雛形を直接編集するか、新しい機材表を元にこのスクリプトを流し直す。
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const SRC = process.argv[2];
const OUT = path.join(process.cwd(), 'resources/kizaihyou-template.xlsm');
if (!SRC) {
  console.error('元にする.xlsmのパスを指定してください');
  process.exit(1);
}

const colNum = (col) => col.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const POSITION_FIRST = colNum('I');
const POSITION_LAST = colNum('AJ');

/** 見出し・ラベルとして残すセル（これ以外の1〜6行目の値は消す） */
const KEEP_IN_HEADER = new Set([
  'A1',
  'B1', // 公演名
  'B2', // 顧客名
  'D2', // 場所
  'B3', // 期間
  'D3', // 出庫
  'D4', // 返却
  'B5', // 種類
  'C5', // 名 称
  'D6', // 備考
  'F6', // TOTAL
  'G6', // ACTIVE
  'H6', // SPARE
]);

const files = unzipSync(new Uint8Array(fs.readFileSync(SRC)));
const dec = new TextDecoder();
const enc = new TextEncoder();

// 共有文字列から「備考」のindexを引く（B4のラベルに再利用する）
const strs = [...dec.decode(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')
);
const bikoIndex = strs.findIndex((s) => s.trim() === '備考');
if (bikoIndex < 0) throw new Error('共有文字列に「備考」が見つかりません');

let xml = dec.decode(files['xl/worksheets/sheet1.xml']);

/** 値を消す対象か判定する */
const shouldClear = (ref, col, row) => {
  if (row <= 6) return !KEEP_IN_HEADER.has(ref); // ヘッダの入力値とポジション見出しを消す
  return true; // 7行目以降のデータはすべて消す
};

let cleared = 0;
xml = xml.replace(/<row ([^>]*)>([\s\S]*?)<\/row>/g, (whole, rowAttrs, body) => {
  const rowNum = Number(rowAttrs.match(/r="(\d+)"/)[1]);
  const newBody = body.replace(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (cell, attrs, tail, inner = '') => {
    const m = attrs.match(/r="(([A-Z]+)\d+)"/);
    if (!m || tail === '/>') return cell;
    if (!shouldClear(m[1], m[2], rowNum)) return cell;
    const formula = inner.match(/<f[^>]*(?:\/>|>[\s\S]*?<\/f>)/)?.[0];
    // TODAY()のような雛形として残すべき数式は保持し、キャッシュ値だけ落とす
    const keptAttrs = attrs.replace(/\s*t="[^"]*"/, '');
    cleared += 1;
    return formula ? `<c${keptAttrs}>${formula}</c>` : `<c${keptAttrs}/>`;
  });
  return `<row ${rowAttrs}>${newBody}</row>`;
});

// B4に「備考」ラベルを足す（C4に機材表全体の備考が入る）
const styleOf = (ref) => xml.match(new RegExp(`<c r="${ref}"([^>]*)`))?.[1]?.match(/s="(\d+)"/)?.[1];
const b4Style = styleOf('B4') ?? styleOf('B3') ?? '17';
if (new RegExp(`<c r="B4"[^>]*?(\\/>|>[\\s\\S]*?<\\/c>)`).test(xml)) {
  xml = xml.replace(/<c r="B4"([^>]*?)(\/>|>[\s\S]*?<\/c>)/, (m, attrs) => {
    const kept = attrs.replace(/\s*t="[^"]*"/, '').replace(/\/\s*$/, '');
    return `<c r="B4"${kept} t="s"><v>${bikoIndex}</v></c>`;
  });
} else {
  xml = xml.replace(/(<row [^>]*r="4"[^>]*>)/, `$1<c r="B4" s="${b4Style}" t="s"><v>${bikoIndex}</v></c>`);
}
files['xl/worksheets/sheet1.xml'] = enc.encode(xml);

// キャッシュ値を消したので、開いたときに再計算させる
const wb = dec.decode(files['xl/workbook.xml']);
files['xl/workbook.xml'] = enc.encode(
  /<calcPr[^>]*\/>/.test(wb)
    ? wb.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>')
    : wb.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(zipSync(files, { level: 6 })));
console.log(`値を消したセル: ${cleared}`);
console.log(`VBA(マクロ)を保持: ${'xl/vbaProject.bin' in files}`);
console.log(`出力: ${OUT} (${fs.statSync(OUT).size} bytes)`);
