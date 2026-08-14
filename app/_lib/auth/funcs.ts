'use server';

import { createClient } from '../db/supabase-server';
import { insertUser, selectUser } from '../db/tables/m-user';
import { CurrentUser } from './types';

/**
 * ログイン中のユーザーをm_userごと取得する関数。
 * 初回ログイン時などプロファイルが未登録の場合はここで作成する。
 *
 * サインアップ画面がまだ無いため、氏名の初期値はauthのuser_metadata、
 * それも無ければメールアドレスのローカル部を使う（後から変更できる想定）。
 *
 * @returns ログイン中のユーザー。未ログインならnull
 */
export const ensureCurrentUser = async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: profile, error } = await selectUser(user.id);
  if (error) throw new Error(`[ensureCurrentUser] ユーザー取得に失敗しました: ${error.message}`);
  if (profile) {
    return { userId: profile.user_id, email: profile.email, userNam: profile.user_nam };
  }

  const metadataNam = typeof user.user_metadata?.user_nam === 'string' ? user.user_metadata.user_nam : '';
  const userNam = metadataNam || user.email.split('@')[0];
  const { data: created, error: insertError } = await insertUser(user.id, user.email, userNam);
  if (insertError) throw new Error(`[ensureCurrentUser] ユーザー登録に失敗しました: ${insertError.message}`);

  return { userId: created.user_id, email: created.email, userNam: created.user_nam };
};

/**
 * ログイン必須の処理から呼ぶ関数。未ログインなら例外を投げる。
 * @returns ログイン中のユーザー
 */
export const requireCurrentUser = async (): Promise<CurrentUser> => {
  const user = await ensureCurrentUser();
  if (!user) throw new Error('[requireCurrentUser] ログインが必要です');
  return user;
};
