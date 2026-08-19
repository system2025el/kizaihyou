-- ============================================================================
-- 02: m_user に権限（ビットマスク）と表示順を追加
--   受注部担当者として選べる対象を permission のビットで制御する。
--   ビットの定義は app/_lib/auth/permission.ts
--   （kikikanの app/(main)/_lib/permission.ts と同じ方式）。
-- ============================================================================
alter table public.m_user add column permission  integer  not null default 0;
alter table public.m_user add column dsp_ord_num smallint;

comment on column public.m_user.permission is
  '権限のビットマスク（1=受注部担当者 / 65535=全権限）。ビット定義は app/_lib/auth/permission.ts';
comment on column public.m_user.dsp_ord_num is
  '選択リスト等での表示順（nullは末尾）';
