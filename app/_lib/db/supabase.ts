import { createClient } from '@supabase/supabase-js';

import { Database } from './types/types';

// クライアント側で環境変数を使用する場合は、プレフィックスとして「NEXT_PUBLIC_」が必要。
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// kikikan(C:\EL)と同一のpublicスキーマ・テーブルを共有する
export const SCHEMA = 'public';
export type schema = 'public';
