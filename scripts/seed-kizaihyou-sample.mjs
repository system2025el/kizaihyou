/**
 * 検証用データを作るスクリプト。
 *
 * 機材30点の機材表を「申請 → 承認（機材管理へ連携）→ 編集 → 再申請」まで進めた状態にする。
 * アプリの処理（funcs.ts / t-juchu-kizai.ts）と同じ順序・同じ値で書き込む。
 *
 *   node scripts/seed-kizaihyou-sample.mjs
 *
 * **機材管理（kikikan）のDBにも書き込む**点に注意。`.env.local` の `KIKIKAN_DATABASE_URL` が
 * 指すステージングDBに受注が1件増える（在庫の引き当ても立つ）。本番DBを指した状態で実行しないこと。
 * 実行のたびに機材表と受注が1件ずつ増えるので、いらなくなったら
 * `docs/saishinsei-hanei.md` の後始末のSQLで消す。
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);
const kz = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const kk = new pg.Client({ connectionString: env.KIKIKAN_DATABASE_URL });
await kk.connect();

const KOEN = '検証公演（30点）';
const BASHO = '検証ホール';
const KOKYAKU = '(株)エンジニア・ライティング';
const SHUKO = '2026-10-05';
const NYUKO = '2026-10-09';
const POSITIONS = ['FOH', 'SIDE', 'BACK', 'FLOOR'];
const JST = (p) => `(${p}::date::timestamp AT TIME ZONE 'Asia/Tokyo')`;

// ---- 1. よく使われている機材を30点選ぶ（YARD25 + KICS5。KICSは移動伝票の検証用） ----
const pick = async (shozokuId, limit) =>
  (
    await kk.query(
      `select m.kizai_id, k.kizai_nam, k.shozoku_id, coalesce(k.reg_amt,0)::int as reg_amt,
              round(avg(coalesce(m.plan_kizai_qty,0)))::int as avg_qty
         from public.t_juchu_kizai_meisai m
         join public.v_kizai_lst_sel k on k.kizai_id = m.kizai_id
        where k.del_flg <> 1 and k.dsp_flg <> 0 and coalesce(k.ctn_flg,0) <> 1 and k.shozoku_id = $1
        group by m.kizai_id, k.kizai_nam, k.shozoku_id, k.reg_amt
        order by count(*) desc limit $2`,
      [shozokuId, limit]
    )
  ).rows;

const kizaiList = [...(await pick(2, 25)), ...(await pick(1, 5))];
console.log(
  `機材 ${kizaiList.length}点を選定（YARD ${kizaiList.filter((k) => k.shozoku_id === 2).length} / KICS ${kizaiList.filter((k) => k.shozoku_id === 1).length}）`
);

// ---- 2. ユーザー ----
const { data: users } = await kz.schema('public').from('m_user').select('user_id, user_nam').eq('del_flg', 0);
const u = (nam) => users.find((x) => x.user_nam === nam);
const shinseisha = u('テスト太郎');
const shoninsha = u('米山');
const tanto = ['萩原', '崎山', '米山'].map((n, i) => ({ ...u(n), ord: i + 1 }));

// ---- 3. 機材表を作る ----
const { data: head, error: he } = await kz
  .schema('public')
  .from('t_kizaihyou')
  .insert({
    koen_nam: KOEN,
    basho_nam: BASHO,
    kokyaku_nam: KOKYAKU,
    shukko_dat: SHUKO,
    nyuko_dat: NYUKO,
    mem: '検証用に自動生成',
    add_user: shinseisha.user_nam,
    upd_user: shinseisha.user_nam,
  })
  .select('kizaihyou_id, kizaihyou_cod')
  .single();
if (he) throw he;
console.log(`機材表 ${head.kizaihyou_cod} を作成`);

const { data: cols } = await kz
  .schema('public')
  .from('t_kizaihyou_column')
  .insert(POSITIONS.map((nam, i) => ({ kizaihyou_id: head.kizaihyou_id, column_nam: nam, dsp_ord_num: i + 1 })))
  .select('column_id, dsp_ord_num');
const colIds = [...cols].sort((a, b) => a.dsp_ord_num - b.dsp_ord_num).map((c) => c.column_id);

// 数量はよくある平均受注数を4ポジションにばらす
const planFor = (k) => {
  const total = Math.max(1, k.avg_qty || 4);
  const per = Math.max(1, Math.floor(total / 2));
  return [per, Math.max(0, total - per), 0, 0];
};

const { data: insRows } = await kz
  .schema('public')
  .from('t_kizaihyou_row')
  .insert(
    kizaiList.map((k, i) => ({
      kizaihyou_id: head.kizaihyou_id,
      kizai_kind: '',
      kizai_id: k.kizai_id,
      kizai_nam: k.kizai_nam,
      mem: null,
      spare_qty: i % 5 === 0 ? 1 : 0,
      dsp_ord_num: i + 1,
    }))
  )
  .select('row_id, dsp_ord_num, kizai_id');
const rowsSorted = [...insRows].sort((a, b) => a.dsp_ord_num - b.dsp_ord_num);

const qtyRows = [];
rowsSorted.forEach((r, i) => {
  planFor(kizaiList[i]).forEach((q, ci) => {
    if (q > 0) qtyRows.push({ row_id: r.row_id, column_id: colIds[ci], qty: q });
  });
});
await kz.schema('public').from('t_kizaihyou_qty').insert(qtyRows);

// ---- スナップショット作成 ----
const buildSnapshot = async (headOverride = {}) => {
  const { data: h } = await kz
    .schema('public')
    .from('t_kizaihyou')
    .select('koen_nam, basho_nam, kokyaku_nam, shukko_dat, nyuko_dat, mem')
    .eq('kizaihyou_id', head.kizaihyou_id)
    .single();
  const { data: c } = await kz
    .schema('public')
    .from('t_kizaihyou_column')
    .select('column_id, column_nam, dsp_ord_num')
    .eq('kizaihyou_id', head.kizaihyou_id)
    .order('dsp_ord_num');
  const { data: r } = await kz
    .schema('public')
    .from('t_kizaihyou_row')
    .select('row_id, kizai_kind, kizai_id, kizai_nam, mem, spare_qty, dsp_ord_num')
    .eq('kizaihyou_id', head.kizaihyou_id)
    .order('dsp_ord_num');
  const { data: q } = await kz
    .schema('public')
    .from('t_kizaihyou_qty')
    .select('row_id, column_id, qty')
    .in(
      'row_id',
      r.map((x) => x.row_id)
    );
  return {
    head: {
      eventName: h.koen_nam,
      place: h.basho_nam ?? '',
      clientName: h.kokyaku_nam ?? '',
      shippedAt: h.shukko_dat ?? '',
      returnedAt: h.nyuko_dat ?? '',
      memo: h.mem ?? '',
      ...headOverride,
    },
    columns: c.map((x) => ({ id: String(x.column_id), label: x.column_nam })),
    rows: r.map((x) => ({
      id: String(x.row_id),
      kind: x.kizai_kind,
      kizaiId: x.kizai_id,
      name: x.kizai_nam,
      remark: x.mem ?? '',
      spare: x.spare_qty ? String(x.spare_qty) : '',
      qty: Object.fromEntries(q.filter((y) => y.row_id === x.row_id).map((y) => [String(y.column_id), String(y.qty)])),
    })),
  };
};

const addHis = async (actCod, actNam, user, mem, snapshot) => {
  const { data, error } = await kz
    .schema('public')
    .from('t_kizaihyou_his')
    .insert({
      kizaihyou_id: head.kizaihyou_id,
      act_cod: actCod,
      act_nam: actNam,
      user_id: user.user_id,
      user_nam: user.user_nam,
      mem,
      snapshot,
    })
    .select('his_id')
    .single();
  if (error) throw error;
  return data.his_id;
};

await addHis(1, '新規作成', shinseisha, null, await buildSnapshot());

// ---- 4. 申請 ----
const tantoNam = tanto.map((t) => t.user_nam).join('、');
const shinseiHisId1 = await addHis(
  3,
  `申請（受注部担当者：${tantoNam}）`,
  shinseisha,
  'メイン機材の申請です',
  await buildSnapshot()
);
await kz
  .schema('public')
  .from('t_kizaihyou_tanto')
  .insert(
    tanto.map((t) => ({
      kizaihyou_id: head.kizaihyou_id,
      user_id: t.user_id,
      user_nam: t.user_nam,
      dsp_ord_num: t.ord,
    }))
  );
await kz
  .schema('public')
  .from('t_kizaihyou')
  .update({
    sts_cod: 2,
    tanto_nam: tantoNam,
    shinsei_nam: shinseisha.user_nam,
    shinsei_user_id: shinseisha.user_id,
    shinsei_his_id: shinseiHisId1,
    upd_user: shinseisha.user_nam,
  })
  .eq('kizaihyou_id', head.kizaihyou_id);
console.log('申請しました');

// ---- 5. 承認 → 機材管理へ連携 ----
await kz
  .schema('public')
  .from('t_kizaihyou')
  .update({ sts_cod: 4, upd_user: shoninsha.user_nam })
  .eq('kizaihyou_id', head.kizaihyou_id);
await addHis(4, '承認', shoninsha, '検証用の承認', null);

const maxJuchu = await kk.query('SELECT max(juchu_head_id) AS m FROM public.t_juchu_head');
const juchuHeadId = Math.max(Number(maxJuchu.rows[0].m ?? 0) + 1, 90000);
await kk.query(
  `INSERT INTO public.t_juchu_head (juchu_head_id, del_flg, juchu_sts, juchu_dat, juchu_str_dat, juchu_end_dat,
     nyuryoku_user, koen_nam, koenbasho_nam, kokyaku_id, mem, zei_kbn, add_dat, add_user)
   VALUES ($1,0,0,${JST('$2')}::date,$3::date,$4::date,$5,$6,$7,1013,$8,2,now(),$5)`,
  [juchuHeadId, SHUKO, SHUKO, NYUKO, '米山', KOEN, BASHO, '検証用に自動生成']
);

const HK = 1;
await kk.query(
  `INSERT INTO public.t_juchu_kizai_head (juchu_head_id, juchu_kizai_head_id, juchu_kizai_head_kbn,
  head_nam, juchu_honbanbi_qty, ht_kbn, oya_juchu_kizai_head_id, add_dat, add_user) VALUES ($1,$2,1,$3,0,0,NULL,now(),$4)`,
  [juchuHeadId, HK, KOEN, '米山']
);
await kk.query(
  `INSERT INTO public.t_juchu_kizai_nyushuko (juchu_head_id, juchu_kizai_head_id, nyushuko_shubetu_id,
  nyushuko_basho_id, nyushuko_dat, add_dat, add_user)
  VALUES ($1,$2,1,2,${JST('$3')},now(),$5), ($1,$2,2,2,${JST('$4')},now(),$5)`,
  [juchuHeadId, HK, SHUKO, NYUKO, '米山']
);
await kk.query(
  `INSERT INTO public.t_juchu_kizai_honbanbi (juchu_head_id, juchu_kizai_head_id, juchu_honbanbi_shubetu_id,
  juchu_honbanbi_dat, juchu_honbanbi_add_qty, mem, add_dat, add_user)
  SELECT $1,$2,1,d::date,0,'',now(),$5 FROM generate_series($3::date,$4::date,interval '1 day') d`,
  [juchuHeadId, HK, SHUKO, NYUKO, '米山']
);
await kk.query(
  `INSERT INTO public.t_juchu_kizai_honbanbi (juchu_head_id, juchu_kizai_head_id, juchu_honbanbi_shubetu_id,
  juchu_honbanbi_dat, juchu_honbanbi_add_qty, mem, add_dat, add_user)
  VALUES ($1,$2,2,$3::date,0,'',now(),$5), ($1,$2,3,$4::date,0,'',now(),$5)`,
  [juchuHeadId, HK, SHUKO, NYUKO, '米山']
);

const meisai = kizaiList.map((k, i) => {
  const plan = planFor(k).reduce((a, b) => a + b, 0);
  return {
    mid: i + 1,
    kizaiId: k.kizai_id,
    tanka: k.reg_amt,
    qty: plan,
    yobi: i % 5 === 0 ? 1 : 0,
    shozoku: k.shozoku_id,
  };
});
await kk.query(
  `INSERT INTO public.t_juchu_kizai_meisai (juchu_head_id, juchu_kizai_head_id, juchu_kizai_meisai_id,
  kizai_id, kizai_tanka_amt, plan_kizai_qty, plan_yobi_qty, mem, mem2, keep_qty, shozoku_id, dsp_ord_num, indent_num, add_dat, add_user)
  SELECT $1,$2,t.mid,t.kid,t.tanka,t.q,t.y,NULL,NULL,NULL,2,t.mid,0,now(),$3
    FROM unnest($4::int[],$5::int[],$6::numeric[],$7::int[],$8::int[]) AS t(mid,kid,tanka,q,y)`,
  [
    juchuHeadId,
    HK,
    '米山',
    meisai.map((m) => m.mid),
    meisai.map((m) => m.kizaiId),
    meisai.map((m) => m.tanka),
    meisai.map((m) => m.qty),
    meisai.map((m) => m.yobi),
  ]
);
await kk.query(
  `INSERT INTO public.t_nyushuko_den (juchu_head_id, juchu_kizai_head_id, juchu_kizai_meisai_id,
  sagyo_kbn_id, sagyo_den_dat, sagyo_id, kizai_id, plan_qty, dsp_ord_num, indent_num, add_dat, add_user)
  SELECT $1,$2,t.mid,k.kbn, CASE WHEN k.is_shuko THEN ${JST('$4')} ELSE ${JST('$5')} END, 2, t.kid, t.pq, t.mid, 0, now(), $3
    FROM unnest($6::int[],$7::int[],$8::int[]) AS t(mid,kid,pq)
    CROSS JOIN (VALUES (10,true),(20,true),(30,false)) AS k(kbn,is_shuko)`,
  [
    juchuHeadId,
    HK,
    '米山',
    SHUKO,
    NYUKO,
    meisai.map((m) => m.mid),
    meisai.map((m) => m.kizaiId),
    meisai.map((m) => m.qty + m.yobi),
  ]
);

const ido = meisai.filter((m) => m.shozoku === 1);
if (ido.length) {
  const maxIdo = await kk.query('SELECT max(ido_den_id) AS m FROM public.t_ido_den_juchu');
  const first = Number(maxIdo.rows[0].m ?? 0) + 1;
  await kk.query(
    `INSERT INTO public.t_ido_den_juchu (ido_den_id, sagyo_den_dat, sagyo_siji_id, sagyo_id, sagyo_kbn_id,
    kizai_id, plan_qty, juchu_head_id, juchu_kizai_head_id, add_dat, add_user)
    SELECT $1 + t.ord, $2::date, 1, k.sid, k.kbn, t.kid, t.pq, $3, $4, now(), $5
      FROM unnest($6::int[],$7::int[],$8::int[]) AS t(ord,kid,pq)
      CROSS JOIN (VALUES (40,1),(50,2)) AS k(kbn,sid)`,
    [
      first,
      SHUKO,
      juchuHeadId,
      HK,
      '米山',
      ido.map((_, i) => i),
      ido.map((m) => m.kizaiId),
      ido.map((m) => m.qty + m.yobi),
    ]
  );
}

await kz
  .schema('public')
  .from('t_kizaihyou')
  .update({ juchu_head_id: juchuHeadId, juchu_kizai_head_id: HK, upd_user: shoninsha.user_nam })
  .eq('kizaihyou_id', head.kizaihyou_id);
await addHis(8, `kikikan連携（受注 ${juchuHeadId}）`, shoninsha, `機材明細 ${meisai.length}件`, null);
console.log(`承認し、機材管理に受注 ${juchuHeadId} を作成（明細 ${meisai.length}件 / 移動 ${ido.length}件）`);

// ---- 6. 受注部が機材管理側で1件だけ数量を調整（「受注部が調整済み」の検証用） ----
const adjusted = meisai[1];
await kk.query(
  `UPDATE public.t_juchu_kizai_meisai SET plan_kizai_qty = plan_kizai_qty + 7, upd_dat = now(), upd_user = '柏井'
  WHERE juchu_head_id=$1 AND juchu_kizai_head_id=$2 AND juchu_kizai_meisai_id=$3 AND kizai_id=$4`,
  [juchuHeadId, HK, adjusted.mid, adjusted.kizaiId]
);
console.log(`機材管理側で機材ID ${adjusted.kizaiId} の受注数を +7 に調整（受注部の手作業を再現）`);

// ---- 7. 機材表を編集（追加3・数量変更3・削除2・入庫日変更） ----
const { data: curRows } = await kz
  .schema('public')
  .from('t_kizaihyou_row')
  .select('row_id, kizai_id, kizai_nam, dsp_ord_num')
  .eq('kizaihyou_id', head.kizaihyou_id)
  .order('dsp_ord_num');

// 数量変更（先頭3行の1ポジション目を+5）
for (const r of curRows.slice(0, 3)) {
  const { data: q } = await kz
    .schema('public')
    .from('t_kizaihyou_qty')
    .select('qty')
    .eq('row_id', r.row_id)
    .eq('column_id', colIds[0])
    .maybeSingle();
  await kz
    .schema('public')
    .from('t_kizaihyou_qty')
    .upsert({ row_id: r.row_id, column_id: colIds[0], qty: (q?.qty ?? 0) + 5 });
}
// 削除（末尾2行）
const removed = curRows.slice(-2);
await kz
  .schema('public')
  .from('t_kizaihyou_row')
  .delete()
  .in(
    'row_id',
    removed.map((r) => r.row_id)
  );
// 追加（サブ機材3点）
const extra = await pick(2, 40);
const already = new Set(kizaiList.map((k) => k.kizai_id));
const added = extra.filter((k) => !already.has(k.kizai_id)).slice(0, 3);
const { data: addedRows } = await kz
  .schema('public')
  .from('t_kizaihyou_row')
  .insert(
    added.map((k, i) => ({
      kizaihyou_id: head.kizaihyou_id,
      kizai_kind: '',
      kizai_id: k.kizai_id,
      kizai_nam: k.kizai_nam,
      mem: 'サブ機材として追加',
      spare_qty: 0,
      dsp_ord_num: 100 + i,
    }))
  )
  .select('row_id, kizai_id');
await kz
  .schema('public')
  .from('t_kizaihyou_qty')
  .insert(addedRows.map((r) => ({ row_id: r.row_id, column_id: colIds[1], qty: 4 })));
// 入庫日を1日延ばす（サマリーの食い違い検証）
const NYUKO2 = '2026-10-10';
await kz.schema('public').from('t_kizaihyou').update({ nyuko_dat: NYUKO2 }).eq('kizaihyou_id', head.kizaihyou_id);

// ---- 8. 再申請 ----
const shinseiHisId2 = await addHis(
  3,
  `申請（受注部担当者：${tantoNam}）`,
  shinseisha,
  'サブ機材を追加して再申請します',
  await buildSnapshot()
);
await kz
  .schema('public')
  .from('t_kizaihyou')
  .update({
    sts_cod: 2,
    shinsei_his_id: shinseiHisId2,
    upd_user: shinseisha.user_nam,
  })
  .eq('kizaihyou_id', head.kizaihyou_id);

console.log(`\n■ 完成: ${head.kizaihyou_cod}（申請中・再申請の状態）`);
console.log(`   機材管理の受注: ${juchuHeadId}`);
console.log(
  `   変更: 数量変更3 / 追加3（${added.map((a) => a.kizai_nam.slice(0, 16)).join('、')}） / 削除2（${removed.map((r) => r.kizai_nam.slice(0, 16)).join('、')}） / 入庫日 ${NYUKO}→${NYUKO2}`
);
await kk.end();
