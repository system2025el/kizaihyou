'use server';

import { supabaseKikikan } from './supabase-kikikan';

/** 機材表の「名称」欄で選択できる機材の絞り込み条件（kikikan側の運用に合わせる） */
const SELECTABLE = { del_flg: 0, dsp_flg: 1 } as const;

/**
 * kikikanの機材マスタから、選択可能な機材の一覧を取得する関数
 * @returns 機材ID・機材名のリスト（表示順）
 */
export const selectKikikanKizaiList = async () => {
  try {
    return await supabaseKikikan
      .from('m_kizai')
      .select('kizai_id, kizai_nam, bumon_id')
      .eq('del_flg', SELECTABLE.del_flg)
      .eq('dsp_flg', SELECTABLE.dsp_flg)
      .order('dsp_ord_num', { ascending: true, nullsFirst: false })
      .order('kizai_id', { ascending: true });
  } catch (e) {
    throw new Error('[selectKikikanKizaiList] DBエラー:', { cause: e });
  }
};

/**
 * kikikanの機材マスタから、機材名で部分一致検索する関数
 * @param keyword 検索キーワード
 * @param limit 取得上限
 * @returns 機材ID・機材名のリスト（表示順）
 */
export const searchKikikanKizai = async (keyword: string, limit = 50) => {
  // PostgRESTのilikeパターンで意味を持つ文字をエスケープする
  const escaped = keyword.replace(/[%_\\]/g, (char) => `\\${char}`);
  try {
    return await supabaseKikikan
      .from('m_kizai')
      .select('kizai_id, kizai_nam')
      .eq('del_flg', SELECTABLE.del_flg)
      .eq('dsp_flg', SELECTABLE.dsp_flg)
      .ilike('kizai_nam', `%${escaped}%`)
      .order('dsp_ord_num', { ascending: true, nullsFirst: false })
      .order('kizai_id', { ascending: true })
      .limit(limit);
  } catch (e) {
    throw new Error('[searchKikikanKizai] DBエラー:', { cause: e });
  }
};
