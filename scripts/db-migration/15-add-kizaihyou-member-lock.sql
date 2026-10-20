-- ============================================================================
-- 15: 機材表のメンバー（共同編集）と編集ロック
--
--   これまで機材表は作成者1人のものだったが、機材表ごとにメンバーを招待して
--   一緒に編集・申請できるようにする。同時に編集すると後から保存した側が
--   先の変更を黙って消すので、編集は1人ずつ（編集ロック）にする。
--
--   ■ t_kizaihyou_member（メンバーと権限）
--     role_cod: 1=閲覧 / 2=編集（保存まで） / 3=申請（申請・取り下げまで） / 9=持ち主
--     持ち主は作成者で、1機材表に1人。メンバーの招待・権限変更・外す、削除・完了は持ち主だけ。
--     持ち主の行は t_kizaihyou の INSERT トリガーで作る。新規作成・コピー・スナップショットからの
--     流用のどれで作っても、ヘッダと持ち主の行が同じトランザクションで入るようにするため。
--
--   ■ t_kizaihyou_lock（編集ロック。機材表1件につき1行）
--     「編集」を押した人が取り、操作している間だけ画面が延長する。操作が無ければ expire_dat を
--     過ぎて切れ、他の人が取れる。取得は INSERT ... ON CONFLICT DO UPDATE ... WHERE 1文で行い、
--     「空いているか確かめる」と「取る」の間に他の人が割り込めないようにしている。
--
--   ■ t_kizaihyou.content_ver（楽観ロックの版）
--     保存のたびに1増やす。保存時に画面が読み込んだ版と照合し、食い違えば保存しない。
--     ロックが切れている間に他の人が保存した、という取りこぼしをここで止める。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- メンバー
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_member (
  kizaihyou_id bigint      not null references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  user_id      uuid        not null references public.m_user (user_id),
  role_cod     smallint    not null check (role_cod in (1, 2, 3, 9)),
  add_dat      timestamptz not null default now(),
  add_user     text        not null default '',
  upd_dat      timestamptz not null default now(),
  upd_user     text        not null default '',
  primary key (kizaihyou_id, user_id)
);

comment on table public.t_kizaihyou_member is
  '機材表のメンバー。role_cod: 1=閲覧 / 2=編集 / 3=申請 / 9=持ち主（作成者、1機材表に1人）';
comment on column public.t_kizaihyou_member.role_cod is
  '1=閲覧 / 2=編集（保存まで） / 3=申請（申請・取り下げまで） / 9=持ち主（招待・削除・完了も）';

-- 持ち主は1機材表に1人
create unique index t_kizaihyou_member_owner_uidx
    on public.t_kizaihyou_member (kizaihyou_id) where role_cod = 9;

-- 機材表履歴一覧で「自分がメンバーの機材表」を引く
create index t_kizaihyou_member_user_idx on public.t_kizaihyou_member (user_id);

create trigger trg_t_kizaihyou_member_upd_dat
  before update on public.t_kizaihyou_member
  for each row execute function public.set_upd_dat();

-- 作成者を持ち主として登録する
create function public.add_kizaihyou_owner() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.add_user_id is not null then
    insert into public.t_kizaihyou_member (kizaihyou_id, user_id, role_cod, add_user, upd_user)
    values (new.kizaihyou_id, new.add_user_id, 9, new.add_user, new.add_user);
  end if;
  return new;
end;
$$;

create trigger trg_t_kizaihyou_add_owner
  after insert on public.t_kizaihyou
  for each row execute function public.add_kizaihyou_owner();

-- 既存の機材表は作成者を持ち主にする
insert into public.t_kizaihyou_member (kizaihyou_id, user_id, role_cod, add_user, upd_user)
select kizaihyou_id, add_user_id, 9, add_user, add_user
  from public.t_kizaihyou
 where add_user_id is not null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 編集ロック
-- ----------------------------------------------------------------------------
create table public.t_kizaihyou_lock (
  kizaihyou_id bigint      primary key references public.t_kizaihyou (kizaihyou_id) on delete cascade,
  user_id      uuid        not null references public.m_user (user_id),
  user_nam     text        not null default '',
  lock_dat     timestamptz not null default now(),
  last_act_dat timestamptz not null default now(),
  expire_dat   timestamptz not null
);

comment on table public.t_kizaihyou_lock is
  '機材表の編集ロック（1機材表に1行）。expire_datを過ぎたものは切れていて、他の人が取れる';
comment on column public.t_kizaihyou_lock.lock_dat is '今の持ち主が編集を始めた日時';
comment on column public.t_kizaihyou_lock.last_act_dat is '最後に操作して延長した日時（閲覧側に「最終操作」として出す）';

-- ----------------------------------------------------------------------------
-- 楽観ロックの版
-- ----------------------------------------------------------------------------
alter table public.t_kizaihyou add column content_ver integer not null default 0;

comment on column public.t_kizaihyou.content_ver is
  '内容の版。保存のたびに1増やし、画面が読み込んだ版と食い違う保存は弾く（楽観ロック）';

-- ----------------------------------------------------------------------------
-- RLS（他のテーブルと同じく、認証済みユーザーに一律許可。権限の判定はアプリ側で行う）
-- ----------------------------------------------------------------------------
alter table public.t_kizaihyou_member enable row level security;
alter table public.t_kizaihyou_lock   enable row level security;

create policy p_t_kizaihyou_member_all on public.t_kizaihyou_member
  for all to authenticated using (true) with check (true);
create policy p_t_kizaihyou_lock_all on public.t_kizaihyou_lock
  for all to authenticated using (true) with check (true);
