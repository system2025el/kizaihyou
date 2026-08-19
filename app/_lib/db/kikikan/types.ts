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
      /** 部門マスタ。機材表の「種類」欄の入力候補に使う */
      m_bumon: {
        Row: {
          bumon_id: number;
          bumon_nam: string;
          dai_bumon_id: number | null;
          dsp_ord_num: number | null;
          /** 1 = 削除済み */
          del_flg: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
    Views: {
      /** 機材ごとの保有数（RFIDタグの実本数）。引き当てが無い日の在庫数はこれになる */
      v_kizai_qty: {
        Row: {
          kizai_id: number;
          kizai_nam: string;
          kizai_qty: number;
          del_flg: number | null;
        };
        Relationships: [];
      };
      /**
       * 日別の在庫数。`zaiko_qty = kizai_qty - plan_qty`。
       * 引き当てのある日だけ行があるので、行が無い日は`v_kizai_qty.kizai_qty`を使う
       * （kikikan側の`COALESCE(v.zaiko_qty, k.kizai_qty)`と同じ扱い）。
       */
      v_zaiko_qty: {
        Row: {
          plan_dat: string;
          kizai_id: number;
          kizai_qty: number;
          juchu_qty: number;
          yobi_qty: number;
          plan_qty: number;
          zaiko_qty: number;
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type KikikanKizai = KikikanDatabase['public']['Tables']['m_kizai']['Row'];
