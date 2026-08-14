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
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { DEFAULT_COLUMN_LABELS, EQUIPMENT_NAME_OPTIONS } from '@/app/_lib/equipment-table/mock-data';
import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

const INITIAL_ROW_COUNT = 10;

let rowIdCounter = 0;
const createRow = (): EquipmentRow => {
  rowIdCounter += 1;
  return { id: `row-${rowIdCounter}`, kind: '', name: '', remark: '', spare: '', qty: {} };
};

const getActiveSum = (row: EquipmentRow) =>
  Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getTotal = (row: EquipmentRow) => getActiveSum(row) + (Number(row.spare) || 0);

let columnIdCounter = 0;
const createColumn = (label: string): EquipmentColumn => {
  columnIdCounter += 1;
  return { id: `col-${columnIdCounter}`, label };
};

const createDefaultColumns = () => DEFAULT_COLUMN_LABELS.map(createColumn);
const createDefaultRows = () => Array.from({ length: INITIAL_ROW_COUNT }, createRow);

// 既存データ(読み込んだ機材表の内容など)に含まれるidより後の番号から
// 採番が続くようカウンタを底上げする。衝突したidの重複描画を防ぐため。
const bumpCounterPastIds = (ids: string[], prefix: string, current: number) => {
  let max = current;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const num = Number(id.slice(prefix.length));
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return max;
};

// 行(row-*)は縦方向、列(col-*)は横方向のみに移動を制限する
const restrictAxisByDraggedType: Modifier = (args) => {
  const isRow = typeof args.active?.id === 'string' && args.active.id.startsWith('row-');
  return isRow ? restrictToVerticalAxis(args) : restrictToHorizontalAxis(args);
};

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
  onUpdateRow: (patch: Partial<EquipmentRow>) => void;
  onUpdateQty: (columnId: string, value: string) => void;
  onRemoveRow: () => void;
};

const EquipmentRowView = ({ row, index, columns, onUpdateRow, onUpdateQty, onRemoveRow }: EquipmentRowViewProps) => {
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
          options={EQUIPMENT_NAME_OPTIONS}
          inputValue={row.name}
          onInputChange={(_event, value) => onUpdateRow({ name: value })}
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
  title?: string;
  initialColumns?: EquipmentColumn[];
  initialRows?: EquipmentRow[];
};

const EquipmentTable = ({ title, initialColumns, initialRows }: EquipmentTableProps) => {
  const [columns, setColumns] = useState<EquipmentColumn[]>(() => {
    const cols = initialColumns ?? createDefaultColumns();
    columnIdCounter = bumpCounterPastIds(
      cols.map((c) => c.id),
      'col-',
      columnIdCounter
    );
    return cols;
  });
  const [rows, setRows] = useState<EquipmentRow[]>(() => {
    const rws = initialRows ?? createDefaultRows();
    rowIdCounter = bumpCounterPastIds(
      rws.map((r) => r.id),
      'row-',
      rowIdCounter
    );
    return rws;
  });
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
    if (activeId.startsWith('row-')) {
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
          <Typography variant="h5">{title ?? '機材表（モック）'}</Typography>
          <Box display="flex" gap={1}>
            <Button startIcon={<AddIcon />} onClick={addRow}>
              行を追加
            </Button>
            <Button startIcon={<AddIcon />} onClick={addColumn}>
              列を追加
            </Button>
          </Box>
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
                    onUpdateRow={(patch) => updateRow(row.id, patch)}
                    onUpdateQty={(columnId, value) => updateQty(row.id, columnId, value)}
                    onRemoveRow={() => removeRow(row.id)}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </DndContext>
  );
};
export default EquipmentTable;
