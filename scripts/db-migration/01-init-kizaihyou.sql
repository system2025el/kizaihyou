-- ============================================================================
-- kizaihyou 初期スキーマ
--   命名はkikikan(C:\EL)の規約に合わせる:
--     m_* = マスタ / t_* = トランザクション / v_* = ビュー
--     *_id / *_cod / *_nam / mem / del_flg / dsp_ord_num
--     add_dat / add_user / upd_dat / upd_user
--   DBカラムはsnake_case、アプリコードはcamelCase（変換は各クエリで手動）。
--
--   kikikan(project_ref: jimqcvyaoddsxbcrsnfs)とは別Postgresインスタンスのため、
--   kikikanのm_kizai等への外部キー制約は張れない。参照は t_kizaihyou_row.kizai_id
--   に値のみ保持し、整合性はアプリ側で担保する。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- m_user : kizaihyou専用Authのユーザープロファイル
--   auth.usersはメールとUUIDしか持たないため、氏名等をここで保持する。
--   kikikan側の担当者マスタとの名寄せはUUIDではなくemailで行う想定
--   （同じ人間でもkikikanとkizaihyouでauth UUIDは別物になるため）。
-- ----------------------------------------------------------------------------
create table public.m_user (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text        not null unique,
  user_nam text        not null,
  del_flg  smallint    not null default 0,
  add_dat  timestamptz not null default now(),
  add_user text,
  upd_dat  timestamptz not null default now(),
  upd_user text
);

comment on table public.m_user is 'ユーザーマスタ（kizaihyou専用Authのプロファイル）';
comment on column public.m_user.email is 'kikikan側担当者マスタとの名寄せキー';

-- ----------------------------------------------------------------------------
-- m_kizaihyou_sts : 機材表の状態ステータスマスタ
--   chip_color はMUIのChip colorをそのまま持つ（画面のSTATUS_COLOR相当）。
-- ----------------------------------------------------------------------------
create table public.m_kizaihyou_sts (
  sts_cod     smallint primary key,
  sts_nam     text     not null unique,
  chip_color  text     not null,
  dsp_ord_num smallint not null
);

comment on table public.m_kizaihyou_sts is '機材表 状態ステータスマスタ';

insert into public.m_kizaihyou_sts (sts_cod, sts_nam, chip_color, dsp_ord_num) values
  (1, '作成中', 'default', 1),
  (2, '申請中', 'info', 2),
  (3, '差戻し', 'error', 3),
  (4, '承認済', 'success', 4);

-- ----------------------------------------------------------------------------
-- t_kizaihyou : 機材表ヘッダ
--   公演名・場所・顧客名等はkikikanの受注(t_juchu_head)とは切り離し、
--   現段階ではkizaihyou側で自前保持する。
-- ----------------------------------------------------------------------------
create sequence public.seq_kizaihyou_cod;

create table public.t_kizaihyou (
  kizaihyou_id  bigint generated always as identity primary key,
  kizaihyou_cod text        not null unique
                            default ('KZ-' || lpad(nextval('public.seq_kizaihyou_cod')::text, 4, '0')),
  koen_nam      text        not null,
  basho_nam     text,
  kokyaku_nam   text,
  shukko_dat    date,
  nyuko_dat     date,
  sts_cod       smallint    not null default 1 references public.m_kizaihyou_sts (sts_cod),
  tanto_nam     text        not null default '',
  tanto_user_id uuid        references public.m_user (user_id),
  copy_from_id  bigint      references public.t_kizaihyou (kizaihyou_id),
  del_flg       smallint    not null default 0,
  add_dat       timestamptz not null default now(),
  add_user      text,
  upd_dat       timestamptz not null default now(),
  upd_user      text
);

comment on table public.t_kizaihyou is '機材表ヘッダ';
comment on column public.t_kizaihyou.kizaihyou_cod is '画面表示用ID（KZ-0001形式、自動採番）';
comment on column public.t_kizaihyou.tanto_nam is '受注部担当者名（表示用。kizaihyouユーザーでない担当者も入りうる）';
comment on column public.t_kizaihyou.tanto_user_id is '受注部担当者がkizaihyouユーザーの場合の紐付け';
comment on column public.t_kizaihyou.copy_from_id is 'コピーして新規作成した場合のコピー元';

create index idx_t_kizaihyou_sts on public.t_kizaihyou (sts_cod) where del_flg = 0;

-- ----------------------------------------------------------------------------
-- t_kizaihyou_column : 機材表の列（会場のポジション等）
--   dsp_ord_num にはunique制約を張らない。ドラッグ並び替えで一括更新する際に
--   途中経過で重複するため。
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_column (
  column_id    bigint generated always as identity primary key,
  kizaihyou_id bigint   not null references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  column_nam   text     not null default '',
  dsp_ord_num  integer  not null
);

comment on table public.t_kizaihyou_column is '機材表の列（ポジション）';

create index idx_t_kizaihyou_column_head on public.t_kizaihyou_column (kizaihyou_id, dsp_ord_num);

-- ----------------------------------------------------------------------------
-- t_kizaihyou_row : 機材表の行（機材1点）
--   kizai_id はkikikanのm_kizai.kizai_id。別DBのためFK制約は張れず、
--   マスタに無い手入力名の場合はnull。kizai_nam は表示用スナップショット
--   （kikikan側でマスタ名が変わっても過去の機材表の見た目を保つ）。
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_row (
  row_id       bigint generated always as identity primary key,
  kizaihyou_id bigint  not null references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  kizai_kind   text    not null default '',
  kizai_id     integer,
  kizai_nam    text    not null default '',
  mem          text,
  spare_qty    integer not null default 0,
  dsp_ord_num  integer not null
);

comment on table public.t_kizaihyou_row is '機材表の行（機材1点）';
comment on column public.t_kizaihyou_row.kizai_kind is '種類（自由入力）';
comment on column public.t_kizaihyou_row.kizai_id is 'kikikanのm_kizai.kizai_id（別DBのためFK無し。手入力名はnull）';
comment on column public.t_kizaihyou_row.kizai_nam is '名称（表示用スナップショット）';
comment on column public.t_kizaihyou_row.mem is '備考';
comment on column public.t_kizaihyou_row.spare_qty is 'SPARE数（TOTAL = ACTIVE合計 + SPARE）';

create index idx_t_kizaihyou_row_head on public.t_kizaihyou_row (kizaihyou_id, dsp_ord_num);
create index idx_t_kizaihyou_row_kizai on public.t_kizaihyou_row (kizai_id) where kizai_id is not null;

-- ----------------------------------------------------------------------------
-- t_kizaihyou_qty : 行×列の数量セル
--   空セルはレコードを作らない（疎行列として保持）。
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_qty (
  row_id    bigint  not null references public.t_kizaihyou_row (row_id) on delete cascade,
  column_id bigint  not null references public.t_kizaihyou_column (column_id) on delete cascade,
  qty       integer not null,
  primary key (row_id, column_id)
);

comment on table public.t_kizaihyou_qty is '機材表の数量セル（行×列。空セルは行を作らない）';

create index idx_t_kizaihyou_qty_column on public.t_kizaihyou_qty (column_id);

-- ----------------------------------------------------------------------------
-- t_kizaihyou_his : 機材表の操作履歴
--   user_nam は操作時点の氏名スナップショット（退職・改名後も履歴を保つ）。
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_his (
  his_id       bigint generated always as identity primary key,
  kizaihyou_id bigint      not null references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  act_dat      timestamptz not null default now(),
  act_nam      text        not null,
  user_id      uuid        references public.m_user (user_id),
  user_nam     text        not null default '',
  mem          text
);

comment on table public.t_kizaihyou_his is '機材表の操作履歴';
comment on column public.t_kizaihyou_his.act_nam is '操作内容（新規作成／申請／承認／差戻し 等）';
comment on column public.t_kizaihyou_his.user_nam is '操作者名（操作時点のスナップショット）';
comment on column public.t_kizaihyou_his.mem is '承認・差戻し時のコメント';

create index idx_t_kizaihyou_his_head on public.t_kizaihyou_his (kizaihyou_id, act_dat);

-- ----------------------------------------------------------------------------
-- upd_dat の自動更新
-- ----------------------------------------------------------------------------
create function public.set_upd_dat() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.upd_dat := now();
  return new;
end;
$$;

create trigger trg_m_user_upd_dat
  before update on public.m_user
  for each row execute function public.set_upd_dat();

create trigger trg_t_kizaihyou_upd_dat
  before update on public.t_kizaihyou
  for each row execute function public.set_upd_dat();

-- ----------------------------------------------------------------------------
-- RLS
--   全画面がログイン必須のため、認証済みユーザーに一律で許可する。
--   権限（ビットマスク等）による細分化は未導入。
--   将来kikikanから直接参照する場合はservice_roleか専用ポリシーを別途追加する。
-- ----------------------------------------------------------------------------
alter table public.m_user            enable row level security;
alter table public.m_kizaihyou_sts   enable row level security;
alter table public.t_kizaihyou       enable row level security;
alter table public.t_kizaihyou_column enable row level security;
alter table public.t_kizaihyou_row   enable row level security;
alter table public.t_kizaihyou_qty   enable row level security;
alter table public.t_kizaihyou_his   enable row level security;

create policy p_m_user_select on public.m_user
  for select to authenticated using (true);
create policy p_m_user_insert_self on public.m_user
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy p_m_user_update_self on public.m_user
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy p_m_kizaihyou_sts_select on public.m_kizaihyou_sts
  for select to authenticated using (true);

create policy p_t_kizaihyou_all on public.t_kizaihyou
  for all to authenticated using (true) with check (true);
create policy p_t_kizaihyou_column_all on public.t_kizaihyou_column
  for all to authenticated using (true) with check (true);
create policy p_t_kizaihyou_row_all on public.t_kizaihyou_row
  for all to authenticated using (true) with check (true);
create policy p_t_kizaihyou_qty_all on public.t_kizaihyou_qty
  for all to authenticated using (true) with check (true);
create policy p_t_kizaihyou_his_all on public.t_kizaihyou_his
  for all to authenticated using (true) with check (true);
