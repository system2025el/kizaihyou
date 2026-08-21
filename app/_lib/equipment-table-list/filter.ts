import { EquipmentTableListRow, EquipmentTableStatus, KIZAIHYOU_STS } from './types';

/** 機材表履歴一覧の絞り込み条件 */
export type EquipmentTableListFilter = {
  /** フリーワード。空白区切りで、すべての語を含む行だけを残す */
  query: string;
  /** 絞り込むステータス。空配列なら絞り込まない */
  statuses: EquipmentTableStatus[];
  /** 出庫日の開始（YYYY-MM-DD）。空文字なら下限なし */
  shippedFrom: string;
  /** 出庫日の終了（YYYY-MM-DD）。空文字なら上限なし */
  shippedTo: string;
};

export const EMPTY_FILTER: EquipmentTableListFilter = {
  query: '',
  statuses: [],
  shippedFrom: '',
  shippedTo: '',
};

/** 並び替えできる列 */
export type EquipmentTableListSortKey =
  | 'cod'
  | 'eventName'
  | 'place'
  | 'clientName'
  | 'createdAt'
  | 'updatedAt'
  | 'shippedAt'
  | 'returnedAt'
  | 'status'
  | 'salesStaffName'
  | 'juchuHeadId';

export type EquipmentTableListSort = {
  key: EquipmentTableListSortKey;
  direction: 'asc' | 'desc';
};

/** 既定の並び順。DBから返ってくる順（更新日時の新しい順）と同じ */
export const DEFAULT_SORT: EquipmentTableListSort = { key: 'updatedAt', direction: 'desc' };

/**
 * フリーワードの検索対象。
 *
 * **ステータスは含めない**。専用の絞り込みがあるうえに、
 * 公演名に「承認」のような語が入っているとステータスで絞ったつもりの
 * 結果に紛れ込むため。
 */
const searchTarget = (row: EquipmentTableListRow) =>
  [row.cod, row.eventName, row.place, row.clientName, row.salesStaffName, row.requesterName, row.juchuHeadId]
    .join(' ')
    .toLowerCase();

/** 空白区切りの語をすべて含むか（AND検索）。全角空白も区切りとして扱う */
const matchesQuery = (row: EquipmentTableListRow, query: string) => {
  const terms = query.split(/[\s　]+/).filter(Boolean);
  if (!terms.length) return true;
  const target = searchTarget(row);
  return terms.every((term) => target.includes(term.toLowerCase()));
};

/** 出庫日が期間に入っているか。出庫日が未入力の行は、期間を指定した時点で対象外にする */
const matchesShippedRange = (row: EquipmentTableListRow, from: string, to: string) => {
  if (!from && !to) return true;
  if (!row.shippedAt) return false;
  if (from && row.shippedAt < from) return false;
  if (to && row.shippedAt > to) return false;
  return true;
};

/** 絞り込みが1つでも効いているか（「◯件中◯件」を出すかの判定に使う） */
export const hasFilter = (filter: EquipmentTableListFilter) =>
  Boolean(filter.query.trim() || filter.statuses.length || filter.shippedFrom || filter.shippedTo);

export const filterEquipmentTableList = (rows: EquipmentTableListRow[], filter: EquipmentTableListFilter) =>
  rows.filter(
    (row) =>
      matchesQuery(row, filter.query) &&
      (!filter.statuses.length || filter.statuses.includes(row.status)) &&
      matchesShippedRange(row, filter.shippedFrom, filter.shippedTo)
  );

/**
 * 並び替えに使う値。
 *
 * 日時は「YYYY/MM/DD HH:mm」、日付は「YYYY-MM-DD」でどちらも0埋めされているので、
 * 文字列のまま比べても時系列どおりに並ぶ。
 * ステータスはマスタのコード順（作成中→申請中→…）で並べたいので数値に読み替える。
 */
const sortValue = (row: EquipmentTableListRow, key: EquipmentTableListSortKey): string | number | null => {
  if (key === 'status') return KIZAIHYOU_STS[row.status];
  return row[key];
};

/** 未入力（null・空文字）は方向によらず末尾に置く。並び替えても行が迷子にならないようにするため */
const isEmpty = (value: string | number | null) => value === null || value === '';

export const sortEquipmentTableList = (rows: EquipmentTableListRow[], sort: EquipmentTableListSort) => {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (isEmpty(left) || isEmpty(right)) {
      if (isEmpty(left) && isEmpty(right)) return 0;
      return isEmpty(left) ? 1 : -1;
    }
    if (left === right) return 0;
    return (left < right ? -1 : 1) * sign;
  });
};
