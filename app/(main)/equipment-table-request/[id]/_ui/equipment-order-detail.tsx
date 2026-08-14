'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { EquipmentTableDetail } from '@/app/_lib/equipment-table/funcs';
import { approveEquipmentTable, rejectEquipmentTable } from '@/app/_lib/equipment-table-list/funcs';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

import { addDays, buildDateList, formatMd, isSameDay, parseDisplayDate } from '../_lib/date-utils';
import { MOCK_BASE_STOCK } from '../_lib/mock-data';
import { EquipmentOrderRow } from '../_lib/types';

const RANGE_START_COLOR = '#BBDEFB';
const RANGE_END_COLOR = '#FFF59D';
const IN_RANGE_COLOR = '#ACB9CA';
const TOTAL_COLUMN_COLOR = '#E3F2FD';

// 固定列(左側)の累積オフセット。sticky配置に使う。
const STICKY_LEFT = { select: 0, memo: 40, name: 80, total: 300, ordered: 360, spare: 430, contact: 500 };

/** 機材表の行を受注明細（機材）の行に読み替える。名称未入力の行は対象外。 */
const toOrderRows = (detail: EquipmentTableDetail): EquipmentOrderRow[] =>
  detail.rows
    .filter((row) => row.name.trim() !== '')
    .map((row) => ({
      id: row.id,
      kizaiName: row.name,
      mem: row.remark,
      mem2: '',
      orderedQty: Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0),
      spareQty: Number(row.spare) || 0,
      baseStock: MOCK_BASE_STOCK,
    }));

type Props = { detail: EquipmentTableDetail };

const EquipmentOrderDetail = ({ detail }: Props) => {
  const router = useRouter();
  const [rows, setRows] = useState<EquipmentOrderRow[]>(() => toOrderRows(detail));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [actionType, setActionType] = useState<'承認' | '差戻し' | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openAction = (type: '承認' | '差戻し') => {
    setComment('');
    setError('');
    setActionType(type);
  };

  const handleConfirmAction = async () => {
    if (!actionType) return;
    setBusy(true);
    try {
      if (actionType === '承認') {
        await approveEquipmentTable(detail.id, comment);
      } else {
        await rejectEquipmentTable(detail.id, comment);
      }
      setActionType(null);
      router.push('/equipment-table-request');
    } catch {
      setError(`${actionType}に失敗しました。`);
      setBusy(false);
    }
  };

  const updateRow = (rowId: string, patch: Partial<EquipmentOrderRow>) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const toggleSelected = (rowId: string) => {
    setSelected((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  const { dateList, rangeStart, rangeEnd } = useMemo(() => {
    if (!detail.head.shippedAt || !detail.head.returnedAt) {
      return { dateList: [] as Date[], rangeStart: null as Date | null, rangeEnd: null as Date | null };
    }
    const start = parseDisplayDate(detail.head.shippedAt);
    const end = parseDisplayDate(detail.head.returnedAt);
    return { dateList: buildDateList(addDays(start, -1), addDays(end, 8)), rangeStart: start, rangeEnd: end };
  }, [detail.head.shippedAt, detail.head.returnedAt]);

  const isInRange = (date: Date) =>
    rangeStart !== null &&
    rangeEnd !== null &&
    date.getTime() >= rangeStart.getTime() &&
    date.getTime() <= rangeEnd.getTime();

  const getCellColor = (date: Date) => {
    if (rangeEnd && isSameDay(date, rangeEnd)) return RANGE_END_COLOR;
    if (rangeStart && isSameDay(date, rangeStart)) return RANGE_START_COLOR;
    if (isInRange(date)) return IN_RANGE_COLOR;
    return '#FFFFFF';
  };

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => router.push('/equipment-table-request')} title="一覧に戻る">
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5">
              {detail.cod} {detail.head.eventName} の受注明細（機材）
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {detail.head.place} ／ {detail.head.clientName} ／ 出庫日 {detail.head.shippedAt || '-'} ／ 入庫日{' '}
              {detail.head.returnedAt || '-'}
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1}>
          <Button variant="contained" color="success" onClick={() => openAction('承認')} disabled={busy}>
            承認
          </Button>
          <Button variant="outlined" color="error" onClick={() => openAction('差戻し')} disabled={busy}>
            差し戻し
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer sx={{ maxHeight: '80vh' }}>
        <Table stickyHeader size="small" sx={{ width: 'max-content' }}>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.select,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 40,
                }}
              />
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.memo,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 40,
                }}
              >
                メモ
              </TableCell>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.name,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 220,
                }}
              >
                機材名
              </TableCell>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.total,
                  zIndex: 3,
                  bgcolor: TOTAL_COLUMN_COLOR,
                  minWidth: 60,
                }}
              >
                合計
              </TableCell>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.ordered,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 70,
                }}
              >
                受注
              </TableCell>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.spare,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 70,
                }}
              >
                予備
              </TableCell>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: STICKY_LEFT.contact,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                  minWidth: 40,
                }}
              >
                連絡
              </TableCell>
              {dateList.map((date) => (
                <TableCell
                  key={date.getTime()}
                  align="center"
                  sx={{ minWidth: 56, color: isInRange(date) ? 'primary.main' : 'text.primary' }}
                >
                  {formatMd(date)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7 + dateList.length} align="center">
                  機材が登録されていません
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const total = row.orderedQty + row.spareQty;
              return (
                <TableRow key={row.id}>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.select, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    <Checkbox size="small" checked={!!selected[row.id]} onChange={() => toggleSelected(row.id)} />
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.memo, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    <MemoTooltip title={row.kizaiName} memo={row.mem} onSave={(mem) => updateRow(row.id, { mem })} />
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.name, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    {row.kizaiName}
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.total, zIndex: 1, bgcolor: TOTAL_COLUMN_COLOR }}
                  >
                    {total}
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.ordered, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    <TextField
                      value={row.orderedQty}
                      onChange={(e) =>
                        updateRow(row.id, { orderedQty: Number(e.target.value.replace(/\D/g, '')) || 0 })
                      }
                      variant="standard"
                      size="small"
                      type="number"
                      sx={{ width: 56 }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.spare, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    <TextField
                      value={row.spareQty}
                      onChange={(e) => updateRow(row.id, { spareQty: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      variant="standard"
                      size="small"
                      type="number"
                      sx={{ width: 56 }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{ position: 'sticky', left: STICKY_LEFT.contact, zIndex: 1, bgcolor: 'background.paper' }}
                  >
                    <MemoTooltip title={row.kizaiName} memo={row.mem2} onSave={(mem2) => updateRow(row.id, { mem2 })} />
                  </TableCell>
                  {dateList.map((date) => {
                    const stock = isInRange(date) ? row.baseStock - total : row.baseStock;
                    return (
                      <TableCell
                        key={date.getTime()}
                        align="center"
                        sx={{ bgcolor: getCellColor(date), color: stock < 0 ? 'error.main' : 'text.primary' }}
                      >
                        {stock}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={actionType !== null} onClose={() => setActionType(null)}>
        <DialogTitle fontSize="medium">
          {detail.cod} {detail.head.eventName} を{actionType}
        </DialogTitle>
        <DialogContent>
          <TextField
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            label="コメント（任意）"
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleConfirmAction}
            variant="contained"
            color={actionType === '承認' ? 'success' : 'error'}
            disabled={busy}
          >
            {actionType}する
          </Button>
          <Button onClick={() => setActionType(null)}>キャンセル</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default EquipmentOrderDetail;
