/** 「YYYY-MM-DD」「YYYY/MM/DD」どちらの表記でもDateに変換する */
export const parseDisplayDate = (value: string) => {
  const [year, month, day] = value.split(/[-/]/).map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatMd = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * 在庫を表示する日付の範囲（出庫日の1日前〜入庫日の8日後）。
 * 画面と在庫取得で同じ範囲を使うため、ここに集約する。
 *
 * @param shippedAt 出庫日（YYYY-MM-DD）
 * @param returnedAt 入庫日（YYYY-MM-DD）
 * @returns 範囲と日付リスト。出庫日か入庫日が未設定ならnull
 */
export const buildStockDateRange = (shippedAt: string, returnedAt: string) => {
  if (!shippedAt || !returnedAt) return null;

  const rangeStart = parseDisplayDate(shippedAt);
  const rangeEnd = parseDisplayDate(returnedAt);
  const start = addDays(rangeStart, -1);
  const end = addDays(rangeEnd, 8);
  return { rangeStart, rangeEnd, start, end, dates: buildDateList(start, end) };
};

/** DateをDBに渡す「YYYY-MM-DD」にする（ローカル日付のまま。UTC変換はしない） */
export const formatIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const buildDateList = (start: Date, end: Date) => {
  const dates: Date[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
};
