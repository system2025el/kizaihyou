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

このリポジトリは、姉妹プロジェクト **kikikan**（`C:\EL`、GitHub: 別リポジトリ、Vercel: 別プロジェクト）と**同一のSupabaseプロジェクト・同一の`public`スキーマ**を直接共有している。GitHubリポジトリもVercelプロジェクトも別だが、DBとAuthは1つ。

- **project_ref**: `jimqcvyaoddsxbcrsnfs`（ステージング/preview用。本番用project_refは別途あり、`.env.local`内にコメントアウトで記載）
- **テーブル共有**: `m_bumon`等、kikikan側で定義済みのテーブルをこのリポジトリからも直接select/insert/update/deleteする。このリポジトリ独自のテーブルを追加する場合も同じ`public`スキーマに追加する。
- **スキーマ変更の運用ルール**: 2つのリポジトリが同じテーブル定義に依存しているため、
  - テーブル定義（カラム追加・型変更等）を変更したら、**もう一方のリポジトリの`app/_lib/db/types/types.ts`も再生成すること**を忘れない。
  - どちらのリポジトリでマイグレーションを管理するか（migrationファイルの置き場所）は未確定。SQLでスキーマを変更する際は、必ずkikikan側（`y.yoneyama`）と事前にすり合わせる。
- **Auth**: Supabase Authのユーザーテーブルも共有。ただしセッション（Cookie/localStorage）はドメインごとに独立するため、同じユーザーでもkikikanとkizaihyouでそれぞれログインが必要（SSOは組んでいない）。
- **型生成**: `app/_lib/db/types/types.ts`はSupabase CLI（ローカル実行、`npx supabase gen types typescript --db-url "$DATABASE_URL" --schema public`）で生成する想定だが、このコマンドはDocker Desktop（またはPodman）が無いと失敗する（`LegacyContainerRuntimeNotFoundError`）。この環境にはDockerが無いため、代わりに`.mcp.json`のSupabase MCP（`generate_typescript_types`ツール）経由で生成している。生成後は`yarn fix:prettier`でプロジェクトのフォーマットに合わせること。スキーマ変更時は同じ手順で再生成する。

## アーキテクチャ（現状）

まだ雛形段階で、`app/page.tsx`・`app/layout.tsx`のみの最小構成。今後機能を追加する際は、kikikan(`C:\EL\CLAUDE.md`)の設計を踏襲する想定：

- **ルーティング**: `app/`配下のNext.js App Router。認証必須ページと認証不要ページ（login/signup等）を分ける場合はkikikanの`app/(main)/`＋`AuthGuard`の構成を参考にする。
- **コロケーション**: 機能ごとに`_lib/`（型・Server Actions・ビジネスロジック）と`_ui/`（コンポーネント）のサブフォルダを持たせる。アプリ全体で共有するコードは`app/_lib/`・`app/_ui/`。
- **データアクセス — 同一DBに対する2種類のクライアント**（kikikanと同一方針。実装済みなのは接続部分のみ）:
  - `app/_lib/db/postgres.ts` — 生の`pg` `Pool`（HMRを跨いで生き残るよう`globalForPool`でシングルトン化）。手書きSQL、トランザクション、複雑・大量データのクエリに使用。
  - `app/_lib/db/supabase.ts` — Supabase JSクライアント（PostgREST）。シンプルなCRUDと`supabase.auth`に使用。`SCHEMA`定数（`'public'`固定）をエクスポートしており、直書きせずこの定数経由で参照する。
  - `app/_lib/db/supabase-admin.ts` — service-roleクライアント。サーバー専用。クライアントコンポーネントに絶対にimportしないこと。
  - 今後`app/_lib/db/tables/*.ts`（テーブル/ビューごとのクエリ関数）を追加する際は、kikikanの命名規約（`m-*`=マスタ、`t-*`=トランザクション、`v-*`=ビュー、関数名は`select*`/`insert*`/`update*`/`delete*`/`check*`）とtry/catchでの2層エラーハンドリング（DB層は`throw new Error('[関数名] DBエラー:', { cause: e })`、呼び出し元の`funcs.ts`層でSupabaseの`error`をチェック）を踏襲する。
  - DBのカラムはsnake_case、アプリコードはcamelCase。変換の自動レイヤーは無く、クエリごとに手動マッピングする。
- **API RouteではなくServer Actions**: ビジネスロジックのファイルは`'use server'`を付与し、クライアントコンポーネントから直接Server Actionsとして呼び出す方針（kikikanに合わせる）。

## コーディング規約

- import順序は`eslint-plugin-simple-import-sort`により強制される（`import/order`ではない）。`yarn fix`で自動修正可能。
- Prettier設定: シングルクォート、セミコロンあり、printWidth 120、ES5準拠のtrailing comma。

## デプロイ・ブランチ運用

未確定。現状は`master`ブランチのみで、Vercelプロジェクトとの連携もまだ。決まり次第このセクションを更新する（kikikanは`main`=本番／`v0.0.0`=ステージングで、`vercel-ignored-build-step.sh`によりこの2ブランチ以外のビルドをキャンセルする方式）。
