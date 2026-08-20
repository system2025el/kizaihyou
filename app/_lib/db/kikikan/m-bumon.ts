'use server';

import { supabaseKikikan } from './supabase-kikikan';

/**
 * kikikanの部門ビューから、機材表の「種類」欄の候補を取得する関数。
 *
 * kikikanの機材追加ダイアログと**同じビュー・同じ並び順**（`kizai_grp_cod`）にして、
 * 受注部が見慣れた順序で候補が出るようにしている。
 *
 * @returns 部門ID・部門名のリスト（kikikanと同じ表示順）
 */
export const selectKikikanBumonList = async () => {
  try {
    return await supabaseKikikan
      .from('v_bumon_lst')
      .select('bumon_id, bumon_nam')
      .neq('del_flg', 1)
      .order('kizai_grp_cod', { ascending: true, nullsFirst: false });
  } catch (e) {
    throw new Error('[selectKikikanBumonList] DBエラー:', { cause: e });
  }
};
