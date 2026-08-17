'use server';

import { requireCurrentUser } from '../auth/funcs';
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
import { insertKizaihyouHis } from '../db/tables/t-kizaihyou-his';
import { EquipmentTableHead, EquipmentTableStatus } from '../equipment-table-list/types';
import { INITIAL_COLUMN_COUNT, INITIAL_ROW_COUNT } from './constants';
import { EquipmentColumn, EquipmentRow, KizaiOption } from './types';

export type EquipmentTableDetail = {
  id: number;
  cod: string;
  status: EquipmentTableStatus;
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
    head: {
      eventName: head.koen_nam,
      place: head.basho_nam ?? '',
      clientName: head.kokyaku_nam ?? '',
      shippedAt: head.shukko_dat ?? '',
      returnedAt: head.nyuko_dat ?? '',
    },
    columns: (columns ?? []).map((column) => ({ id: String(column.column_id), label: column.column_nam })),
    rows: (rows ?? []).map((row) => ({
      id: String(row.row_id),
      kind: row.kizai_kind,
      kizaiId: row.kizai_id,
      name: row.kizai_nam,
      remark: row.mem ?? '',
      spare: row.spare_qty ? String(row.spare_qty) : '',
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
});

/** 新規作成した機材表に入れる初期の空の列・空行 */
const initialContent = (): KizaihyouContentInput => ({
  columns: Array.from({ length: INITIAL_COLUMN_COUNT }, () => ({ columnNam: '' })),
  rows: Array.from({ length: INITIAL_ROW_COUNT }, () => ({
    kizaiKind: '',
    kizaiId: null,
    kizaiNam: '',
    mem: '',
    spareQty: 0,
    qty: [],
  })),
});

/**
 * 機材表を新規作成する関数（ステータスは「作成中」）。
 * 初期の列と空行まで入れるので、作成後は`/equipment-table/[id]`をそのまま開ける。
 *
 * @param head ヘッダの入力値
 * @returns 作成した機材表のkizaihyou_id
 */
export const createEquipmentTable = async (head: EquipmentTableHead): Promise<number> => {
  const user = await requireCurrentUser();

  const { data, error } = await insertKizaihyou(toHeadInput(head), user.userNam, user.userId, null);
  if (error) throw new Error(`[createEquipmentTable] 機材表の作成に失敗しました: ${error.message}`);

  await saveKizaihyouContent(data.kizaihyou_id, toHeadInput(head), initialContent(), user.userNam);

  const { error: hisError } = await insertKizaihyouHis(data.kizaihyou_id, '新規作成', user.userId, user.userNam, null);
  if (hisError) throw new Error(`[createEquipmentTable] 操作履歴の登録に失敗しました: ${hisError.message}`);

  return data.kizaihyou_id;
};

/**
 * 機材表のヘッダと内容を保存する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param head ヘッダの入力値
 * @param columns 画面の列（表示順）
 * @param rows 画面の行（表示順）
 */
export const saveEquipmentTable = async (
  kizaihyouId: number,
  head: EquipmentTableHead,
  columns: EquipmentColumn[],
  rows: EquipmentRow[]
) => {
  const user = await requireCurrentUser();

  const content: KizaihyouContentInput = {
    columns: columns.map((column) => ({ columnNam: column.label })),
    rows: rows.map((row) => ({
      kizaiKind: row.kind,
      kizaiId: row.kizaiId,
      kizaiNam: row.name,
      mem: row.remark,
      spareQty: Number(row.spare) || 0,
      qty: columns.map((column) => {
        const value = Number(row.qty[column.id]);
        return row.qty[column.id] && !Number.isNaN(value) ? value : null;
      }),
    })),
  };

  await saveKizaihyouContent(kizaihyouId, toHeadInput(head), content, user.userNam);
};

/**
 * 「名称」欄の候補をkikikanの機材マスタから取得する関数
 * @returns 機材ID・機材名のリスト
 */
export const fetchKizaiOptions = async (): Promise<KizaiOption[]> => {
  const { data, error } = await selectKikikanKizaiList();
  if (error) throw new Error(`[fetchKizaiOptions] kikikanの機材マスタ取得に失敗しました: ${error.message}`);
  return (data ?? []).map((kizai) => ({ kizaiId: kizai.kizai_id, kizaiNam: kizai.kizai_nam }));
};
