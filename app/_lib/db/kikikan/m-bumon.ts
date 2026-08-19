'use server';

import { supabaseKikikan } from './supabase-kikikan';

/**
 * kikikanの部門マスタから、有効な部門の一覧を取得する関数。
 * 機材表の「種類」欄の入力候補に使う。
 *
 * @returns 部門ID・部門名のリスト（表示順）
 */
export const selectKikikanBumonList = async () => {
  try {
    return await supabaseKikikan
      .from('m_bumon')
      .select('bumon_id, bumon_nam')
      .eq('del_flg', 0)
      .order('dsp_ord_num', { ascending: true, nullsFirst: false })
      .order('bumon_id', { ascending: true });
  } catch (e) {
    throw new Error('[selectKikikanBumonList] DBエラー:', { cause: e });
  }
};
