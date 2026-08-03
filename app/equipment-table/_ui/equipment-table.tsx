'use client';

import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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

import { DEFAULT_COLUMN_LABELS, EQUIPMENT_NAME_OPTIONS } from '../_lib/mock-data';
import { EquipmentColumn, EquipmentRow } from '../_lib/types';

const INITIAL_ROW_COUNT = 10;

let rowIdCounter = 0;
const createRow = (): EquipmentRow => {
  rowIdCounter += 1;
  return { id: `row-${rowIdCounter}`, kind: '', name: '', remark: '', spare: '', qty: {} };
};

const getActiveSum = (row: EquipmentRow) =>
  Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0);

const getTotal = (row: EquipmentRow) => getActiveSum(row) + (Number(row.spare) || 0);

const moveItem = <T,>(list: T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

let columnIdCounter = 0;
const createColumn = (label: string): EquipmentColumn => {
  columnIdCounter += 1;
  return { id: `col-${columnIdCounter}`, label };
};

const initialColumns = DEFAULT_COLUMN_LABELS.map(createColumn);
const initialRows = Array.from({ length: INITIAL_ROW_COUNT }, createRow);

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

const EquipmentTable = () => {
  const [columns, setColumns] = useState<EquipmentColumn[]>(initialColumns);
  const [rows, setRows] = useState<EquipmentRow[]>(initialRows);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const addRow = () => setRows((prev) => [...prev, createRow()]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((row) => row.id !== id));
  const moveRow = (id: string, direction: -1 | 1) => {
    setRows((prev) =>
      moveItem(
        prev,
        prev.findIndex((row) => row.id === id),
        direction
      )
    );
  };

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
  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumns((prev) => {
      const oldIndex = prev.findIndex((column) => column.id === active.id);
      const newIndex = prev.findIndex((column) => column.id === over.id);
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

  return (
    <DndContext
      id="equipment-table-columns"
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleColumnDragEnd}
    >
      <Box p={2}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h5">機材表（モック）</Typography>
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
                <TableCell sx={{ minWidth: 160 }}>備考</TableCell>
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
              {rows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {index + 1}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => moveRow(row.id, -1)}
                        disabled={index === 0}
                        title="行を上に移動"
                      >
                        <KeyboardArrowUpIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => moveRow(row.id, 1)}
                        disabled={index === rows.length - 1}
                        title="行を下に移動"
                      >
                        <KeyboardArrowDownIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => removeRow(row.id)} title="行を削除">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={row.kind}
                      onChange={(e) => updateRow(row.id, { kind: e.target.value })}
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
                      onInputChange={(_event, value) => updateRow(row.id, { name: value })}
                      renderInput={(params) => <TextField {...params} variant="standard" />}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={row.remark}
                      onChange={(e) => updateRow(row.id, { remark: e.target.value })}
                      variant="standard"
                      size="small"
                      fullWidth
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
                      onChange={(e) => updateRow(row.id, { spare: e.target.value })}
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
                        onChange={(e) => updateQty(row.id, column.id, e.target.value)}
                        variant="standard"
                        size="small"
                        type="number"
                        sx={{ width: 64 }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </DndContext>
  );
};
export default EquipmentTable;
