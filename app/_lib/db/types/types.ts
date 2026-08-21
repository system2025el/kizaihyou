export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      m_kizaihyou_sts: {
        Row: {
          chip_color: string;
          dsp_ord_num: number;
          sts_cod: number;
          sts_nam: string;
        };
        Insert: {
          chip_color: string;
          dsp_ord_num: number;
          sts_cod: number;
          sts_nam: string;
        };
        Update: {
          chip_color?: string;
          dsp_ord_num?: number;
          sts_cod?: number;
          sts_nam?: string;
        };
        Relationships: [];
      };
      m_user: {
        Row: {
          add_dat: string;
          add_user: string | null;
          del_flg: number;
          dsp_ord_num: number | null;
          email: string;
          permission: number;
          upd_dat: string;
          upd_user: string | null;
          user_id: string;
          user_nam: string;
        };
        Insert: {
          add_dat?: string;
          add_user?: string | null;
          del_flg?: number;
          dsp_ord_num?: number | null;
          email: string;
          permission?: number;
          upd_dat?: string;
          upd_user?: string | null;
          user_id: string;
          user_nam: string;
        };
        Update: {
          add_dat?: string;
          add_user?: string | null;
          del_flg?: number;
          dsp_ord_num?: number | null;
          email?: string;
          permission?: number;
          upd_dat?: string;
          upd_user?: string | null;
          user_id?: string;
          user_nam?: string;
        };
        Relationships: [];
      };
      t_kizaihyou: {
        Row: {
          add_dat: string;
          add_user: string | null;
          basho_nam: string | null;
          copy_from_id: number | null;
          del_flg: number;
          juchu_head_id: number | null;
          juchu_kizai_head_id: number | null;
          kizaihyou_cod: string;
          kizaihyou_id: number;
          koen_nam: string;
          kokyaku_nam: string | null;
          mem: string | null;
          nyuko_dat: string | null;
          shinsei_his_id: number | null;
          shinsei_nam: string;
          shinsei_user_id: string | null;
          shukko_dat: string | null;
          sts_cod: number;
          tanto_nam: string;
          upd_dat: string;
          upd_user: string | null;
        };
        Insert: {
          add_dat?: string;
          add_user?: string | null;
          basho_nam?: string | null;
          copy_from_id?: number | null;
          del_flg?: number;
          juchu_head_id?: number | null;
          juchu_kizai_head_id?: number | null;
          kizaihyou_cod?: string;
          kizaihyou_id?: never;
          koen_nam: string;
          kokyaku_nam?: string | null;
          mem?: string | null;
          nyuko_dat?: string | null;
          shinsei_his_id?: number | null;
          shinsei_nam?: string;
          shinsei_user_id?: string | null;
          shukko_dat?: string | null;
          sts_cod?: number;
          tanto_nam?: string;
          upd_dat?: string;
          upd_user?: string | null;
        };
        Update: {
          add_dat?: string;
          add_user?: string | null;
          basho_nam?: string | null;
          copy_from_id?: number | null;
          del_flg?: number;
          juchu_head_id?: number | null;
          juchu_kizai_head_id?: number | null;
          kizaihyou_cod?: string;
          kizaihyou_id?: never;
          koen_nam?: string;
          kokyaku_nam?: string | null;
          mem?: string | null;
          nyuko_dat?: string | null;
          shinsei_his_id?: number | null;
          shinsei_nam?: string;
          shinsei_user_id?: string | null;
          shukko_dat?: string | null;
          sts_cod?: number;
          tanto_nam?: string;
          upd_dat?: string;
          upd_user?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_copy_from_id_fkey';
            columns: ['copy_from_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou';
            referencedColumns: ['kizaihyou_id'];
          },
          {
            foreignKeyName: 't_kizaihyou_sts_cod_fkey';
            columns: ['sts_cod'];
            isOneToOne: false;
            referencedRelation: 'm_kizaihyou_sts';
            referencedColumns: ['sts_cod'];
          },
          {
            foreignKeyName: 't_kizaihyou_shinsei_his_id_fkey';
            columns: ['shinsei_his_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou_his';
            referencedColumns: ['his_id'];
          },
          {
            foreignKeyName: 't_kizaihyou_shinsei_user_id_fkey';
            columns: ['shinsei_user_id'];
            isOneToOne: false;
            referencedRelation: 'm_user';
            referencedColumns: ['user_id'];
          },
        ];
      };
      t_kizaihyou_column: {
        Row: {
          column_id: number;
          column_nam: string;
          dsp_ord_num: number;
          kizaihyou_id: number;
        };
        Insert: {
          column_id?: never;
          column_nam?: string;
          dsp_ord_num: number;
          kizaihyou_id: number;
        };
        Update: {
          column_id?: never;
          column_nam?: string;
          dsp_ord_num?: number;
          kizaihyou_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_column_kizaihyou_id_fkey';
            columns: ['kizaihyou_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou';
            referencedColumns: ['kizaihyou_id'];
          },
        ];
      };
      t_kizaihyou_his: {
        Row: {
          act_cod: number;
          act_dat: string;
          act_nam: string;
          his_id: number;
          kizaihyou_id: number;
          mem: string | null;
          snapshot: Json | null;
          snapshot_flg: number | null;
          user_id: string | null;
          user_nam: string;
        };
        Insert: {
          act_cod?: number;
          act_dat?: string;
          act_nam: string;
          his_id?: never;
          kizaihyou_id: number;
          mem?: string | null;
          snapshot?: Json | null;
          snapshot_flg?: number | null;
          user_id?: string | null;
          user_nam?: string;
        };
        Update: {
          act_cod?: number;
          act_dat?: string;
          act_nam?: string;
          his_id?: never;
          kizaihyou_id?: number;
          mem?: string | null;
          snapshot?: Json | null;
          snapshot_flg?: number | null;
          user_id?: string | null;
          user_nam?: string;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_his_kizaihyou_id_fkey';
            columns: ['kizaihyou_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou';
            referencedColumns: ['kizaihyou_id'];
          },
          {
            foreignKeyName: 't_kizaihyou_his_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'm_user';
            referencedColumns: ['user_id'];
          },
        ];
      };
      t_kizaihyou_qty: {
        Row: {
          column_id: number;
          qty: number;
          row_id: number;
        };
        Insert: {
          column_id: number;
          qty: number;
          row_id: number;
        };
        Update: {
          column_id?: number;
          qty?: number;
          row_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_qty_column_id_fkey';
            columns: ['column_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou_column';
            referencedColumns: ['column_id'];
          },
          {
            foreignKeyName: 't_kizaihyou_qty_row_id_fkey';
            columns: ['row_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou_row';
            referencedColumns: ['row_id'];
          },
        ];
      };
      t_kizaihyou_tanto: {
        Row: {
          dsp_ord_num: number;
          kizaihyou_id: number;
          user_id: string;
          user_nam: string;
        };
        Insert: {
          dsp_ord_num?: number;
          kizaihyou_id: number;
          user_id: string;
          user_nam?: string;
        };
        Update: {
          dsp_ord_num?: number;
          kizaihyou_id?: number;
          user_id?: string;
          user_nam?: string;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_tanto_kizaihyou_id_fkey';
            columns: ['kizaihyou_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou';
            referencedColumns: ['kizaihyou_id'];
          },
          {
            foreignKeyName: 't_kizaihyou_tanto_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'm_user';
            referencedColumns: ['user_id'];
          },
        ];
      };
      t_kizaihyou_row: {
        Row: {
          dsp_ord_num: number;
          indent_num: number;
          kizai_id: number | null;
          kizai_kind: string;
          kizai_nam: string;
          kizaihyou_id: number;
          mem: string | null;
          row_id: number;
          spare_qty: number;
        };
        Insert: {
          dsp_ord_num: number;
          indent_num?: number;
          kizai_id?: number | null;
          kizai_kind?: string;
          kizai_nam?: string;
          kizaihyou_id: number;
          mem?: string | null;
          row_id?: never;
          spare_qty?: number;
        };
        Update: {
          dsp_ord_num?: number;
          indent_num?: number;
          kizai_id?: number | null;
          kizai_kind?: string;
          kizai_nam?: string;
          kizaihyou_id?: number;
          mem?: string | null;
          row_id?: never;
          spare_qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: 't_kizaihyou_row_kizaihyou_id_fkey';
            columns: ['kizaihyou_id'];
            isOneToOne: false;
            referencedRelation: 't_kizaihyou';
            referencedColumns: ['kizaihyou_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
