'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { keepEditing, startEditing, stopEditing } from '@/app/_lib/equipment-table/lock-funcs';
import {
  EDIT_LOCK_HEARTBEAT_MS,
  EDIT_LOCK_TTL_MINUTES,
  EDIT_LOCK_WARN_SECONDS,
  StartEditingResult,
} from '@/app/_lib/equipment-table/member';

/** ロックが無くなった理由。expired＝操作が無く期限が切れた、それ以外は取り直せなかった結果 */
export type LockLostReason = { reason: 'expired' } | Exclude<StartEditingResult, { ok: true }>;

/** 期限の表示を確かめる間隔 */
const TICK_MS = 5000;

/** 画面を離れたあと、ロックを外すまで待つ時間（React Strict Modeの付け直しで外さないため） */
const RELEASE_DELAY_MS = 500;

/**
 * 画面を閉じたときのロック解除を、少しだけ遅らせて予約しておく場所。
 * 開発時のStrict Modeは画面を一度外してすぐ付け直すので、そのたびに外してしまわないよう、
 * 付け直したら予約を取り消す。
 */
const pendingReleases = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * 機材表画面の編集ロックを扱うフック。
 *
 * - 「編集」で取り、「編集を終了」・画面を離れる・タブを閉じるで外す
 * - 編集中は、前回の延長から操作（キー入力・クリック）があったときだけ1分ごとに延長する。
 *   10分何もしなければ延長が止まって切れる。切れる1分前から警告を出せるよう\`warning\`を立てる
 * - 他の人に取られた・期限が切れたときは\`onLost\`で知らせる（入力中の内容は画面に残る）
 *
 * @param kizaihyouId 対象のkizaihyou_id（未保存の新規作成ならnull。ロックは使わない）
 * @param initialExpiresInSeconds 画面を開いた時点で自分がロックを持っていれば、その残り秒数
 * @param onLost ロックが無くなったときに呼ばれる
 */
export const useEditLock = (
  kizaihyouId: number | null,
  initialExpiresInSeconds: number | null,
  onLost: (lost: LockLostReason) => void
) => {
  const [expiresAt, setExpiresAt] = useState<number | null>(() =>
    initialExpiresInSeconds === null ? null : Date.now() + initialExpiresInSeconds * 1000
  );
  const [now, setNow] = useState(() => Date.now());
  const editing = kizaihyouId !== null && expiresAt !== null;

  const lastActivityRef = useRef(Date.now());
  const lastExtendRef = useRef(Date.now());
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  const applyResult = useCallback((result: StartEditingResult) => {
    if (result.ok) {
      setExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      lastExtendRef.current = Date.now();
    } else {
      setExpiresAt(null);
      onLostRef.current(result);
    }
    return result;
  }, []);

  /** 「編集」を押したとき */
  const start = useCallback(async (): Promise<StartEditingResult | null> => {
    if (kizaihyouId === null) return null;
    const result = await startEditing(kizaihyouId);
    if (result.ok) {
      setExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      lastActivityRef.current = Date.now();
      lastExtendRef.current = Date.now();
    }
    return result;
  }, [kizaihyouId]);

  /** 警告に出す「編集を続ける」や、操作があったときの延長 */
  const extend = useCallback(async () => {
    if (kizaihyouId === null) return;
    applyResult(await keepEditing(kizaihyouId));
  }, [kizaihyouId, applyResult]);

  /** 「編集を終了」したとき */
  const stop = useCallback(async () => {
    setExpiresAt(null);
    if (kizaihyouId !== null) await stopEditing(kizaihyouId).catch(() => undefined);
  }, [kizaihyouId]);

  /** 保存はサーバー側でロックを延長しているので、画面の期限も合わせる */
  const markExtended = useCallback(() => {
    setExpiresAt(Date.now() + EDIT_LOCK_TTL_MINUTES * 60 * 1000);
    lastExtendRef.current = Date.now();
  }, []);

  /** 申請などでサーバー側がロックを外したとき */
  const markReleased = useCallback(() => setExpiresAt(null), []);

  // 操作の記録と、操作があったときだけの延長
  useEffect(() => {
    if (!editing) return;
    const touch = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('keydown', touch);
    window.addEventListener('pointerdown', touch);
    const timer = setInterval(() => {
      if (lastActivityRef.current > lastExtendRef.current) void extend();
    }, EDIT_LOCK_HEARTBEAT_MS);
    return () => {
      window.removeEventListener('keydown', touch);
      window.removeEventListener('pointerdown', touch);
      clearInterval(timer);
    };
  }, [editing, extend]);

  // 期限の確認（警告の表示と、切れたときの通知）
  useEffect(() => {
    if (!editing) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [editing]);

  const remainingSeconds = expiresAt === null ? null : Math.ceil((expiresAt - now) / 1000);
  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds <= 0) {
      setExpiresAt(null);
      onLostRef.current({ reason: 'expired' });
    }
  }, [remainingSeconds]);

  // タブを閉じた・別のページへ移ったときに外す
  useEffect(() => {
    if (!editing || kizaihyouId === null) return;
    const pending = pendingReleases.get(kizaihyouId);
    if (pending) {
      clearTimeout(pending);
      pendingReleases.delete(kizaihyouId);
    }

    // ページを離れる瞬間はServer Actionsの応答を待てないので、ブラウザが送り届けるsendBeaconで外す
    const releaseOnLeave = () => navigator.sendBeacon(`/api/equipment-table/${kizaihyouId}/lock/release`);
    window.addEventListener('pagehide', releaseOnLeave);
    return () => {
      window.removeEventListener('pagehide', releaseOnLeave);
      // 画面内の移動（一覧へ戻る等）。Strict Modeの付け直しなら上で取り消される
      pendingReleases.set(
        kizaihyouId,
        setTimeout(() => {
          pendingReleases.delete(kizaihyouId);
          void stopEditing(kizaihyouId).catch(() => undefined);
        }, RELEASE_DELAY_MS)
      );
    };
  }, [editing, kizaihyouId]);

  return {
    editing,
    /** まもなく切れる（警告を出す） */
    warning: remainingSeconds !== null && remainingSeconds <= EDIT_LOCK_WARN_SECONDS,
    remainingSeconds,
    start,
    extend,
    stop,
    markExtended,
    markReleased,
  };
};
