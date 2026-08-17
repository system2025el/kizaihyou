# CLAUDE.md

このファイルは、このリポジトリ（kizaihyou）で作業する Claude Code (claude.ai/code) 向けのガイドです。

## コマンド

```bash
yarn dev            # 開発サーバー起動 (next dev --turbopack)
yarn build           # 本番ビルド
yarn start            # 本番ビルドの起動

yarn lint            # prettier --check + next lint
yarn fix             # prettier --write + eslint --fix（コミット前に実行推奨）
```

このリポジトリにテストランナーは導入されていません（jest/vitest/playwright等なし）。存在しないテストコマンドを作り出さないこと。

## kikikan(C:\EL)との関係（重要）

このリポジトリは、姉妹プロジェクト **kikikan**（`C:\EL`、GitHub: 別リポジトリ、Vercel: 別プロジェクト）と機能的に連携するが、**Supabaseプロジェクトは完全に分離している（2026年8月〜）**。GitHub・Vercelはもちろん、DBとAuthもそれぞれ別。

- **経緯**: 当初はkikikanと同一Supabaseプロジェクト・同一`public`スキーマを直接共有する想定だったが、「Auth（ユーザー認証）をkizaihyou単独で管理したい」という理由から専用プロジェクトに切り替えた。
- **project_ref**: `lqxuybzllbgprzuuynfp`（kizaihyou専用、開発用に1つのみ作成。本番/ステージングを分ける運用にする場合は別途プロジェクトを作成しこの節を更新する）
- **スキーマ**: kizaihyou専用の`public`スキーマ。kikikanのテーブル定義とは無関係なので、スキーマ変更時にkikikan側とすり合わせる必要はない（後述の`m_kizai`参照を除く）。
- **kikikanの機材マスタ参照**: 機材表の「名称」はkikikanの機材マスタ`m_kizai`を参照する。接続は`app/_lib/db/kikikan/`配下（`KIKIKAN_*`環境変数）。**kikikanのservice_roleキーは`permission denied for schema public`になり使えない**（kikikan側でschema publicへのGRANTが無い）ため、anonキーで参照している。anonキーとはいえ他プロジェクトの認証情報なので`NEXT_PUBLIC_`を付けず、Server Actionsからのみ使うこと。別Postgresインスタンスなので外部キー制約は張れず、`t_kizaihyou_row.kizai_id`に値のみ保持し整合性はアプリ側で担保する。
- **Auth**: kikikanとは完全に別。同じ人間でもkikikanとkizaihyouでユーザーレコード（UUID）は別になる。将来、受注部担当者などのデータをkikikan側の担当者マスタと突き合わせる場合は、UUIDではなくメールアドレス等の別キーで名寄せする設計が必要。
- **将来のクロスプロジェクトアクセス**: kikikan（本番・ステージングともVercel上）からこのプロジェクトのDBを直接参照・更新する構想がある。技術的には(a) kikikan側にこのプロジェクト用の`DATABASE_URL`・Supabase-jsクライアントをもう1組追加、(b) このプロジェクト側でkikikanから参照される想定のテーブルに適切なRLSポリシーを設定、で実現可能。ただし2つの別Postgresインスタンスにまたがる単一トランザクションは組めない点に注意（アプリ側で部分失敗のハンドリングを設計する）。
- **IPv4アドオン**: このプロジェクトは新しい方式で作成されているため、Postgresへの直接接続（`app/_lib/db/postgres.ts`のpg Pool、ポート6543）はデフォルトでIPv6のみ。IPv4のみのネットワーク（このリポジトリの開発環境を含む）から接続するには、SupabaseダッシュボードでIPv4アドオン（有料、月$4程度）を有効化する必要がある（本プロジェクトでは有効化済み）。Supabase-js経由のアクセス（PostgREST、ポート443のHTTPS）はこの制約を受けず、アドオン無しでも常に接続可能。
- **マイグレーション**: DDLは`.mcp.json`のSupabase MCP（`apply_migration`）で適用し、同じSQLを`scripts/db-migration/*.sql`にも残す（kikikanの`scripts/db-migration/`と同じ運用）。適用後は`get_advisors`でRLS漏れ等を確認する。
- **型生成**: `app/_lib/db/types/types.ts`はSupabase CLI（ローカル実行、`npx supabase gen types typescript --db-url "$DATABASE_URL" --schema public`）で生成する想定だが、このコマンドはDocker Desktop（またはPodman）が無いと失敗する（`LegacyContainerRuntimeNotFoundError`）。この環境にはDockerが無いため、代わりに`.mcp.json`のSupabase MCP（`generate_typescript_types`ツール、project_refは上記kizaihyou専用のもの）経由で生成している。生成後は`yarn fix:prettier`でプロジェクトのフォーマットに合わせること。スキーマ変更時は同じ手順で再生成する。

## アーキテクチャ（現状）

画面（`/login`・`/equipment-table/[id]`・`/equipment-table-list`・`/equipment-table-request`）はDBに接続済み。モックが残るのは受注明細（機材）の在庫数だけで、これはkikikanの受注と紐づいていないため`_lib/mock-data.ts`の固定値を使っている。設計はkikikan(`C:\EL\CLAUDE.md`)を踏襲する：

- **ルーティング**: `app/`配下のNext.js App Router。`app/(main)/`＝ハンバーガーメニュー付きの画面、`app/equipment-table/[id]`と`/login`はその外側（全幅）。
- **認証**: `middleware.ts`が全ページでセッションを検証し、未ログインなら`/login`へ飛ばす（公開パスは`/login`・`/error`のみ）。**セッションはlocalStorageではなくCookieに保存する**（`@supabase/ssr`）。そうしないとServer Actions側がログイン状態を認識できず、RLSに弾かれる。ログイン直後に`ensureCurrentUser()`が`m_user`のプロファイルを作る（サインアップ画面は未実装なので、氏名の初期値はメールアドレスのローカル部）。
- **コロケーション**: 機能ごとに`_lib/`（型・Server Actions・ビジネスロジック）と`_ui/`（コンポーネント）のサブフォルダを持たせる。アプリ全体で共有するコードは`app/_lib/`・`app/_ui/`。
- **データアクセス — 同一DBに対する2種類のクライアント**（kikikanと同一方針）:
  - `app/_lib/db/postgres.ts` — 生の`pg` `Pool`（HMRを跨いで生き残るよう`globalForPool`でシングルトン化）。手書きSQL、トランザクション、複雑・大量データのクエリに使用。機材表の保存（`saveKizaihyouContent`）とコピー（`copyKizaihyou`）がこれ。**RLSはバイパスされる**ので、呼び出し元のfuncs層で必ず`requireCurrentUser()`を通すこと。
  - `app/_lib/db/supabase-server.ts` — サーバー用Supabase JSクライアント。ログインCookieを引き継ぐのでRLSは`authenticated`として評価される。DB層（`tables/*.ts`）の読み取りと単純な更新はこちら。
  - `app/_lib/db/supabase-client.ts` — ブラウザ用（`createBrowserClient`）。`supabase.auth`のログイン処理のみに使う。
  - `app/_lib/db/schema.ts` — `SCHEMA`定数（`'public'`固定）。スキーマ名を直書きせずこの定数経由で参照する。
  - `app/_lib/db/supabase-admin.ts` — service-roleクライアント。サーバー専用。クライアントコンポーネントに絶対にimportしないこと。
  - `app/_lib/db/kikikan/` — **kikikanのDB**を参照する別系統（`supabase-kikikan.ts`＝クライアント、`types.ts`＝手書きの型、`m-kizai.ts`＝クエリ関数）。上記3つはいずれもkizaihyou自身のDBを指すので混同しないこと。
  - `app/_lib/db/tables/*.ts`（テーブル/ビューごとのクエリ関数）はkikikanの命名規約（`m-*`=マスタ、`t-*`=トランザクション、`v-*`=ビュー、関数名は`select*`/`insert*`/`update*`/`delete*`/`check*`）とtry/catchでの2層エラーハンドリング（DB層は`throw new Error('[関数名] DBエラー:', { cause: e })`、呼び出し元の`funcs.ts`層でSupabaseの`error`をチェック）に従う。
  - DBのカラムはsnake_case、アプリコードはcamelCase。変換の自動レイヤーは無く、クエリごとに手動マッピングする。
- **API RouteではなくServer Actions**: ビジネスロジックのファイルは`'use server'`を付与し、クライアントコンポーネントから直接Server Actionsとして呼び出す方針（kikikanに合わせる）。

### Excel出力

機材表画面の「Excel出力」は、罫線・色・列幅・印刷設定・数式・**マクロ**を作り直さずに済むよう、**空の雛形`resources/kizaihyou-template.xlsm`に値だけを差し込む**方式（実装は`app/_lib/equipment-table/excel.ts`）。`.xlsm`はZIPなので`fflate`で展開し、`xl/worksheets/sheet1.xml`のセルだけ書き換えて詰め直す。`vbaProject.bin`を含む他のパーツはバイト単位でそのまま残るため、マクロが生き残る（exceljs等の一般的なライブラリは`.xlsm`を書けないので使っていない）。

- **雛形の作り直し**: `node scripts/build-excel-template.mjs <実運用の機材表.xlsm>`。実ファイルから値だけを消して雛形を作る。レイアウトを変えたいときはExcel上で雛形を直接編集するか、新しい機材表を元にこのスクリプトを流し直す。
- **雛形のセル配置**: `C1`=公演名 / `C2`=顧客名 / `E2`=場所 / `G3`=出庫日 / `G4`=返却日 / `C4`=機材表全体の備考（ラベルは`B4`）。5行目`I`〜`AJ`=ポジション見出し。7行目以降が機材1行で`B`=種類 / `C`=名称 / `D`=行ごとの備考 / `H`=SPARE / `I`〜`AJ`=数量。`F`(TOTAL)・`G`(ACTIVE)は雛形側の数式が計算するので値は書かない。
- **上限**: ポジションは28列（`I`〜`AJ`）、機材は405行（7〜411行目）。雛形に書式が用意されている範囲を超えるため、超えたら明示的にエラーにしている。
- **実データの範囲に切り詰める**（`trimSheet`）: 雛形は空の行・列にも罫線が引いてあるので、そのまま出すと使っていない枠が大量に残る。実データの最終行・最終列より外の`<row>`・`<c>`を削り、結合セル・条件付き書式・改ページ・`dimension`・印刷範囲（`_xlnm.Print_Area`）も同じ範囲に合わせる。1行目右端にある作成日（`TODAY()`）は切り詰めで消えてしまうため、セルごと最終列へ移して書式を保つ。
- 日付はExcelのシリアル値（1899-12-30起点）で書く。書式は雛形のセル側に付いている。
- 文字列は`t="inlineStr"`で書き込み、`sharedStrings.xml`は触らない（件数の整合を取らずに済むため）。
- Server Actionsはバイナリを返せないのでbase64で受け渡し、クライアントでBlobに戻してダウンロードさせる。
- `resources/`はimportしていないのでNextのファイル追跡に乗らない。`next.config.ts`の`outputFileTracingIncludes`で明示的にビルド成果物へ含めている。

### テーブル構成

DDLは`scripts/db-migration/01-init-kizaihyou.sql`（適用済み）。命名・監査列（`del_flg`/`add_dat`/`add_user`/`upd_dat`/`upd_user`/`dsp_ord_num`）はkikikanの規約に合わせている。

| テーブル             | 役割                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `m_user`             | kizaihyou専用Authのユーザープロファイル（`auth.users`にFK）。`email`がkikikan側担当者との名寄せキー                                                                |
| `m_kizaihyou_sts`    | 状態ステータスマスタ（作成中/申請中/差戻し/承認済＋MUIのChip color）                                                                                               |
| `t_kizaihyou`        | 機材表ヘッダ。`kizaihyou_cod`（`KZ-0001`形式）はシーケンスで自動採番。`mem`＝機材表全体の備考（Excelの`C4`）                                                       |
| `t_kizaihyou_column` | 機材表の列（会場のポジション）。並び替え中に値が重複しうるため`dsp_ord_num`にunique制約は張らない                                                                  |
| `t_kizaihyou_row`    | 機材表の行（機材1点）。`kizai_id`＝kikikanの`m_kizai.kizai_id`（FK無し、手入力名はnull）、`kizai_nam`は表示用スナップショット。`mem`＝行ごとの備考（Excelの`D`列） |
| `t_kizaihyou_qty`    | 行×列の数量セル。空セルはレコードを作らない（疎行列）。`TOTAL = ACTIVE合計 + spare_qty`                                                                            |
| `t_kizaihyou_his`    | 操作履歴。`mem`に承認・差戻しコメント、`user_nam`は操作時点の氏名スナップショット                                                                                  |

- 公演名・場所・顧客名・出庫入庫日はkikikanの受注（`t_juchu_head`）とは切り離し、kizaihyou側で自前保持している。受注との紐付けは未実装。
- RLSは全テーブルで有効。現状は認証済みユーザーに一律許可（権限の細分化は未導入）。kikikanから参照させる場合は別途ポリシーが必要。
- **機材表の保存は「列・行を全削除して入れ直す」方式**（数量セルは列のcascadeで消える）。画面がシート全体を一括編集するための割り切りで、保存のたびに`column_id`・`row_id`は採番し直される。画面側の未保存の行・列には`row-new-1`のような一時idを振り、保存時は配列のindexで数量セルを対応付けている。

## コーディング規約

- **日時はDBにUTCで入れ、表示時にJSTへ変換する**。日時カラムは`timestamptz`とし、DBのタイムゾーンはUTC（`now()`は`+00`で返る）。画面に出すときは必ず`app/_lib/format.ts`の`formatDateTime`（`timeZone: 'Asia/Tokyo'`を明示）を通すこと。`toLocaleString`等を素で使うと実行環境のタイムゾーン（Vercel上はUTC）に引きずられるので使わない。出庫日・入庫日のような日付だけの値は`date`型＋`formatDate`で、タイムゾーン変換はしない。
- import順序は`eslint-plugin-simple-import-sort`により強制される（`import/order`ではない）。`yarn fix`で自動修正可能。
- Prettier設定: シングルクォート、セミコロンあり、printWidth 120、ES5準拠のtrailing comma。

## デプロイ・ブランチ運用

未確定。現状は`master`ブランチのみで、Vercelプロジェクトとの連携もまだ。決まり次第このセクションを更新する（kikikanは`main`=本番／`v0.0.0`=ステージングで、`vercel-ignored-build-step.sh`によりこの2ブランチ以外のビルドをキャンセルする方式）。
