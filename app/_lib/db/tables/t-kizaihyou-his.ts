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
 * @param actCod 操作種別（KIZAIHYOU_ACT）。判定はこちらで行う
 * @param actNam 操作内容の表示用文字列（'申請（受注部担当者：◯◯）'等）
 * @param userId 操作者のuser_id
 * @param userNam 操作者名（操作時点のスナップショット）
 * @param mem 承認・差戻し時のコメント
 * @param snapshot その時点の機材表の内容（保存・申請以外はnull）
 */
export const insertKizaihyouHis = async (
  kizaihyouId: number,
  actCod: number,
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
      act_cod: actCod,
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
 * 指定した履歴がスナップショットを持つかだけを取得する関数。
 *
 * 一覧で「申請/承認された内容を開く」アイコンを出すかの判定に使う。
 * 全機材表の全履歴を引くと重いので、ヘッダが指している申請履歴の分だけに絞る。
 *
 * @param hisIds 調べるhis_id
 * @returns his_idとスナップショットの有無
 */
export const selectKizaihyouHisSnapshotFlags = async (hisIds: number[]) => {
  const supabase = await createClient();
  try {
    return await supabase.schema(SCHEMA).from('t_kizaihyou_his').select('his_id, snapshot_flg').in('his_id', hisIds);
  } catch (e) {
    throw new Error('[selectKizaihyouHisSnapshotFlags] DBエラー:', { cause: e });
  }
};

/**
 * ひとつ前の申請（スナップショット付き）を取得する関数。
 * 機材表承認画面が「前回の申請から何が変わったか」を出すために使う。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param actCod 申請の操作種別（KIZAIHYOU_ACT.申請）
 * @param beforeHisId このhis_idより前を探す（＝今回の申請より前）
 * @returns ひとつ前の申請（無ければdataはnull）
 */
export const selectPreviousKizaihyouRequest = async (kizaihyouId: number, actCod: number, beforeHisId: number) => {
  const supabase = await createClient();
  try {
    return await supabase
      .schema(SCHEMA)
      .from('t_kizaihyou_his')
      .select('his_id, act_dat, user_nam, snapshot')
      .eq('kizaihyou_id', kizaihyouId)
      .eq('act_cod', actCod)
      .eq('snapshot_flg', 1)
      .lt('his_id', beforeHisId)
      .order('his_id', { ascending: false })
      .limit(1)
      .maybeSingle();
  } catch (e) {
    throw new Error('[selectPreviousKizaihyouRequest] DBエラー:', { cause: e });
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
