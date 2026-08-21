-- 承認・差戻しの履歴を横断で引くためのインデックス。
--
-- 機材表申請依頼画面の「対応済み」タブが、act_cod = 4（承認）/ 5（差戻し）の
-- 履歴を機材表を問わず新しい順に引く。既存の
-- t_kizaihyou_his_kizaihyou_id_act_cod_his_id_idx は先頭列が kizaihyou_id なので
-- この引き方には効かない。

create index if not exists t_kizaihyou_his_act_cod_idx
    on public.t_kizaihyou_his (act_cod, his_id desc);
