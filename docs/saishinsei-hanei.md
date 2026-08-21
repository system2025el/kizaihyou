# 再申請の機材明細への反映

一度承認して機材管理（kikikan）へ連携したあとに、機材表がもう一度申請されたときの話。
本書は **第1段（参照専用の反映画面）** の仕様と、その検証に使うデータの作り方をまとめる。

作成日: 2026-08-21 / 対象: `app/(main)/equipment-table-request/[id]/`

---

## 1. なぜ「上書き」にしないのか

初回承認で作った受注機材明細は、そのあと**受注部が機材管理側で手を入れる**。実地でも、
連携した受注 91602 に受注部が2つ目の受注機材ヘッダー（公演04）を足しているのを確認した。

つまり **連携後は機材管理が正**で、機材表の内容で丸ごと置き換えると受注部の作業が消える。
そこで運用をこう決めた。

- 追加分を別の受注機材ヘッダーに切り出すのは、受注部の実務として受け入れられない（＝1本にまとめたい）
- 前回の承認内容と今回の申請内容の差分を見せ、機材明細の現在も並べて見せる
- **入出庫の日時・場所は自動で変えない**（機材が動くと移動伝票まで波及するため、機材の増減とは分けて扱う）

第1段はここまで（表示だけ）。実際に機材明細へ書きに行くのは第2段。

---

## 2. 画面の作り

| ファイル                      | 役割                                         |
| ----------------------------- | -------------------------------------------- |
| `_lib/merge-preview.ts`       | 突き合わせ（Server Actions、**SELECTのみ**） |
| `_ui/merge-preview-panel.tsx` | 機材表承認画面の上に出す参照専用のテーブル   |

`fetchMergePreview(approval)` は連携済み（`juchu_head_id` と `juchu_kizai_head_id` が入っている）
のときだけ結果を返し、未連携なら `null`。パネルも出ない。

### 突き合わせる3つの数量

機材1点につき、次の3つを横に並べる。キーは `toDiffKey()`（`id:機材ID`、手入力の名称は `nam:名称`）。

| 列             | どこから                                                   |
| -------------- | ---------------------------------------------------------- |
| 前回の申請     | 今回の申請 − 差分（`approval.diff`）で復元                 |
| 今回の申請     | 申請時のスナップショット                                   |
| 機材管理の現在 | `t_juchu_kizai_meisai`（`selectKikikanJuchuKizaiCurrent`） |

前回の申請を差分から逆算しているのは、スナップショットを2件読まずに済ませるため。
差分に載っていない機材は前回も今回も同じ、という前提で復元している。

### 状態の出し分け

| 状態         | 条件                                             |
| ------------ | ------------------------------------------------ |
| 追加         | 前回に無く、今回にある                           |
| 削除         | 前回にあり、今回に無い                           |
| 数量変更     | 受注数か予備数が変わった                         |
| 機材管理のみ | 機材表には無いが機材明細にある（受注部が足した） |
| 変更なし     | 上記以外（**表には出さない**）                   |

加えて「前回の申請」と「機材管理の現在」が食い違う行に **「受注部が調整済み」** と出す。
受注部が向こうで数量を触った印で、第2段で機械的に上書きすると消える値。

### 機材以外の食い違い

公演名・公演場所・顧客名を `t_juchu_head` と、出庫日・入庫日を `t_juchu_kizai_nyushuko` と比べて、
違えば警告として並べる。**直しに行かない**（受注部が機材管理側で直す前提）。
入出庫は場所（KICS / YARD / 厚木）ごとに行があるので、ラベルにも場所を出す。

---

## 3. 第2段でやること（未実装）

反映のルールはここまでで合意済み。

- **追加**: 対象の受注機材ヘッダーの現在の `t_juchu_kizai_nyushuko` から所属・日付を引いて明細を作る
  （機材表の出庫日・入庫日ではなく、**機材管理側の現在の日付に合わせる**）
- **数量変更**: `t_juchu_kizai_meisai` の `plan_kizai_qty` / `plan_yobi_qty` を更新
- **削除**: 実績があっても消す。機材管理の機材明細画面の保存と同じで、
  - `t_juchu_kizai_meisai` / `t_nyushuko_den` / `t_nyushuko_result` は
    (`juchu_head_id`, `juchu_kizai_head_id`, `juchu_kizai_meisai_id`, `kizai_id`) で削除
  - `t_ido_den_juchu` は (`juchu_head_id`, `juchu_kizai_head_id`, `kizai_id`) で削除
- **入出庫の日時・場所は触らない**

---

## 4. 検証データ

`scripts/seed-kizaihyou-sample.mjs` が、上のケースを全部含む機材表を1件作る。

```bash
node scripts/seed-kizaihyou-sample.mjs
```

> **機材管理のDBにも書き込む。** `.env.local` の `KIKIKAN_DATABASE_URL` が指す先に受注が1件増え、
> 在庫の引き当ても立つ。ステージングを指していることを確かめてから実行すること。

### 作られるもの

機材は「機材明細への登場回数が多い順」に選ぶので、実際によく使う機材が並ぶ。
コンテナ（`ctn_flg = 1`）と非表示（`dsp_flg = 0`）は除く。

| 項目           | 内容                                               |
| -------------- | -------------------------------------------------- |
| 機材           | 30点（YARD 25 / KICS 5。KICS分は移動伝票の検証用） |
| ポジション     | FOH / SIDE / BACK / FLOOR                          |
| 出庫日・入庫日 | 2026-10-05 → 2026-10-09（編集後は 10-10）          |
| 進行           | 新規作成 → 申請 → 承認 → 連携 → 編集 → 再申請      |

編集で入れてある変化。

- 数量変更 3件（先頭3行の FOH を +5）
- 追加 3件（サブ機材として追加、SIDE に 4）
- 削除 2件（末尾2行）
- 入庫日 10-09 → 10-10（機材以外の食い違いの検証）
- **機材管理側で1件だけ受注数を +7**（更新者 `柏井`）── 「受注部が調整済み」の検証

### 実際に作った分（2026-08-21）

| 機材表  | 機材管理の受注 | 中身                                       |
| ------- | -------------- | ------------------------------------------ |
| KZ-0005 | 91604          | 明細30 / 使用日7 / 作業伝票90 / 移動伝票10 |

履歴は `58 新規作成 → 59 申請 → 60 承認 → 61 連携 → 62 申請`。

### 後始末

いらなくなったら両方のDBから消す。**先に機材管理側**（在庫の引き当てが残るため）。

```sql
-- 機材管理（kikikan）側。:juchu は 91604 のような受注番号
delete from public.t_ido_den_juchu        where juchu_head_id = :juchu;
delete from public.t_nyushuko_result      where juchu_head_id = :juchu;
delete from public.t_nyushuko_den         where juchu_head_id = :juchu;
delete from public.t_juchu_kizai_meisai   where juchu_head_id = :juchu;
delete from public.t_juchu_kizai_honbanbi where juchu_head_id = :juchu;
delete from public.t_juchu_kizai_nyushuko where juchu_head_id = :juchu;
delete from public.t_juchu_kizai_head     where juchu_head_id = :juchu;
delete from public.t_juchu_head           where juchu_head_id = :juchu;
```

```sql
-- kizaihyou側。行・列・数量・履歴・担当者はcascadeで消える
delete from public.t_kizaihyou where kizaihyou_cod = 'KZ-0005';
```

> 機材表を消しても `kizaihyou_cod` のシーケンスは戻らないので、採番に欠番ができる。
