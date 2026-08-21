/**
 * 「作成中」の機材表をまとめて作るスクリプト。
 *
 * 機材表履歴一覧の絞り込み・並び替え・件数表示を、関係者に見てもらうための
 * デモデータを用意する。公演名・場所・顧客名は機材管理（kikikan）の実際の受注から
 * 拾い、機材も登場回数の多いものを使う。
 *
 *   node scripts/seed-kizaihyou-drafts.mjs [件数]   # 既定は20件
 *
 * **機材管理のDBは読むだけ**（受注も在庫の引き当ても作らない）。書き込むのは
 * kizaihyou側だけで、ステータスは全件「作成中」。
 *
 * 実行すると kizaihyou_cod のシーケンスを件数分消費する（KZ-0006〜のような
 * 連番が進む）。いらなくなったら末尾の後始末のSQLで消すこと。
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import pg from 'pg';

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

const COUNT = Number(process.argv[2]) || 20;
const OWNER = '米山';
/** 出庫日の起点。ここから5日ずつずらして散らし、期間での絞り込みを試せるようにする */
const FIRST_SHUKO = new Date('2026-09-05T00:00:00Z');
/** ポジションの組み合わせ。機材表ごとに使い分ける */
const POSITION_SETS = [
  ['FOH', 'SIDE', 'BACK'],
  ['上手', '下手', 'センター', 'バトン'],
  ['FOH', 'SIDE L', 'SIDE R', 'BACK', 'FLOOR'],
  ['1バトン', '2バトン', '3バトン'],
];

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

// ---- 1. 作成者 ----
const { data: users } = await kz.schema('public').from('m_user').select('user_id, user_nam').eq('del_flg', 0);
const owner = users.find((u) => u.user_nam === OWNER);
if (!owner) throw new Error(`m_userに「${OWNER}」がいません`);

// ---- 2. 公演名・場所・顧客名を機材管理の受注から拾う（検証用のレコードは除く） ----
const { rows: juchu } = await kk.query(
  `select distinct on (h.koen_nam) h.koen_nam, h.koenbasho_nam, k.kokyaku_nam
     from public.t_juchu_head h
     left join public.m_kokyaku k on k.kokyaku_id = h.kokyaku_id
    where coalesce(h.del_flg, 0) = 0
      and coalesce(h.koen_nam, '') <> ''
      and coalesce(h.koenbasho_nam, '') <> ''
      and h.koen_nam !~* '(検証|テスト|test|デモ|打ち込み|修理)'
    order by h.koen_nam, h.juchu_head_id desc`
);
if (juchu.length < COUNT) throw new Error(`使える公演が ${juchu.length}件しかありません（${COUNT}件必要）`);

// ---- 3. 機材（機材明細への登場回数が多い順。コンテナ・非表示は除く） ----
const { rows: kizaiList } = await kk.query(
  `select m.kizai_id, k.kizai_nam, round(avg(coalesce(m.plan_kizai_qty, 0)))::int as avg_qty
     from public.t_juchu_kizai_meisai m
     join public.v_kizai_lst_sel k on k.kizai_id = m.kizai_id
    where k.del_flg <> 1 and k.dsp_flg <> 0 and coalesce(k.ctn_flg, 0) <> 1
    group by m.kizai_id, k.kizai_nam
    order by count(*) desc
    limit 60`
);
await kk.end();

console.log(`公演 ${juchu.length}件 / 機材 ${kizaiList.length}件から、作成中の機材表を ${COUNT}件作ります`);

const created = [];
for (let i = 0; i < COUNT; i += 1) {
  const source = juchu[i];
  const positions = POSITION_SETS[i % POSITION_SETS.length];
  // 5件に1件は出庫日・入庫日を空にする（未入力の行の見え方と、期間での絞り込みを試すため）
  const hasDates = i % 5 !== 4;
  const shukko = addDays(FIRST_SHUKO, i * 5);
  const nyuko = addDays(shukko, 2 + (i % 3));

  const { data: head, error } = await kz
    .schema('public')
    .from('t_kizaihyou')
    .insert({
      koen_nam: source.koen_nam,
      basho_nam: source.koenbasho_nam,
      kokyaku_nam: source.kokyaku_nam ?? '',
      shukko_dat: hasDates ? iso(shukko) : null,
      nyuko_dat: hasDates ? iso(nyuko) : null,
      mem: i % 3 === 0 ? '仮組みの段階です' : null,
      add_user: owner.user_nam,
      add_user_id: owner.user_id,
      upd_user: owner.user_nam,
    })
    .select('kizaihyou_id, kizaihyou_cod')
    .single();
  if (error) throw error;

  // 列
  const { data: cols } = await kz
    .schema('public')
    .from('t_kizaihyou_column')
    .insert(positions.map((nam, ci) => ({ kizaihyou_id: head.kizaihyou_id, column_nam: nam, dsp_ord_num: ci + 1 })))
    .select('column_id, dsp_ord_num');
  const colIds = [...cols].sort((a, b) => a.dsp_ord_num - b.dsp_ord_num).map((c) => c.column_id);

  // 行。機材数は5〜24でばらす
  const rowCount = 5 + ((i * 7) % 20);
  const picked = kizaiList.slice((i * 3) % 20, ((i * 3) % 20) + rowCount);
  const { data: insRows } = await kz
    .schema('public')
    .from('t_kizaihyou_row')
    .insert(
      picked.map((k, ri) => ({
        kizaihyou_id: head.kizaihyou_id,
        kizai_kind: '',
        kizai_id: k.kizai_id,
        kizai_nam: k.kizai_nam,
        mem: null,
        spare_qty: ri % 6 === 0 ? 1 : 0,
        // 3行に1行は、直前の機材とセット（ ┗ ）にする
        indent_num: ri > 0 && ri % 3 === 0 ? 1 : 0,
        dsp_ord_num: ri + 1,
      }))
    )
    .select('row_id, dsp_ord_num');
  const rowsSorted = [...insRows].sort((a, b) => a.dsp_ord_num - b.dsp_ord_num);

  // 数量。平均受注数を先頭2ポジションに割り振る
  const qtyRows = [];
  rowsSorted.forEach((r, ri) => {
    const total = Math.max(1, picked[ri].avg_qty || 4);
    const first = Math.max(1, Math.floor(total / 2));
    qtyRows.push({ row_id: r.row_id, column_id: colIds[0], qty: first });
    if (total - first > 0) qtyRows.push({ row_id: r.row_id, column_id: colIds[1], qty: total - first });
  });
  await kz.schema('public').from('t_kizaihyou_qty').insert(qtyRows);

  // 「新規作成」の履歴にその時点のスナップショットを載せる（タイムライン・閲覧ページ用）
  const snapshot = {
    head: {
      eventName: source.koen_nam,
      place: source.koenbasho_nam,
      clientName: source.kokyaku_nam ?? '',
      shippedAt: hasDates ? iso(shukko) : '',
      returnedAt: hasDates ? iso(nyuko) : '',
      memo: i % 3 === 0 ? '仮組みの段階です' : '',
    },
    columns: cols.map((c) => ({ id: String(c.column_id), label: c.column_nam })),
    rows: rowsSorted.map((r, ri) => ({
      id: String(r.row_id),
      kind: '',
      kizaiId: picked[ri].kizai_id,
      name: picked[ri].kizai_nam,
      remark: '',
      spare: ri % 6 === 0 ? '1' : '',
      indent: ri > 0 && ri % 3 === 0 ? 1 : 0,
      qty: Object.fromEntries(
        qtyRows.filter((q) => q.row_id === r.row_id).map((q) => [String(q.column_id), String(q.qty)])
      ),
    })),
  };
  await kz.schema('public').from('t_kizaihyou_his').insert({
    kizaihyou_id: head.kizaihyou_id,
    act_cod: 1,
    act_nam: '新規作成',
    user_id: owner.user_id,
    user_nam: owner.user_nam,
    mem: null,
    snapshot,
  });

  created.push({
    cod: head.kizaihyou_cod,
    公演名: source.koen_nam,
    出庫日: hasDates ? iso(shukko) : '(未入力)',
    機材: rowCount,
    ポジション: positions.length,
  });
}

console.table(created);
console.log(`\n■ 完成: ${created[0].cod} 〜 ${created[created.length - 1].cod}（${OWNER}名義・すべて作成中）`);
console.log('後始末:');
console.log(
  `  delete from public.t_kizaihyou where add_user_id = '${owner.user_id}' and sts_cod = 1 and kizaihyou_cod in (${created
    .map((c) => `'${c.cod}'`)
    .join(', ')});`
);
