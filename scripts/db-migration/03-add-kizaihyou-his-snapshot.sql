-- ============================================================================
-- 03: 操作履歴に、その時点の機材表の内容（スナップショット）を持たせる
--   保存・申請のたびにシート全体をJSONで残し、タイムライン・履歴から
--   閲覧専用ページで見られるようにする。
--   JSONの形は app/_lib/equipment-table/types.ts の EquipmentTableSnapshot。
--
--   snapshot_flg は「アイコンを出すか」を一覧で判定するための生成列。
--   一覧のたびに巨大なJSON本体を引かずに済ませる。
-- ============================================================================
alter table public.t_kizaihyou_his add column snapshot jsonb;

alter table public.t_kizaihyou_his
  add column snapshot_flg smallint generated always as (case when snapshot is null then 0 else 1 end) stored;

comment on column public.t_kizaihyou_his.snapshot is
  '保存・申請時点の機材表の内容（head/columns/rows）。形は app/_lib/equipment-table/types.ts の EquipmentTableSnapshot';
comment on column public.t_kizaihyou_his.snapshot_flg is
  'snapshotを持つ履歴かどうか（0/1）の生成列。一覧でJSON本体を引かずに判定するため';
