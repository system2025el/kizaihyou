'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
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

let columnIdCounter = 0;
const createColumn = (label: string): EquipmentColumn => {
  columnIdCounter += 1;
  return { id: `col-${columnIdCounter}`, label };
};

const initialColumns = DEFAULT_COLUMN_LABELS.map(createColumn);
const initialRows = Array.from({ length: INITIAL_ROW_COUNT }, createRow);

const EquipmentTable = () => {
  const [columns, setColumns] = useState<EquipmentColumn[]>(initialColumns);
  const [rows, setRows] = useState<EquipmentRow[]>(initialRows);

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
              <TableCell sx={{ minWidth: 56 }} />
              <TableCell sx={{ minWidth: 140 }}>種類</TableCell>
              <TableCell sx={{ minWidth: 220 }}>名称</TableCell>
              <TableCell sx={{ minWidth: 160 }}>備考</TableCell>
              <TableCell sx={{ minWidth: 70 }}>TOTAL</TableCell>
              <TableCell sx={{ minWidth: 70 }}>ACTIVE</TableCell>
              <TableCell sx={{ minWidth: 70 }}>SPARE</TableCell>
              {columns.map((column) => (
                <TableCell key={column.id} sx={{ minWidth: 110 }}>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <TextField
                      value={column.label}
                      onChange={(e) => updateColumnLabel(column.id, e.target.value)}
                      variant="standard"
                      size="small"
                    />
                    <IconButton size="small" onClick={() => removeColumn(column.id)} title="列を削除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </TableCell>
              ))}
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
  );
};
export default EquipmentTable;
