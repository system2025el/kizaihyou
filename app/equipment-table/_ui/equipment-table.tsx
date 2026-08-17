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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  createFilterOptions,
  IconButton,
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EquipmentTableDetail, saveEquipmentTable } from '@/app/_lib/equipment-table/funcs';
import { EquipmentColumn, EquipmentRow, KizaiOption } from '@/app/_lib/equipment-table/types';
import { requestEquipmentTable } from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableHead, EquipmentTableStatus } from '@/app/_lib/equipment-table-list/types';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

/** 未保存の行・列に付ける一時id。保存するとDBの採番したidに置き換わる */
let tempIdCounter = 0;
const createTempId = (prefix: string) => {
  tempIdCounter += 1;
  return `${prefix}-new-${tempIdCounter}`;
};

const createRow = (): EquipmentRow => ({
  id: createTempId('row'),
  kind: '',
  kizaiId: null,
  name: '',
  remark: '',
  spare: '',
  qty: {},
});

const createColumn = (label: string): EquipmentColumn => ({ id: createTempId('col'), label });

const getActiveSum = (row: EquipmentRow) =>
  Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getTotal = (row: EquipmentRow) => getActiveSum(row) + (Number(row.spare) || 0);

// 行(row-*)は縦方向、列(col-*)は横方向のみに移動を制限する
const restrictAxisByDraggedType: Modifier = (args) => {
  const isRow = typeof args.active?.id === 'string' && args.active.id.startsWith('row');
  return isRow ? restrictToVerticalAxis(args) : restrictToHorizontalAxis(args);
};

// 候補が1000件を超えるため、表示件数を絞って描画コストを抑える
const filterKizaiOptions = createFilterOptions<KizaiOption>({
  limit: 50,
  stringify: (option) => option.kizaiNam,
});

/** 申請できるステータス（承認待ち・承認済みからは再申請しない） */
const REQUESTABLE_STATUSES: EquipmentTableStatus[] = ['作成中', '差戻し'];

type ColumnHeaderCellProps = {
  column: EquipmentColumn;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
};

const ColumnHeaderCell = ({ column, onLabelChange, onRemove }: ColumnHeaderCellProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });

  return (
    <TableCell
      ref={setNodeRef}
      sx={{
        minWidth: 110,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : 'auto',
        bgcolor: 'background.paper',
      }}
    >
      <Box display="flex" alignItems="center" gap={0.5}>
        <IconButton size="small" sx={{ cursor: 'grab' }} title="ドラッグで並び替え" {...attributes} {...listeners}>
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
        <TextField
          value={column.label}
          onChange={(e) => onLabelChange(e.target.value)}
          variant="standard"
          size="small"
        />
        <IconButton size="small" onClick={onRemove} title="列を削除">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </TableCell>
  );
};

type EquipmentRowViewProps = {
  row: EquipmentRow;
  index: number;
  columns: EquipmentColumn[];
  kizaiOptions: KizaiOption[];
  onUpdateRow: (patch: Partial<EquipmentRow>) => void;
  onUpdateQty: (columnId: string, value: string) => void;
  onRemoveRow: () => void;
};

const EquipmentRowView = ({
  row,
  index,
  columns,
  kizaiOptions,
  onUpdateRow,
  onUpdateQty,
  onRemoveRow,
}: EquipmentRowViewProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : 'auto',
        bgcolor: isDragging ? 'background.paper' : undefined,
      }}
    >
      <TableCell>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Typography variant="caption" color="text.secondary">
            {index + 1}
          </Typography>
          <IconButton size="small" sx={{ cursor: 'grab' }} title="ドラッグで並び替え" {...attributes} {...listeners}>
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onRemoveRow} title="行を削除">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </TableCell>
      <TableCell>
        <TextField
          value={row.kind}
          onChange={(e) => onUpdateRow({ kind: e.target.value })}
          variant="standard"
          size="small"
          fullWidth
        />
      </TableCell>
      <TableCell>
        <Autocomplete
          freeSolo
          size="small"
          options={kizaiOptions}
          filterOptions={filterKizaiOptions}
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
      </TableCell>
      <TableCell align="center">
        <MemoTooltip title={row.name || '備考'} memo={row.remark} onSave={(remark) => onUpdateRow({ remark })} />
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
          />
        </TableCell>
      ))}
    </TableRow>
  );
};

type EquipmentTableProps = {
  detail: EquipmentTableDetail;
  kizaiOptions: KizaiOption[];
};

const EquipmentTable = ({ detail, kizaiOptions }: EquipmentTableProps) => {
  const router = useRouter();
  const [head, setHead] = useState<EquipmentTableHead>(detail.head);
  const [columns, setColumns] = useState<EquipmentColumn[]>(detail.columns);
  const [rows, setRows] = useState<EquipmentRow[]>(detail.rows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const addRow = () => setRows((prev) => [...prev, createRow()]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((row) => row.id !== id));

  const addColumn = () => setColumns((prev) => [...prev, createColumn(`列${prev.length + 1}`)]);
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
    const activeId = String(active.id);
    if (activeId.startsWith('row')) {
      setRows((prev) => {
        const oldIndex = prev.findIndex((row) => row.id === active.id);
        const newIndex = prev.findIndex((row) => row.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    } else {
      setColumns((prev) => {
        const oldIndex = prev.findIndex((column) => column.id === active.id);
        const newIndex = prev.findIndex((column) => column.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
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

  const save = async () => {
    await saveEquipmentTable(detail.id, head, columns, rows);
    // 保存で列・行のidが採番し直されるため、サーバーから読み直す
    router.refresh();
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      await save();
      setMessage('保存しました');
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async () => {
    setBusy(true);
    setError('');
    try {
      await save();
      await requestEquipmentTable(detail.id);
      setMessage('申請しました');
      router.push('/equipment-table-list');
    } catch {
      setError('申請に失敗しました。');
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
            <IconButton onClick={() => router.push('/equipment-table-list')} title="機材表履歴一覧に戻る">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5">機材表 {detail.cod}</Typography>
            <Chip label={detail.status} size="small" />
          </Box>
          <Box display="flex" gap={1}>
            <Button startIcon={<AddIcon />} onClick={addRow}>
              行を追加
            </Button>
            <Button startIcon={<AddIcon />} onClick={addColumn}>
              列を追加
            </Button>
            <Button startIcon={<SaveIcon />} variant="outlined" onClick={handleSave} disabled={busy}>
              保存
            </Button>
            <Button
              startIcon={<SendIcon />}
              variant="contained"
              onClick={handleRequest}
              disabled={busy || !REQUESTABLE_STATUSES.includes(detail.status)}
            >
              申請
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box display="flex" flexWrap="wrap" gap={2} mb={2}>
          <TextField
            label="公演名"
            value={head.eventName}
            onChange={(e) => setHead({ ...head, eventName: e.target.value })}
            size="small"
            sx={{ minWidth: 260 }}
          />
          <TextField
            label="場所"
            value={head.place}
            onChange={(e) => setHead({ ...head, place: e.target.value })}
            size="small"
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="顧客名"
            value={head.clientName}
            onChange={(e) => setHead({ ...head, clientName: e.target.value })}
            size="small"
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="出庫日"
            value={head.shippedAt}
            onChange={(e) => setHead({ ...head, shippedAt: e.target.value })}
            size="small"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="入庫日"
            value={head.returnedAt}
            onChange={(e) => setHead({ ...head, returnedAt: e.target.value })}
            size="small"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>

        <TableContainer sx={{ maxHeight: '80vh' }}>
          <Table stickyHeader size="small" sx={{ width: 'max-content' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 130 }} />
                <TableCell sx={{ minWidth: 140 }}>種類</TableCell>
                <TableCell sx={{ minWidth: 220 }}>名称</TableCell>
                <TableCell align="center" sx={{ minWidth: 60 }}>
                  備考
                </TableCell>
                <TableCell sx={{ minWidth: 70 }}>TOTAL</TableCell>
                <TableCell sx={{ minWidth: 70 }}>ACTIVE</TableCell>
                <TableCell sx={{ minWidth: 70 }}>SPARE</TableCell>
                <SortableContext items={columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
                  {columns.map((column) => (
                    <ColumnHeaderCell
                      key={column.id}
                      column={column}
                      onLabelChange={(label) => updateColumnLabel(column.id, label)}
                      onRemove={() => removeColumn(column.id)}
                    />
                  ))}
                </SortableContext>
              </TableRow>
            </TableHead>
            <TableBody>
              <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                {rows.map((row, index) => (
                  <EquipmentRowView
                    key={row.id}
                    row={row}
                    index={index}
                    columns={columns}
                    kizaiOptions={kizaiOptions}
                    onUpdateRow={(patch) => updateRow(row.id, patch)}
                    onUpdateQty={(columnId, value) => updateQty(row.id, columnId, value)}
                    onRemoveRow={() => removeRow(row.id)}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </TableContainer>

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
