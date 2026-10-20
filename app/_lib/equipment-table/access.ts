// 'use server'は付けない。付けるとexportがすべて外から直接呼べるServer Actionsになり、
// 権限の判定そのものを素通しで呼ばれてしまう。Server Actionsの中からだけimportすること。

import { requireCurrentUser } from '../auth/funcs';
import { hasPermission, PERMISSION } from '../auth/permission';
import { CurrentUser } from '../auth/types';
import { KizaihyouLockRow, selectKizaihyouLock } from '../db/tables/t-kizaihyou-lock';
import { selectKizaihyouMember } from '../db/tables/t-kizaihyou-member';
import { EditLockInfo, hasRole, KIZAIHYOU_ROLE, KizaihyouAccess, KizaihyouRole, ROLE_LABELS, toRole } from './member';

/**
 * ログイン中のユーザーがこの機材表に対して持っている権限を求める関数。
 *
 * メンバーならその権限。メンバーでなくても受注部担当者なら閲覧だけ許す
 * （承認画面から申請時点の内容を開いたり、タイムラインにコメントしたりするため）。
 * どちらでもなければnull＝開けない。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param user ログイン中のユーザー
 * @returns 権限。開けなければnull
 */
export const getKizaihyouAccess = async (kizaihyouId: number, user: CurrentUser): Promise<KizaihyouAccess | null> => {
  const { data, error } = await selectKizaihyouMember(kizaihyouId, user.userId);
  if (error) throw new Error(`[getKizaihyouAccess] メンバーの取得に失敗しました: ${error.message}`);
  if (data) return { role: toRole(data.role_cod), member: true };
  if (hasPermission(user.permission, PERMISSION.juchu_tanto)) return { role: KIZAIHYOU_ROLE.閲覧, member: false };
  return null;
};

/** 権限が足りないときに投げる例外。画面に出す文言をそのまま持つ */
export class KizaihyouForbiddenError extends Error {}

/**
 * 操作に必要な権限を持っているかを確かめ、足りなければ例外を投げる関数。
 * 画面でボタンを消すだけではServer Actionsを直接呼ばれたときに素通りするので、
 * 機材表を変える処理はすべてこれを通すこと。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param required 必要な権限
 * @returns ログイン中のユーザーと、その権限
 */
export const requireKizaihyouRole = async (
  kizaihyouId: number,
  required: KizaihyouRole
): Promise<{ user: CurrentUser; access: KizaihyouAccess }> => {
  const user = await requireCurrentUser();
  const access = await getKizaihyouAccess(kizaihyouId, user);
  if (!access) throw new KizaihyouForbiddenError('この機材表のメンバーではありません。');
  if (!hasRole(access.role, required)) {
    throw new KizaihyouForbiddenError(`この操作には「${ROLE_LABELS[required]}」以上の権限が必要です。`);
  }
  return { user, access };
};

/** 編集ロックの行を画面に出す形に直す */
export const toLockInfo = (row: KizaihyouLockRow, userId: string): EditLockInfo => ({
  userId: row.user_id,
  userNam: row.user_nam,
  mine: row.user_id === userId,
  idleMinutes: Math.max(0, row.idle_minutes),
  expiresInSeconds: Math.max(0, row.expires_in_seconds),
});

/**
 * 保存・申請・状態の変更の前に、他の人が編集中でないかを確かめる関数。
 * 自分が持っているか誰も持っていなければnull、他の人が持っていればその情報を返す。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId ログイン中のユーザー
 * @returns 他の人の編集ロック。無ければnull
 */
export const findOtherEditor = async (kizaihyouId: number, userId: string): Promise<EditLockInfo | null> => {
  const lock = await selectKizaihyouLock(kizaihyouId);
  return lock && lock.user_id !== userId ? toLockInfo(lock, userId) : null;
};
