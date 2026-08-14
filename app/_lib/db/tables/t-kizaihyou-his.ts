'use server';

import { SCHEMA } from '../schema';
import { createClient } from '../supabase-server';

/**
 * 機材表の操作履歴を取得する関数
 * @param kizaihyouIds 対象のkizaihyou_id
 * @returns 操作日時の古い順に並んだ履歴
 */
export const selectKizaihyouHisList = async (kizaihyouIds: number[]) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_his')
      .select('his_id, kizaihyou_id, act_dat, act_nam, user_nam, mem')
      .in('kizaihyou_id', kizaihyouIds)
      .order('act_dat');
  } catch (e) {
    throw new Error('[selectKizaihyouHisList] DBエラー:', { cause: e });
  }
};

/**
 * 機材表の操作履歴を追加する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param actNam 操作内容（新規作成／申請／承認／差戻し 等）
 * @param userId 操作者のuser_id
 * @param userNam 操作者名（操作時点のスナップショット）
 * @param mem 承認・差戻し時のコメント
 */
export const insertKizaihyouHis = async (
  kizaihyouId: number,
  actNam: string,
  userId: string,
  userNam: string,
  mem: string | null
) => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('t_kizaihyou_his').insert({
      kizaihyou_id: kizaihyouId,
      act_nam: actNam,
      user_id: userId,
      user_nam: userNam,
      mem,
    });
  } catch (e) {
    throw new Error('[insertKizaihyouHis] DBエラー:', { cause: e });
  }
};
