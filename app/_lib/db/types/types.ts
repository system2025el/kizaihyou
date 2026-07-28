// プレースホルダー。実際の型はSupabase CLIで生成すること（手動編集しない）。
// kikikan(C:\EL)と同一のpublicスキーマを共有しているため、スキーマ変更時は
// 双方のリポジトリでそれぞれ再生成する必要がある。
//
// yarn supabase login
// yarn supabase gen types typescript --project-id jimqcvyaoddsxbcrsnfs --schema public > app/_lib/db/types/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
