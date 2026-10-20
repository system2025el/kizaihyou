'use server';

import { SCHEMA } from '../schema';
import { createClient } from '../supabase-server';

/**
 * ユーザーがその機材表のメンバーかと、その権限を取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId m_user.user_id
 * @returns メンバーの行（メンバーでなければdataはnull）
 */
export const selectKizaihyouMember = async (kizaihyouId: number, userId: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .select('role_cod')
      .eq('kizaihyou_id', kizaihyouId)
      .eq('user_id', userId)
      .maybeSingle();
  } catch (e) {
    throw new Error('[selectKizaihyouMember] DBエラー:', { cause: e });
  }
};

/**
 * 機材表のメンバー一覧を取得する関数（持ち主が先頭、あとは権限の強い順）
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns メンバーと、その氏名・メールアドレス
 */
export const selectKizaihyouMemberList = async (kizaihyouId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .select('user_id, role_cod, add_dat, m_user ( user_nam, email )')
      .eq('kizaihyou_id', kizaihyouId)
      .order('role_cod', { ascending: false })
      .order('add_dat');
  } catch (e) {
    throw new Error('[selectKizaihyouMemberList] DBエラー:', { cause: e });
  }
};

/**
 * ユーザーがメンバーになっている機材表と、その権限を取得する関数（機材表履歴一覧の絞り込み用）
 * @param userId m_user.user_id
 * @returns kizaihyou_idと権限
 */
export const selectKizaihyouMemberships = async (userId: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .select('kizaihyou_id, role_cod')
      .eq('user_id', userId);
  } catch (e) {
    throw new Error('[selectKizaihyouMemberships] DBエラー:', { cause: e });
  }
};

/**
 * メンバーを追加する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 招待するm_user.user_id
 * @param roleCod 権限
 * @param addUser 招待した人の氏名
 */
export const insertKizaihyouMember = async (kizaihyouId: number, userId: string, roleCod: number, addUser: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .insert({ kizaihyou_id: kizaihyouId, user_id: userId, role_cod: roleCod, add_user: addUser, upd_user: addUser });
  } catch (e) {
    throw new Error('[insertKizaihyouMember] DBエラー:', { cause: e });
  }
};

/**
 * メンバーの権限を変える関数。持ち主の行（role_cod = 9）は変えない
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 対象のm_user.user_id
 * @param roleCod 変更後の権限
 * @param updUser 変更した人の氏名
 */
export const updateKizaihyouMemberRole = async (
  kizaihyouId: number,
  userId: string,
  roleCod: number,
  updUser: string
) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .update({ role_cod: roleCod, upd_user: updUser })
      .eq('kizaihyou_id', kizaihyouId)
      .eq('user_id', userId)
      .neq('role_cod', 9);
  } catch (e) {
    throw new Error('[updateKizaihyouMemberRole] DBエラー:', { cause: e });
  }
};

/**
 * メンバーを外す関数。持ち主の行（role_cod = 9）は外さない
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 外すm_user.user_id
 */
export const deleteKizaihyouMember = async (kizaihyouId: number, userId: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_member')
      .delete()
      .eq('kizaihyou_id', kizaihyouId)
      .eq('user_id', userId)
      .neq('role_cod', 9);
  } catch (e) {
    throw new Error('[deleteKizaihyouMember] DBエラー:', { cause: e });
  }
};
