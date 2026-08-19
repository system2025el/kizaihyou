-- ============================================================================
-- 04: 機材表ヘッダに申請者（依頼者）を持たせる
--   機材表申請依頼画面で「誰からの依頼か」を出すため。
--   受注部担当者（tanto_nam / tanto_user_id）と対になる持ち方にする。
--   操作履歴からact_namを文字列で判定して求めることもできるが、
--   文言を変えた瞬間に壊れるのでヘッダに持つ。
-- ============================================================================
alter table public.t_kizaihyou add column shinsei_nam     text not null default '';
alter table public.t_kizaihyou add column shinsei_user_id uuid references public.m_user (user_id);

comment on column public.t_kizaihyou.shinsei_nam is
  '申請者（依頼者）名。申請時点のスナップショット';
comment on column public.t_kizaihyou.shinsei_user_id is
  '申請者（依頼者）のuser_id';
