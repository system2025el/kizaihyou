/**
 * timestamptzを画面表示用の「YYYY/MM/DD HH:mm」に整形する関数。
 *
 * サーバー側で整形するため、実行環境のタイムゾーン（Vercel上はUTC）に
 * 左右されないよう明示的にJSTを指定する。
 *
 * @param value ISO形式の日時
 * @returns 整形した日時（valueが無ければ空文字）
 */
export const formatDateTime = (value: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(/-/g, '/');
};

/**
 * 今日の日付をJSTの「YYYY-MM-DD」で返す関数。
 * DBに入れる日付に使う。Vercel上の実行環境はUTCなので、
 * ローカル時刻から作ると日付がずれる（sv-SEロケールはYYYY-MM-DD形式になる）。
 *
 * @returns YYYY-MM-DD
 */
export const todayInJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

/**
 * date型（YYYY-MM-DD）を画面表示用の「YYYY/MM/DD」に整形する関数。
 * 日付のみの値なのでタイムゾーン変換はしない。
 *
 * @param value YYYY-MM-DD形式の日付
 * @returns 整形した日付（valueが無ければnull）
 */
export const formatDate = (value: string | null) => (value ? value.replace(/-/g, '/') : null);
