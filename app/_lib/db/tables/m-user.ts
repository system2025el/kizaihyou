'use server';

import { SCHEMA } from '../schema';
import { createClient } from '../supabase-server';

/**
 * user_idが一致するユーザープロファイルを取得する関数
 * @param userId 探すuser_id（auth.usersのUUID）
 * @returns ユーザープロファイル（未登録ならdataはnull）
 */
export const selectUser = async (userId: string) => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('m_user').select('*').eq('user_id', userId).maybeSingle();
  } catch (e) {
    throw new Error('[selectUser] DBエラー:', { cause: e });
  }
};

/**
 * ユーザープロファイルを新規登録する関数
 * @param userId auth.usersのUUID
 * @param email メールアドレス（kikikan側担当者との名寄せキー）
 * @param userNam 氏名
 * @returns 登録したユーザープロファイル
 */
export const insertUser = async (userId: string, email: string, userNam: string) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('m_user')
      .insert({ user_id: userId, email, user_nam: userNam, add_user: email })
      .select()
      .single();
  } catch (e) {
    throw new Error('[insertUser] DBエラー:', { cause: e });
  }
};
