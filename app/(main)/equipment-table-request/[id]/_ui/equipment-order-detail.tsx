'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ForumIcon from '@mui/icons-material/Forum';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { EquipmentTableApproval } from '@/app/_lib/equipment-table/funcs';
import { approveEquipmentTable, rejectEquipmentTable } from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableHistoryEntry } from '@/app/_lib/equipment-table-list/types';
import { EquipmentTimeline } from '@/app/_ui/equipment-timeline';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

import { buildStockDateRange, formatIsoDate, formatMd, isSameDay } from '../_lib/date-utils';
import { EquipmentOrderRow, EquipmentStockMap } from '../_lib/types';

const RANGE_START_COLOR = '#BBDEFB';
const RANGE_END_COLOR = '#FFF59D';
const IN_RANGE_COLOR = '#ACB9CA';
const TOTAL_COLUMN_COLOR = '#E3F2FD';

// 固定列(左側)の累積オフセット。sticky配置に使う。
const STICKY_LEFT = { select: 0, memo: 40, name: 80, total: 300, ordered: 360, spare: 430, contact: 500 };

/** 機材表の行を承認画面の行に読み替える。名称未入力の行は対象外。 */
const toOrderRows = (rows: EquipmentTableApproval['rows']): EquipmentOrderRow[] =>
  rows
    .filter((row) => row.name.trim() !== '')
    .map((row) => ({
      id: row.id,
      kizaiId: row.kizaiId,
      kizaiName: row.name,
      mem: row.remark,
      mem2: '',
      orderedQty: Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0),
      spareQty: Number(row.spare) || 0,
    }));

type Props = {
  approval: EquipmentTableApproval;
  stockMap: EquipmentStockMap;
  history: EquipmentTableHistoryEntry[];
};

const EquipmentOrderDetail = ({ approval, stockMap, history }: Props) => {
  const router = useRouter();
  const head = approval.head;
  const [rows, setRows] = useState<EquipmentOrderRow[]>(() => toOrderRows(approval.rows));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [actionType, setActionType] = useState<'承認' | '差戻し' | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(true);

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
        await approveEquipmentTable(approval.id, comment);
      } else {
        await rejectEquipmentTable(approval.id, comment);
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
    const range = buildStockDateRange(head.shippedAt, head.returnedAt);
    if (!range) return { dateList: [] as Date[], rangeStart: null as Date | null, rangeEnd: null as Date | null };
    return { dateList: range.dates, rangeStart: range.rangeStart, rangeEnd: range.rangeEnd };
  }, [head.shippedAt, head.returnedAt]);

  /**
   * その日の在庫数。kikikanの在庫にはこの機材表の分が入っていないので、
   * 出庫日〜入庫日は画面の合計数を引いて表示する。
   * kikikanの機材マスタに紐づいていない行（手入力の名称）は在庫を出せない。
   */
  const getStock = (row: EquipmentOrderRow, date: Date) => {
    const stock = row.kizaiId === null ? undefined : stockMap[row.kizaiId];
    if (!stock) return null;

    // 引き当てのある日だけ行があるので、無い日は保有数がそのまま在庫数になる
    const base = stock.stockByDate[formatIsoDate(date)] ?? stock.kizaiQty;
    return isInRange(date) ? base - (row.orderedQty + row.spareQty) : base;
  };

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
          {approval.hisId && (
            // 申請された内容を機材表の形で確認するための導線。承認作業を中断させないよう別タブで開く
            <IconButton
              component={Link}
              href={`/equipment-table/${approval.id}/snapshot/${approval.hisId}`}
              target="_blank"
              title="申請された機材表を別タブで開く"
            >
              <OpenInNewIcon />
            </IconButton>
          )}
          <Box>
            <Typography variant="h5">
              {approval.cod} {head.eventName} の機材表承認
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {head.place} ／ {head.clientName} ／ 出庫日 {head.shippedAt || '-'} ／ 入庫日 {head.returnedAt || '-'}
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1}>
          <Button startIcon={<ForumIcon />} onClick={() => setTimelineOpen((prev) => !prev)}>
            タイムライン
          </Button>
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

      {approval.fromSnapshot ? (
        <Alert severity={approval.editedAfterRequest ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {approval.requestedAt} に {approval.requesterName} が申請した時点の内容です。
          {approval.editedAfterRequest && '　※申請後に機材表が編集されています（表示・承認の対象は申請時点の内容です）'}
          {approval.requestComment && (
            <Typography variant="body2" whiteSpace="pre-wrap" mt={1}>
              申請コメント：{approval.requestComment}
            </Typography>
          )}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          申請時点の内容が記録されていないため、現在の機材表の内容を表示しています。
        </Alert>
      )}

      <Box display="flex" gap={2} alignItems="flex-start">
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
                        onChange={(e) =>
                          updateRow(row.id, { spareQty: Number(e.target.value.replace(/\D/g, '')) || 0 })
                        }
                        variant="standard"
                        size="small"
                        type="number"
                        sx={{ width: 56 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{ position: 'sticky', left: STICKY_LEFT.contact, zIndex: 1, bgcolor: 'background.paper' }}
                    >
                      <MemoTooltip
                        title={row.kizaiName}
                        memo={row.mem2}
                        onSave={(mem2) => updateRow(row.id, { mem2 })}
                      />
                    </TableCell>
                    {dateList.map((date) => {
                      const stock = getStock(row, date);
                      return (
                        <TableCell
                          key={date.getTime()}
                          align="center"
                          sx={{
                            bgcolor: getCellColor(date),
                            color: stock !== null && stock < 0 ? 'error.main' : 'text.primary',
                          }}
                        >
                          {stock ?? '-'}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {timelineOpen && (
          <EquipmentTimeline
            kizaihyouId={approval.id}
            history={history}
            onClose={() => setTimelineOpen(false)}
            onError={setError}
          />
        )}
      </Box>

      <Dialog open={actionType !== null} onClose={() => setActionType(null)}>
        <DialogTitle fontSize="medium">
          {approval.cod} {head.eventName} を{actionType}
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
