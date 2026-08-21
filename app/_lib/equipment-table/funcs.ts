'use server';

import { requireCurrentUser } from '../auth/funcs';
import { selectKikikanBumonList } from '../db/kikikan/m-bumon';
import { selectKikikanKizaiList } from '../db/kikikan/m-kizai';
import {
  insertKizaihyou,
  KizaihyouContentInput,
  saveKizaihyouContent,
  selectKizaihyouColumns,
  selectKizaihyouHead,
  selectKizaihyouQty,
  selectKizaihyouRows,
} from '../db/tables/t-kizaihyou';
import {
  insertKizaihyouHis,
  selectKizaihyouHis,
  selectKizaihyouHisList,
  selectLatestKizaihyouSnapshot,
  selectPreviousKizaihyouRequest,
} from '../db/tables/t-kizaihyou-his';
import {
  EquipmentTableHead,
  EquipmentTableHistoryEntry,
  EquipmentTableStatus,
  KIZAIHYOU_ACT,
} from '../equipment-table-list/types';
import { formatDateTime } from '../format';
import { buildEquipmentTableDiff, EquipmentTableDiff, hasDiff } from './diff';
import { buildKizaihyouExcel, buildKizaihyouExcelFileName } from './excel';
import { buildKizaihyouPdf, buildKizaihyouPdfFileName } from './pdf';
import { BumonOption, EquipmentColumn, EquipmentRow, EquipmentTableSnapshot, KizaiOption } from './types';

export type EquipmentTableDetail = {
  id: number;
  cod: string;
  status: EquipmentTableStatus;
  /** 前回の申請先（受注部担当者）。再申請のときの初期選択に使う。未申請なら空配列 */
  tantoUserIds: string[];
  /** 現在の申請にあたる操作履歴。未申請ならnull */
  shinseiHisId: number | null;
  /** kikikanに作った受注番号。未連携ならnull */
  juchuHeadId: number | null;
  /** kikikanの受注機材ヘッダー。機材明細まで作られていればnull以外 */
  juchuKizaiHeadId: number | null;
  head: EquipmentTableHead;
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

/**
 * 機材表を1件、内容（列・行・数量）ごと取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 機材表の内容（見つからなければnull）
 */
export const fetchEquipmentTable = async (kizaihyouId: number): Promise<EquipmentTableDetail | null> => {
  const { data: head, error } = await selectKizaihyouHead(kizaihyouId);
  if (error) throw new Error(`[fetchEquipmentTable] 機材表の取得に失敗しました: ${error.message}`);
  if (!head) return null;

  const { data: columns, error: columnError } = await selectKizaihyouColumns(kizaihyouId);
  if (columnError) throw new Error(`[fetchEquipmentTable] 列の取得に失敗しました: ${columnError.message}`);

  const { data: rows, error: rowError } = await selectKizaihyouRows(kizaihyouId);
  if (rowError) throw new Error(`[fetchEquipmentTable] 行の取得に失敗しました: ${rowError.message}`);

  const rowIds = (rows ?? []).map((row) => row.row_id);
  const { data: qty, error: qtyError } = rowIds.length
    ? await selectKizaihyouQty(rowIds)
    : { data: [], error: null as null };
  if (qtyError) throw new Error(`[fetchEquipmentTable] 数量の取得に失敗しました: ${qtyError.message}`);

  const qtyByRow = new Map<number, Record<string, string>>();
  for (const cell of qty ?? []) {
    const cells = qtyByRow.get(cell.row_id) ?? {};
    cells[String(cell.column_id)] = String(cell.qty);
    qtyByRow.set(cell.row_id, cells);
  }

  return {
    id: head.kizaihyou_id,
    cod: head.kizaihyou_cod,
    status: (head.m_kizaihyou_sts?.sts_nam ?? '作成中') as EquipmentTableStatus,
    tantoUserIds: [...(head.t_kizaihyou_tanto ?? [])]
      .sort((a, b) => a.dsp_ord_num - b.dsp_ord_num)
      .map((tanto) => tanto.user_id),
    shinseiHisId: head.shinsei_his_id,
    juchuHeadId: head.juchu_head_id,
    juchuKizaiHeadId: head.juchu_kizai_head_id,
    head: {
      eventName: head.koen_nam,
      place: head.basho_nam ?? '',
      clientName: head.kokyaku_nam ?? '',
      shippedAt: head.shukko_dat ?? '',
      returnedAt: head.nyuko_dat ?? '',
      memo: head.mem ?? '',
    },
    columns: (columns ?? []).map((column) => ({ id: String(column.column_id), label: column.column_nam })),
    rows: (rows ?? []).map((row) => ({
      id: String(row.row_id),
      kind: row.kizai_kind,
      kizaiId: row.kizai_id,
      name: row.kizai_nam,
      remark: row.mem ?? '',
      spare: row.spare_qty ? String(row.spare_qty) : '',
      indent: row.indent_num,
      qty: qtyByRow.get(row.row_id) ?? {},
    })),
  };
};

/** ヘッダの入力値をDB層の形に変換する（未入力の日付はnullにする） */
const toHeadInput = (head: EquipmentTableHead) => ({
  koenNam: head.eventName,
  bashoNam: head.place,
  kokyakuNam: head.clientName,
  shukkoDat: head.shippedAt || null,
  nyukoDat: head.returnedAt || null,
  mem: head.memo || null,
});

/** 画面の列・行をDB層の形に変換する（数量は列の表示順に並べる） */
const toContentInput = (columns: EquipmentColumn[], rows: EquipmentRow[]): KizaihyouContentInput => ({
  columns: columns.map((column) => ({ columnNam: column.label })),
  rows: rows.map((row) => ({
    kizaiKind: row.kind,
    kizaiId: row.kizaiId,
    kizaiNam: row.name,
    mem: row.remark,
    spareQty: Number(row.spare) || 0,
    indentNum: row.indent,
    qty: columns.map((column) => {
      const value = Number(row.qty[column.id]);
      return row.qty[column.id] && !Number.isNaN(value) ? value : null;
    }),
  })),
});

/**
 * 機材表を新規作成する関数（ステータスは「作成中」）。
 *
 * **新規作成ボタンを押した時点では呼ばない**。機材表画面で最初に保存（または申請）
 * したときに初めて呼び、そこでレコードを作る。書きかけの機材表が一覧に並ばないようにするため。
 *
 * 「新規作成」の操作履歴には作成時点のスナップショットを載せるので、
 * タイムラインは最初の履歴から内容を辿れる。
 *
 * @param head ヘッダの入力値
 * @param columns 画面の列（表示順）
 * @param rows 画面の行（表示順）
 * @returns 作成した機材表のkizaihyou_id
 */
export const createEquipmentTable = async (
  head: EquipmentTableHead,
  columns: EquipmentColumn[],
  rows: EquipmentRow[]
): Promise<number> => {
  const user = await requireCurrentUser();

  const { data, error } = await insertKizaihyou(toHeadInput(head), user.userNam, user.userId, null);
  if (error) throw new Error(`[createEquipmentTable] 機材表の作成に失敗しました: ${error.message}`);

  await saveKizaihyouContent(data.kizaihyou_id, toHeadInput(head), toContentInput(columns, rows), user.userNam);

  const { error: hisError } = await insertKizaihyouHis(
    data.kizaihyou_id,
    KIZAIHYOU_ACT.新規作成,
    '新規作成',
    user.userId,
    user.userNam,
    null,
    { head, columns, rows }
  );
  if (hisError) throw new Error(`[createEquipmentTable] 操作履歴の登録に失敗しました: ${hisError.message}`);

  return data.kizaihyou_id;
};

/**
 * スナップショット同士を比べるための正規化。
 * 列・行のidは保存のたびに採番し直されるので比較には含めず、
 * 数量は列の表示順に並べ直す（画面側のtoSnapshotと同じ考え方）。
 *
 * DBから読んだ側はjsonbがキー順を並べ替えているため、オブジェクトを
 * そのままJSON.stringifyすると同じ内容でも文字列が一致しない。
 * 比較する値はすべて配列に並べ直してから文字列化すること。
 */
/**
 * DBに入っているスナップショットを画面の型に直す関数。
 *
 * jsonbは保存した当時の形のまま残るので、あとから足した項目は古いものに入っていない。
 * 読むたびに既定値で埋めて、比較や表示が`undefined`に振り回されないようにする。
 */
const fromStoredSnapshot = (snapshot: unknown): EquipmentTableSnapshot => {
  const stored = snapshot as EquipmentTableSnapshot;
  return { ...stored, rows: stored.rows.map((row) => ({ ...row, indent: row.indent ?? 0 })) };
};

const normalizeSnapshot = (snapshot: EquipmentTableSnapshot) =>
  JSON.stringify([
    [
      snapshot.head.eventName,
      snapshot.head.place,
      snapshot.head.clientName,
      snapshot.head.shippedAt,
      snapshot.head.returnedAt,
      snapshot.head.memo,
    ],
    snapshot.columns.map((column) => column.label),
    snapshot.rows.map((row) => [
      row.kind,
      row.kizaiId,
      row.name,
      row.remark,
      row.spare,
      row.indent,
      snapshot.columns.map((column) => row.qty[column.id] ?? ''),
    ]),
  ]);

/**
 * 機材表のヘッダと内容を保存する関数。
 *
 * 保存のたびにその時点の内容を操作履歴にスナップショットとして残すが、
 * 直前のスナップショットと中身が同じなら履歴は作らない（何も変えずに
 * 保存を押しただけの履歴でタイムラインが埋まるのを防ぐ）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param head ヘッダの入力値
 * @param columns 画面の列（表示順）
 * @param rows 画面の行（表示順）
 * @param recordHistory 「保存」の履歴を残すか。申請の直前の保存は
 *                      「申請」の履歴にスナップショットを残すのでfalseにする
 */
export const saveEquipmentTable = async (
  kizaihyouId: number,
  head: EquipmentTableHead,
  columns: EquipmentColumn[],
  rows: EquipmentRow[],
  recordHistory = true
) => {
  const user = await requireCurrentUser();

  await saveKizaihyouContent(kizaihyouId, toHeadInput(head), toContentInput(columns, rows), user.userNam);
  if (!recordHistory) return;

  const snapshot: EquipmentTableSnapshot = { head, columns, rows };
  const { data: latest, error } = await selectLatestKizaihyouSnapshot(kizaihyouId);
  if (error) throw new Error(`[saveEquipmentTable] 直近のスナップショット取得に失敗しました: ${error.message}`);

  const latestSnapshot = latest?.snapshot ? fromStoredSnapshot(latest.snapshot) : null;
  if (latestSnapshot && normalizeSnapshot(latestSnapshot) === normalizeSnapshot(snapshot)) return;

  const { error: hisError } = await insertKizaihyouHis(
    kizaihyouId,
    KIZAIHYOU_ACT.保存,
    '保存',
    user.userId,
    user.userNam,
    null,
    snapshot
  );
  if (hisError) throw new Error(`[saveEquipmentTable] 操作履歴の登録に失敗しました: ${hisError.message}`);
};

/**
 * 画面の内容をExcel（.xlsm）にして返す関数。
 * Server Actionsはバイナリをそのまま返せないのでbase64で受け渡す。
 *
 * @param kizaihyouCod 機材表ID（ファイル名に使う）
 * @param head ヘッダの入力値
 * @param columns 画面の列（表示順）
 * @param rows 画面の行（表示順）
 * @returns ファイル名とbase64のExcel
 */
export const exportEquipmentTableExcel = async (
  kizaihyouCod: string,
  head: EquipmentTableHead,
  columns: EquipmentColumn[],
  rows: EquipmentRow[]
): Promise<{ fileName: string; base64: string }> => {
  await requireCurrentUser();

  const bytes = await buildKizaihyouExcel({ head, columns, rows });
  return {
    fileName: buildKizaihyouExcelFileName(kizaihyouCod, head.eventName),
    base64: Buffer.from(bytes).toString('base64'),
  };
};

/**
 * 画面の内容をPDFにして返す関数。Excel出力と同じくbase64で受け渡す。
 *
 * @param kizaihyouCod 機材表ID（ファイル名・PDFの見出しに使う）
 * @param head ヘッダの入力値
 * @param columns 画面の列（表示順）
 * @param rows 画面の行（表示順）
 * @returns ファイル名とbase64のPDF
 */
export const exportEquipmentTablePdf = async (
  kizaihyouCod: string,
  head: EquipmentTableHead,
  columns: EquipmentColumn[],
  rows: EquipmentRow[]
): Promise<{ fileName: string; base64: string }> => {
  await requireCurrentUser();

  const bytes = await buildKizaihyouPdf({ kizaihyouCod, head, columns, rows });
  return {
    fileName: buildKizaihyouPdfFileName(kizaihyouCod, head.eventName),
    base64: Buffer.from(bytes).toString('base64'),
  };
};

/**
 * 機材表のタイムライン（操作履歴とコメント）を取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 操作日時の古い順に並んだ履歴
 */
export const fetchEquipmentTableHistory = async (kizaihyouId: number): Promise<EquipmentTableHistoryEntry[]> => {
  const { data, error } = await selectKizaihyouHisList([kizaihyouId]);
  if (error) throw new Error(`[fetchEquipmentTableHistory] 操作履歴の取得に失敗しました: ${error.message}`);

  return (data ?? []).map((his) => ({
    hisId: his.his_id,
    at: formatDateTime(his.act_dat),
    user: his.user_nam,
    action: his.act_nam,
    comment: his.mem ?? '',
    hasSnapshot: his.snapshot_flg === 1,
  }));
};

/**
 * 機材表にコメントを登録する関数。操作履歴と同じテーブルに
 * act_nam='コメント'で積むので、機材表履歴一覧の履歴にもそのまま出る。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param comment 登録するコメント
 * @returns 登録後のタイムライン
 */
export const addEquipmentTableComment = async (
  kizaihyouId: number,
  comment: string
): Promise<EquipmentTableHistoryEntry[]> => {
  const user = await requireCurrentUser();

  const { error } = await insertKizaihyouHis(
    kizaihyouId,
    KIZAIHYOU_ACT.コメント,
    'コメント',
    user.userId,
    user.userNam,
    comment
  );
  if (error) throw new Error(`[addEquipmentTableComment] コメントの登録に失敗しました: ${error.message}`);

  return fetchEquipmentTableHistory(kizaihyouId);
};

/** スナップショット閲覧ページが表示する内容 */
export type EquipmentTableSnapshotDetail = {
  hisId: number;
  kizaihyouId: number;
  /** 画面表示用の機材表ID（KZ-0001形式） */
  cod: string;
  /** スナップショットを残した操作の日時・操作者・内容 */
  at: string;
  user: string;
  action: string;
  comment: string;
  snapshot: EquipmentTableSnapshot;
};

/**
 * 操作履歴に残したスナップショットを取得する関数
 * @param hisId 対象のhis_id
 * @returns スナップショットの内容（履歴が無い・スナップショットを持たない場合はnull）
 */
export const fetchEquipmentTableSnapshot = async (hisId: number): Promise<EquipmentTableSnapshotDetail | null> => {
  const { data, error } = await selectKizaihyouHis(hisId);
  if (error) throw new Error(`[fetchEquipmentTableSnapshot] 履歴の取得に失敗しました: ${error.message}`);
  if (!data?.snapshot) return null;

  const { data: head, error: headError } = await selectKizaihyouHead(data.kizaihyou_id);
  if (headError) throw new Error(`[fetchEquipmentTableSnapshot] 機材表の取得に失敗しました: ${headError.message}`);

  return {
    hisId: data.his_id,
    kizaihyouId: data.kizaihyou_id,
    cod: head?.kizaihyou_cod ?? '',
    at: formatDateTime(data.act_dat),
    user: data.user_nam,
    action: data.act_nam,
    comment: data.mem ?? '',
    snapshot: fromStoredSnapshot(data.snapshot),
  };
};

/** 機材表承認画面が表示する内容 */
export type EquipmentTableApproval = {
  id: number;
  cod: string;
  status: EquipmentTableStatus;
  /** 表示する内容。申請時点のスナップショットがあればそれ、無ければ現在の内容 */
  head: EquipmentTableHead;
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
  /** 申請時点のスナップショットを表示しているか */
  fromSnapshot: boolean;
  /** 表示しているスナップショットの操作履歴。閲覧ページのURLに使う（無ければnull） */
  hisId: number | null;
  /** 申請日時（スナップショットが無ければ空文字） */
  requestedAt: string;
  requesterName: string;
  requestComment: string;
  /** 申請後に機材表が編集されているか（承認者に注意を出すため） */
  editedAfterRequest: boolean;
  /** ログイン中のユーザーが申請先の受注部担当者か（承認・差戻しができるか） */
  canApprove: boolean;
  /** kikikanに作った受注番号。未連携ならnull */
  juchuHeadId: number | null;
  /** kikikanの受注機材ヘッダー。在庫の足し戻しに使う。未連携ならnull */
  juchuKizaiHeadId: number | null;
  /** kikikanへの連携が最後まで済んでいるか（機材明細まで作られたか） */
  juchuLinked: boolean;
  /**
   * ひとつ前の申請からの差分。再申請のときだけ入る。
   * 初回の申請や、差分が無い場合はnull。
   */
  diff: EquipmentTableDiff | null;
};

/**
 * 機材表承認画面に出す内容を取得する関数。
 *
 * 申請後も申請者は機材表を編集できるので、**現在の内容ではなく申請時点の
 * スナップショットを表示する**。これを入れる前に申請されたものはスナップショットが
 * 無いので、現在の内容にフォールバックする（fromSnapshot=false）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns 承認画面が表示する内容（機材表が無ければnull）
 */
export const fetchEquipmentTableForApproval = async (kizaihyouId: number): Promise<EquipmentTableApproval | null> => {
  const user = await requireCurrentUser();

  const detail = await fetchEquipmentTable(kizaihyouId);
  if (!detail) return null;

  // 承認・差戻しは申請先に指定された受注部担当者だけができる（サーバー側でも弾く）
  const base = {
    id: detail.id,
    cod: detail.cod,
    status: detail.status,
    canApprove: detail.tantoUserIds.includes(user.userId),
    juchuHeadId: detail.juchuHeadId,
    juchuKizaiHeadId: detail.juchuKizaiHeadId,
    juchuLinked: detail.juchuKizaiHeadId !== null,
  };
  const request = detail.shinseiHisId === null ? null : await fetchEquipmentTableSnapshot(detail.shinseiHisId);
  if (!request) {
    return {
      ...base,
      head: detail.head,
      columns: detail.columns,
      rows: detail.rows,
      fromSnapshot: false,
      hisId: null,
      diff: null,
      requestedAt: '',
      requesterName: '',
      requestComment: '',
      editedAfterRequest: false,
    };
  }

  // ひとつ前の申請と比べて差分を出す（＝再申請のときだけ出る）
  const { data: previous, error: previousError } = await selectPreviousKizaihyouRequest(
    kizaihyouId,
    KIZAIHYOU_ACT.申請,
    request.hisId
  );
  if (previousError)
    throw new Error(`[fetchEquipmentTableForApproval] 前回の申請の取得に失敗しました: ${previousError.message}`);

  const diff = previous?.snapshot
    ? buildEquipmentTableDiff(fromStoredSnapshot(previous.snapshot), request.snapshot, formatDateTime(previous.act_dat))
    : null;

  const current: EquipmentTableSnapshot = { head: detail.head, columns: detail.columns, rows: detail.rows };
  return {
    ...base,
    diff: diff && hasDiff(diff) ? diff : null,
    head: request.snapshot.head,
    columns: request.snapshot.columns,
    rows: request.snapshot.rows,
    fromSnapshot: true,
    hisId: detail.shinseiHisId,
    requestedAt: request.at,
    requesterName: request.user,
    requestComment: request.comment,
    editedAfterRequest: normalizeSnapshot(current) !== normalizeSnapshot(request.snapshot),
  };
};

/**
 * スナップショットの内容を流用して機材表を新規作成する関数。
 * 流用するのは現在の機材表ではなく、その履歴時点の内容。
 *
 * コピー作成（copyKizaihyou）と揃えて、ステータスは「作成中」、
 * 出庫日・入庫日と受注部担当者は引き継がない。
 *
 * @param hisId 流用元のhis_id
 * @returns 作成した機材表のkizaihyou_id
 */
export const createEquipmentTableFromSnapshot = async (hisId: number): Promise<number> => {
  const user = await requireCurrentUser();

  const source = await fetchEquipmentTableSnapshot(hisId);
  if (!source) throw new Error('[createEquipmentTableFromSnapshot] 流用元のスナップショットが見つかりません');

  const { head, columns, rows } = source.snapshot;
  const headInput = { ...toHeadInput(head), shukkoDat: null, nyukoDat: null };

  const { data, error } = await insertKizaihyou(headInput, user.userNam, user.userId, source.kizaihyouId);
  if (error) throw new Error(`[createEquipmentTableFromSnapshot] 機材表の作成に失敗しました: ${error.message}`);

  await saveKizaihyouContent(data.kizaihyou_id, headInput, toContentInput(columns, rows), user.userNam);

  const { error: hisError } = await insertKizaihyouHis(
    data.kizaihyou_id,
    KIZAIHYOU_ACT.新規作成,
    `${source.cod}の${source.at}時点から流用して新規作成`,
    user.userId,
    user.userNam,
    null
  );
  if (hisError) throw new Error(`[createEquipmentTableFromSnapshot] 操作履歴の登録に失敗しました: ${hisError.message}`);

  return data.kizaihyou_id;
};

/**
 * 「名称」欄の候補をkikikanの機材マスタから取得する関数
 * @returns 機材ID・機材名のリスト
 */
export const fetchKizaiOptions = async (): Promise<KizaiOption[]> => {
  const { data, error } = await selectKikikanKizaiList();
  if (error) throw new Error(`[fetchKizaiOptions] kikikanの機材マスタ取得に失敗しました: ${error.message}`);
  return (data ?? []).map((kizai) => ({
    kizaiId: kizai.kizai_id,
    kizaiNam: kizai.kizai_nam,
    bumonId: kizai.bumon_id,
  }));
};

/**
 * 「種類」欄の候補をkikikanの部門マスタから取得する関数。
 *
 * 「名称」（機材マスタ）と違い、`t_kizaihyou_row.kizai_kind`はテキストしか持たない
 * （部門IDは保持しない）ので、あくまで入力補助であって選択の強制ではない。
 * bumonIdも返すのは、選んだ種類で「名称」の候補を絞るため。
 *
 * @returns 部門ID・部門名のリスト（表示順）
 */
export const fetchKizaiKindOptions = async (): Promise<BumonOption[]> => {
  const { data, error } = await selectKikikanBumonList();
  if (error) throw new Error(`[fetchKizaiKindOptions] kikikanの部門マスタ取得に失敗しました: ${error.message}`);
  return (data ?? []).map((bumon) => ({ bumonId: bumon.bumon_id, bumonNam: bumon.bumon_nam }));
};
