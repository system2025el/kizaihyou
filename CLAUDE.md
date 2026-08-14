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

- **経緯**: 当初はkikikanと同一Supabaseプロジェクト・同一`public`スキーマを直接共有する想定だったが、「Auth（ユーザー認証）をkizaihyou単独で管理したい」という理由から専用プロジェクトに切り替えた。旧共有プロジェクトの接続情報は`.env.local`にコメントアウトで残している（参考用、現在は未使用）。
- **project_ref**: `lqxuybzllbgprzuuynfp`（kizaihyou専用、開発用に1つのみ作成。本番/ステージングを分ける運用にする場合は別途プロジェクトを作成しこの節を更新する）
- **スキーマ**: kizaihyou専用の`public`スキーマ。現時点ではテーブル未作成（`app/_lib/db/types/types.ts`は空スキーマの型）。kikikanのテーブル定義とは無関係なので、スキーマ変更時にkikikan側とすり合わせる必要はない。
- **Auth**: kikikanとは完全に別。同じ人間でもkikikanとkizaihyouでユーザーレコード（UUID）は別になる。将来、受注部担当者などのデータをkikikan側の担当者マスタと突き合わせる場合は、UUIDではなくメールアドレス等の別キーで名寄せする設計が必要。
- **将来のクロスプロジェクトアクセス**: kikikan（本番・ステージングともVercel上）からこのプロジェクトのDBを直接参照・更新する構想がある。技術的には(a) kikikan側にこのプロジェクト用の`DATABASE_URL`・Supabase-jsクライアントをもう1組追加、(b) このプロジェクト側でkikikanから参照される想定のテーブルに適切なRLSポリシーを設定、で実現可能。ただし2つの別Postgresインスタンスにまたがる単一トランザクションは組めない点に注意（アプリ側で部分失敗のハンドリングを設計する）。
- **IPv4アドオン**: このプロジェクトは新しい方式で作成されているため、Postgresへの直接接続（`app/_lib/db/postgres.ts`のpg Pool、ポート6543）はデフォルトでIPv6のみ。IPv4のみのネットワーク（このリポジトリの開発環境を含む）から接続するには、SupabaseダッシュボードでIPv4アドオン（有料、月$4程度）を有効化する必要がある（本プロジェクトでは有効化済み）。Supabase-js経由のアクセス（PostgREST、ポート443のHTTPS）はこの制約を受けず、アドオン無しでも常に接続可能。
- **型生成**: `app/_lib/db/types/types.ts`はSupabase CLI（ローカル実行、`npx supabase gen types typescript --db-url "$DATABASE_URL" --schema public`）で生成する想定だが、このコマンドはDocker Desktop（またはPodman）が無いと失敗する（`LegacyContainerRuntimeNotFoundError`）。この環境にはDockerが無いため、代わりに`.mcp.json`のSupabase MCP（`generate_typescript_types`ツール、project_refは上記kizaihyou専用のもの）経由で生成している。生成後は`yarn fix:prettier`でプロジェクトのフォーマットに合わせること。スキーマ変更時は同じ手順で再生成する。

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
