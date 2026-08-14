import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { Database } from './types/types';

/**
 * サーバーサイド（Server Actions / Server Components）用のSupabaseクライアント。
 * ログインユーザーのセッションCookieを引き継ぐため、RLSは`authenticated`として評価される。
 */
export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, httpOnly: true })
            );
          } catch {
            // Server Componentから呼ばれた場合はCookieをsetできないため無視する
          }
        },
      },
    }
  );
};
