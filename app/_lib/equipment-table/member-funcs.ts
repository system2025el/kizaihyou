'use server';

import { selectUser, selectUserList } from '../db/tables/m-user';
import { insertKizaihyouHis } from '../db/tables/t-kizaihyou-his';
import { deleteKizaihyouLock } from '../db/tables/t-kizaihyou-lock';
import {
  deleteKizaihyouMember,
  insertKizaihyouMember,
  selectKizaihyouMemberList,
  updateKizaihyouMemberRole,
} from '../db/tables/t-kizaihyou-member';
import { KIZAIHYOU_ACT } from '../equipment-table-list/types';
import { requireKizaihyouRole } from './access';
import {
  INVITABLE_ROLES,
  KIZAIHYOU_ROLE,
  KizaihyouMember,
  KizaihyouRole,
  MemberCandidate,
  ROLE_LABELS,
  toRole,
} from './member';

/** 招待・権限変更で選べる権限か（持ち主は作成者だけなので選ばせない） */
const assertInvitableRole = (role: number): KizaihyouRole => {
  if (!(INVITABLE_ROLES as readonly number[]).includes(role)) throw new Error('[assertInvitableRole] 選べない権限です');
  return role as KizaihyouRole;
};

/** メンバーの変更を操作履歴（タイムライン）に残す */
const recordMemberChange = async (kizaihyouId: number, userId: string, userNam: string, actNam: string) => {
  const { error } = await insertKizaihyouHis(kizaihyouId, KIZAIHYOU_ACT.メンバー変更, actNam, userId, userNam, null);
  if (error) throw new Error(`[recordMemberChange] 操作履歴の登録に失敗しました: ${error.message}`);
};

/**
 * 対象のユーザーを取得する（氏名は履歴に残す）。
 * 招待するときは有効なユーザーに限るが、権限変更・外すときは無効になった人（退職など）も対象にできるようにする
 */
const findUser = async (userId: string, activeOnly: boolean) => {
  const { data, error } = await selectUser(userId);
  if (error) throw new Error(`[findUser] ユーザーの取得に失敗しました: ${error.message}`);
  if (!data || (activeOnly && data.del_flg !== 0)) throw new Error('[findUser] 招待できるユーザーではありません');
  return data;
};

/**
 * 機材表のメンバー一覧を取得する関数（メンバーなら誰でも見られる）
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 持ち主が先頭、あとは権限の強い順
 */
export const fetchKizaihyouMembers = async (kizaihyouId: number): Promise<KizaihyouMember[]> => {
  await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.閲覧);

  const { data, error } = await selectKizaihyouMemberList(kizaihyouId);
  if (error) throw new Error(`[fetchKizaihyouMembers] メンバーの取得に失敗しました: ${error.message}`);
  return (data ?? []).map((member) => ({
    userId: member.user_id,
    userNam: member.m_user?.user_nam ?? '',
    email: member.m_user?.email ?? '',
    role: toRole(member.role_cod),
  }));
};

/**
 * 招待できるユーザー（kizaihyouにアカウントがあり、まだメンバーでない人）を取得する関数。持ち主だけ
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 表示順に並んだユーザー
 */
export const fetchMemberCandidates = async (kizaihyouId: number): Promise<MemberCandidate[]> => {
  await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.持ち主);

  const [{ data: users, error }, members] = await Promise.all([selectUserList(), fetchKizaihyouMembers(kizaihyouId)]);
  if (error) throw new Error(`[fetchMemberCandidates] ユーザーの取得に失敗しました: ${error.message}`);

  const memberIds = new Set(members.map((member) => member.userId));
  return (users ?? [])
    .filter((user) => !memberIds.has(user.user_id))
    .map((user) => ({ userId: user.user_id, userNam: user.user_nam, email: user.email }));
};

/**
 * メンバーを招待する関数。持ち主だけ。
 * 招待するとすぐ機材表履歴一覧に出る（通知は送らないので、本人には別途伝える）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 招待するm_user.user_id
 * @param role 権限（閲覧・編集・申請）
 */
export const addKizaihyouMember = async (kizaihyouId: number, userId: string, role: number) => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.持ち主);
  const roleCod = assertInvitableRole(role);
  const target = await findUser(userId, true);

  const { error } = await insertKizaihyouMember(kizaihyouId, userId, roleCod, user.userNam);
  if (error) throw new Error(`[addKizaihyouMember] メンバーの追加に失敗しました: ${error.message}`);

  await recordMemberChange(
    kizaihyouId,
    user.userId,
    user.userNam,
    `メンバーを招待（${target.user_nam}：${ROLE_LABELS[roleCod]}）`
  );
};

/**
 * メンバーの権限を変える関数。持ち主だけ。持ち主自身の権限は変えられない。
 *
 * 編集ロックを持っている人を閲覧に下げた場合は、ロックも外す
 * （そのままだと編集できない人がロックを握り続けてしまう）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 対象のm_user.user_id
 * @param role 変更後の権限（閲覧・編集・申請）
 */
export const changeKizaihyouMemberRole = async (kizaihyouId: number, userId: string, role: number) => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.持ち主);
  const roleCod = assertInvitableRole(role);
  const target = await findUser(userId, false);

  const { error } = await updateKizaihyouMemberRole(kizaihyouId, userId, roleCod, user.userNam);
  if (error) throw new Error(`[changeKizaihyouMemberRole] 権限の変更に失敗しました: ${error.message}`);
  if (roleCod < KIZAIHYOU_ROLE.編集) await deleteKizaihyouLock(kizaihyouId, userId);

  await recordMemberChange(
    kizaihyouId,
    user.userId,
    user.userNam,
    `メンバーの権限を変更（${target.user_nam}：${ROLE_LABELS[roleCod]}）`
  );
};

/**
 * メンバーを外す関数。持ち主だけ。持ち主自身は外せない。
 * 外した人が編集ロックを持っていれば、それも外す。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 外すm_user.user_id
 */
export const removeKizaihyouMember = async (kizaihyouId: number, userId: string) => {
  const { user } = await requireKizaihyouRole(kizaihyouId, KIZAIHYOU_ROLE.持ち主);
  const target = await findUser(userId, false);

  const { error } = await deleteKizaihyouMember(kizaihyouId, userId);
  if (error) throw new Error(`[removeKizaihyouMember] メンバーの削除に失敗しました: ${error.message}`);
  await deleteKizaihyouLock(kizaihyouId, userId);

  await recordMemberChange(kizaihyouId, user.userId, user.userNam, `メンバーから外す（${target.user_nam}）`);
};
