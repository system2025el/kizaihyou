/**
 * kikikan(C:\EL)のスキーマ型のうち、kizaihyouから参照する分だけを手書きで定義したもの。
 *
 * kikikanは別Supabaseプロジェクトなので、このリポジトリの
 * `app/_lib/db/types/types.ts`（Supabase MCPで自動生成）には含まれない。
 * kikikan側のマスタ定義が変わったらここも手で追随させる。
 */
export type KikikanDatabase = {
  public: {
    Tables: {
      m_kizai: {
        Row: {
          kizai_id: number;
          kizai_nam: string;
          kizai_grp_cod: string | null;
          shozoku_id: number;
          bumon_id: number | null;
          dsp_ord_num: number | null;
          /** 1 = 削除済み */
          del_flg: number | null;
          /** 0 = 非表示 */
          dsp_flg: number | null;
          mem: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type KikikanKizai = KikikanDatabase['public']['Tables']['m_kizai']['Row'];
