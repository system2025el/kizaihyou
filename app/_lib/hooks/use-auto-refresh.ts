'use client';

import { useEffect } from 'react';

/**
 * 一覧を取り直す間隔（ミリ秒）。
 * タイムライン（15秒）ほどの即時性は要らないので長めにしてある。
 */
const REFRESH_INTERVAL_MS = 60000;

/**
 * 画面を開いている間、定期的に・タブに戻ったときに再取得するフック。
 *
 * 他の人の操作（申請・承認・差戻し）を拾うために使う。タブが裏にある間は
 * 動かさず、表に戻った時点で必ず1回取り直すので、別作業から戻ったときは
 * 待たずに最新になる。
 *
 * @param refresh 再取得する処理。毎レンダリングで作り直さないよう`useCallback`で包むこと
 * @param enabled falseの間は動かさない
 * @param intervalMs 取り直す間隔（既定は60秒）
 */
export const useAutoRefresh = (refresh: () => void, enabled = true, intervalMs = REFRESH_INTERVAL_MS) => {
  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (document.visibilityState !== 'visible') return;
      refresh();
    };

    const timer = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, [refresh, enabled, intervalMs]);
};
