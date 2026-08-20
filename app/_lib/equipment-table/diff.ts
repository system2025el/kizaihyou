import { EquipmentTableHead } from '../equipment-table-list/types';
import { getActiveSum, hasEquipmentRowContent } from './sheet';
import { EquipmentRow, EquipmentTableSnapshot } from './types';

/**
 * 申請時点のスナップショット同士の差分。
 *
 * 機材表承認画面が「ひとつ前の申請から何が変わったか」を出すために使う。
 * 差戻し→再申請なら「差し戻した版から直したところ」、承認済→再申請なら
 * 「承認した版から変わったところ」が、同じ比較で得られる。
 */
export type EquipmentTableDiff = {
  /** 比較した前回の申請日時（表示用） */
  previousAt: string;
  /** 変わったヘッダ項目 */
  head: { label: string; before: string; after: string }[];
  /** 追加された行のキー（今回にあり、前回に無い） */
  addedKeys: string[];
  /** 数量が変わった行のキー → 前回の数量 */
  changedKeys: Record<string, { orderedQty: number; spareQty: number }>;
  /**
   * 削除された機材（前回にあり、今回に無い）。
   * 承認画面では数量0の行として一覧に並べ、前回の数量を併記する。
   */
  removedRows: EquipmentTableDiffRow[];
};

/** 削除された機材1件。数量は前回の値 */
export type EquipmentTableDiffRow = {
  key: string;
  kizaiId: number | null;
  name: string;
  orderedQty: number;
  spareQty: number;
};

/**
 * 行を突き合わせるキー。
 * kikikanの機材マスタから選んだ行は機材IDで、手入力の名称は名称で対応付ける
 * （行のidは保存のたびに採番し直されるので使えない）。
 */
export const toDiffKey = (row: Pick<EquipmentRow, 'kizaiId' | 'name'>) =>
  row.kizaiId === null ? `nam:${row.name}` : `id:${row.kizaiId}`;

type RowSummary = { kizaiId: number | null; name: string; orderedQty: number; spareQty: number };

/** 同じ機材が複数行あることもあるので、キーごとに数量を合算する */
const summarize = (rows: EquipmentRow[]) => {
  const summary = new Map<string, RowSummary>();
  for (const row of rows.filter(hasEquipmentRowContent)) {
    const key = toDiffKey(row);
    const current = summary.get(key);
    const orderedQty = getActiveSum(row);
    const spareQty = Number(row.spare) || 0;
    if (current) {
      current.orderedQty += orderedQty;
      current.spareQty += spareQty;
    } else {
      summary.set(key, { kizaiId: row.kizaiId, name: row.name, orderedQty, spareQty });
    }
  }
  return summary;
};

const HEAD_LABELS: { key: keyof EquipmentTableHead; label: string }[] = [
  { key: 'eventName', label: '公演名' },
  { key: 'place', label: '場所' },
  { key: 'clientName', label: '顧客名' },
  { key: 'shippedAt', label: '出庫日' },
  { key: 'returnedAt', label: '入庫日' },
  { key: 'memo', label: '備考' },
];

/**
 * 前回の申請と今回の申請の差分を求める関数
 *
 * @param previous 前回の申請時点のスナップショット
 * @param current 今回の申請時点のスナップショット
 * @param previousAt 前回の申請日時（表示用）
 * @returns 差分
 */
export const buildEquipmentTableDiff = (
  previous: EquipmentTableSnapshot,
  current: EquipmentTableSnapshot,
  previousAt: string
): EquipmentTableDiff => {
  const head = HEAD_LABELS.filter(({ key }) => (previous.head[key] ?? '') !== (current.head[key] ?? '')).map(
    ({ key, label }) => ({
      label,
      before: previous.head[key] || '（未入力）',
      after: current.head[key] || '（未入力）',
    })
  );

  const before = summarize(previous.rows);
  const after = summarize(current.rows);

  const addedKeys: string[] = [];
  const changedKeys: EquipmentTableDiff['changedKeys'] = {};
  for (const [key, row] of after) {
    const old = before.get(key);
    if (!old) {
      addedKeys.push(key);
      continue;
    }
    if (old.orderedQty !== row.orderedQty || old.spareQty !== row.spareQty) {
      changedKeys[key] = { orderedQty: old.orderedQty, spareQty: old.spareQty };
    }
  }

  const removedRows = [...before.entries()].filter(([key]) => !after.has(key)).map(([key, row]) => ({ key, ...row }));

  return { previousAt, head, addedKeys, changedKeys, removedRows };
};

/** 差分が1つでもあるか（無ければ画面に出さない） */
export const hasDiff = (diff: EquipmentTableDiff) =>
  diff.head.length > 0 ||
  diff.addedKeys.length > 0 ||
  diff.removedRows.length > 0 ||
  Object.keys(diff.changedKeys).length > 0;
