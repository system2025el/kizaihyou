import { EquipmentRow } from './types';

/**
 * 機材名の前に付けるインデント文字。kikikanのm_dic（dic_id = 1）と同じ文字を使う。
 * 直前の機材とセットで使うもの（付属ケーブル等）を表す。
 */
export const INDENT_CHARA = ' ┗ ';

/** 表示・出力に使う機材名。インデントが付いている行は先頭に「 ┗ 」を足す */
export const getIndentedName = (row: EquipmentRow) =>
  row.name ? `${INDENT_CHARA.repeat(row.indent)}${row.name}` : row.name;

/** 数量の桁数の上限（DBのinteger、kikikanの数量列に収まる範囲） */
const QTY_MAX_DIGITS = 6;

/**
 * 数量の入力欄に入れられた文字を、数量として受け付ける文字列に直す関数。
 *
 * 入力欄は`type="number"`にしていない。スピンボタン（△▽）やマウスのホイール・上下キーで
 * 値が変わって誤入力が多かったため（課題A-2）。代わりにここで数字以外を落とす。
 * マイナス・小数点も落ちるので、0以上の整数しか入らない（課題A-3）。
 * 日本語入力のまま打った全角数字は半角に直す。
 */
export const toQtyInput = (value: string) =>
  value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, QTY_MAX_DIGITS);

/**
 * 保存する数量に直す関数。0以上の整数でなければnull（空欄扱い）にする。
 * 画面では数字しか入らないが、Server Actionsは直接呼べるのでサーバー側でも確かめる。
 */
export const parseQty = (value: string | undefined) => {
  if (!value) return null;
  const qty = Number(value);
  return Number.isInteger(qty) && qty >= 0 ? qty : null;
};

/**
 * 行が属するセット（インデントの無い行と、その直下に続くインデント行＝付属品）の範囲を返す関数。
 * @returns [先頭のindex, 末尾の次のindex]
 */
const getRowGroupRange = (rows: EquipmentRow[], index: number): [number, number] => {
  let start = index;
  // 付属品なら親までさかのぼる。先頭が親のいない付属品なら、そこをセットの先頭とみなす
  while (start > 0 && rows[start].indent > 0) start -= 1;
  let end = start + 1;
  while (end < rows.length && rows[end].indent > 0) end += 1;
  return [start, end];
};

/**
 * ドラッグで行を並び替える関数（課題A-9）。
 *
 * - **親の行（インデント無し）は、直下に続く付属品（インデント行）ごと動かす**。セットオプションで足した
 *   付属品が親だけ動かすと置き去りになる、という要望への対応。
 * - 親を動かすとき、落とした先が別のセットの中なら、そのセットの前（上へ動かしたとき）か後ろ（下へ動かしたとき）に置く。
 *   セットの親と付属品の間に別の機材が割り込むと、付属品が別の親に付いたように見えてしまうため。
 * - 付属品の行を動かすときは、その行だけを落とした位置へ動かす（別のセットへ付け替えられるように）。
 *
 * @param activeId 掴んだ行のid
 * @param overId 落とした位置の行のid
 */
export const moveEquipmentRow = (rows: EquipmentRow[], activeId: string, overId: string): EquipmentRow[] => {
  const from = rows.findIndex((row) => row.id === activeId);
  const to = rows.findIndex((row) => row.id === overId);
  if (from === -1 || to === -1 || from === to) return rows;

  if (rows[from].indent > 0) {
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  const [, blockEnd] = getRowGroupRange(rows, from);
  // 自分の付属品の上に落としたときは動かさない
  if (to > from && to < blockEnd) return rows;

  const block = rows.slice(from, blockEnd);
  const rest = [...rows.slice(0, from), ...rows.slice(blockEnd)];
  const [groupStart, groupEnd] = getRowGroupRange(
    rest,
    rest.findIndex((row) => row.id === overId)
  );
  const insertAt = to > from ? groupEnd : groupStart;
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
};

/**
 * 親の行を掴んだときに一緒に動く付属品の行のidを返す関数（ドラッグ中に薄く表示するため）。
 * 付属品の行を掴んだとき・付属品が無いときは空。
 */
export const getFollowingChildRowIds = (rows: EquipmentRow[], activeId: string) => {
  const from = rows.findIndex((row) => row.id === activeId);
  if (from === -1 || rows[from].indent > 0) return [];
  const [, blockEnd] = getRowGroupRange(rows, from);
  return rows.slice(from + 1, blockEnd).map((row) => row.id);
};

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
