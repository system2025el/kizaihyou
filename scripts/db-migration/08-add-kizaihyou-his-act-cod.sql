-- ============================================================================
-- 08: 操作履歴に操作種別コードを持たせる
--   これまで操作の種類は act_nam（'申請（受注部担当者：◯◯）'等）の文字列でしか
--   判別できず、文言を変えると壊れる状態だった。機材表承認画面で
--   「ひとつ前の申請」のスナップショットと比べて差分を出すために、
--   コードで確実に引けるようにする。
--
--   既定値0（不明）で追加するので、この列を知らない既存コードからのINSERTも通る。
-- ============================================================================
alter table public.t_kizaihyou_his add column act_cod smallint not null default 0;

comment on column public.t_kizaihyou_his.act_cod is
  '操作種別（0=不明 1=新規作成 2=保存 3=申請 4=承認 5=差戻し 6=取り下げ 7=コメント）。定義は app/_lib/equipment-table-list/types.ts の KIZAIHYOU_ACT';

-- 既存データを act_nam から一度だけ変換する
update public.t_kizaihyou_his
   set act_cod = case
                   when act_nam like '申請%'   then 3
                   when act_nam = '承認'       then 4
                   when act_nam = '差戻し'     then 5
                   when act_nam = '取り下げ'   then 6
                   when act_nam = 'コメント'   then 7
                   when act_nam = '保存'       then 2
                   when act_nam like '%新規作成' then 1
                   else 0
                 end;

-- 「ひとつ前の申請」を引くためのインデックス
create index idx_t_kizaihyou_his_act on public.t_kizaihyou_his (kizaihyou_id, act_cod, his_id desc);
