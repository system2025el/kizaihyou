import { Pool } from 'pg';

/**
 * kikikan(C:\EL)のPostgresへの直接接続。
 *
 * 参照だけなら`supabase-kikikan.ts`（PostgREST）で足りるが、受注の登録は
 * 受注ヘッダー・受注機材ヘッダー・機材明細・使用日カレンダーにまたがるため、
 * 途中で失敗して伝票だけ残ることがないようトランザクションが要る。
 * PostgRESTではトランザクションを組めないのでこちらを使う。
 *
 * **接続ロールは`postgres`で、kikikanの全テーブルに対して何でもできてしまう。**
 * 触ってよいのは受注まわり（t_juchu_head / t_juchu_kizai_head /
 * t_juchu_kizai_meisai / t_juchu_kizai_honbanbi / t_juchu_kizai_nyushuko）だけ。
 * 参照では、PostgRESTで集計できない在庫（期間中の最少在庫、`v-zaiko-qty-min.ts`）にも使う。
 * サーバー専用（`NEXT_PUBLIC_`を付けない）で、クライアントコンポーネントから
 * 絶対にimportしないこと。
 *
 * 現在の向き先はkikikanの**ステージング**（PostgreSQL 15系。本番は17系）。
 * kizaihyouを本番運用するときは、本番のkikikanを向ける切り替えが要る。
 */
const globalForKikikanPool = global as unknown as { kikikanPool?: Pool };

export const kikikanPool =
  globalForKikikanPool.kikikanPool ??
  (globalForKikikanPool.kikikanPool = new Pool({
    connectionString: process.env.KIKIKAN_DATABASE_URL,
  }));

/** kikikan側のスキーマ名（kizaihyouのSCHEMAとは別物なので混同しないこと） */
export const KIKIKAN_SCHEMA = 'public';
