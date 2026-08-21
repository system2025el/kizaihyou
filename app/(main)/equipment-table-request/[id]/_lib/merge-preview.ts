'use server';

import { KIKIKAN_BASHO_ID, KIKIKAN_NYUSHUKO_SHUBETU_ID } from '@/app/_lib/db/kikikan/constants';
import { selectKikikanJuchuHead } from '@/app/_lib/db/kikikan/t-juchu-head';
import { selectKikikanJuchuKizaiCurrent } from '@/app/_lib/db/kikikan/t-juchu-kizai';
import { toDiffKey } from '@/app/_lib/equipment-table/diff';
import { EquipmentTableApproval } from '@/app/_lib/equipment-table/funcs';
import { getActiveSum, hasEquipmentRowContent } from '@/app/_lib/equipment-table/sheet';

/** 機材1点の突き合わせ結果 */
export type MergePreviewRow = {
  kizaiId: number | null;
  kizaiNam: string;
  /** 前回の申請（＝前回連携した内容）の数量。今回追加された機材ならnull */
  previous: { orderedQty: number; spareQty: number } | null;
  /** 今回の申請の数量。機材表から消された機材ならnull */
  current: { orderedQty: number; spareQty: number } | null;
  /** 機材管理に今入っている数量。まだ登録されていなければnull */
  kikikan: { orderedQty: number; spareQty: number } | null;
  /** 受注部が機材管理側で数量を調整しているか（前回申請と機材管理の現在が違う） */
  adjustedByJuchu: boolean;
};

/** 再申請を機材明細へ反映するための下見（参照専用） */
export type MergePreview = {
  juchuHeadId: number;
  juchuKizaiHeadId: number;
  headNam: string;
  /**
   * 機材以外の食い違い（公演名・場所・顧客名・出庫日・入庫日）。
   * **自動では変えない**ので、受注部が機材管理側で直す前提で表示だけする。
   */
  headMismatches: { label: string; kizaihyou: string; kikikan: string }[];
  rows: MergePreviewRow[];
};

const BASHO_NAM: Record<number, string> = {
  [KIKIKAN_BASHO_ID.kics]: 'KICS',
  [KIKIKAN_BASHO_ID.yard]: 'YARD',
  [KIKIKAN_BASHO_ID.others]: '厚木',
};

const isSameQty = (a: { orderedQty: number; spareQty: number }, b: { orderedQty: number; spareQty: number }) =>
  a.orderedQty === b.orderedQty && a.spareQty === b.spareQty;

/**
 * 再申請の内容を機材明細へどう反映するかの下見を作る関数（**参照のみ**）。
 *
 * 連携後は機材管理が正で、受注部が向こうで手を入れている。ここでは
 *   「前回の申請 → 今回の申請」（機材表側で何が変わったか）と
 *   「機材管理の現在」（受注部が何を持っているか）
 * を並べて見せるだけで、書き込みは一切しない。
 *
 * @param approval 機材表承認画面が表示している内容
 * @returns 下見。未連携なら null
 */
export const fetchMergePreview = async (approval: EquipmentTableApproval): Promise<MergePreview | null> => {
  if (approval.juchuHeadId === null || approval.juchuKizaiHeadId === null) return null;

  const current = await selectKikikanJuchuKizaiCurrent(approval.juchuHeadId, approval.juchuKizaiHeadId);
  if (!current) return null;

  // --- 機材ごとの突き合わせ ---
  const rowByKey = new Map<string, MergePreviewRow>();

  for (const row of approval.rows.filter(hasEquipmentRowContent)) {
    const key = toDiffKey(row);
    const qty = { orderedQty: getActiveSum(row), spareQty: Number(row.spare) || 0 };
    const existing = rowByKey.get(key);
    if (existing?.current) {
      existing.current.orderedQty += qty.orderedQty;
      existing.current.spareQty += qty.spareQty;
      continue;
    }
    rowByKey.set(key, {
      kizaiId: row.kizaiId,
      kizaiNam: row.name,
      previous: null,
      current: qty,
      kikikan: null,
      adjustedByJuchu: false,
    });
  }

  // 前回の申請の数量。差分から復元できる（変更も削除もされていない機材は今回と同じ）
  const diff = approval.diff;
  for (const [key, row] of rowByKey) {
    if (diff?.addedKeys.includes(key)) continue; // 今回追加された＝前回は無い
    row.previous = diff?.changedKeys[key] ?? (row.current ? { ...row.current } : null);
  }
  for (const removed of diff?.removedRows ?? []) {
    rowByKey.set(removed.key, {
      kizaiId: removed.kizaiId,
      kizaiNam: removed.name,
      previous: { orderedQty: removed.orderedQty, spareQty: removed.spareQty },
      current: null,
      kikikan: null,
      adjustedByJuchu: false,
    });
  }

  // 機材管理の現在。機材表に無いもの（受注部が向こうで足した機材）も行として出す
  for (const row of current.rows) {
    const key = `id:${row.kizaiId}`;
    const kikikan = { orderedQty: row.planKizaiQty, spareQty: row.planYobiQty };
    const existing = rowByKey.get(key);
    if (existing) {
      existing.kikikan = kikikan;
      continue;
    }
    rowByKey.set(key, {
      kizaiId: row.kizaiId,
      kizaiNam: row.kizaiNam,
      previous: null,
      current: null,
      kikikan,
      adjustedByJuchu: false,
    });
  }

  for (const row of rowByKey.values()) {
    // 前回連携した内容と機材管理の現在が違う＝受注部が調整している
    row.adjustedByJuchu = Boolean(row.previous && row.kikikan && !isSameQty(row.previous, row.kikikan));
  }

  // --- 機材以外の食い違い ---
  const juchu = await selectKikikanJuchuHead(approval.juchuHeadId);
  const headMismatches: MergePreview['headMismatches'] = [];
  const pushIfDifferent = (label: string, kizaihyou: string, kikikan: string) => {
    if (kizaihyou.trim() !== kikikan.trim()) headMismatches.push({ label, kizaihyou, kikikan });
  };

  if (juchu) {
    pushIfDifferent('公演名', approval.head.eventName, juchu.koenNam);
    pushIfDifferent('公演場所', approval.head.place, juchu.koenbashoNam);
    pushIfDifferent('顧客名', approval.head.clientName, juchu.kokyakuNam);
  }
  for (const nyushuko of current.nyushuko) {
    const isShuko = nyushuko.shubetuId === KIKIKAN_NYUSHUKO_SHUBETU_ID.shuko;
    const label = `${isShuko ? '出庫日' : '入庫日'}（${BASHO_NAM[nyushuko.bashoId] ?? nyushuko.bashoId}）`;
    pushIfDifferent(label, isShuko ? approval.head.shippedAt : approval.head.returnedAt, nyushuko.dat);
  }

  return {
    juchuHeadId: approval.juchuHeadId,
    juchuKizaiHeadId: approval.juchuKizaiHeadId,
    headNam: current.headNam,
    headMismatches,
    rows: [...rowByKey.values()],
  };
};
