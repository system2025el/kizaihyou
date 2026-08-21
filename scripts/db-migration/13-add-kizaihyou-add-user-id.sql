-- 機材表の作成者をユーザーIDで持つ。
--
-- 機材表履歴一覧を「自分が作った機材表だけ」に絞るため。
-- 監査列の add_user は氏名の文字列なので、改姓や同姓同名で突き合わせが壊れる。
-- 絞り込みの判定には使わず、m_user への参照を別に持たせる。
--
-- 既存データは add_user（氏名）から引き当てて埋める。埋まらなかった行は
-- 誰にも見えなくなるので、適用後に add_user_id is null の件数を確認すること。

alter table public.t_kizaihyou
  add column add_user_id uuid references public.m_user (user_id);

comment on column public.t_kizaihyou.add_user_id is
  '作成者のm_user.user_id。機材表履歴一覧を自分の分だけに絞るのに使う（add_userは氏名なので判定に使わない）';

update public.t_kizaihyou t
   set add_user_id = u.user_id
  from public.m_user u
 where u.user_nam = t.add_user
   and t.add_user_id is null;

create index if not exists t_kizaihyou_add_user_id_idx
    on public.t_kizaihyou (add_user_id);
