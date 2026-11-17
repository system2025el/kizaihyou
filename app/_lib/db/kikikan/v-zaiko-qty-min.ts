import { KIKIKAN_SCHEMA, kikikanPool } from './postgres-kikikan';

/**
 * 機材ごとに、期間中で一番少ない日の在庫を取得する関数（参照のみ）。
 * 機材表画面の「在庫」列（課題A-8）に使う。
 *
 * 承認画面のように日別の在庫を全部取ると「機材数×日数」件になり、PostgRESTのページングも
 * 要って重い（114機材・16日で約1秒、2か月で約2.5秒）。ここで知りたいのは「期間中に1日でも
 * 足りなくなるか」だけなので、kikikanのDB側で最少を集計して機材数ぶんだけ受け取る（約0.3秒）。
 * PostgRESTでは集計できないので、直接接続（`kikikanPool`）を使う。
 *
 * - 在庫は承認画面と同じ考え方：`v_zaiko_qty`は引き当てのある日しか行が無いので、
 *   行の無い日は保有数（`v_kizai_qty`）を在庫とする（kikikanの`COALESCE(v.zaiko_qty, k.kizai_qty)`と同じ）。
 * - `v_zaiko_qty`は先に期間で絞ってから日付と突き合わせる。日付ごとにビューを結合すると
 *   絞り込みが効かず、同じ結果に約2.5秒かかった。
 * - **機材管理へ連携済みなら、この機材表が立てている引き当てを足し戻す**。あちらの在庫から既に
 *   引かれているので、そのまま比べると二重に引くことになる。足し戻しは日ごとに行う
 *   （引き当ての日は`t_juchu_kizai_honbanbi`の種別を問わないDISTINCT。`selectKikikanAllocation`と同じ）。
 *
 * @param kizaiIds 対象の機材ID（kikikanのm_kizai.kizai_id）
 * @param fromDat 開始日（YYYY-MM-DD、この日を含む）
 * @param toDat 終了日（YYYY-MM-DD、この日を含む）
 * @param juchuHeadId 連携済みの受注番号（未連携ならnull）
 * @param juchuKizaiHeadId 連携済みの受注機材ヘッダーID（未連携ならnull）
 * @returns 機材ID→期間中の最少在庫。kikikanのマスタに無い機材は含まれない
 */
export const selectKikikanMinZaikoQty = async (
  kizaiIds: number[],
  fromDat: string,
  toDat: string,
  juchuHeadId: number | null,
  juchuKizaiHeadId: number | null
): Promise<Map<number, number>> => {
  const result = new Map<number, number>();
  if (!kizaiIds.length) return result;

  try {
    const { rows } = await kikikanPool.query<{ kizai_id: number; min_qty: number }>(
      `WITH zaiko AS MATERIALIZED (
         SELECT z.kizai_id, z.plan_dat, z.zaiko_qty
           FROM ${KIKIKAN_SCHEMA}.v_zaiko_qty z
          WHERE z.kizai_id = ANY($1::int[]) AND z.plan_dat BETWEEN $2::date AND $3::date
       ),
       own AS (
         SELECT m.kizai_id, b.dat, sum(coalesce(m.plan_kizai_qty, 0) + coalesce(m.plan_yobi_qty, 0)) AS qty
           FROM ${KIKIKAN_SCHEMA}.t_juchu_kizai_meisai m
          CROSS JOIN (SELECT DISTINCT h.juchu_honbanbi_dat AS dat
                        FROM ${KIKIKAN_SCHEMA}.t_juchu_kizai_honbanbi h
                       WHERE h.juchu_head_id = $4 AND h.juchu_kizai_head_id = $5) b
          WHERE m.juchu_head_id = $4 AND m.juchu_kizai_head_id = $5
          GROUP BY m.kizai_id, b.dat
       )
       SELECT k.kizai_id, min(coalesce(z.zaiko_qty, k.kizai_qty) + coalesce(o.qty, 0))::int AS min_qty
         FROM ${KIKIKAN_SCHEMA}.v_kizai_qty k
        CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(dat)
         LEFT JOIN zaiko z ON z.kizai_id = k.kizai_id AND z.plan_dat = d.dat::date
         LEFT JOIN own o ON o.kizai_id = k.kizai_id AND o.dat = d.dat::date
        WHERE k.kizai_id = ANY($1::int[])
        GROUP BY k.kizai_id`,
      [kizaiIds, fromDat, toDat, juchuHeadId, juchuKizaiHeadId]
    );
    for (const row of rows) result.set(row.kizai_id, row.min_qty);
  } catch (e) {
    throw new Error('[selectKikikanMinZaikoQty] kikikanのDBエラー:', { cause: e });
  }
  return result;
};
