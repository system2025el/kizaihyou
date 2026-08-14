import { createClient } from '@supabase/supabase-js';

import { KikikanDatabase } from './types';

/**
 * kikikan(C:\EL)のSupabaseプロジェクトを参照するクライアント。
 *
 * kizaihyouとは別のSupabaseプロジェクト（別Postgresインスタンス）のため、
 * kizaihyouのテーブルとの外部キー制約や単一トランザクションは組めない。
 *
 * 認証はkikikanのanonキーで行う。kikikanのservice_roleキーはschema publicへの
 * GRANTが無く「permission denied for schema public」になるため使えない
 * （anonキーではm_kizaiを参照できることを確認済み）。
 *
 * anonキーとはいえkikikanの認証情報なので、ブラウザに露出させないよう
 * NEXT_PUBLIC_プレフィックスを付けていない。
 * **クライアントコンポーネントでimportしないこと**。Server Actions（'use server'）
 * からのみ呼び出す。
 */
export const supabaseKikikan = createClient<KikikanDatabase>(
  process.env.KIKIKAN_SUPABASE_URL!,
  process.env.KIKIKAN_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
