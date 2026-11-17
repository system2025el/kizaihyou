import { useCallback, useRef, useState } from 'react';

/** 履歴に積める件数の上限。古いものから捨てる */
const MAX_HISTORY = 100;

/**
 * 機材表画面の「元に戻す／やり直す」（課題A-11）。
 *
 * 操作の直前の内容（ヘッダ・列・行の丸ごと）を積んでおき、戻すときはそれに差し替える。
 * 行・列は書き換えのたびに新しい配列・オブジェクトを作っている（イミュータブル）ので、
 * 積むのは参照だけで済み、件数が多くてもコピーの負担は無い。
 *
 * 文字や数量の入力は1文字ずつ積むと戻すのが大変なので、同じ欄への続けての入力は1回分にまとめる
 * （`record`に同じキーを続けて渡すと積まない）。別の欄に移る、行を消すなどの操作を挟めば区切られる。
 *
 * 履歴は画面の中だけのもので、保存しても消えない（保存した後に戻すと、未保存の変更として扱われる）。
 * 他の人の保存を読み込んだときなど、画面の内容が外から差し替わったときは`reset`で捨てる。
 *
 * 積み下ろしは描画とは無関係にイベントの中で行うのでrefで持ち、ボタンの活性だけのために描き直しを起こす。
 */
export const useUndoHistory = <T>(current: T, restore: (state: T) => void) => {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const syncCounts = useCallback(
    () => setCounts({ past: pastRef.current.length, future: futureRef.current.length }),
    []
  );

  /**
   * 内容を書き換える直前に呼ぶ。
   * @param key 続けての入力を1回分にまとめるためのキー（「どの欄か」）。nullなら必ず1回分として積む
   */
  const record = useCallback(
    (key: string | null = null) => {
      if (key !== null && key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), currentRef.current];
      futureRef.current = [];
      syncCounts();
    },
    [syncCounts]
  );

  const undo = useCallback(() => {
    const target = pastRef.current.at(-1);
    if (target === undefined) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, currentRef.current];
    // 戻した直後の入力は、戻す前の入力とまとめない
    lastKeyRef.current = null;
    restore(target);
    syncCounts();
  }, [restore, syncCounts]);

  const redo = useCallback(() => {
    const target = futureRef.current.at(-1);
    if (target === undefined) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, currentRef.current];
    lastKeyRef.current = null;
    restore(target);
    syncCounts();
  }, [restore, syncCounts]);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    lastKeyRef.current = null;
    syncCounts();
  }, [syncCounts]);

  return { record, undo, redo, reset, canUndo: counts.past > 0, canRedo: counts.future > 0 };
};
