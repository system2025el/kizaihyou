'use client';

import { closestCenter, DndContext, DragEndEvent, Modifier, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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
import DownloadIcon from '@mui/icons-material/Download';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ForumIcon from '@mui/icons-material/Forum';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
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
import { useMemo, useState } from 'react';

import { INITIAL_COLUMN_COUNT, INITIAL_ROW_COUNT } from '@/app/_lib/equipment-table/constants';
import { downloadBase64File, PDF_MIME_TYPE, XLSM_MIME_TYPE } from '@/app/_lib/equipment-table/download';
import {
  createEquipmentTable,
  EquipmentTableDetail,
  exportEquipmentTableExcel,
  exportEquipmentTablePdf,
  saveEquipmentTable,
} from '@/app/_lib/equipment-table/funcs';
import { getActiveSum, getTotal, hasEquipmentRowContent } from '@/app/_lib/equipment-table/sheet';
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
import { EquipmentTimeline } from '@/app/_ui/equipment-timeline';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

import KizaiAddDialog, { AddedKizai } from './kizai-add-dialog';

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

const createColumn = (label: string): EquipmentColumn => ({
  id: createTempId('col'),
  label,
});

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
        minWidth: 110,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        // stickyHeaderが付ける z-index: 2 を上書きしないこと。
        // 'auto'にすると、DOM上あとに来る本体の行がヘッダーの上に描画される
        zIndex: isDragging ? 3 : 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box display="flex" alignItems="center" gap={0.5}>
        {!readOnly && (
          <IconButton size="small" sx={{ cursor: 'grab' }} title="ドラッグで並び替え" {...attributes} {...listeners}>
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        )}
        <TextField
          value={column.label}
          onChange={(e) => onLabelChange(e.target.value)}
          variant="standard"
          size="small"
          slotProps={{ input: { readOnly } }}
        />
        {!readOnly && (
          <IconButton size="small" onClick={onRemove} title="列を削除">
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
}: EquipmentRowViewProps) => {
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<HTMLElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toRowDragId(row.id),
    disabled: readOnly,
  });

  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : 'auto',
        bgcolor: isDragging ? 'background.paper' : undefined,
        // インデントの切り替えは普段は目立たせない（オプションなので）
        '&:hover .indent-toggle': { opacity: 1 },
      }}
    >
      <TableCell>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Typography variant="caption" color="text.secondary">
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
      <TableCell>
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
      <TableCell>
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
            renderInput={(params) => <TextField {...params} variant="standard" />}
          />
        </Box>
      </TableCell>
      <TableCell align="center">
        <MemoTooltip
          title={row.name || '備考'}
          memo={row.remark}
          readOnly={readOnly}
          onSave={(remark) => onUpdateRow({ remark })}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2">{getTotal(row)}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{getActiveSum(row)}</Typography>
      </TableCell>
      <TableCell>
        <TextField
          value={row.spare}
          onChange={(e) => onUpdateRow({ spare: e.target.value })}
          variant="standard"
          size="small"
          type="number"
          sx={{ width: 64 }}
          slotProps={{ input: { readOnly } }}
        />
      </TableCell>
      {columns.map((column) => (
        <TableCell key={column.id}>
          <TextField
            value={row.qty[column.id] ?? ''}
            onChange={(e) => onUpdateQty(column.id, e.target.value)}
            variant="standard"
            size="small"
            type="number"
            sx={{ width: 64 }}
            slotProps={{ input: { readOnly } }}
          />
        </TableCell>
      ))}
    </TableRow>
  );
};

type EquipmentTableProps = {
  /** まだ保存していない（新規作成の）機材表ならnull */
  detail: EquipmentTableDetail | null;
  kizaiOptions: KizaiOption[];
  kizaiKindOptions: BumonOption[];
  juchuTantoOptions: JuchuTantoOption[];
  history: EquipmentTableHistoryEntry[];
};

const EquipmentTable = ({
  detail,
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
  const [kizaiAddTarget, setKizaiAddTarget] = useState<{
    afterRowId: string | null;
  } | null>(null);
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

  // 申請中は承認者が申請時点の内容を見ているので、こちらからは触らせない
  const readOnly = READ_ONLY_STATUSES.includes(status);
  const canRequest = REQUESTABLE_STATUSES.includes(status);

  // 未保存の変更があるかは、最後に保存した内容とのスナップショット比較で判定する
  const [savedSnapshot, setSavedSnapshot] = useState(() => toSnapshot(head, columns, rows));
  const currentSnapshot = useMemo(() => toSnapshot(head, columns, rows), [head, columns, rows]);
  const isDirty = currentSnapshot !== savedSnapshot;

  // 申請にだけ必要な入力チェック（保存は書きかけでもできる）
  const requestErrors = useMemo(() => validateForRequest(head, rows), [head, rows]);

  const addRow = () => setRows((prev) => [...prev, createRow()]);

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
  const removeRow = (id: string) => setRows((prev) => prev.filter((row) => row.id !== id));
  const insertRowBelow = (id: string) =>
    setRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      return [...prev.slice(0, index + 1), createRow(), ...prev.slice(index + 1)];
    });

  const addColumn = () => setColumns((prev) => [...prev, createColumn('')]);
  const removeColumn = (id: string) => {
    setColumns((prev) => prev.filter((column) => column.id !== id));
    setRows((prev) =>
      prev.map((row) => {
        const qty = { ...row.qty };
        delete qty[id];
        return { ...row, qty };
      })
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = fromDragId(String(active.id));
    const overId = fromDragId(String(over.id));

    if (isRowDragId(String(active.id))) {
      setRows((prev) => {
        const oldIndex = prev.findIndex((row) => row.id === activeId);
        const newIndex = prev.findIndex((row) => row.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      return;
    }

    setColumns((prev) => {
      const oldIndex = prev.findIndex((column) => column.id === activeId);
      const newIndex = prev.findIndex((column) => column.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const updateRow = (id: string, patch: Partial<EquipmentRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const updateQty = (rowId: string, columnId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, qty: { ...row.qty, [columnId]: value } } : row)));
  };

  const updateColumnLabel = (id: string, label: string) => {
    setColumns((prev) => prev.map((column) => (column.id === id ? { ...column, label } : column)));
  };

  /**
   * 保存する。まだ保存していない機材表ならここで作成する。
   * recordHistory=falseは申請の直前の保存用（「申請」の履歴にスナップショットを残すため）。
   *
   * @returns 機材表のkizaihyou_id（新規作成ならここで採番されたもの）
   */
  const save = async (recordHistory = true): Promise<number> => {
    const snapshot = toSnapshot(head, columns, rows);

    if (kizaihyouId === null) {
      const createdId = await createEquipmentTable(head, columns, rows);
      setSavedSnapshot(snapshot);
      return createdId;
    }

    await saveEquipmentTable(kizaihyouId, head, columns, rows, recordHistory);
    setSavedSnapshot(snapshot);
    // 保存で列・行のidが採番し直されるため、サーバーから読み直す
    router.refresh();
    return kizaihyouId;
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
      const savedId = await save();
      if (kizaihyouId === null) {
        // 採番されたIDの画面へ。戻るで未保存の画面に戻らないようreplaceする
        router.replace(`/equipment-table/${savedId}`);
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
      const savedId = await save(false);
      await requestEquipmentTable(savedId, tantoUserIds, requestComment.trim());
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
      if (saveFirst) await save();
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
    if (isDirty) {
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
      onDragEnd={handleDragEnd}
    >
      <Box p={2}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton onClick={handleBack} title="機材表履歴一覧に戻る">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">機材表 {cod || '（新規作成）'}</Typography>
            <Chip label={status} size="small" />
          </Box>
          <Box display="flex" gap={1}>
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
            <Button
              startIcon={<ForumIcon />}
              onClick={() => setTimelineOpen((prev) => !prev)}
              disabled={kizaihyouId === null}
            >
              タイムライン
            </Button>
            <Button startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={busy || kizaihyouId === null}>
              流用して新規作成
            </Button>
            <Button startIcon={<DownloadIcon />} onClick={handleExportExcel} disabled={busy}>
              Excel出力
            </Button>
            <Button startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={busy}>
              PDF出力
            </Button>
            {status === '完了' ? (
              <Button startIcon={<LockOpenIcon />} onClick={handleReopen} disabled={busy}>
                作成中に戻す
              </Button>
            ) : (
              <Button
                startIcon={<TaskAltIcon />}
                onClick={handleComplete}
                disabled={busy || kizaihyouId === null || !COMPLETABLE_STATUSES.includes(status)}
              >
                完了にする
              </Button>
            )}
            <Button
              startIcon={<DeleteForeverIcon />}
              color="error"
              onClick={() => setDeleteOpen(true)}
              disabled={busy || kizaihyouId === null || status === '申請中'}
            >
              削除
            </Button>
            <Button startIcon={<SaveIcon />} variant="outlined" onClick={handleSave} disabled={busy || readOnly}>
              保存
            </Button>
            {status === '申請中' ? (
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
                disabled={busy || !canRequest}
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
        {readOnly && (
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
                onChange={(e) => setHead({ ...head, eventName: e.target.value })}
                size="small"
                sx={{ minWidth: 260 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="場所"
                value={head.place}
                onChange={(e) => setHead({ ...head, place: e.target.value })}
                size="small"
                sx={{ minWidth: 200 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="顧客名"
                value={head.clientName}
                onChange={(e) => setHead({ ...head, clientName: e.target.value })}
                size="small"
                sx={{ minWidth: 200 }}
                slotProps={{ input: { readOnly } }}
              />
              <TextField
                label="出庫日"
                value={head.shippedAt}
                onChange={(e) => setHead({ ...head, shippedAt: e.target.value })}
                size="small"
                type="date"
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { readOnly },
                }}
              />
              <TextField
                label="入庫日"
                value={head.returnedAt}
                onChange={(e) => setHead({ ...head, returnedAt: e.target.value })}
                size="small"
                type="date"
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { readOnly },
                }}
              />
              <TextField
                label="備考"
                value={head.memo}
                onChange={(e) => setHead({ ...head, memo: e.target.value })}
                size="small"
                sx={{ minWidth: 280, flexGrow: 1 }}
                slotProps={{ input: { readOnly } }}
              />
            </Box>

            <TableContainer sx={{ maxHeight: '80vh' }}>
              <Table stickyHeader size="small" sx={{ width: 'max-content' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 165 }} />
                    <TableCell sx={{ minWidth: 140 }}>種類</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>名称</TableCell>
                    <TableCell align="center" sx={{ minWidth: 60 }}>
                      備考
                    </TableCell>
                    <TableCell sx={{ minWidth: 70 }}>TOTAL</TableCell>
                    <TableCell sx={{ minWidth: 70 }}>ACTIVE</TableCell>
                    <TableCell sx={{ minWidth: 70 }}>SPARE</TableCell>
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
                          onRemove={() => removeColumn(column.id)}
                        />
                      ))}
                    </SortableContext>
                  </TableRow>
                </TableHead>
                <TableBody>
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
                        onRemoveRow={() => removeRow(row.id)}
                        onAddKizaiBelow={() => setKizaiAddTarget({ afterRowId: row.id })}
                        onInsertRowBelow={() => insertRowBelow(row.id)}
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
