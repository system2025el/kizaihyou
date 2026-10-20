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
    return {
      userId: profile.user_id,
      email: profile.email,
      userNam: profile.user_nam,
      permission: profile.permission,
    };
  }

  const metadataNam = typeof user.user_metadata?.user_nam === 'string' ? user.user_metadata.user_nam : '';
  const userNam = metadataNam || user.email.split('@')[0];
  const { data: created, error: insertError } = await insertUser(user.id, user.email, userNam);
  if (insertError) throw new Error(`[ensureCurrentUser] ユーザー登録に失敗しました: ${insertError.message}`);

  return {
    userId: created.user_id,
    email: created.email,
    userNam: created.user_nam,
    permission: created.permission,
  };
};

/**
 * ログアウトする関数。
 *
 * セッションCookieはmiddleware・サーバー側クライアントが`httpOnly`で付け直しているため、
 * ブラウザ側の`supabase.auth.signOut()`では消せない。サーバー側で消す。
 *
 * `scope: 'local'`にしているのは、この端末のセッションだけを終わらせるため。
 * 既定の`global`だと同じアカウントの全端末のセッションが切れる（仮アカウントを複数人で
 * 使っている今は、他の人まで巻き込んでログアウトさせてしまう）。
 */
export const signOut = async () => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error(`[signOut] ログアウトに失敗しました: ${error.message}`);
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
