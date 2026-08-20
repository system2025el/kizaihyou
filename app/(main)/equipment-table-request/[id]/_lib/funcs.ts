'use server';

import { requireCurrentUser } from '@/app/_lib/auth/funcs';
import { selectKikikanAllocation } from '@/app/_lib/db/kikikan/t-juchu-kizai';
import { selectKikikanKizaiQty, selectKikikanZaikoQtyList } from '@/app/_lib/db/kikikan/v-zaiko-qty';

import { EquipmentStockMap } from './types';

/**
 * 機材表承認画面に出す日別在庫をkikikanから取得する関数（参照のみ）。
 *
 * kikikanの`v_zaiko_qty`は「引き当てのある日」しか行を持たないので、
 * 行が無い日は保有数（`v_kizai_qty.kizai_qty`）を在庫数として扱う。
 * これはkikikan側の`COALESCE(v.zaiko_qty, k.kizai_qty)`と同じ扱い。
 *
 * 出庫日〜入庫日の差し引きは画面側で行う。
 *
 * **機材管理へ連携済みの場合**は、あちらにも引き当てが立っていて在庫から既に
 * 引かれている。画面でもう一度引くと二重計上になるので、この機材表が立てている
 * 数量を`linkedByDate`として返し、画面で足し戻す
 * （機材管理の受注機材明細画面が「自受注の保存済み引当を足し戻す」のと同じ考え方）。
 *
 * @param kizaiIds 対象の機材ID（kikikanのm_kizai.kizai_id）
 * @param fromDat 開始日（YYYY-MM-DD、この日を含む）
 * @param toDat 終了日（YYYY-MM-DD、この日を含む）
 * @param juchuHeadId 連携済みの受注番号（未連携ならnull）
 * @param juchuKizaiHeadId 連携済みの受注機材ヘッダーID（未連携ならnull）
 * @returns 機材ID→在庫
 */
export const fetchEquipmentStockMap = async (
  kizaiIds: number[],
  fromDat: string,
  toDat: string,
  juchuHeadId: number | null = null,
  juchuKizaiHeadId: number | null = null
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
    stockMap[kizaiId] = { kizaiQty, stockByDate: {}, linkedByDate: {} };
  }
  for (const zaiko of zaikoList) {
    const stock = stockMap[zaiko.kizaiId];
    if (stock) stock.stockByDate[zaiko.planDat] = zaiko.zaikoQty;
  }

  // 連携済みなら、この機材表が機材管理に立てている引き当てを足し戻す
  if (juchuHeadId !== null && juchuKizaiHeadId !== null) {
    const allocations = await selectKikikanAllocation(juchuHeadId, juchuKizaiHeadId);
    for (const allocation of allocations) {
      const stock = stockMap[allocation.kizaiId];
      if (!stock) continue;
      for (const dat of allocation.dats) {
        // 表示している期間の外は捨てる
        if (dat < fromDat || dat > toDat) continue;
        stock.linkedByDate[dat] = (stock.linkedByDate[dat] ?? 0) + allocation.qty;
      }
    }
  }

  return stockMap;
};
