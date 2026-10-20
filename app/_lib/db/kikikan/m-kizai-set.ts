'use server';

import { supabaseKikikan } from './supabase-kikikan';

/**
 * 指定した親機材のセットオプション（付属品）をkikikanのセットマスタから取得する関数。
 *
 * kikikanの機材追加ダイアログ（`checkSetoptions`／`getSetOptions`）と同じく`m_kizai_set`を引く。
 * あちらは親機材1件ずつ取りに行くが、こちらは選んだ親機材の分をまとめて1回で取る。
 *
 * @param kizaiIds 親機材のkizai_idの配列
 * @returns 親機材ID・付属品の機材IDのリスト
 */
export const selectKikikanKizaiSetList = async (kizaiIds: number[]) => {
  try {
    return await supabaseKikikan
      .from('m_kizai_set')
      .select('kizai_id, set_kizai_id')
      .in('kizai_id', kizaiIds)
      .neq('del_flg', 1);
  } catch (e) {
    throw new Error('[selectKikikanKizaiSetList] DBエラー:', { cause: e });
  }
};

/**
 * 付属品の機材名・在庫場所をkikikanの機材一覧ビューから取得する関数。
 *
 * kikikanは付属品を`v_kizai_lst`（非表示・コンテナの機材も含む）から引いているので揃える。
 * 「名称」欄の候補（`v_kizai_lst_sel`から非表示・コンテナを除いたもの）に無い付属品もあり得るため、
 * 候補とは別にここで取る。並びはkikikanの表示順（`kizai_grp_cod, dsp_ord_num`）。
 *
 * @param kizaiIds 付属品のkizai_idの配列
 * @returns 機材ID・機材名・部門ID・在庫場所・グループコードのリスト
 */
export const selectKikikanKizaiLstByIds = async (kizaiIds: number[]) => {
  try {
    return await supabaseKikikan
      .from('v_kizai_lst')
      .select('kizai_id, kizai_nam, bumon_id, shozoku_nam, kizai_grp_cod')
      .in('kizai_id', kizaiIds)
      .neq('del_flg', 1)
      .order('kizai_grp_cod', { ascending: true, nullsFirst: false })
      .order('dsp_ord_num', { ascending: true, nullsFirst: false });
  } catch (e) {
    throw new Error('[selectKikikanKizaiLstByIds] DBエラー:', { cause: e });
  }
};
