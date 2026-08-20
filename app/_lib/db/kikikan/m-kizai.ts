'use server';

import { supabaseKikikan } from './supabase-kikikan';

/**
 * kikikanの機材選択ビューから、機材表の「名称」欄の候補を取得する関数。
 *
 * kikikanの機材追加ダイアログと**同じビュー・同じ並び順**（`kizai_grp_cod, dsp_ord_num`）にして、
 * 受注部が見慣れた順序で候補が出るようにしている。
 * コンテナ（`ctn_flg = 1`）は機材表では扱わないので候補から除く。
 *
 * @returns 機材ID・機材名・部門IDのリスト（kikikanと同じ表示順）
 */
export const selectKikikanKizaiList = async () => {
  try {
    return await supabaseKikikan
      .from('v_kizai_lst_sel')
      .select('kizai_id, kizai_nam, bumon_id')
      .neq('del_flg', 1)
      .neq('dsp_flg', 0)
      .neq('ctn_flg', 1)
      .order('kizai_grp_cod', { ascending: true, nullsFirst: false })
      .order('dsp_ord_num', { ascending: true, nullsFirst: false });
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
      .from('v_kizai_lst_sel')
      .select('kizai_id, kizai_nam')
      .neq('del_flg', 1)
      .neq('dsp_flg', 0)
      .neq('ctn_flg', 1)
      .ilike('kizai_nam', `%${escaped}%`)
      .order('kizai_grp_cod', { ascending: true, nullsFirst: false })
      .order('dsp_ord_num', { ascending: true, nullsFirst: false })
      .limit(limit);
  } catch (e) {
    throw new Error('[searchKikikanKizai] DBエラー:', { cause: e });
  }
};

/**
 * 受注機材明細を作るのに要る機材の情報を取得する関数。
 * 単価は定価（reg_amt）、所属は移動伝票を作るかの判定に使う。
 *
 * @param kizaiIds 対象の機材ID
 * @returns 機材ID・定価・所属
 */
export const selectKikikanKizaiForJuchu = async (kizaiIds: number[]) => {
  try {
    return await supabaseKikikan.from('m_kizai').select('kizai_id, reg_amt, shozoku_id').in('kizai_id', kizaiIds);
  } catch (e) {
    throw new Error('[selectKikikanKizaiForJuchu] DBエラー:', { cause: e });
  }
};
