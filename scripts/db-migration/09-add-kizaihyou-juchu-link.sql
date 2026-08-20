-- ============================================================================
-- 09: 承認時にkikikanへ作った受注との紐付けを持つ
--   承認するとkikikanのステージングに受注ヘッダー（伝票）を作る。そのIDをここに
--   持つことで、次の2つを1組で満たす。
--     1. 二重作成の防止（値が入っていれば作成済み）
--     2. 在庫の二重計上の回避。機材表承認画面の在庫は
--        「kikikanの在庫 − 機材表の要求数」で出しているが、kikikanに引き当てが
--        立った後は二重に引かれる。この受注に紐づく機材明細の数量を足し戻して補正する
--        （kikikanの受注機材明細画面と同じ計算）。
--
--   kikikanは別Postgresインスタンスなので外部キー制約は張れない。
--   t_kizaihyou_row.kizai_id と同じく、値だけ保持して整合性はアプリ側で担保する。
-- ============================================================================
alter table public.t_kizaihyou add column juchu_head_id       integer;
alter table public.t_kizaihyou add column juchu_kizai_head_id integer;

comment on column public.t_kizaihyou.juchu_head_id is
  '承認時にkikikanへ作った受注ヘッダーのjuchu_head_id（FK無し。未連携ならnull）';
comment on column public.t_kizaihyou.juchu_kizai_head_id is
  '同じくkikikanの受注機材ヘッダーのjuchu_kizai_head_id（受注内の連番）';
