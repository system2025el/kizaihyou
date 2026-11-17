'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragStartEvent,
  Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import EditOffIcon from '@mui/icons-material/EditOff';
import ForumIcon from '@mui/icons-material/Forum';
import GridOnIcon from '@mui/icons-material/GridOn';
import GroupIcon from '@mui/icons-material/Group';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import UndoIcon from '@mui/icons-material/Undo';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  createFilterOptions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_COLUMN_COUNT, INITIAL_ROW_COUNT } from '@/app/_lib/equipment-table/constants';
import { downloadBase64File, PDF_MIME_TYPE, XLSM_MIME_TYPE } from '@/app/_lib/equipment-table/download';
import {
  createEquipmentTable,
  EquipmentTableDetail,
  exportEquipmentTableExcel,
  exportEquipmentTablePdf,
  saveEquipmentTable,
} from '@/app/_lib/equipment-table/funcs';
import { fetchEditStatus, forceStopEditing } from '@/app/_lib/equipment-table/lock-funcs';
import {
  EDIT_STATUS_POLL_MS,
  EditLockInfo,
  EditStatus,
  hasRole,
  KIZAIHYOU_ROLE,
  KizaihyouAccess,
  ROLE_LABELS,
  SaveResult,
} from '@/app/_lib/equipment-table/member';
import {
  getActiveSum,
  getFollowingChildRowIds,
  getTotal,
  hasEquipmentRowContent,
  moveEquipmentRow,
  toQtyInput,
} from '@/app/_lib/equipment-table/sheet';
import { BumonOption, EquipmentColumn, EquipmentRow, KizaiOption } from '@/app/_lib/equipment-table/types';
import { validateForRequest } from '@/app/_lib/equipment-table/validation';
import {
  completeEquipmentTable,
  copyEquipmentTable,
  deleteEquipmentTable,
  reopenEquipmentTable,
  requestEquipmentTable,
  withdrawEquipmentTable,
} from '@/app/_lib/equipment-table-list/funcs';
import {
  EquipmentTableHead,
  EquipmentTableHistoryEntry,
  EquipmentTableStatus,
  JuchuTantoOption,
} from '@/app/_lib/equipment-table-list/types';
import { useAutoRefresh } from '@/app/_lib/hooks/use-auto-refresh';
import { EquipmentTimeline } from '@/app/_ui/equipment-timeline';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';
import { ToolbarIconButton } from '@/app/_ui/toolbar-icon-button';

import KizaiAddDialog, { AddedKizai } from './kizai-add-dialog';
import MembersDialog from './members-dialog';
import { LockLostReason, useEditLock } from './use-edit-lock';
import { useUndoHistory } from './use-undo-history';

/** 未保存の行・列に付ける一時id。保存するとDBの採番したidに置き換わる */
let tempIdCounter = 0;
const createTempId = (prefix: string) => {
  tempIdCounter += 1;
  return `${prefix}-new-${tempIdCounter}`;
};

/**
 * 名称欄の左に置く、インデントの切り替え。
 *
 * 記号そのもの（`┗`）をボタンの中身にして、設定するとどう表示されるかが
 * その場で分かるようにしている。アイコンだと、選んでいない行でも
 * 何か設定されているように見えてしまうため。
 */
const INDENT_MARK = '┗';
/** 切り替えの幅。設定の有無で名称欄がずれないよう、常に同じ幅を空けておく */
const INDENT_SLOT_WIDTH = 24;

const createRow = (): EquipmentRow => ({
  id: createTempId('row'),
  kind: '',
  kizaiId: null,
  name: '',
  remark: '',
  spare: '',
  indent: 0,
  qty: {},
});

const createColumn = (label: string): EquipmentColumn => ({ id: createTempId('col'), label });

/** 元に戻す／やり直すで差し替える、画面の内容一式 */
type SheetState = { head: EquipmentTableHead; columns: EquipmentColumn[]; rows: EquipmentRow[] };

/**
 * 行の書き換えのうち、続けて入力するもの（文字・数量）。同じ欄への続けての入力は「元に戻す」1回分にまとめる。
 * それ以外（インデントの切り替え・備考の保存など）は1回ずつ戻せるようにする。
 */
const TYPING_ROW_FIELDS = new Set<keyof EquipmentRow>(['kind', 'name', 'kizaiId', 'spare']);
const toRowUndoKey = (rowId: string, patch: Partial<EquipmentRow>) => {
  const fields = Object.keys(patch) as (keyof EquipmentRow)[];
  if (!fields.every((field) => TYPING_ROW_FIELDS.has(field))) return null;
  // 名称は入力（name・kizaiId=null）と候補の選択（name・kizaiId）で同じ欄として扱う
  return `row:${rowId}:${fields.includes('name') ? 'name' : fields.sort().join(',')}`;
};

/** まだ保存していない機材表の初期値 */
const EMPTY_HEAD: EquipmentTableHead = {
  eventName: '',
  place: '',
  clientName: '',
  shippedAt: '',
  returnedAt: '',
  memo: '',
};
const createInitialColumns = () => Array.from({ length: INITIAL_COLUMN_COUNT }, () => createColumn(''));
const createInitialRows = () => Array.from({ length: INITIAL_ROW_COUNT }, () => createRow());

/**
 * ドラッグ用のid。
 *
 * 行・列のidは保存するとDBの採番（`123`のような数値文字列）に置き換わり、
 * 行と列で値が衝突しうる。dnd-kitは1つのDndContext内でidが一意である必要があり、
 * 掴んだのが行か列かの判定もこのidで行うため、種類を接頭辞で明示する。
 */
const toRowDragId = (rowId: string) => `row:${rowId}`;
const toColumnDragId = (columnId: string) => `col:${columnId}`;
const isRowDragId = (dragId: string) => dragId.startsWith('row:');
const fromDragId = (dragId: string) => dragId.slice(dragId.indexOf(':') + 1);

// 行は縦方向、列は横方向のみに移動を制限する
const restrictAxisByDraggedType: Modifier = (args) => {
  const isRow = typeof args.active?.id === 'string' && isRowDragId(args.active.id);
  return isRow ? restrictToVerticalAxis(args) : restrictToHorizontalAxis(args);
};

// 候補が1000件を超えるため、表示件数を絞って描画コストを抑える
const filterKizaiOptions = createFilterOptions<KizaiOption>({
  limit: 50,
  stringify: (option) => option.kizaiNam,
});

/**
 * 申請できるステータス。申請中だけは二重申請になるので不可。
 * 承認済からの再申請は、承認後に内容が変わった場合に承認を取り直すために許す
 * （機材表承認画面には前回の申請からの差分が出る）。
 */
const REQUESTABLE_STATUSES: EquipmentTableStatus[] = ['作成中', '差戻し', '取下げ', '承認済'];

/**
 * 編集できないステータス。
 * 申請中は承認者が見ている内容なので触らせない。
 * 完了は締めた案件が黙って書き換わらないよう、作成中に戻してから編集させる。
 */
const READ_ONLY_STATUSES: EquipmentTableStatus[] = ['申請中', '完了'];

/** 完了にできるステータス（申請中は承認者が見ている最中なので不可） */
const COMPLETABLE_STATUSES: EquipmentTableStatus[] = ['作成中', '差戻し', '承認済', '取下げ'];

/**
 * 未保存の変更があるかを判定するためのスナップショット。
 * 行・列のidは保存のたびに採番し直されるため、比較対象には含めない。
 */
const toSnapshot = (head: EquipmentTableHead, columns: EquipmentColumn[], rows: EquipmentRow[]) =>
  JSON.stringify({
    head,
    columns: columns.map((column) => column.label),
    rows: rows.map((row) => ({
      kind: row.kind,
      kizaiId: row.kizaiId,
      name: row.name,
      remark: row.remark,
      spare: row.spare,
      indent: row.indent,
      // 列の並び替えに追随できるよう、列idではなく表示順で数量を並べる
      qty: columns.map((column) => row.qty[column.id] ?? ''),
    })),
  });

/**
 * SPAREから左の列。横スクロールしても左に固定する（ポジションの列が多いと、
 * どの機材の行を見ているのか分からなくなるため）。
 * position: stickyでずらす量（left）を決めるには各列の幅が確定している必要があるので、
 * 幅はminWidthではなく固定値にする。
 */
// SPAREは入力欄（56px）とセルの左右の余白が収まる幅にする。余白の既定（16pxずつ）のままだと
// 入力欄が列の外へはみ出し、固定列の境目の線をまたいでしまう
// 名称は長い機材名（ケーブルの長さなど末尾に付く情報）が切れないよう広めに取る（課題A-1）。
// それでも収まらない名前は、マウスを載せると全体が見える
const FIXED_COLUMN_WIDTHS = [165, 140, 320, 60, 70, 70, 80] as const;
const LAST_FIXED_COLUMN = FIXED_COLUMN_WIDTHS.length - 1;

/**
 * 見出しの右端をドラッグして幅を変えられる固定列（課題A-1）。キーはFIXED_COLUMN_WIDTHSの位置。
 * 見やすい幅は人や画面の大きさで違うので、幅はブラウザごとに覚える（機材表ごとには持たない。
 * 別の機材表を開くたびに合わせ直すことになるため）。Excel・PDFの出力には影響しない。
 */
const RESIZABLE_COLUMNS: Record<number, { min: number; max: number }> = {
  1: { min: 80, max: 400 }, // 種類
  2: { min: 160, max: 800 }, // 名称
};
const COLUMN_WIDTH_STORAGE_KEY = 'kizaihyou.equipmentTable.columnWidths';

const clampWidth = (index: number, width: number) =>
  Math.round(Math.min(RESIZABLE_COLUMNS[index].max, Math.max(RESIZABLE_COLUMNS[index].min, width)));

/** ブラウザに覚えた幅を読む。読めない（プライベートモード等）・壊れているときは既定の幅 */
const loadFixedColumnWidths = (): number[] => {
  const widths: number[] = [...FIXED_COLUMN_WIDTHS];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      Object.keys(RESIZABLE_COLUMNS).forEach((key) => {
        const value = (saved as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isFinite(value)) widths[Number(key)] = clampWidth(Number(key), value);
      });
    }
  } catch {
    // 覚えた幅が使えなくても、既定の幅で表示できれば困らない
  }
  return widths;
};

const saveFixedColumnWidths = (widths: number[]) => {
  try {
    const saved = Object.fromEntries(Object.keys(RESIZABLE_COLUMNS).map((key) => [key, widths[Number(key)]]));
    window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 保存できなくても、この画面を開いている間は変えた幅のまま使える
  }
};

/**
 * 固定列の幅と左端の位置をCSS変数にする。表（<table>）に付け、各セルはこの変数を参照する。
 * 幅を変えると右側の固定列の位置（left）もずれるので、まとめて計算し直す。
 *
 * セルごとにpropsで幅を渡さないのは、ドラッグ中に数百行を描き直すと重くなるため。
 * ドラッグ中は表の要素の変数だけを直接書き換え、離したときにstateへ反映する。
 */
const toFixedColumnVars = (widths: number[]) => {
  const vars: Record<string, string> = {};
  let left = 0;
  widths.forEach((width, index) => {
    vars[`--fixed-w-${index}`] = `${width}px`;
    vars[`--fixed-left-${index}`] = `${left}px`;
    left += width;
  });
  return vars;
};

/**
 * 固定列のセルに付けるsx。幅と位置は表に付けたCSS変数（toFixedColumnVars）から取る。
 * 背景色を付けないと、後ろをスクロールしていくポジションの列が透けて見える。
 * z-indexは、本体の固定列(1) < 見出しの行(stickyHeaderの2・ドラッグ中の列見出し3) < 見出しの固定列(4)。
 * 見出しの固定列は縦横どちらにスクロールしても一番上に来る必要がある。
 */
const fixedCellSx = (index: number, header = false) => ({
  position: 'sticky',
  left: `var(--fixed-left-${index})`,
  width: `var(--fixed-w-${index})`,
  minWidth: `var(--fixed-w-${index})`,
  maxWidth: `var(--fixed-w-${index})`,
  zIndex: header ? 4 : 1,
  bgcolor: 'background.paper',
  // 固定列とスクロールする列の境目が分かるよう、最後の固定列の右に線を引く
  ...(index === LAST_FIXED_COLUMN && { borderRight: 1, borderRightColor: 'divider' }),
});

type ColumnResizeHandleProps = {
  /** ドラッグを始めた時点の幅 */
  width: number;
  /** ドラッグ中に呼ぶ（画面の見た目だけを変える） */
  onResize: (width: number) => void;
  /** 離したときに呼ぶ（stateとブラウザに反映する） */
  onResizeEnd: (width: number) => void;
  onReset: () => void;
  clamp: (width: number) => number;
};

/**
 * 固定列の見出しの右端に置く、幅を変えるつまみ。ダブルクリックで既定の幅に戻す。
 * Pointer Captureでつまみ自身にポインタを捕まえておくので、見出しの外へドラッグしても追従する。
 */
const ColumnResizeHandle = ({ width, onResize, onResizeEnd, onReset, clamp }: ColumnResizeHandleProps) => {
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    let current = width;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // 捕まえられなくても、つまみの上で動かしている間は幅を変えられる
    }

    const handleMove = (moveEvent: PointerEvent) => {
      current = clamp(width + moveEvent.clientX - startX);
      onResize(current);
    };
    const handleUp = () => {
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleUp);
      handle.removeEventListener('pointercancel', handleUp);
      onResizeEnd(current);
    };
    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleUp);
    handle.addEventListener('pointercancel', handleUp);
  };

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      title="ドラッグで幅を変更（ダブルクリックで元の幅に戻す）"
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      sx={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        touchAction: 'none',
        // 普段は境目の細い線だけ見せ、マウスを載せたら掴める範囲を色で示す
        borderRight: 2,
        borderRightColor: 'divider',
        '&:hover, &:active': { bgcolor: 'primary.light', opacity: 0.6 },
      }}
    />
  );
};

/** 数量（SPARE・各ポジション）の入力欄。数字なので右寄せにする */
const QTY_INPUT_SX = { '& input': { textAlign: 'right' } } as const;

/**
 * 数量の入力欄のinput属性。`type="number"`はスピンボタン・ホイール・上下キーで値が変わり
 * 誤入力が多かったので使わない（課題A-2）。数字以外は`toQtyInput`で落とす。
 * inputModeはタブレットで数字のキーボードを出すため。
 */
const QTY_HTML_INPUT = { inputMode: 'numeric' } as const;

/**
 * 数量の入力欄をキーボードで移動するための位置（課題A-4）。
 * 列はSPAREを0、ポジションを1から数える。入力欄にdata属性で持たせ、表のkeydownでまとめて扱う。
 */
const qtyGridInput = (row: number, col: number) => ({
  ...QTY_HTML_INPUT,
  'data-qty-row': row,
  'data-qty-col': col,
});

/** キーごとの移動量（行, 列） */
const QTY_GRID_MOVES: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  Enter: [1, 0],
};

/**
 * 数量の欄でのキー操作。テンキーとカーソルだけで入力していけるよう、Excelに近い動きにする（課題A-4）。
 * - 矢印キーは隣のセルへ移動するだけにする（数字なので、欄の中でカーソルを動かす必要は無い）
 * - Enterは下、Shift+Enterは上へ移動する
 * - 移動先は中身を選択した状態にして、打てばそのまま上書きできるようにする
 * 表の端では動かない。日本語入力の変換中は、変換の操作に矢印・Enterを使うので邪魔しない。
 */
const handleQtyGridKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLInputElement) || target.dataset.qtyRow === undefined) return;
  if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const move = QTY_GRID_MOVES[event.key];
  if (!move) return;

  event.preventDefault();
  const [rowStep, colStep] = event.key === 'Enter' && event.shiftKey ? [-1, 0] : move;
  const row = Number(target.dataset.qtyRow) + rowStep;
  const col = Number(target.dataset.qtyCol) + colStep;
  const next = event.currentTarget.querySelector<HTMLInputElement>(
    `input[data-qty-row="${row}"][data-qty-col="${col}"]`
  );
  if (!next) return;
  next.focus();
  next.select();
};

/**
 * 選択中のセルを枠で囲む（課題A-5）。どの行かも分かるよう、その行の行番号も色を付ける（`.row-number`）。
 * 入力欄の下線だけでは、今どこにいるのか分かりにくいため。
 */
const FOCUSED_CELL_SX = {
  // 行頭の操作ボタン（並び替え・追加・削除）の欄は、押したときに枠が出ても意味が無いので除く
  '& > td:focus-within:not(.row-controls)': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
  '&:focus-within .row-number': { color: 'primary.main', fontWeight: 'bold' },
} as const;

/** キーで移動したセルが固定列や見出しの下に隠れないよう、スクロールに余白を取る（見出しの行の高さ） */
const HEADER_SCROLL_PADDING = 48;

/**
 * 何も入力されていない行の背景色（課題A-6）。区切りに入れた空行や、使っていない行を見分けやすくする。
 * 固定列は後ろのポジション列が透けないよう背景を塗っているので、不透明な色にする。
 */
const EMPTY_ROW_COLOR = 'grey.100';

/** 列名の入力欄の幅。空欄・短い名前は最小幅（数量の入力欄に近い幅）、長すぎる名前は最大幅で止める */
const COLUMN_LABEL_MIN_WIDTH = 76;
const COLUMN_LABEL_MAX_WIDTH = 240;

type ColumnHeaderCellProps = {
  column: EquipmentColumn;
  readOnly: boolean;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
};

const ColumnHeaderCell = ({ column, readOnly, onLabelChange, onRemove }: ColumnHeaderCellProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toColumnDragId(column.id),
    disabled: readOnly,
  });

  return (
    <TableCell
      ref={setNodeRef}
      sx={{
        px: 0.5,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        // stickyHeaderが付ける z-index: 2 を上書きしないこと。
        // 'auto'にすると、DOM上あとに来る本体の行がヘッダーの上に描画される
        zIndex: isDragging ? 3 : 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box display="flex" alignItems="center">
        {!readOnly && (
          <IconButton
            size="small"
            sx={{ cursor: 'grab', p: 0.25 }}
            title="ドラッグで並び替え"
            {...attributes}
            {...listeners}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        )}
        {/*
          入力欄の幅を列名の長さに合わせる。入力欄（input）は中身に合わせて伸び縮みしないので、
          同じ文字を見えない状態で同じマス（grid-area）に重ね、そのマスの幅に入力欄を合わせる。
          空欄や短い名前は数量の入力欄に近い幅（最小）、長すぎる名前は最大幅で止める
          （止まった名前はマウスを載せると全体が見える）。
        */}
        <Box
          sx={{
            display: 'inline-grid',
            minWidth: COLUMN_LABEL_MIN_WIDTH,
            maxWidth: COLUMN_LABEL_MAX_WIDTH,
            '& > *': { gridArea: '1 / 1' },
          }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{
              typography: 'body1',
              whiteSpace: 'pre',
              visibility: 'hidden',
              overflow: 'hidden',
              height: 0,
              // カーソルの分だけ余裕を持たせる
              pr: 0.5,
            }}
          >
            {column.label}
          </Box>
          <TextField
            value={column.label}
            onChange={(e) => onLabelChange(e.target.value)}
            variant="standard"
            size="small"
            title={column.label}
            fullWidth
            // inputは既定でsize=20相当（約180px）の幅を主張し、マスの幅を押し広げてしまう。
            // 1にして、幅を見えない文字の側だけで決まるようにする
            slotProps={{ input: { readOnly }, htmlInput: { size: 1 } }}
          />
        </Box>
        {!readOnly && (
          <IconButton size="small" onClick={onRemove} title="列を削除" sx={{ p: 0.25 }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </TableCell>
  );
};

type EquipmentRowViewProps = {
  row: EquipmentRow;
  index: number;
  columns: EquipmentColumn[];
  /** この行の「名称」候補。種類で絞り込まれている場合がある */
  kizaiOptions: KizaiOption[];
  /** 種類で絞り込んだ候補か（該当0件のときの案内文を変えるのに使う） */
  kizaiOptionsFiltered: boolean;
  kizaiKindOptions: string[];
  readOnly: boolean;
  onUpdateRow: (patch: Partial<EquipmentRow>) => void;
  onUpdateQty: (columnId: string, value: string) => void;
  onRemoveRow: () => void;
  /** この行の直下に機材追加ダイアログで選んだ機材を入れる */
  onAddKizaiBelow: () => void;
  /** この行の直下に空行を1行入れる */
  onInsertRowBelow: () => void;
  /** ドラッグ中の親の行と一緒に動く付属品か（薄く表示して、一緒に動くことを示す） */
  movingWithParent?: boolean;
};

const EquipmentRowView = ({
  row,
  index,
  columns,
  kizaiOptions,
  kizaiOptionsFiltered,
  kizaiKindOptions,
  readOnly,
  onUpdateRow,
  onUpdateQty,
  onRemoveRow,
  onAddKizaiBelow,
  onInsertRowBelow,
  movingWithParent = false,
}: EquipmentRowViewProps) => {
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<HTMLElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toRowDragId(row.id),
    disabled: readOnly,
  });
  const empty = !hasEquipmentRowContent(row);

  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : movingWithParent ? 0.3 : 1,
        zIndex: isDragging ? 1 : 'auto',
        bgcolor: isDragging ? 'background.paper' : undefined,
        // 固定列のセルは個別に背景を塗っているので、行ではなくセルごと塗り替える
        ...(empty && { '& > td': { bgcolor: EMPTY_ROW_COLOR } }),
        // インデントの切り替えは普段は目立たせない（オプションなので）
        '&:hover .indent-toggle': { opacity: 1 },
        ...FOCUSED_CELL_SX,
      }}
    >
      <TableCell sx={fixedCellSx(0)} className="row-controls">
        <Box display="flex" alignItems="center" gap={0.5}>
          {/* 桁数で後ろのアイコンがずれないよう、3桁分の幅を取って右寄せにする（行数は3桁まで） */}
          <Typography
            className="row-number"
            variant="caption"
            color="text.secondary"
            sx={{ width: '3ch', flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          >
            {index + 1}
          </Typography>
          {!readOnly && (
            <>
              <IconButton
                size="small"
                sx={{ cursor: 'grab' }}
                title="ドラッグで並び替え"
                {...attributes}
                {...listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => setInsertMenuAnchor(e.currentTarget)}
                title="この行の下に追加"
                aria-haspopup="menu"
              >
                <AddCircleOutlineIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={onRemoveRow} title="行を削除">
                <DeleteIcon fontSize="small" />
              </IconButton>
              <Menu anchorEl={insertMenuAnchor} open={!!insertMenuAnchor} onClose={() => setInsertMenuAnchor(null)}>
                <MenuItem
                  onClick={() => {
                    setInsertMenuAnchor(null);
                    onAddKizaiBelow();
                  }}
                >
                  <ListItemIcon>
                    <LibraryAddIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="この下に機材を追加" />
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setInsertMenuAnchor(null);
                    onInsertRowBelow();
                  }}
                >
                  <ListItemIcon>
                    <AddIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="この下に空行を挿入" />
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </TableCell>
      <TableCell sx={fixedCellSx(1)}>
        <Autocomplete
          freeSolo
          readOnly={readOnly}
          size="small"
          options={kizaiKindOptions}
          inputValue={row.kind}
          onInputChange={(_event, value, reason) => {
            // 候補を選んだ直後のresetはonChange側で反映済みなので無視する
            if (reason === 'reset') return;
            onUpdateRow({ kind: value });
          }}
          onChange={(_event, value) => onUpdateRow({ kind: value ?? '' })}
          renderInput={(params) => <TextField {...params} variant="standard" />}
        />
      </TableCell>
      <TableCell sx={fixedCellSx(2)}>
        <Box display="flex" alignItems="center" gap={0.5}>
          {readOnly ? (
            <Box width={INDENT_SLOT_WIDTH} textAlign="center" color="text.secondary" fontSize={13}>
              {row.indent ? INDENT_MARK : ''}
            </Box>
          ) : (
            <IconButton
              className="indent-toggle"
              size="small"
              onClick={() => onUpdateRow({ indent: row.indent ? 0 : 1 })}
              title={row.indent ? '上の機材とのセットを解除する' : '上の機材とセットにする'}
              sx={{
                width: INDENT_SLOT_WIDTH,
                height: INDENT_SLOT_WIDTH,
                borderRadius: 1,
                fontSize: 13,
                lineHeight: 1,
                color: row.indent ? 'text.primary' : 'text.disabled',
                // 設定済みの行は常に見せ、そうでない行はホバー・フォーカスまで薄いままにする
                opacity: row.indent ? 1 : 0.2,
                transition: 'opacity 120ms',
                '&:focus-visible': { opacity: 1 },
              }}
            >
              {INDENT_MARK}
            </IconButton>
          )}
          <Autocomplete
            sx={{ flexGrow: 1 }}
            freeSolo
            readOnly={readOnly}
            size="small"
            options={kizaiOptions}
            filterOptions={filterKizaiOptions}
            noOptionsText={
              kizaiOptionsFiltered
                ? 'この種類に該当する機材がありません（種類を空にすると全機材から選べます）'
                : '該当する機材がありません'
            }
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.kizaiNam)}
            inputValue={row.name}
            onInputChange={(_event, value, reason) => {
              // 候補を選んだ直後のresetはonChange側で反映済みなので無視する
              if (reason === 'reset') return;
              onUpdateRow({ name: value, kizaiId: null });
            }}
            onChange={(_event, value) => {
              if (value && typeof value !== 'string') {
                onUpdateRow({ name: value.kizaiNam, kizaiId: value.kizaiId });
                return;
              }
              onUpdateRow({ name: value ?? '', kizaiId: null });
            }}
            renderInput={(params) => <TextField {...params} variant="standard" title={row.name} />}
          />
        </Box>
      </TableCell>
      <TableCell sx={fixedCellSx(3)} align="center">
        <MemoTooltip
          title={row.name || '備考'}
          memo={row.remark}
          readOnly={readOnly}
          onSave={(remark) => onUpdateRow({ remark })}
        />
      </TableCell>
      <TableCell align="right" sx={fixedCellSx(4)}>
        <Typography variant="body2">{getTotal(row)}</Typography>
      </TableCell>
      <TableCell align="right" sx={fixedCellSx(5)}>
        <Typography variant="body2">{getActiveSum(row)}</Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...fixedCellSx(6), px: 1 }}>
        <TextField
          value={row.spare}
          onChange={(e) => onUpdateRow({ spare: toQtyInput(e.target.value) })}
          variant="standard"
          size="small"
          sx={{ width: 56, ...QTY_INPUT_SX }}
          slotProps={{ input: { readOnly }, htmlInput: qtyGridInput(index, 0) }}
        />
      </TableCell>
      {columns.map((column, columnIndex) => (
        <TableCell key={column.id} align="center">
          <TextField
            value={row.qty[column.id] ?? ''}
            onChange={(e) => onUpdateQty(column.id, toQtyInput(e.target.value))}
            variant="standard"
            size="small"
            sx={{ width: 64, ...QTY_INPUT_SX }}
            slotProps={{ input: { readOnly }, htmlInput: qtyGridInput(index, columnIndex + 1) }}
          />
        </TableCell>
      ))}
    </TableRow>
  );
};

type EquipmentTableProps = {
  /** まだ保存していない（新規作成の）機材表ならnull */
  detail: EquipmentTableDetail | null;
  /** ログイン中のユーザーの権限。新規作成（detailがnull）ならnull＝作る人が持ち主 */
  access?: KizaihyouAccess | null;
  /** 開いた時点の編集ロックの状態。新規作成ならnull */
  editStatus?: EditStatus | null;
  kizaiOptions: KizaiOption[];
  kizaiKindOptions: BumonOption[];
  juchuTantoOptions: JuchuTantoOption[];
  history: EquipmentTableHistoryEntry[];
};

/** ロックを持っている人の表示（「○○さんが編集中（最終操作 3分前）」） */
const describeLock = (lock: EditLockInfo) =>
  `${lock.userNam}さんが編集中です（最終操作 ${lock.idleMinutes === 0 ? '1分以内' : `${lock.idleMinutes}分前`}）`;

const EquipmentTable = ({
  detail,
  access = null,
  editStatus = null,
  kizaiOptions,
  kizaiKindOptions,
  juchuTantoOptions,
  history,
}: EquipmentTableProps) => {
  const router = useRouter();
  // 未保存のうちはkizaihyou_idが無い。最初の保存・申請でここに採番されたidが入る
  const kizaihyouId = detail?.id ?? null;
  const cod = detail?.cod ?? '';
  const status = detail?.status ?? '作成中';

  const [head, setHead] = useState<EquipmentTableHead>(detail?.head ?? EMPTY_HEAD);
  const [columns, setColumns] = useState<EquipmentColumn[]>(detail?.columns ?? createInitialColumns);
  const [rows, setRows] = useState<EquipmentRow[]>(detail?.rows ?? createInitialRows);
  /** 元に戻す／やり直す（課題A-11）。内容を書き換える操作は、書き換える直前にundoHistory.recordを呼ぶ */
  const restoreSheet = useCallback((state: SheetState) => {
    setHead(state.head);
    setColumns(state.columns);
    setRows(state.rows);
  }, []);
  const undoHistory = useUndoHistory<SheetState>({ head, columns, rows }, restoreSheet);
  const { undo: undoSheet, redo: redoSheet, reset: resetUndoHistory } = undoHistory;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [withdrawComment, setWithdrawComment] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  // 差戻し・取下げ後の再申請では前回の申請先を初期選択にする
  const [tantoUserIds, setTantoUserIds] = useState<string[]>(detail?.tantoUserIds ?? []);
  const [requestComment, setRequestComment] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(true);
  /**
   * 機材追加ダイアログを開いているか。afterRowIdはその行の直下に入れる（行の「＋」から開いた場合）。
   * nullなら上部のボタンから開いた場合で、入力のある最後の行の直後に入れる
   */
  const [kizaiAddTarget, setKizaiAddTarget] = useState<{ afterRowId: string | null } | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  /** 画面が持っている内容の版。保存・申請のときにサーバーの版と照合する */
  const [contentVer, setContentVer] = useState(detail?.contentVer ?? 0);
  /** 他の人（または自分の別のタブ）が持っている編集ロック。誰も編集していなければnull */
  const [otherLock, setOtherLock] = useState<EditLockInfo | null>(
    editStatus?.lock && !editStatus.lock.mine ? editStatus.lock : null
  );
  /** 版が食い違って保存・申請できなかった（最新を読み込むボタンを出す） */
  const [conflict, setConflict] = useState(false);
  const [confirmEndEdit, setConfirmEndEdit] = useState(false);
  /** 固定列の幅（種類・名称はドラッグで変えられる）。ブラウザに覚えた幅はマウント後に読む */
  const tableRef = useRef<HTMLTableElement>(null);
  const [fixedWidths, setFixedWidths] = useState<number[]>(() => [...FIXED_COLUMN_WIDTHS]);
  useEffect(() => {
    // localStorageはサーバー側の描画には無いので、初回の描画は既定の幅で揃えてから差し替える
    setFixedWidths(loadFixedColumnWidths());
  }, []);
  const withFixedWidth = (index: number, width: number) => fixedWidths.map((value, i) => (i === index ? width : value));
  /** ドラッグ中。表のCSS変数だけを書き換え、行は描き直さない */
  const previewFixedWidth = (index: number, width: number) => {
    const table = tableRef.current;
    if (!table) return;
    Object.entries(toFixedColumnVars(withFixedWidth(index, width))).forEach(([name, value]) =>
      table.style.setProperty(name, value)
    );
  };
  const commitFixedWidth = (index: number, width: number) => {
    const next = withFixedWidth(index, width);
    setFixedWidths(next);
    saveFixedColumnWidths(next);
  };
  /** 見出しの固定列に付ける、幅を変えるつまみ */
  const renderResizeHandle = (index: number) => (
    <ColumnResizeHandle
      width={fixedWidths[index]}
      clamp={(width) => clampWidth(index, width)}
      onResize={(width) => previewFixedWidth(index, width)}
      onResizeEnd={(width) => commitFixedWidth(index, width)}
      onReset={() => commitFixedWidth(index, FIXED_COLUMN_WIDTHS[index])}
    />
  );
  /** ドラッグ中の行のid。一緒に動く付属品を薄く表示するのに使う（課題A-9） */
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const followingRowIds = useMemo(
    () => new Set(draggingRowId === null ? [] : getFollowingChildRowIds(rows, draggingRowId)),
    [rows, draggingRowId]
  );
  /** 削除の確認を出している行・列 */
  const [removeTarget, setRemoveTarget] = useState<{ type: 'row' | 'column'; id: string; message: string } | null>(
    null
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const kindOptions = useMemo(
    // 同名の部門があってもプルダウンには1つだけ出す
    () => Array.from(new Set(kizaiKindOptions.map((bumon) => bumon.bumonNam))),
    [kizaiKindOptions]
  );

  /**
   * 種類（部門名）→ その部門に属する機材。
   * 行ごとに1700件超を毎回filterすると重いので、部門名で引ける形に組み直しておく。
   * 部門マスタに無い種類（手入力）はキーが無く、全機材が候補になる。
   */
  const kizaiOptionsByKind = useMemo(() => {
    const byBumonId = new Map<number, KizaiOption[]>();
    for (const kizai of kizaiOptions) {
      if (kizai.bumonId === null) continue;
      const list = byBumonId.get(kizai.bumonId);
      if (list) list.push(kizai);
      else byBumonId.set(kizai.bumonId, [kizai]);
    }

    const byKind = new Map<string, KizaiOption[]>();
    for (const bumon of kizaiKindOptions) {
      // 同名の部門があれば機材をまとめる
      byKind.set(bumon.bumonNam, [...(byKind.get(bumon.bumonNam) ?? []), ...(byBumonId.get(bumon.bumonId) ?? [])]);
    }
    return byKind;
  }, [kizaiOptions, kizaiKindOptions]);

  // 新規作成（まだ保存していない）は作る人が持ち主
  const role = access?.role ?? KIZAIHYOU_ROLE.持ち主;
  const isOwner = role === KIZAIHYOU_ROLE.持ち主;
  const canEditRole = hasRole(role, KIZAIHYOU_ROLE.編集);
  const canRequestRole = hasRole(role, KIZAIHYOU_ROLE.申請);

  // 申請中は承認者が申請時点の内容を見ているので、こちらからは触らせない
  const statusReadOnly = READ_ONLY_STATUSES.includes(status);
  const canRequest = REQUESTABLE_STATUSES.includes(status);

  // 未保存の変更があるかは、最後に保存した内容とのスナップショット比較で判定する
  const [savedSnapshot, setSavedSnapshot] = useState(() => toSnapshot(head, columns, rows));
  const currentSnapshot = useMemo(() => toSnapshot(head, columns, rows), [head, columns, rows]);
  const isDirty = currentSnapshot !== savedSnapshot;

  /** ロックを失ったとき（期限切れ・他の人に取られた）。入力中の内容は画面に残す */
  const handleLockLost = useCallback((lost: LockLostReason) => {
    if (lost.reason === 'locked') {
      setOtherLock(lost.lock);
      setError(
        `${lost.lock.userNam}さんが編集を始めたため、編集を終了しました。入力中で保存していない内容は保存されていません。`
      );
    } else if (lost.reason === 'expired') {
      setError(
        '操作が無かったため編集ロックが切れました。入力中で保存していない内容は保存されていません。「編集」を押すと続けられます（その間に他の人が保存していなければ、そのまま保存できます）。'
      );
    } else {
      setError(lost.message);
    }
  }, []);

  const editLock = useEditLock(
    kizaihyouId,
    editStatus?.lock?.mine && !statusReadOnly ? editStatus.lock.expiresInSeconds : null,
    handleLockLost
  );
  // 新規作成はロックの対象外（まだ誰も開けない）なので、作る人がそのまま編集する
  const editing = kizaihyouId === null || editLock.editing;
  const readOnly = statusReadOnly || !editing;

  /**
   * Ctrl+Z（元に戻す）・Ctrl+Y / Ctrl+Shift+Z（やり直す）。入力欄の中でも画面全体の履歴で戻す
   * （入力欄ごとのブラウザ標準の取り消しは、Reactで値を管理している欄では当てにならないため）。
   * ダイアログ（備考・申請・機材追加など）の中は対象外にして、そこの入力欄の標準の動きに任せる。
   */
  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
      if (!isUndo && !isRedo) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault();
      if (isUndo) undoSheet();
      else redoSheet();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, undoSheet, redoSheet]);

  // 申請・取り下げ・承認などで状態が変わって編集できなくなったら、ロックも手放す
  useEffect(() => {
    if (statusReadOnly && editLock.editing) void editLock.stop();
  }, [statusReadOnly, editLock]);

  // サーバーから新しい内容が届いたら（保存後の読み直し・他の人の保存）画面に反映する。
  // 編集中で保存していない変更があるときは、入力を消さないよう反映しない（forceReloadRefを立てたときを除く）
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const currentSnapshotRef = useRef(currentSnapshot);
  currentSnapshotRef.current = currentSnapshot;
  const forceReloadRef = useRef(false);
  const firstDetailRef = useRef(true);
  useEffect(() => {
    if (firstDetailRef.current) {
      firstDetailRef.current = false;
      return;
    }
    if (!detail || (isDirtyRef.current && !forceReloadRef.current)) return;
    forceReloadRef.current = false;
    // 自分の保存の読み直しなら内容は画面と同じなので、元に戻すの履歴は残す（保存後も戻せるように）。
    // 他の人の保存・「最新を読み込む」で中身が変わったときは、古い内容へ戻せてしまわないよう捨てる
    if (toSnapshot(detail.head, detail.columns, detail.rows) !== currentSnapshotRef.current) resetUndoHistory();
    setHead(detail.head);
    setColumns(detail.columns);
    setRows(detail.rows);
    setSavedSnapshot(toSnapshot(detail.head, detail.columns, detail.rows));
    setContentVer(detail.contentVer);
    setTantoUserIds(detail.tantoUserIds);
    setConflict(false);
  }, [detail, resetUndoHistory]);

  /** 入力中の内容を捨てて、最新の内容を読み込む */
  const reloadLatest = () => {
    forceReloadRef.current = true;
    setError('');
    router.refresh();
  };

  // 編集していない間は、誰が編集中か・誰かが保存したかを定期的に確かめ、保存されていれば読み直す
  const pollEditStatus = useCallback(async () => {
    if (kizaihyouId === null || editLock.editing) return;
    try {
      const statusNow = await fetchEditStatus(kizaihyouId);
      setOtherLock(statusNow.lock);
      if (statusNow.contentVer !== contentVer && !isDirtyRef.current) router.refresh();
    } catch {
      // 一時的な失敗は次の確認で取り直す
    }
  }, [kizaihyouId, editLock.editing, contentVer, router]);
  useAutoRefresh(pollEditStatus, kizaihyouId !== null && !editLock.editing, EDIT_STATUS_POLL_MS);

  /** 「編集」 */
  const handleStartEdit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await editLock.start();
      if (!result) return;
      if (result.ok) {
        setOtherLock(null);
        // 閲覧している間に誰かが保存していれば、その内容から編集を始める
        if (result.contentVer !== contentVer) {
          if (isDirtyRef.current) setConflict(true);
          else router.refresh();
        }
        return;
      }
      if (result.reason === 'locked') {
        setOtherLock(result.lock);
        setError(`${describeLock(result.lock)}。編集が終わるまでお待ちください。`);
      } else {
        setError(result.message);
      }
    } catch {
      setError('編集を始められませんでした。');
    } finally {
      setBusy(false);
    }
  };

  /** 「編集を終了」。保存していない変更があれば確認する */
  const handleEndEdit = () => {
    if (isDirty) {
      setConfirmEndEdit(true);
      return;
    }
    void editLock.stop();
  };

  /** 持ち主が、他の人の編集ロックを外す */
  const handleForceUnlock = async () => {
    if (kizaihyouId === null) return;
    setBusy(true);
    setError('');
    try {
      await forceStopEditing(kizaihyouId);
      setOtherLock(null);
      setMessage('編集ロックを解除しました。「編集」を押すと編集できます。');
    } catch {
      setError('編集ロックを解除できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  /** 保存・申請が止められたときの表示 */
  const showBlocked = (result: Exclude<SaveResult, { ok: true }>) => {
    if (result.reason === 'locked') {
      setOtherLock(result.lock);
      void editLock.stop();
      setError(`${describeLock(result.lock)}。保存・申請できませんでした。`);
      return;
    }
    if (result.reason === 'conflict') setConflict(true);
    setError(result.message);
  };

  // 申請にだけ必要な入力チェック（保存は書きかけでもできる）
  const requestErrors = useMemo(() => validateForRequest(head, rows), [head, rows]);

  const addRow = () => {
    undoHistory.record();
    setRows((prev) => [...prev, createRow()]);
  };

  // 機材追加ダイアログの重複確認に使う
  const existingKizaiIds = useMemo(() => rows.flatMap((row) => (row.kizaiId === null ? [] : [row.kizaiId])), [rows]);
  const bumonNamById = useMemo(
    () => new Map(kizaiKindOptions.map((bumon) => [bumon.bumonId, bumon.bumonNam])),
    [kizaiKindOptions]
  );

  /**
   * 機材追加ダイアログで選んだ機材を行として足す。種類は機材の部門名を入れる（「種類」欄で選んだときと同じ値）。
   *
   * 行の「＋」から開いた場合はその行の直下に入れる。
   * 上部のボタンから開いた場合は、入力のある最後の行の直後に入れる。機材表は空行が並んだ状態で
   * 開くので、末尾に足すと空行の下に入って見失うため。残りの空行はその下に残す。
   */
  const addKizaiRows = (kizai: AddedKizai[]) => {
    const afterRowId = kizaiAddTarget?.afterRowId ?? null;
    setKizaiAddTarget(null);
    if (!kizai.length) return;
    undoHistory.record();
    setRows((prev) => {
      // ダイアログを開いている間に対象の行が消えることは無いが、念のため見つからなければ既定の位置にする
      let lastIndex = afterRowId === null ? -1 : prev.findIndex((row) => row.id === afterRowId);
      if (lastIndex === -1) {
        prev.forEach((row, index) => {
          if (hasEquipmentRowContent(row)) lastIndex = index;
        });
      }
      const added = kizai.map((item) => ({
        ...createRow(),
        kind: item.bumonId === null ? '' : (bumonNamById.get(item.bumonId) ?? ''),
        kizaiId: item.kizaiId,
        name: item.kizaiNam,
        indent: item.indent,
      }));
      return [...prev.slice(0, lastIndex + 1), ...added, ...prev.slice(lastIndex + 1)];
    });
    setMessage(`機材を${kizai.length}行追加しました。`);
  };
  const removeRow = (id: string) => {
    undoHistory.record();
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  /**
   * 行・列の削除ボタン。入力のある行・列は確認を出してから消す（課題A-10）。
   * 空の行・列まで確認すると、空行を片付けるたびに手間が増えるのでそのまま消す。
   */
  const requestRemoveRow = (id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return;
    if (!hasEquipmentRowContent(rows[index])) {
      removeRow(id);
      return;
    }
    setRemoveTarget({
      type: 'row',
      id,
      message: `${index + 1}行目「${rows[index].name || '名称なし'}」を削除しますか？`,
    });
  };
  const requestRemoveColumn = (id: string) => {
    const column = columns.find((item) => item.id === id);
    if (!column) return;
    const qtyCount = rows.filter((row) => (row.qty[id] ?? '') !== '').length;
    if (!column.label && qtyCount === 0) {
      removeColumn(id);
      return;
    }
    setRemoveTarget({
      type: 'column',
      id,
      message:
        `列「${column.label || '見出しなし'}」を削除しますか？` +
        (qtyCount ? `この列に入力した数量（${qtyCount}行分）も消えます。` : ''),
    });
  };
  const confirmRemove = () => {
    if (!removeTarget) return;
    if (removeTarget.type === 'row') removeRow(removeTarget.id);
    else removeColumn(removeTarget.id);
    setRemoveTarget(null);
    // 確認を出すほどの削除なので、戻せることを知らせる（課題A-11）
    setMessage(`${removeTarget.type === 'row' ? '行' : '列'}を削除しました。「元に戻す」（Ctrl+Z）で戻せます。`);
  };
  const insertRowBelow = (id: string) => {
    undoHistory.record();
    setRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      return [...prev.slice(0, index + 1), createRow(), ...prev.slice(index + 1)];
    });
  };

  const addColumn = () => {
    undoHistory.record();
    setColumns((prev) => [...prev, createColumn('')]);
  };
  const removeColumn = (id: string) => {
    undoHistory.record();
    setColumns((prev) => prev.filter((column) => column.id !== id));
    setRows((prev) =>
      prev.map((row) => {
        const qty = { ...row.qty };
        delete qty[id];
        return { ...row, qty };
      })
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = String(event.active.id);
    setDraggingRowId(isRowDragId(dragId) ? fromDragId(dragId) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingRowId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = fromDragId(String(active.id));
    const overId = fromDragId(String(over.id));

    if (isRowDragId(String(active.id))) {
      // 親の行は付属品（直下のインデント行）ごと動かす（課題A-9）
      const moved = moveEquipmentRow(rows, activeId, overId);
      if (moved === rows) return;
      undoHistory.record();
      setRows(moved);
      return;
    }

    undoHistory.record();

    setColumns((prev) => {
      const oldIndex = prev.findIndex((column) => column.id === activeId);
      const newIndex = prev.findIndex((column) => column.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const updateRow = (id: string, patch: Partial<EquipmentRow>) => {
    undoHistory.record(toRowUndoKey(id, patch));
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const updateQty = (rowId: string, columnId: string, value: string) => {
    undoHistory.record(`qty:${rowId}:${columnId}`);
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, qty: { ...row.qty, [columnId]: value } } : row)));
  };

  const updateHead = (field: keyof EquipmentTableHead, value: string) => {
    undoHistory.record(`head:${field}`);
    setHead((prev) => ({ ...prev, [field]: value }));
  };

  const updateColumnLabel = (id: string, label: string) => {
    undoHistory.record(`col:${id}`);
    setColumns((prev) => prev.map((column) => (column.id === id ? { ...column, label } : column)));
  };

  /**
   * 保存する。まだ保存していない機材表ならここで作成する。
   * recordHistory=falseは申請の直前の保存用（「申請」の履歴にスナップショットを残すため）。
   *
   * @returns 機材表のkizaihyou_id（新規作成ならここで採番されたもの）
   */
  const save = async (recordHistory = true): Promise<SaveResult> => {
    const snapshot = toSnapshot(head, columns, rows);

    if (kizaihyouId === null) {
      const created = await createEquipmentTable(head, columns, rows);
      setSavedSnapshot(snapshot);
      setContentVer(created.contentVer);
      return { ok: true, ...created };
    }

    const result = await saveEquipmentTable(kizaihyouId, head, columns, rows, contentVer, recordHistory);
    if (!result.ok) return result;
    setSavedSnapshot(snapshot);
    setContentVer(result.contentVer);
    editLock.markExtended();
    // 保存で列・行のidが採番し直されるため、サーバーから読み直す
    router.refresh();
    return result;
  };

  const handleBack = () => {
    if (isDirty) {
      setConfirmBack(true);
      return;
    }
    router.push('/equipment-table-list');
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await save();
      if (!result.ok) {
        showBlocked(result);
        return;
      }
      if (kizaihyouId === null) {
        // 採番されたIDの画面へ（作った人が編集ロックを持った状態で開く）。戻るで未保存の画面に戻らないようreplaceする
        router.replace(`/equipment-table/${result.kizaihyouId}`);
        return;
      }
      setMessage('保存しました');
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleExportExcel = async () => {
    setBusy(true);
    setError('');
    try {
      const { fileName, base64 } = await exportEquipmentTableExcel(cod, head, columns, rows);
      downloadBase64File(fileName, base64, XLSM_MIME_TYPE);
      setMessage('Excelを出力しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excelの出力に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleExportPdf = async () => {
    setBusy(true);
    setError('');
    try {
      const { fileName, base64 } = await exportEquipmentTablePdf(cod, head, columns, rows);
      downloadBase64File(fileName, base64, PDF_MIME_TYPE);
      setMessage('PDFを出力しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDFの出力に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async () => {
    setBusy(true);
    setError('');
    try {
      // 編集中なら今の内容を保存してから、その版で申請する。編集していなければ表示中の版で申請する
      let target = { kizaihyouId, contentVer };
      if (editing) {
        const saved = await save(false);
        if (!saved.ok) {
          showBlocked(saved);
          setRequestOpen(false);
          setBusy(false);
          return;
        }
        target = saved;
      }
      if (target.kizaihyouId === null) return;

      const result = await requestEquipmentTable(
        target.kizaihyouId,
        tantoUserIds,
        requestComment.trim(),
        target.contentVer
      );
      if (!result.ok) {
        showBlocked(result);
        setRequestOpen(false);
        setBusy(false);
        return;
      }
      // 申請と同時にサーバー側でロックも外れている
      editLock.markReleased();
      setMessage('申請しました');
      router.push('/equipment-table-list');
    } catch {
      setError('申請に失敗しました。');
      setRequestOpen(false);
      setBusy(false);
    }
  };

  // 流用元にはDBの内容が使われるので、未保存の変更があるときは先に確認する
  const copyAndCreate = async (saveFirst: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (saveFirst) {
        const saved = await save();
        if (!saved.ok) {
          showBlocked(saved);
          setConfirmCopy(false);
          setBusy(false);
          return;
        }
      }
      if (kizaihyouId === null) return;
      const id = await copyEquipmentTable(kizaihyouId, cod);
      router.push(`/equipment-table/${id}`);
    } catch {
      setError('流用しての新規作成に失敗しました。');
      setConfirmCopy(false);
      setBusy(false);
    }
  };

  const handleCopy = () => {
    // 流用元はDBの内容。編集中で保存していない変更があるときだけ確認する
    if (isDirty && editing) {
      setConfirmCopy(true);
      return;
    }
    copyAndCreate(false);
  };

  /** 完了・完了解除・削除。いずれも保存済みの機材表にしか効かない */
  const runStatusAction = async (
    action: (id: number) => Promise<void>,
    doneMessage: string,
    failMessage: string,
    afterDone?: () => void
  ) => {
    if (kizaihyouId === null) return;
    setBusy(true);
    setError('');
    try {
      await action(kizaihyouId);
      setMessage(doneMessage);
      if (afterDone) afterDone();
      else router.refresh();
    } catch {
      setError(failMessage);
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = () =>
    runStatusAction(completeEquipmentTable, '完了にしました', '完了への変更に失敗しました。');

  const handleReopen = () =>
    runStatusAction(reopenEquipmentTable, '作成中に戻しました', '作成中への変更に失敗しました。');

  // 削除すると一覧から消えるので、そのまま一覧へ戻す
  const handleDelete = () => {
    setDeleteOpen(false);
    return runStatusAction(deleteEquipmentTable, '削除しました', '削除に失敗しました。', () =>
      router.push('/equipment-table-list')
    );
  };

  const handleWithdraw = async () => {
    setBusy(true);
    setError('');
    try {
      if (kizaihyouId === null) return;
      await withdrawEquipmentTable(kizaihyouId, withdrawComment.trim());
      setWithdrawOpen(false);
      setMessage('申請を取り下げました');
      router.refresh();
    } catch {
      setError('申請の取り下げに失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DndContext
      id="equipment-table"
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictAxisByDraggedType]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingRowId(null)}
    >
      <Box p={2}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton onClick={handleBack} title="機材表履歴一覧に戻る">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">機材表 {cod || '（新規作成）'}</Typography>
            <Chip label={status} size="small" />
            {access && (
              <Chip
                label={access.member ? `権限：${ROLE_LABELS[role]}` : '受注部として閲覧'}
                size="small"
                variant="outlined"
              />
            )}
            {kizaihyouId !== null && editing && <Chip label="編集中" size="small" color="primary" />}
          </Box>
          <Box display="flex" gap={1} flexWrap="wrap" justifyContent="flex-end" alignItems="center">
            {/* 補助的な操作はアイコンだけにする（課題A-13）。説明はマウスを載せると出る */}
            <ToolbarIconButton
              label="タイムライン（操作履歴・コメント）"
              icon={<ForumIcon />}
              color={timelineOpen ? 'primary' : 'default'}
              onClick={() => setTimelineOpen((prev) => !prev)}
              disabled={kizaihyouId === null}
            />
            {kizaihyouId !== null && access?.member && (
              <ToolbarIconButton label="メンバー" icon={<GroupIcon />} onClick={() => setMembersOpen(true)} />
            )}
            <ToolbarIconButton
              label="流用して新規作成"
              icon={<ContentCopyIcon />}
              onClick={handleCopy}
              disabled={busy || kizaihyouId === null}
            />
            <ToolbarIconButton label="Excel出力" icon={<GridOnIcon />} onClick={handleExportExcel} disabled={busy} />
            <ToolbarIconButton label="PDF出力" icon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={busy} />
            {/* 完了・作成中に戻す・削除は持ち主だけ。他の人が編集中なら止める（サーバー側でも弾く） */}
            {isOwner &&
              (status === '完了' ? (
                <ToolbarIconButton
                  label="作成中に戻す"
                  icon={<LockOpenIcon />}
                  onClick={handleReopen}
                  disabled={busy}
                />
              ) : (
                <ToolbarIconButton
                  label="完了にする"
                  icon={<TaskAltIcon />}
                  onClick={handleComplete}
                  disabled={busy || kizaihyouId === null || !COMPLETABLE_STATUSES.includes(status) || !!otherLock}
                />
              ))}
            {isOwner && (
              <ToolbarIconButton
                label="機材表を削除"
                icon={<DeleteForeverIcon />}
                color="error"
                onClick={() => setDeleteOpen(true)}
                disabled={busy || kizaihyouId === null || status === '申請中' || !!otherLock}
              />
            )}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {/* 誤って消した行・列や入力を戻す（課題A-11）。履歴は画面の中だけで、保存しても消えない */}
            <ToolbarIconButton
              label="元に戻す（Ctrl+Z）"
              icon={<UndoIcon />}
              onClick={undoHistory.undo}
              disabled={readOnly || !undoHistory.canUndo}
            />
            <ToolbarIconButton
              label="やり直す（Ctrl+Y）"
              icon={<RedoIcon />}
              onClick={undoHistory.redo}
              disabled={readOnly || !undoHistory.canRedo}
            />
            {kizaihyouId !== null &&
              canEditRole &&
              !statusReadOnly &&
              (editLock.editing ? (
                <Button startIcon={<EditOffIcon />} onClick={handleEndEdit} disabled={busy}>
                  編集を終了
                </Button>
              ) : (
                <Button
                  startIcon={<EditIcon />}
                  variant="contained"
                  onClick={handleStartEdit}
                  disabled={busy || (!!otherLock && !otherLock.mine)}
                >
                  編集
                </Button>
              ))}
            <Button
              startIcon={<LibraryAddIcon />}
              onClick={() => setKizaiAddTarget({ afterRowId: null })}
              disabled={readOnly}
            >
              機材追加
            </Button>
            <Button startIcon={<AddIcon />} onClick={addRow} disabled={readOnly}>
              行を追加
            </Button>
            <Button startIcon={<AddIcon />} onClick={addColumn} disabled={readOnly}>
              列を追加
            </Button>
            <Button startIcon={<SaveIcon />} variant="outlined" onClick={handleSave} disabled={busy || readOnly}>
              保存
            </Button>
            {!canRequestRole ? null : status === '申請中' ? (
              <Button
                startIcon={<UndoIcon />}
                variant="contained"
                color="warning"
                onClick={() => {
                  setWithdrawComment('');
                  setWithdrawOpen(true);
                }}
                disabled={busy}
              >
                取り下げ
              </Button>
            ) : (
              <Button
                startIcon={<SendIcon />}
                variant="contained"
                onClick={() => setRequestOpen(true)}
                // 編集していないのに保存していない変更がある（ロックが切れた後など）と、画面と違う内容を申請してしまう
                disabled={busy || !canRequest || (!!otherLock && !otherLock.mine) || (!editing && isDirty)}
              >
                申請
              </Button>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {kizaihyouId === null && (
          <Alert severity="info" sx={{ mb: 2 }}>
            まだ保存していません。保存するか申請すると機材表IDが採番され、機材表履歴一覧に載ってタイムライン・出力・流用が使えるようになります。
          </Alert>
        )}
        {conflict && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button size="small" onClick={reloadLatest}>
                最新を読み込む
              </Button>
            }
          >
            この画面を開いた後に、他の人が機材表を保存しています。「最新を読み込む」を押すと最新の内容になります（保存していない入力は消えます）。
          </Alert>
        )}
        {otherLock && !editLock.editing && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              isOwner &&
              !otherLock.mine && (
                <Button size="small" onClick={handleForceUnlock} disabled={busy}>
                  ロックを解除
                </Button>
              )
            }
          >
            {otherLock.mine
              ? 'あなたが別のタブ（または別の端末）で編集中です。この画面で「編集」を押すと、こちらで編集を続けられます。'
              : `${describeLock(otherLock)}。編集が終わるまでは閲覧のみです（30秒ごとに最新の内容を反映します）。`}
          </Alert>
        )}
        {editLock.editing && editLock.warning && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button size="small" onClick={() => void editLock.extend()}>
                編集を続ける
              </Button>
            }
          >
            操作が無いため、まもなく編集ロックが切れます（あと{Math.max(0, editLock.remainingSeconds ?? 0)}秒）。
          </Alert>
        )}
        {access && !canEditRole && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {access.member
              ? '閲覧権限のため編集できません。編集が必要な場合は持ち主に権限の変更を頼んでください。'
              : '受注部担当者として閲覧しています（この機材表のメンバーではないため編集できません）。'}
          </Alert>
        )}
        {statusReadOnly && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {status === '完了'
              ? '完了した機材表は編集できません。編集するには「作成中に戻す」を押してください。'
              : '申請中の機材表は編集できません。編集するには申請を取り下げてください。'}
          </Alert>
        )}
        {status === '承認済' && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            action={
              // 承認後も編集できるので、承認された内容（申請時点）はこちらから開く
              detail?.shinseiHisId && (
                <Button
                  size="small"
                  component={Link}
                  href={`/equipment-table/${detail.id}/snapshot/${detail.shinseiHisId}`}
                  target="_blank"
                >
                  承認された内容を開く
                </Button>
              )
            }
          >
            承認済みです。内容を変更した場合は、あらためて申請すると承認を取り直せます（承認画面には前回の申請からの差分が出ます）。
          </Alert>
        )}

        <Box display="flex" gap={2} alignItems="flex-start">
          <Box flexGrow={1} minWidth={0}>
            <Box display="flex" flexWrap="wrap" gap={2} mb={2}>
              <TextField
                label="公演名"
                value={head.eventName}
                onChange={(e) => updateHead('eventName', e.target.value)}
                size="small"
                sx={{ minWidth: 260 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="場所"
                value={head.place}
                onChange={(e) => updateHead('place', e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="顧客名"
                value={head.clientName}
                onChange={(e) => updateHead('clientName', e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="出庫日"
                value={head.shippedAt}
                onChange={(e) => updateHead('shippedAt', e.target.value)}
                size="small"
                type="date"
                slotProps={{ inputLabel: { shrink: true }, input: { readOnly } }}
              />
              <TextField
                label="入庫日"
                value={head.returnedAt}
                onChange={(e) => updateHead('returnedAt', e.target.value)}
                size="small"
                type="date"
                slotProps={{ inputLabel: { shrink: true }, input: { readOnly } }}
              />
              <TextField
                label="備考"
                value={head.memo}
                onChange={(e) => updateHead('memo', e.target.value)}
                size="small"
                sx={{ minWidth: 280, flexGrow: 1 }}
                slotProps={{ input: { readOnly } }}
              />
            </Box>

            <TableContainer
              sx={{
                maxHeight: '80vh',
                // キーで移動したセルが、上の見出し・左の固定列の下に隠れないようにする
                scrollPaddingTop: HEADER_SCROLL_PADDING,
                scrollPaddingLeft: fixedWidths.reduce((sum, width) => sum + width, 0),
              }}
            >
              <Table
                ref={tableRef}
                stickyHeader
                size="small"
                sx={{ width: 'max-content' }}
                // 固定列の幅・位置（fixedCellSxが参照する）
                style={toFixedColumnVars(fixedWidths) as React.CSSProperties}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={fixedCellSx(0, true)} />
                    <TableCell sx={fixedCellSx(1, true)}>
                      種類
                      {renderResizeHandle(1)}
                    </TableCell>
                    <TableCell sx={fixedCellSx(2, true)}>
                      名称
                      {renderResizeHandle(2)}
                    </TableCell>
                    <TableCell align="center" sx={fixedCellSx(3, true)}>
                      備考
                    </TableCell>
                    <TableCell align="right" sx={fixedCellSx(4, true)}>
                      TOTAL
                    </TableCell>
                    <TableCell align="right" sx={fixedCellSx(5, true)}>
                      ACTIVE
                    </TableCell>
                    <TableCell align="center" sx={{ ...fixedCellSx(6, true), px: 1 }}>
                      SPARE
                    </TableCell>
                    <SortableContext
                      items={columns.map((column) => toColumnDragId(column.id))}
                      strategy={horizontalListSortingStrategy}
                    >
                      {columns.map((column) => (
                        <ColumnHeaderCell
                          key={column.id}
                          column={column}
                          readOnly={readOnly}
                          onLabelChange={(label) => updateColumnLabel(column.id, label)}
                          onRemove={() => requestRemoveColumn(column.id)}
                        />
                      ))}
                    </SortableContext>
                  </TableRow>
                </TableHead>
                <TableBody onKeyDown={handleQtyGridKeyDown}>
                  <SortableContext
                    items={rows.map((row) => toRowDragId(row.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    {rows.map((row, index) => (
                      <EquipmentRowView
                        key={row.id}
                        row={row}
                        index={index}
                        columns={columns}
                        kizaiOptions={kizaiOptionsByKind.get(row.kind) ?? kizaiOptions}
                        kizaiOptionsFiltered={kizaiOptionsByKind.has(row.kind)}
                        kizaiKindOptions={kindOptions}
                        readOnly={readOnly}
                        onUpdateRow={(patch) => updateRow(row.id, patch)}
                        onUpdateQty={(columnId, value) => updateQty(row.id, columnId, value)}
                        onRemoveRow={() => requestRemoveRow(row.id)}
                        onAddKizaiBelow={() => setKizaiAddTarget({ afterRowId: row.id })}
                        onInsertRowBelow={() => insertRowBelow(row.id)}
                        movingWithParent={followingRowIds.has(row.id)}
                      />
                    ))}
                  </SortableContext>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {timelineOpen && kizaihyouId !== null && (
            <EquipmentTimeline
              kizaihyouId={kizaihyouId}
              history={history}
              onClose={() => setTimelineOpen(false)}
              onError={setError}
            />
          )}
        </Box>

        {kizaihyouId !== null && (
          <MembersDialog
            open={membersOpen}
            kizaihyouId={kizaihyouId}
            isOwner={isOwner}
            onClose={() => setMembersOpen(false)}
          />
        )}

        <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)} fullWidth maxWidth="xs">
          <DialogTitle fontSize="medium">{removeTarget?.type === 'column' ? '列の削除' : '行の削除'}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{removeTarget?.message}</Typography>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" color="error" onClick={confirmRemove}>
              削除する
            </Button>
            {/* 誤操作を防ぐための確認なので、Enterで消えないようキャンセル側にフォーカスを置く */}
            <Button onClick={() => setRemoveTarget(null)} autoFocus>
              キャンセル
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={confirmEndEdit} onClose={() => setConfirmEndEdit(false)}>
          <DialogTitle fontSize="medium">保存していない変更があります</DialogTitle>
          <DialogContent>
            <Typography variant="body2">保存してから編集を終了しますか？</Typography>
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              onClick={async () => {
                setConfirmEndEdit(false);
                setBusy(true);
                setError('');
                try {
                  const result = await save();
                  if (!result.ok) {
                    showBlocked(result);
                    return;
                  }
                  await editLock.stop();
                  setMessage('保存して編集を終了しました');
                } catch {
                  setError('保存に失敗しました。');
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存して終了
            </Button>
            <Button
              color="error"
              onClick={async () => {
                setConfirmEndEdit(false);
                await editLock.stop();
                reloadLatest();
              }}
            >
              変更を破棄して終了
            </Button>
            <Button onClick={() => setConfirmEndEdit(false)}>キャンセル</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={confirmBack} onClose={() => setConfirmBack(false)}>
          <DialogTitle fontSize="medium">保存していない変更があります</DialogTitle>
          <DialogContent>
            <Typography variant="body2">変更を破棄して機材表履歴一覧に戻りますか？</Typography>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" color="error" onClick={() => router.push('/equipment-table-list')}>
              破棄して戻る
            </Button>
            <Button onClick={() => setConfirmBack(false)}>キャンセル</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle fontSize="medium">申請を取り下げる</DialogTitle>
          <DialogContent>
            <Typography variant="body2" mb={2}>
              取り下げると編集できるようになり、あらためて申請もできます。
            </Typography>
            <TextField
              label="コメント（任意）"
              value={withdrawComment}
              onChange={(e) => setWithdrawComment(e.target.value)}
              size="small"
              multiline
              minRows={3}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button variant="contained" color="warning" onClick={handleWithdraw} disabled={busy}>
              取り下げる
            </Button>
            <Button onClick={() => setWithdrawOpen(false)} disabled={busy}>
              キャンセル
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle fontSize="medium">機材表を削除する</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              機材表 {cod} を削除すると機材表履歴一覧に出なくなります。 一覧の「削除済も表示」から元に戻せます。
            </Typography>
            {detail?.juchuHeadId !== null && detail?.juchuHeadId !== undefined && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                機材管理の受注 {detail.juchuHeadId} に連携済みです。削除しても機材管理側の受注・機材明細は残ります。
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="contained" color="error" onClick={handleDelete} disabled={busy}>
              削除する
            </Button>
            <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
              キャンセル
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={confirmCopy} onClose={() => setConfirmCopy(false)}>
          <DialogTitle fontSize="medium">保存していない変更があります</DialogTitle>
          <DialogContent>
            <Typography variant="body2">流用元には保存済みの内容が使われます。保存してから流用しますか？</Typography>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => copyAndCreate(true)} disabled={busy}>
              保存して流用
            </Button>
            <Button onClick={() => copyAndCreate(false)} disabled={busy}>
              保存せずに流用
            </Button>
            <Button onClick={() => setConfirmCopy(false)} disabled={busy}>
              キャンセル
            </Button>
          </DialogActions>
        </Dialog>

        <KizaiAddDialog
          open={!!kizaiAddTarget}
          kizaiOptions={kizaiOptions}
          bumonOptions={kizaiKindOptions}
          existingKizaiIds={existingKizaiIds}
          onClose={() => setKizaiAddTarget(null)}
          onConfirm={addKizaiRows}
        />

        <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle fontSize="medium">機材表を申請する</DialogTitle>
          <DialogContent>
            {requestErrors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold">
                  次の点を直さないと申請できません
                </Typography>
                {requestErrors.map((error) => (
                  <Typography key={error} variant="body2">
                    ・{error}
                  </Typography>
                ))}
              </Alert>
            )}

            <Typography variant="body2" mb={2}>
              申請先の受注部担当者を選んでください（複数選べます。そのうち1人が承認すれば承認済になります）。
              編集中の内容も一緒に保存されます。
            </Typography>
            {juchuTantoOptions.length ? (
              <Autocomplete
                multiple
                disableCloseOnSelect
                size="small"
                options={juchuTantoOptions}
                getOptionLabel={(option) => option.userNam}
                isOptionEqualToValue={(option, value) => option.userId === value.userId}
                value={juchuTantoOptions.filter((option) => tantoUserIds.includes(option.userId))}
                onChange={(_event, value) => setTantoUserIds(value.map((option) => option.userId))}
                renderInput={(params) => <TextField {...params} label="受注部担当者（複数可）" />}
              />
            ) : (
              <Alert severity="warning">受注部担当者の権限を持つユーザーが登録されていません。</Alert>
            )}
            <TextField
              label="コメント（任意）"
              value={requestComment}
              onChange={(e) => setRequestComment(e.target.value)}
              size="small"
              multiline
              minRows={3}
              fullWidth
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              onClick={handleRequest}
              disabled={busy || !tantoUserIds.length || requestErrors.length > 0}
            >
              申請する
            </Button>
            <Button onClick={() => setRequestOpen(false)} disabled={busy}>
              キャンセル
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={message !== ''}
          autoHideDuration={3000}
          onClose={() => setMessage('')}
          message={message}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </Box>
    </DndContext>
  );
};
export default EquipmentTable;
