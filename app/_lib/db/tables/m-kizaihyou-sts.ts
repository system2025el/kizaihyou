'use server';

import { SCHEMA } from '../schema';
import { createClient } from '../supabase-server';

/**
 * 機材表の状態ステータスを全件取得する関数
 * @returns 表示順に並んだステータスマスタ
 */
export const selectKizaihyouStsList = async () => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('m_kizaihyou_sts').select('*').order('dsp_ord_num');
  } catch (e) {
    throw new Error('[selectKizaihyouStsList] DBエラー:', { cause: e });
  }
};
