'use server';

import { requireCurrentUser } from '@/app/_lib/auth/funcs';
import { selectKikikanKizaiQty, selectKikikanZaikoQtyList } from '@/app/_lib/db/kikikan/v-zaiko-qty';

import { EquipmentStockMap } from './types';

/**
 * 機材表承認画面に出す日別在庫をkikikanから取得する関数（参照のみ）。
 *
 * kikikanの`v_zaiko_qty`は「引き当てのある日」しか行を持たないので、
 * 行が無い日は保有数（`v_kizai_qty.kizai_qty`）を在庫数として扱う。
 * これはkikikan側の`COALESCE(v.zaiko_qty, k.kizai_qty)`と同じ扱い。
 *
 * 返す値にはこの機材表の要求数は含まれない。機材表はkikikanの受注と
 * 紐づいていないため引き当てが立っておらず、出庫日〜入庫日の差し引きは
 * 画面側で行う。
 *
 * @param kizaiIds 対象の機材ID（kikikanのm_kizai.kizai_id）
 * @param fromDat 開始日（YYYY-MM-DD、この日を含む）
 * @param toDat 終了日（YYYY-MM-DD、この日を含む）
 * @returns 機材ID→在庫
 */
export const fetchEquipmentStockMap = async (
  kizaiIds: number[],
  fromDat: string,
  toDat: string
): Promise<EquipmentStockMap> => {
  await requireCurrentUser();

  const uniqueIds = Array.from(new Set(kizaiIds));
  if (!uniqueIds.length) return {};

  const [kizaiQtyById, zaikoList] = await Promise.all([
    selectKikikanKizaiQty(uniqueIds),
    selectKikikanZaikoQtyList(uniqueIds, fromDat, toDat),
  ]);

  const stockMap: EquipmentStockMap = {};
  for (const kizaiId of uniqueIds) {
    // 保有数が引けない＝kikikanのマスタに無い機材。在庫は出さない
    const kizaiQty = kizaiQtyById.get(kizaiId);
    if (kizaiQty === undefined) continue;
    stockMap[kizaiId] = { kizaiQty, stockByDate: {} };
  }
  for (const zaiko of zaikoList) {
    const stock = stockMap[zaiko.kizaiId];
    if (stock) stock.stockByDate[zaiko.planDat] = zaiko.zaikoQty;
  }

  return stockMap;
};
