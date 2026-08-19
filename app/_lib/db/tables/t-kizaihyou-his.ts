'use server';

import { EquipmentTableSnapshot } from '../../equipment-table/types';
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
      .select('his_id, kizaihyou_id, act_dat, act_nam, user_nam, mem, snapshot_flg')
      .in('kizaihyou_id', kizaihyouIds)
      .order('act_dat')
      .order('his_id');
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
 * @param snapshot その時点の機材表の内容（保存・申請以外はnull）
 */
export const insertKizaihyouHis = async (
  kizaihyouId: number,
  actNam: string,
  userId: string,
  userNam: string,
  mem: string | null,
  snapshot: EquipmentTableSnapshot | null = null
) => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('t_kizaihyou_his').insert({
      kizaihyou_id: kizaihyouId,
      act_nam: actNam,
      user_id: userId,
      user_nam: userNam,
      mem,
      snapshot,
    });
  } catch (e) {
    throw new Error('[insertKizaihyouHis] DBエラー:', { cause: e });
  }
};

/**
 * スナップショット付きの履歴を1件取得する関数
 * @param hisId 探すhis_id
 * @returns 履歴とスナップショット（見つからなければdataはnull）
 */
export const selectKizaihyouHis = async (hisId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_his')
      .select('his_id, kizaihyou_id, act_dat, act_nam, user_nam, mem, snapshot')
      .eq('his_id', hisId)
      .maybeSingle();
  } catch (e) {
    throw new Error('[selectKizaihyouHis] DBエラー:', { cause: e });
  }
};

/**
 * 直近のスナップショットを取得する関数（内容が変わっていない保存を弾くために使う）
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 直近のスナップショット（1件も無ければdataはnull）
 */
export const selectLatestKizaihyouSnapshot = async (kizaihyouId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_his')
      .select('snapshot')
      .eq('kizaihyou_id', kizaihyouId)
      .eq('snapshot_flg', 1)
      .order('his_id', { ascending: false })
      .limit(1)
      .maybeSingle();
  } catch (e) {
    throw new Error('[selectLatestKizaihyouSnapshot] DBエラー:', { cause: e });
  }
};
