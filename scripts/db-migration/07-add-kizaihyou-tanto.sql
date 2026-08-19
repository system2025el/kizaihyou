-- ============================================================================
-- 07: 申請先（受注部担当者）を複数指定できるようにする
--   1つの機材表に複数の受注部担当者を指定でき、**そのうち1人が承認すれば承認済**に
--   なる運用（全員の承認は不要）。誰が承認したかは t_kizaihyou_his に残る。
--
--   ヘッダの tanto_user_id は1人しか持てないので廃止し、実体はこの表に持つ。
--   tanto_nam は一覧表示用に「、」で連結した文字列を引き続き持つ
--   （一覧のたびに結合しないで済ませるための非正規化）。
-- ============================================================================
create table public.t_kizaihyou_tanto (
  kizaihyou_id bigint  not null references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  user_id      uuid    not null references public.m_user (user_id),
  user_nam     text    not null default '',
  dsp_ord_num  integer not null default 0,
  primary key (kizaihyou_id, user_id)
);

comment on table public.t_kizaihyou_tanto is
  '機材表の申請先（受注部担当者）。複数指定でき、そのうち1人が承認すれば承認済になる';
comment on column public.t_kizaihyou_tanto.user_nam is '申請時点の氏名スナップショット';

create index idx_t_kizaihyou_tanto_user on public.t_kizaihyou_tanto (user_id);

alter table public.t_kizaihyou drop column tanto_user_id;

comment on column public.t_kizaihyou.tanto_nam is
  '受注部担当者名の表示用（複数なら「、」で連結）。実体は t_kizaihyou_tanto';

alter table public.t_kizaihyou_tanto enable row level security;

create policy p_t_kizaihyou_tanto_all on public.t_kizaihyou_tanto
  for all to authenticated using (true) with check (true);
