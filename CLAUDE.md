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
- **kikikanの在庫参照**: 機材表承認画面（`/equipment-table-request/[id]`）の日別在庫は、kikikanの`v_zaiko_qty`（`zaiko_qty = 保有数 - 引き当て数`）と`v_kizai_qty`（保有数）を**参照するだけ**で求める。kikikanの受注機材明細画面と同じビューなので在庫の計算ロジックを二重に持たない。実装は`app/_lib/db/kikikan/v-zaiko-qty.ts`。
  - `v_zaiko_qty`は**引き当てのある日しか行が無い**。行が無い日は保有数をそのまま在庫数として扱う（kikikan側の`COALESCE(v.zaiko_qty, k.kizai_qty)`と同じ）。
  - 別Postgresインスタンスなので日付×機材のCROSS JOINをSQLで組めない。組み合わせはTypeScript側（`fetchEquipmentStockMap`）で作る。
  - 件数が「機材数×日数」になりPostgRESTの1回の上限（1000件）を超えうるので、機材IDを分割したうえで`range`でページングする。
  - **機材表はkikikanの受注ではないので、kikikanの在庫にはこの機材表の要求数が含まれていない**。出庫日〜入庫日の差し引きは画面側で行う（kikikanの受注機材明細画面が「自受注の保存済み引当を足し戻してから画面の値を引く」のとは非対称になる点に注意）。
  - 機材表の行が手入力の名称（`kizai_id`がnull）だと在庫を引けないので、在庫欄は`-`で表示する。
  - **機材表画面の「在庫」列（TOTALの左、課題A-8）は、日別ではなく出庫日〜入庫日で一番少ない日の在庫だけを取る**（`fetchEquipmentTableStock`→`app/_lib/db/kikikan/v-zaiko-qty-min.ts`）。PostgRESTでは集計できないので`kikikanPool`の直接接続でkikikan側に集計させる（114機材・16日で約0.3秒。日別に全部取ると約1秒、2か月で約2.5秒）。`v_zaiko_qty`は先に期間で絞ること（日付ごとに結合すると絞り込みが効かず約2.5秒かかった）。連携済みなら自分の引き当てを日ごとに足し戻す。
  - 取りに行くのは画面を開いたとき・出庫日／入庫日や機材が変わったとき（800ms待ってから）・「在庫を再確認」だけで、数量の入力では取りに行かない（比較は画面の中）。**出庫日・入庫日のどちらかが空、または入庫日が出庫日より前なら取りに行かず**、在庫列は「－」と理由を出す。この機材表の合計（同じ機材の行は足す）が在庫を超えたら在庫とTOTALを赤くし、上部に件数を出す。
- **kikikanのマスタ参照**: 機材表の「名称」はkikikanの機材マスタ`m_kizai`を、「種類」は部門マスタ`m_bumon`を参照する（種類は入力補助だけで、`t_kizaihyou_row.kizai_kind`はテキストしか持たず部門IDは保持しない）。接続は`app/_lib/db/kikikan/`配下（`KIKIKAN_*`環境変数）。**kikikanのservice_roleキーは`permission denied for schema public`になり使えない**（kikikan側でschema publicへのGRANTが無い）ため、anonキーで参照している。anonキーとはいえ他プロジェクトの認証情報なので`NEXT_PUBLIC_`を付けず、Server Actionsからのみ使うこと。別Postgresインスタンスなので外部キー制約は張れず、`t_kizaihyou_row.kizai_id`に値のみ保持し整合性はアプリ側で担保する。
- **Auth**: kikikanとは完全に別。同じ人間でもkikikanとkizaihyouでユーザーレコード（UUID）は別になる。将来、受注部担当者などのデータをkikikan側の担当者マスタと突き合わせる場合は、UUIDではなくメールアドレス等の別キーで名寄せする設計が必要。
- **kikikanへの受注連携（承認時に書き込む）**: 受注部が承認すると、kikikanに受注ヘッダー（伝票）と受注機材ヘッダー・入出庫・使用日カレンダー・機材明細・作業伝票・移動伝票を作る（`app/_lib/db/kikikan/t-juchu-head.ts`・`t-juchu-kizai.ts`、kikikanのコピー作成`juchuMeisaiCopy`と同じ構成）。複数テーブルを1トランザクションで入れるため、書き込みはPostgresへの直接接続（`KIKIKAN_DATABASE_URL`）を使う。別インスタンスで単一トランザクションを組めないので、**承認を先に確定させ、連携が失敗しても承認は取り消さない**（成否は操作履歴に残し、承認画面の再連携ボタンでやり直す）。設計の経緯は`docs/kikikan-juchu-renkei.md`、再申請の内容を機材明細へ反映する件（第1段＝参照専用の下見のみ実装済み）は`docs/saishinsei-hanei.md`。
  - **kikikanのリポジトリにはkizaihyouから書き込まれていることが書かれていない**。kikikan側の変更（テーブル定義・採番・移動や本番日の仕組み）で連携が壊れうるので、kikikanを更新したら`C:\EL\scripts\README.md`のDB変更記録と照らし合わせること。
  - 既知の差：kikikanは新しい受注機材ヘッダーを作るとき本番日テンプレート（`t_juchu_kizai_honbanbi`の`juchu_kizai_head_id = 0`の行）を展開して本番日数を計算するが、こちらは展開せず本番日数0で入れている（既存の受注に明細を足すときに差が出る。受注部が伝票画面で保存し直すと展開される）。
- **将来のクロスプロジェクトアクセス**: kikikan（本番・ステージングともVercel上）からこのプロジェクトのDBを直接参照・更新する構想がある。技術的には(a) kikikan側にこのプロジェクト用の`DATABASE_URL`・Supabase-jsクライアントをもう1組追加、(b) このプロジェクト側でkikikanから参照される想定のテーブルに適切なRLSポリシーを設定、で実現可能。ただし2つの別Postgresインスタンスにまたがる単一トランザクションは組めない点に注意（アプリ側で部分失敗のハンドリングを設計する）。
- **IPv4アドオン**: このプロジェクトは新しい方式で作成されているため、Postgresへの直接接続（`app/_lib/db/postgres.ts`のpg Pool、ポート6543）はデフォルトでIPv6のみ。IPv4のみのネットワーク（このリポジトリの開発環境を含む）から接続するには、SupabaseダッシュボードでIPv4アドオン（有料、月$4程度）を有効化する必要がある（本プロジェクトでは有効化済み）。Supabase-js経由のアクセス（PostgREST、ポート443のHTTPS）はこの制約を受けず、アドオン無しでも常に接続可能。
- **マイグレーション**: DDLは`.mcp.json`のSupabase MCP（`apply_migration`）で適用し、同じSQLを`scripts/db-migration/*.sql`にも残す（kikikanの`scripts/db-migration/`と同じ運用）。適用後は`get_advisors`でRLS漏れ等を確認する。
- **型生成**: `app/_lib/db/types/types.ts`はSupabase CLI（ローカル実行、`npx supabase gen types typescript --db-url "$DATABASE_URL" --schema public`）で生成する想定だが、このコマンドはDocker Desktop（またはPodman）が無いと失敗する（`LegacyContainerRuntimeNotFoundError`）。この環境にはDockerが無いため、代わりに`.mcp.json`のSupabase MCP（`generate_typescript_types`ツール、project_refは上記kizaihyou専用のもの）経由で生成している。生成後は`yarn fix:prettier`でプロジェクトのフォーマットに合わせること。スキーマ変更時は同じ手順で再生成する。

## アーキテクチャ（現状）

画面（`/login`・`/equipment-table/[id]`・`/equipment-table-list`・`/equipment-table-request`）はDBに接続済みで、モックデータは残っていない。設計はkikikan(`C:\EL\CLAUDE.md`)を踏襲する：

- **ルーティング**: `app/`配下のNext.js App Router。`app/(main)/`＝ハンバーガーメニュー付きの画面、`app/equipment-table/[id]`と`/login`はその外側（全幅）。
- **認証**: `middleware.ts`が全ページでセッションを検証し、未ログインなら`/login`へ飛ばす（公開パスは`/login`・`/error`のみ）。**セッションはlocalStorageではなくCookieに保存する**（`@supabase/ssr`）。そうしないとServer Actions側がログイン状態を認識できず、RLSに弾かれる。ログイン直後に`ensureCurrentUser()`が`m_user`のプロファイルを作る（サインアップ画面は未実装なので、氏名の初期値はメールアドレスのローカル部）。
- **権限**: kikikanと同じ整数ビットマスク方式で、`m_user.permission`のビットを`app/_lib/auth/permission.ts`の`hasPermission`でAND判定する（現状は`juchu_tanto: 1`＝受注部担当者と`system: 65535`のみ）。PostgRESTはビット演算ができないため、絞り込みはDB層ではなくfuncs層で行う（`selectUserList`→`fetchJuchuTantoOptions`）。**ユーザーの追加はSupabase AuthのAdmin APIでauthアカウントを作ってから`m_user`にプロファイルを入れる**（`m_user.user_id`が`auth.users`へのFKなのでSQLだけでは追加できない）。権限を編集する画面はまだ無いので、変更はDBを直接更新する。
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
- **API RouteではなくServer Actions**: ビジネスロジックのファイルは`'use server'`を付与し、クライアントコンポーネントから直接Server Actionsとして呼び出す方針（kikikanに合わせる）。例外は`app/api/equipment-table/[id]/lock/release`の1本だけで、タブを閉じる瞬間に編集ロックを外す`navigator.sendBeacon`がPOSTのURLしか叩けないため。

### Excel出力

機材表画面の「Excel出力」は、罫線・色・列幅・印刷設定・数式・**マクロ**を作り直さずに済むよう、**空の雛形`resources/kizaihyou-template.xlsm`に値だけを差し込む**方式（実装は`app/_lib/equipment-table/excel.ts`）。`.xlsm`はZIPなので`fflate`で展開し、`xl/worksheets/sheet1.xml`のセルだけ書き換えて詰め直す。`vbaProject.bin`を含む他のパーツはバイト単位でそのまま残るため、マクロが生き残る（exceljs等の一般的なライブラリは`.xlsm`を書けないので使っていない）。

- **雛形の作り直し**: `node scripts/build-excel-template.mjs <実運用の機材表.xlsm>`。実ファイルから値だけを消して雛形を作る。レイアウトを変えたいときはExcel上で雛形を直接編集するか、新しい機材表を元にこのスクリプトを流し直す。
- **雛形のセル配置**: `C1`=公演名 / `C2`=顧客名 / `E2`=場所 / `G3`=出庫日 / `G4`=返却日 / `C4`=機材表全体の備考（ラベルは`B4`）。5行目`I`〜`AJ`=ポジション見出し。7行目以降が機材1行で`B`=種類 / `C`=名称（インデント行は先頭に「 ┗ 」を付ける） / `D`=行ごとの備考 / `H`=SPARE / `I`〜`AJ`=数量。`F`(TOTAL)・`G`(ACTIVE)は雛形側の数式が計算するので値は書かない。
- **上限**: ポジションは28列（`I`〜`AJ`）、機材は405行（7〜411行目）。雛形に書式が用意されている範囲を超えるため、超えたら明示的にエラーにしている。
- **実データの範囲に切り詰める**（`trimSheet`）: 雛形は空の行・列にも罫線が引いてあるので、そのまま出すと使っていない枠が大量に残る。実データの最終行・最終列より外の`<row>`・`<c>`を削り、結合セル・条件付き書式・改ページ・`dimension`・印刷範囲（`_xlnm.Print_Area`）も同じ範囲に合わせる。1行目右端にある作成日（`TODAY()`）は切り詰めで消えてしまうため、セルごと最終列へ移して書式を保つ。
- 日付はExcelのシリアル値（1899-12-30起点）で書く。書式は雛形のセル側に付いている。
- 文字列は`t="inlineStr"`で書き込み、`sharedStrings.xml`は触らない（件数の整合を取らずに済むため）。
- Server Actionsはバイナリを返せないのでbase64で受け渡し、クライアントでBlobに戻してダウンロードさせる。
- `resources/`はimportしていないのでNextのファイル追跡に乗らない。`next.config.ts`の`outputFileTracingIncludes`で明示的にビルド成果物へ含めている（機材表画面とスナップショット閲覧ページの両方に指定が要る）。

### PDF出力

Excelと違って雛形が無いので、`pdf-lib`で表を組み立てる（実装は`app/_lib/equipment-table/pdf.ts`）。Excel出力と同じくServer Actionでバイト列を作り、base64で受け渡す。

- **日本語フォントの埋め込みが必須**。pdf-libの標準14フォントでは日本語が出ないため、`resources/fonts/ipaexg.ttf`（IPAexゴシック。kikikanの`public/fonts/`と同じもの）を`@pdf-lib/fontkit`で`subset: true`にして埋め込む。サブセット化しないと6MBのフォントがそのままPDFに入る。
- kikikanはPDFをクライアント側（`usePdf`フック）で作っているが、こちらはExcel出力に合わせてサーバー側にした。6MBのフォントをブラウザに送らずに済む。
- **用紙はポジション列の数で決まる**。A4横で1列あたり24pt未満になるならA3横に切り替える。行はページ送りし、公演情報は1ページ目だけ、ページ番号は全ページに出す。
- pdf-libは折り返しをしないので、セルに収まらない文字列は`fitText`で末尾を省略する。ただし名称の列幅は一番長い機材名に合わせて150〜260ptで決め、種類・名称はそれでも収まらなければ6ptまで文字を縮めてから省略する（機材名は末尾の長さ・本数が大事なため）。
- 空行（何も入力されていない行）は出力しない。

### テーブル構成

DDLは`scripts/db-migration/01-init-kizaihyou.sql`（適用済み）。命名・監査列（`del_flg`/`add_dat`/`add_user`/`upd_dat`/`upd_user`/`dsp_ord_num`）はkikikanの規約に合わせている。

| テーブル             | 役割                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `m_user`             | kizaihyou専用Authのユーザープロファイル（`auth.users`にFK）。`email`がkikikan側担当者との名寄せキー、`permission`が権限のビットマスク                                                                    |
| `m_kizaihyou_sts`    | 状態ステータスマスタ（作成中/申請中/差戻し/承認済/取下げ/完了＋MUIのChip color）                                                                                                                         |
| `t_kizaihyou`        | 機材表ヘッダ。`kizaihyou_cod`（`KZ-0001`形式）はシーケンスで自動採番。`mem`＝機材表全体の備考（Excelの`C4`）                                                                                             |
| `t_kizaihyou_column` | 機材表の列（会場のポジション）。並び替え中に値が重複しうるため`dsp_ord_num`にunique制約は張らない                                                                                                        |
| `t_kizaihyou_row`    | 機材表の行（機材1点）。`kizai_id`＝kikikanの`m_kizai.kizai_id`（FK無し、手入力名はnull）、`kizai_nam`は表示用スナップショット。`mem`＝行ごとの備考（Excelの`D`列）。`indent_num`＝機材名のインデント段数 |
| `t_kizaihyou_tanto`  | 機材表の申請先（受注部担当者）。複数指定でき、`user_nam`は申請時点の氏名スナップショット                                                                                                                 |
| `t_kizaihyou_qty`    | 行×列の数量セル。空セルはレコードを作らない（疎行列）。`TOTAL = ACTIVE合計 + spare_qty`                                                                                                                  |
| `t_kizaihyou_member` | 機材表のメンバーと権限（`role_cod`: 1=閲覧 / 2=編集 / 3=申請 / 9=持ち主）。持ち主は作成者で1機材表に1人、`t_kizaihyou`のINSERTトリガーで入る                                                             |
| `t_kizaihyou_lock`   | 編集ロック（1機材表に1行）。`expire_dat`を過ぎたものは切れていて他の人が取れる                                                                                                                           |
| `t_kizaihyou_his`    | 操作履歴兼タイムライン。`mem`にコメント、`snapshot`(jsonb)に保存・申請時点の機材表、`user_nam`は操作時点の氏名スナップショット                                                                           |

- 公演名・場所・顧客名・出庫入庫日はkikikanの受注（`t_juchu_head`）とは切り離し、kizaihyou側で自前保持している。承認時の連携で作った（または紐づけた）受注は`t_kizaihyou.juchu_head_id`・`juchu_kizai_head_id`で指す。
- **申請先の受注部担当者は複数指定できる**。実体は`t_kizaihyou_tanto`で、`t_kizaihyou.tanto_nam`は一覧表示用に「、」で連結した非正規化の文字列。**そのうち1人が承認すれば承認済になる運用で、全員の承認は要らない**（誰が承認したかは`t_kizaihyou_his`に残る）。申請先は再申請のたびに入れ直す。
- **受注部担当者と申請者＝依頼者（`shinsei_nam`・`shinsei_user_id`）は申請時に決まる**。依頼者は操作履歴の`act_nam`から判定することもできるが、文言を変えた瞬間に壊れるのでヘッダに持たせている（機材表申請依頼画面の「依頼者名」列がこれ）。同じ理由で、現在の申請にあたる操作履歴も`shinsei_his_id`でヘッダから直接指す。申請はこの3つとステータスをまとめて更新するので、履歴だけ入ってヘッダが指せていない状態を作らないよう`requestKizaihyou`でpg Poolのトランザクションにしている。機材表画面の「申請」でモーダルを出し、`juchu_tanto`権限を持つユーザーから選ばせる（`requestEquipmentTable`）。新規作成・コピー時には入れない（コピー元からも引き継がない）。画面から渡ったuser_idはサーバー側で権限を取り直して検証する。
- **申請時に、機材管理へ連携する項目の文字数を連携先のカラムに合わせて確かめる**（`validateLengthForKikikan`。公演名・場所100文字、備考・行の備考200文字）。kizaihyou側は`text`で上限が無く、超えると承認後の連携が`value too long`で失敗するため。保存は止めない。承認時の連携直前にも同じチェックを、kikikanに何か書く前に通す（それより前に申請されたものの承認で、伝票だけできて明細で失敗する状態を作らないため）。kikikanのカラム定義が変わったら`KIKIKAN_MAX_LENGTH`も直すこと。
- **`t_kizaihyou_his`は操作履歴とコメントを兼ねる**。右ペインのタイムライン（`app/_ui/equipment-timeline.tsx`。機材表画面と機材表承認画面で共有）がこのテーブルを古い順にそのまま表示し、自由コメントは`act_nam='コメント'`で積む（`addEquipmentTableComment`）。申請・承認・差戻しのコメントも同じ`mem`に入るので、機材表履歴一覧の履歴ダイアログにも一緒に並ぶ。申請先の担当者名は`mem`ではなく`act_nam`（`申請（受注部担当者：◯◯）`）に残す——`mem`は利用者が書いた文章のためのもの、という切り分け。
- **保存・申請時に、その時点のシート全体を`t_kizaihyou_his.snapshot`（jsonb）へ残す**。関連テーブルを複製せずJSON1本にしているのは、保存が元々「列・行を全削除して入れ直す」＝シート全体を一括で扱う作りで、スナップショットは閲覧専用だから。閲覧は`/equipment-table/[id]/snapshot/[hisId]`（編集画面とは別の閲覧専用ページ。タイムラインと機材表履歴一覧の履歴から**別タブで**開く——編集中の内容を失わないため）。
  - 一覧で`snapshot`本体を引かずにアイコンの有無を判定できるよう、生成列`snapshot_flg`（0/1）を持たせている。
  - **中身が直前のスナップショットと同じなら「保存」の履歴を作らない**（`normalizeSnapshot`で比較）。何も変えずに保存を押しただけの履歴でタイムラインが埋まるのを防ぐ。
  - **比較用の正規化では必ず値を配列に並べ直すこと**。行・列のidは保存のたびに採番し直されるうえ、DBから読んだ側はjsonbがキー順を並べ替えているため、オブジェクトのまま`JSON.stringify`すると同じ内容でも一致しない。
  - 申請の直前の保存は`saveEquipmentTable(..., recordHistory=false)`で履歴を作らず、「申請」の履歴にスナップショットをまとめる。
- **「新規作成」を押した時点ではDBにレコードを作らない**。書きかけの機材表が機材表履歴一覧に並ばないようにするため、`/equipment-table/new`（`detail`がnullの機材表画面）を開くだけにして、**最初の保存または申請で`createEquipmentTable`を呼んで作る**。作成後は`router.replace`で採番されたIDの画面に差し替える（戻るで未保存の画面に戻らないように）。
  - 「新規作成」の操作履歴には作成時点のスナップショットを載せるので、タイムラインは最初の履歴から内容を辿れる。
  - 未保存のうちは機材表IDが要る操作（タイムライン・流用して新規作成）を止める。Excel/PDF出力はファイル名の機材表IDが空になるだけなので使える。
- **ステータスごとに編集・申請の可否が変わる**（機材表画面の`READ_ONLY_STATUSES`／`REQUESTABLE_STATUSES`）。
  - **申請中は編集不可**。承認者が申請時点の内容を見ているため。編集したい場合は「取り下げ」（`withdrawEquipmentTable`、ステータス`取下げ`）で編集できる状態に戻す。差戻しと同じ扱いだが、受注部が戻したのか申請者が引っ込めたのかを一覧で区別できるよう別ステータスにしている。
  - **完了は編集も申請もできない**。終わった案件を締めるための状態で、手を入れたくなったら「作成中に戻す」（`reopenEquipmentTable`）で戻す。一覧から隠したい場合はステータスの絞り込みで外す（既定では表示する）。連携済みでも機材管理側の受注には何もしない。
  - **承認済は編集できるが再申請はできない**。承認後に手元で整理してExcel/PDFに出したり、少し手を加えて流用コピーしたりするため。あらためて申請したい場合は「流用して新規作成」で別の機材表にする。
  - 編集不可のときは入力欄を`readOnly`にし、行・列の追加／削除とドラッグ並び替えを消す（`useSortable({ disabled })`）。
- **機材表承認画面（`/equipment-table-request/[id]`）は現在の内容ではなく、申請時点のスナップショットを表示する**（`fetchEquipmentTableForApproval`）。申請後も申請者はメモとして機材表を編集できる仕様なので、現在の内容を見せると「承認した内容」と「申請された内容」が食い違うため。ヘッダ・行・在庫の期間もすべてスナップショット側の値を使う。
  - 現在の内容がスナップショットと違う場合は`editedAfterRequest`で承認者に注意を出す（比較は`normalizeSnapshot`）。
  - この仕組みより前に申請されたものはスナップショットが無いので現在の内容にフォールバックし、その旨を画面に出す（`fromSnapshot=false`）。
  - 承認後も編集できる以上、一覧・機材表画面に出るのは編集後の現在の内容になる。「承認された内容」は`shinsei_his_id`のスナップショット閲覧ページで見る導線を、機材表履歴一覧の「承認・申請内容」列と機材表画面の承認済メッセージに置いている（申請中なら「申請した内容」）。
- **「流用して新規作成」は流用元が2種類ある**。機材表画面のボタンは現在のDBの内容から（`copyKizaihyou`）、閲覧専用ページのボタンはそのスナップショットの内容から（`createEquipmentTableFromSnapshot`）作る。どちらもステータスは「作成中」に戻り、出庫日・入庫日と受注部担当者は引き継がない。機材表画面では未保存の変更が流用元に入らないため、`isDirty`なら「保存して流用／保存せずに流用」を確認する。
- **機材名のインデント（「 ┗ 」）は`t_kizaihyou_row.indent_num`で持つ**。直前の機材とセットで使うもの（付属ケーブル等）を表す、kikikanの機材明細と同じ仕組み。値は0か1だけ（kikikanの実データも0/1しか無い）。記号そのものはkikikanの`m_dic`（`dic_id = 1`）にあるが、参照せず`app/_lib/equipment-table/sheet.ts`の`INDENT_CHARA`に同じ文字を置いている（表示のたびに他プロジェクトのマスタを引きに行かないため）。表示・Excel・PDFは`getIndentedName`を通す。
  - **ドラッグで親（インデント無し）を動かすと、直下に続くインデント行（付属品）も一緒に動く**（`moveEquipmentRow`、課題A-9）。落とした先が別のセットの中なら、そのセットの前か後ろに置く（親と付属品の間に割り込ませない）。付属品だけを掴んだときはその行だけ動くので、別のセットへ付け替えられる。ドラッグ中は一緒に動く付属品を薄く表示する。
  - それ以外の整合はとらない。インデントは先頭行にも付けられるし、親のいない付属品も作れる。kikikan側にもチェックは無い（実データに、親のいない位置の`indent_num = 1`がある）ので、揃えて運用に委ねている。
  - 連携時は`t_juchu_kizai_meisai`と`t_nyushuko_den`の両方に同じ値を入れる（kikikanの既存データもそう揃っている）。
- **機材表画面の「機材追加」は、kikikanの機材明細画面の「機材追加」（`EqptSelectionDialog`）と同じ操作にしている**（`app/equipment-table/_ui/kizai-add-dialog.tsx`）。部門／キーワードで機材を複数選ぶ→機材表にある機材なら1件ずつ重複確認→セットオプション（kikikanの`m_kizai_set`）がある機材は付属品を選ばせる（「別セット選択」で同じ機材をもう1セット）→kikikanの表示順に並べて、入力のある最後の行の直後に差し込む（付属品はインデント1、種類は部門名、数量は空）。
  - 機材・部門の一覧は機材表画面が読み込み済みのもの（`fetchKizaiOptions`／`fetchKizaiKindOptions`）を使い、キーワード検索も画面内で絞る。kikikanへ取りに行くのはセットオプションだけで、確定時に選んだ機材の分をまとめて1回取る（`fetchKizaiSetOptions`）。付属品の名前は、kikikanに合わせて非表示・コンテナの機材も含む`v_kizai_lst`から引く。
- **機材表申請依頼画面は「未対応」「対応済み」の2タブ**。承認すると申請中でなくなって未対応から消えるため、そのままだと承認後の追跡（とくに機材管理への連携が済んだか）ができなくなる。別画面を作らずタブで足している。
  - 「未対応」＝申請中かつ自分が申請先。「対応済み」＝**受注部の誰かが承認・差戻しした機材表**（`fetchApprovalHandledList`）。申請先は複数指定でき1人の承認で成立する運用なので、他の担当者が承認した案件の連携失敗も拾えるよう自分の対応分に限定していない。
  - 対応済みの判定は`t_kizaihyou_tanto`ではなく**操作履歴**（`act_cod`が承認・差戻し）で行う。申請先は再申請のたびに入れ直されるため、担当者で辿ると過去の対応が消える。横断で引くので`t_kizaihyou_his (act_cod, his_id desc)`にインデックスを張ってある。
  - **承認済なのに未連携の機材表があると画面上部に赤い警告を出す**。連携できていない＝機材管理側で在庫が押さえられていないという実害があるのに、一覧の1列だと見落とすため。
  - この画面だけは他人が作った機材表を扱うので、`fetchApprovalHandledList`は`juchu_tanto`権限を確認する。権限が無い場合の失敗が未対応タブを巻き込まないよう、画面側は`Promise.allSettled`で別々に扱う。
- **機材表はメンバー制**（`t_kizaihyou_member`、DDLは`scripts/db-migration/15`）。作成者が持ち主になり、機材表ごとにメンバーを招待できる。権限は段階で、上の段階は下の段階でできることを全部できる（`app/_lib/equipment-table/member.ts`の`KIZAIHYOU_ROLE`）。
  - 閲覧：見る・Excel/PDF出力・コメント・流用して新規作成（流用した機材表は流用した人のもので、メンバーは引き継がない）
  - 編集：＋編集・保存 ／ 申請：＋申請・取り下げ
  - 持ち主：＋メンバーの招待・権限変更・外す、削除・復元・完了・作成中に戻す、編集ロックの強制解除
  - **メンバーでない人は機材表画面・スナップショット閲覧ページを開けない**。ただし**受注部担当者（`juchu_tanto`）は閲覧だけできる**——承認画面から申請時点の内容を開いたり、タイムラインにコメントしたりするため。
  - **権限の判定はServer Actionsの中で必ず行う**（`requireKizaihyouRole`、`app/_lib/equipment-table/access.ts`）。画面でボタンを消すだけではServer Actionsを直接呼ばれると素通りする。`access.ts`は判定そのものを外から呼ばれないよう`'use server'`を付けていない。RLSは認証済みユーザーに一律許可のまま。
  - `fetchEquipmentTable`・`fetchEquipmentTableSnapshot`は承認・連携の処理からも使う内部用で権限を見ない。画面からは`fetchEquipmentTablePage`・`fetchEquipmentTableSnapshotForView`を使う。
  - 招待できるのはkizaihyouにアカウントがある人だけ（サインアップ画面が無い）。招待しても通知は送らない。メンバーの変更とロックの強制解除は操作履歴に残す（`act_cod` 14・15）。
- **編集は1人ずつ（編集ロック、`t_kizaihyou_lock`）**。機材表は「編集」を押すまで閲覧モードで開き、押した人がロックを取る。
  - 取得は`INSERT ... ON CONFLICT DO UPDATE ... WHERE`の1文（`acquireKizaihyouLock`）。kikikanの`t_lock`は「空いているか確かめる」と「取る」が別々で、同時に押すと両方取れる隙間があるので真似しない。
  - 編集中の画面は、操作（キー入力・クリック）があったときだけ1分ごとに延長する（`useEditLock`）。**10分操作しなければ切れて**他の人が取れる。切れる1分前に警告を出す。「編集を終了」・画面内の移動・タブを閉じる（sendBeacon）で外す。
  - 閲覧している画面は30秒ごとに「誰が編集中か」と版を確かめ、誰かが保存していれば読み直す。
  - **保存・申請では版（`t_kizaihyou.content_ver`）も照合する（楽観ロック）**。ロックを放置して切れている間に他の人が保存した、という取りこぼしはロックだけでは防げないため。食い違えば保存せず「最新を読み込む」を出す。保存・申請の結果は例外ではなく`SaveResult`で返す（本番ビルドでは例外の文言が画面に届かないため）。
  - 申請は`requestKizaihyou`のトランザクションの中で版を確かめ、ロックも外す。完了・削除は他の人が編集中なら止める。
  - 新規作成した人は、作成と同時にロックを取った状態で採番後の画面が開く（そのまま編集を続けられる）。
- **機材表履歴一覧は、ログイン中のユーザーがメンバーの機材表しか出さない**（`fetchEquipmentTableList`）。判定はユーザーID（`t_kizaihyou_member.user_id`）で行い、氏名は使わない。**受注部担当者や`system`権限でも例外はない**。招待された機材表には「招待：編集」のように自分の権限を出す。
  - 機材表申請依頼画面は他人が作った機材表を承認する画面なので、メンバーでは絞らない（`fetchApprovalRequestList`は内部の`fetchList`を絞り込みなしで呼ぶ）。同じ関数を使い回すと承認者に何も出なくなるので注意。
- **削除はステータスではなく`t_kizaihyou.del_flg`で表す**（kikikanから引き継いだ監査列）。ステータスにも持たせると`sts_cod = 削除`かつ`del_flg = 0`のような組み合わせが作れてしまい、どちらが正か分からなくなるため。ステータスは触らないので、復元すると削除前の状態がそのまま戻る。
  - 一覧は元から`del_flg = 0`だけを引いているので、削除すると自動的に消える。戻す導線として機材表履歴一覧に「削除済も表示」トグルと復元ボタンを置いている（`selectKizaihyouList(includeDeleted)`）。
  - 申請中は削除も完了もできない（承認者が見ている最中のため）。**機材管理へ連携済みの機材表を削除しても、向こうの受注・機材明細は消さない**（別システムなので受注部の判断に委ねる）。削除の確認ダイアログにその旨を出す。
- RLSは全テーブルで有効。現状は認証済みユーザーに一律許可で、機材表ごとの権限（メンバー制）はアプリ側（Server Actions）で判定している。kikikanから参照させる場合は別途ポリシーが必要。
- **機材表の保存は「列・行を全削除して入れ直す」方式**（数量セルは列のcascadeで消える）。画面がシート全体を一括編集するための割り切りで、保存のたびに`column_id`・`row_id`は採番し直される。画面側の未保存の行・列には`row-new-1`のような一時idを振り、保存時は配列のindexで数量セルを対応付けている。
- **機材表画面の「元に戻す／やり直す」（Ctrl+Z / Ctrl+Y）は画面の中だけの履歴**（`app/equipment-table/_ui/use-undo-history.ts`）。内容を書き換える操作の直前に`undoHistory.record`を呼び、ヘッダ・列・行の一式を積む（イミュータブルなので参照を積むだけ）。同じ欄への続けての入力は1回分にまとめる（キーで判定）。**内容を書き換える処理を足したら`record`を呼ぶこと**（呼ばないとその操作は戻せず、戻すと一緒に消える）。自分の保存では履歴を残し、他の人の保存・「最新を読み込む」で中身が変わったときは捨てる。

## コーディング規約

- **日時はDBにUTCで入れ、表示時にJSTへ変換する**。日時カラムは`timestamptz`とし、DBのタイムゾーンはUTC（`now()`は`+00`で返る）。画面に出すときは必ず`app/_lib/format.ts`の`formatDateTime`（`timeZone: 'Asia/Tokyo'`を明示）を通すこと。`toLocaleString`等を素で使うと実行環境のタイムゾーン（Vercel上はUTC）に引きずられるので使わない。出庫日・入庫日のような日付だけの値は`date`型＋`formatDate`で、タイムゾーン変換はしない。
- import順序は`eslint-plugin-simple-import-sort`により強制される（`import/order`ではない）。`yarn fix`で自動修正可能。
- Prettier設定: シングルクォート、セミコロンあり、printWidth 120、ES5準拠のtrailing comma。

## デプロイ・ブランチ運用

kikikanと同じ方式に揃える。

- `main` → 本番環境、`v0.0.0` → ステージング環境。Vercelが実際にビルドするのはこの2つのみ：`vercel-ignored-build-step.sh` が `VERCEL_GIT_COMMIT_REF` を見て、`main` または `v#.#.#` 形式に一致しない場合はビルドをキャンセルする（スクリプトはkikikanからそのまま流用）。
- 通常の作業は `v0.0.0` またはそこから切ったfeatureブランチで行い、ステージングで検証してから `main` に反映する。明示的な確認なしに `main` への直接pushやforce pushは行わない。
- GitHub: `system2025el/kizaihyou`（デフォルトブランチ `main`）。
- **Supabaseプロジェクトは現状1つだけで、本番・ステージング・ローカルがすべて同じDBを見ている**。運用開始前に開発用のSupabaseプロジェクトを別途作成し、そちらへ開発環境を向ける方針（現行プロジェクトを本番にする）。切り替え時の注意は下記「Supabaseプロジェクトの分割」を参照。

### Supabaseプロジェクトの分割（運用開始前にやること）

現行プロジェクト（`lqxuybzllbgprzuuynfp`）をそのまま本番とし、**開発用のSupabaseプロジェクトを新しく作ってローカル・ステージングをそちらへ向ける**。移行時に踏みやすい点：

- **本番になるDBに、開発中のテストデータとテスト用Authアカウントが残っている**。`test@example.com`（テスト太郎）や仮アドレスのユーザー、テスト用の機材表を消してから本番として使い始めること。
- **新しい開発プロジェクトにはスキーマを作り直す必要がある**。`scripts/db-migration/01〜15`を順に流せば再現できる（マスタのINSERTも含む）。ただし`m_user`は`auth.users`へのFKがあるためSQLだけでは入らず、Admin APIでauthアカウントを作ってからプロファイルを入れる。
- **`KIKIKAN_*`の向き先も見直すこと**。現状はローカルもVercelのプレビューもkikikanの**ステージング**（`jimqcvyaoddsxbcrsnfs`）を向いており、承認時の連携もステージングに書き込む。Vercelには`KIKIKAN_SUPABASE_URL`・`KIKIKAN_SUPABASE_ANON_KEY`に加えて`KIKIKAN_DATABASE_URL`も要る（無いと承認時の連携だけが`ECONNREFUSED 127.0.0.1:5432`で失敗する）。本番（`main`）に入れるときは、kikikanの本番とステージングのどちらへ書くかを決めてから設定すること。
- **IPv4アドオン**は新しいプロジェクトでも有効化が要る（pg Poolでの直接接続を使う場合）。
- `.mcp.json`のSupabase MCPは`project_ref`を直書きしているので、作業対象のプロジェクトに合わせて切り替える。
- **このタイミングで公開範囲も閉じる**（開発中は検証しやすさを優先して開けてある）：GitHubリポジトリ`system2025el/kizaihyou`をPrivateにする、VercelのDeployment Protection（Vercel Authentication）を有効に戻す。開発中にオフにしているのは関係者にURLを渡して触ってもらうためで、アプリ自体はmiddlewareでログイン必須（サインアップ画面も無い）ため、オフでもデータは見えない。
