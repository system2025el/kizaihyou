import { createBrowserClient } from '@supabase/ssr';

import { Database } from './types/types';

/**
 * クライアントサイド用のSupabaseクライアント。
 *
 * セッションをlocalStorageではなくCookieに保存するため、Server Actions側の
 * `supabase-server.ts` からも同じログインセッションを参照できる（＝RLSの
 * `authenticated` として扱われる）。素の`createClient`は使わないこと。
 */
export const createClient = () =>
  createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
