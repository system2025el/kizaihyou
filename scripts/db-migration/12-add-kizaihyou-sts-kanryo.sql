-- 「完了」ステータスと、完了・削除の操作履歴コードを追加する。
--
-- 完了＝終わった案件を締めた状態。編集不可にし、「作成中に戻す」で復帰できる。
-- 一覧から隠したい場合はステータスの絞り込みで外す（既定では表示する）。
--
-- 削除はステータスにせず、既存の監査列 del_flg を使う。
-- ステータスにすると sts_cod と del_flg のどちらが正か分からなくなるため。
-- 一覧のクエリは元から del_flg = 0 で絞っているので、追加の除外は要らない。

insert into public.m_kizaihyou_sts (sts_cod, sts_nam, chip_color, dsp_ord_num)
values (6, '完了', 'secondary', 6);

comment on column public.t_kizaihyou_his.act_cod is
  '操作の種類。0=不明(旧データ) 1=新規作成 2=保存 3=申請 4=承認 5=差戻し 6=取り下げ 7=コメント 8=連携 9=連携失敗 10=完了 11=完了解除 12=削除 13=復元';
