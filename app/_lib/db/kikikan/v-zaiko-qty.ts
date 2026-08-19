'use server';

import { supabaseKikikan } from './supabase-kikikan';

/**
 * kikikanの在庫ビューの参照（読み取り専用）。
 *
 * kikikanでは在庫数を `v_zaiko_qty.zaiko_qty = 保有数 - 引き当て数` で求めており、
 * 受注機材明細画面もこのビューを見ている。kizaihyouも同じビューを読むことで
 * 計算ロジックを二重に持たずに済ませる。
 *
 * kikikanは別Postgresインスタンスなのでkizaihyou側のテーブルとJOINできない。
 * 日付×機材の組み合わせ（kikikan側ではCROSS JOINしている部分）は
 * 呼び出し元のTypeScriptで組み立てる。
 */

/** PostgRESTが1回のリクエストで返す上限。これを超える分はrangeでページングする */
const PAGE_SIZE = 1000;
/** IN句に並べるkizai_idの数。URLが長くなりすぎないように分割する */
const ID_CHUNK_SIZE = 100;

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

/**
 * 機材ごとの保有数を取得する関数。
 * 引き当てが無い日はこの数がそのまま在庫数になる。
 *
 * @param kizaiIds 対象の機材ID
 * @returns 機材ID→保有数
 */
export const selectKikikanKizaiQty = async (kizaiIds: number[]): Promise<Map<number, number>> => {
  const result = new Map<number, number>();
  if (!kizaiIds.length) return result;

  try {
    for (const ids of chunk(kizaiIds, ID_CHUNK_SIZE)) {
      const { data, error } = await supabaseKikikan
        .from('v_kizai_qty')
        .select('kizai_id, kizai_qty')
        .in('kizai_id', ids);
      if (error) throw error;
      for (const row of data ?? []) result.set(row.kizai_id, row.kizai_qty);
    }
  } catch (e) {
    throw new Error('[selectKikikanKizaiQty] DBエラー:', { cause: e });
  }
  return result;
};

/** 日別在庫の1行 */
export type KikikanZaikoQty = {
  kizaiId: number;
  /** YYYY-MM-DD */
  planDat: string;
  zaikoQty: number;
};

/**
 * 期間内の日別在庫数を取得する関数。
 *
 * 引き当てのある日だけ行が返るので、返ってこない日は保有数
 * （`selectKikikanKizaiQty`）を在庫数として扱うこと。
 *
 * 件数が「機材数×日数」になりPostgRESTの1回の上限を超えうるため、
 * 機材IDを分割したうえでページングして全件取る。
 *
 * @param kizaiIds 対象の機材ID
 * @param fromDat 開始日（YYYY-MM-DD、この日を含む）
 * @param toDat 終了日（YYYY-MM-DD、この日を含む）
 * @returns 日別在庫の一覧
 */
export const selectKikikanZaikoQtyList = async (
  kizaiIds: number[],
  fromDat: string,
  toDat: string
): Promise<KikikanZaikoQty[]> => {
  if (!kizaiIds.length) return [];

  const rows: KikikanZaikoQty[] = [];
  try {
    for (const ids of chunk(kizaiIds, ID_CHUNK_SIZE)) {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabaseKikikan
          .from('v_zaiko_qty')
          .select('kizai_id, plan_dat, zaiko_qty')
          .in('kizai_id', ids)
          .gte('plan_dat', fromDat)
          .lte('plan_dat', toDat)
          .order('kizai_id')
          .order('plan_dat')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;

        for (const row of data ?? []) {
          rows.push({ kizaiId: row.kizai_id, planDat: row.plan_dat, zaikoQty: row.zaiko_qty });
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
    }
  } catch (e) {
    throw new Error('[selectKikikanZaikoQtyList] DBエラー:', { cause: e });
  }
  return rows;
};
