export const parseDisplayDate = (value: string) => {
  const [year, month, day] = value.split('/').map(Number);
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

export const buildDateList = (start: Date, end: Date) => {
  const dates: Date[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
};
