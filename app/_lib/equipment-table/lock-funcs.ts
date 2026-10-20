'use server';

import { selectKizaihyouHead } from '../db/tables/t-kizaihyou';
import { insertKizaihyouHis } from '../db/tables/t-kizaihyou-his';
import { acquireKizaihyouLock, deleteKizaihyouLock, selectKizaihyouLock } from '../db/tables/t-kizaihyou-lock';
import { KIZAIHYOU_ACT } from '../equipment-table-list/types';
import { KizaihyouForbiddenError, requireKizaihyouRole, toLockInfo } from './access';
import {
  EDIT_LOCK_TTL_MINUTES,
  EditStatus,
  KIZAIHYOU_ROLE,
  READ_ONLY_STATUS_NAMES,
  StartEditingResult,
} from './member';

/** 機材表の今のステータス名と版を取る */
const selectState = async (kizaihyouId: number) => {
  const { data, error } = await selectKizaihyouHead(kizaihyouId);
  if (error) throw new Error(`[selectState] 機材表の取得に失敗しました: ${error.message}`);
  if (!data) throw new Error('[selectState] 機材表が見つかりません');
  return { status: data.m_kizaihyou_sts?.sts_nam ?? '', contentVer: data.content_ver };
};

/**
 * 「編集」を押したときに編集ロックを取る関数。
 *
 * 他の人が編集中なら取らずに、その人の情報を返す。
 * 取れたときは今の版も返すので、画面は自分の持っている版と比べて、古ければ読み直す。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 取れたか、取れなければ理由
 */
export const startEditing = async (kizaihyouId: number): Promise<StartEditingResult> => {
  try {
    const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.編集);

    const { status, contentVer } = await selectState(kizaihyouId);
    if (READ_ONLY_STATUS_NAMES.includes(status)) {
      return { ok: false, reason: 'readonly', message: `${status}の機材表は編集できません。` };
    }

    const lock = await acquireKizaihyouLock(kizaihyouId, user.userId, user.userNam, EDIT_LOCK_TTL_MINUTES);
    if (!lock) {
      const current = await selectKizaihyouLock(kizaihyouId);
      // 取れなかった直後に相手が外した、という隙間ではもう一度押してもらう
      if (!current) return { ok: false, reason: 'readonly', message: 'もう一度「編集」を押してください。' };
      return { ok: false, reason: 'locked', lock: toLockInfo(current, user.userId) };
    }
    return { ok: true, expiresInSeconds: lock.expires_in_seconds, contentVer };
  } catch (e) {
    if (e instanceof KizaihyouForbiddenError) return { ok: false, reason: 'forbidden', message: e.message };
    throw e;
  }
};

/**
 * 編集中の画面が、操作があったときに編集ロックを延長する関数。
 *
 * 期限が切れていても、まだ誰も取っていなければ取り直す（版の照合があるので、
 * その間に誰かが保存していても保存時に止まる）。他の人が取っていれば延長できない。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 延長できたか
 */
export const keepEditing = async (kizaihyouId: number): Promise<StartEditingResult> => startEditing(kizaihyouId);

/**
 * 「編集を終了」や画面を離れるときに、自分の編集ロックを外す関数
 * @param kizaihyouId 対象のkizaihyou_id
 */
export const stopEditing = async (kizaihyouId: number) => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.閲覧);
  await deleteKizaihyouLock(kizaihyouId, user.userId);
};

/**
 * 持ち主が、他の人の編集ロックを強制的に外す関数。
 * 編集中のままPCを離れた人がいて、自動で切れる（10分）のを待てないときに使う。
 * 誰のロックを外したかは操作履歴に残す。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 */
export const forceStopEditing = async (kizaihyouId: number) => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.持ち主);
  const removedUserNam = await deleteKizaihyouLock(kizaihyouId, null);
  if (!removedUserNam) return;

  const { error } = await insertKizaihyouHis(
    kizaihyouId,
    KIZAIHYOU_ACT.ロック解除,
    `編集ロックを解除（${removedUserNam}さんの編集）`,
    user.userId,
    user.userNam,
    null
  );
  if (error) throw new Error(`[forceStopEditing] 操作履歴の登録に失敗しました: ${error.message}`);
};

/**
 * 閲覧している画面が定期的に取りに行く、機材表の今の状態（誰が編集中か・版）
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 有効な編集ロックと今の版
 */
export const fetchEditStatus = async (kizaihyouId: number): Promise<EditStatus> => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.閲覧);
  const [lock, { contentVer }] = await Promise.all([selectKizaihyouLock(kizaihyouId), selectState(kizaihyouId)]);
  return { lock: lock ? toLockInfo(lock, user.userId) : null, contentVer };
};
