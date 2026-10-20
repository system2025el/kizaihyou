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
          /** 所属（1=KICS / 2=YARD / 3=厚木） */
          shozoku_id: number;
          /** 定価。受注機材明細の単価の初期値になる */
          reg_amt: number | null;
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
      /**
       * 機材のセットオプション（付属品）マスタ。親機材`kizai_id`に付属品`set_kizai_id`が複数ぶら下がる。
       * kikikanの機材追加ダイアログで、親機材を選んだときに付属品を選ばせるのに使っている
       */
      m_kizai_set: {
        Row: {
          kizai_id: number;
          set_kizai_id: number;
          dsp_ord_num: number | null;
          /** 1 = 削除済み */
          del_flg: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      /**
       * 機材選択用のビュー。kikikanの機材追加ダイアログもこれを
       * `kizai_grp_cod, dsp_ord_num`順で表示しているので、機材表の入力候補も同じ順に揃える。
       */
      v_kizai_lst_sel: {
        Row: {
          kizai_id: number;
          kizai_nam: string;
          bumon_id: number | null;
          /** 在庫場所の名前（KICS / YARD など） */
          shozoku_nam: string | null;
          kizai_grp_cod: number | null;
          dsp_ord_num: number | null;
          /** 1 = コンテナ。機材表では扱わないので候補から除く */
          ctn_flg: number | null;
          del_flg: number | null;
          dsp_flg: number | null;
        };
        Relationships: [];
      };
      /**
       * 機材一覧のビュー（v_kizai_lst_selと違い、非表示・コンテナの機材も含む）。
       * kikikanはセットオプションの付属品の名前をこちらから引いているので揃える
       */
      v_kizai_lst: {
        Row: {
          kizai_id: number;
          kizai_nam: string;
          bumon_id: number | null;
          shozoku_nam: string | null;
          kizai_grp_cod: number | null;
          dsp_ord_num: number | null;
          del_flg: number | null;
        };
        Relationships: [];
      };
      /** 部門選択用のビュー。kikikanは`kizai_grp_cod`順で並べている */
      v_bumon_lst: {
        Row: {
          bumon_id: number;
          bumon_nam: string;
          kizai_grp_cod: number | null;
          del_flg: number | null;
        };
        Relationships: [];
      };
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
