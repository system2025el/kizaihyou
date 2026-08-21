-- 機材表の行にインデント段数を追加する。
--
-- 機材管理（kikikan）の機材明細は、直前の機材とセットで使うもの（付属ケーブル等）を
-- 機材名の前の「 ┗ 」で表している。実体は t_juchu_kizai_meisai.indent_num で、
-- 記号そのものは m_dic（dic_id = 1）の dic_val。値は 0 と 1 しか使われていない。
--
-- 機材表でも同じことを表現できるようにし、連携時にそのまま渡す。
-- 親子の連動（親を動かすと子もついてくる）は入れておらず、見た目だけの扱い。

alter table public.t_kizaihyou_row
  add column indent_num smallint not null default 0;

comment on column public.t_kizaihyou_row.indent_num is
  '機材名のインデント段数。0=通常、1=直前の機材とセット（ ┗ ）。kikikanのt_juchu_kizai_meisai.indent_numへそのまま渡す';
