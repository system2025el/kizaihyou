'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ForumIcon from '@mui/icons-material/Forum';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
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

import { toDiffKey } from '@/app/_lib/equipment-table/diff';
import { EquipmentTableApproval } from '@/app/_lib/equipment-table/funcs';
import { getIndentedName } from '@/app/_lib/equipment-table/sheet';
import {
  approveEquipmentTable,
  checkKikikanJuchuLink,
  KikikanJuchuCheck,
  rejectEquipmentTable,
  retryKikikanJuchu,
} from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableHistoryEntry } from '@/app/_lib/equipment-table-list/types';
import { EquipmentTimeline } from '@/app/_ui/equipment-timeline';
import { MemoTooltip } from '@/app/_ui/memo-tooltip';

import { buildStockDateRange, formatIsoDate, formatMd, isSameDay } from '../_lib/date-utils';
import { MergePreview } from '../_lib/merge-preview';
import { EquipmentOrderRow, EquipmentStockMap } from '../_lib/types';
import { MergePreviewPanel } from './merge-preview-panel';

const RANGE_START_COLOR = '#BBDEFB';
const RANGE_END_COLOR = '#FFF59D';
const IN_RANGE_COLOR = '#ACB9CA';
const TOTAL_COLUMN_COLOR = '#E3F2FD';

// 固定列(左側)の累積オフセット。sticky配置に使う。
const STICKY_LEFT = { select: 0, memo: 40, name: 80, total: 300, ordered: 360, spare: 430, contact: 500 };

/**
 * 機材表の行を承認画面の行に読み替える。名称未入力の行は対象外。
 * 前回の申請から削除された機材は、数量0の行として末尾に並べる
 * （在庫が戻ることも含めて、承認者が変更を追えるようにするため）。
 */
const toOrderRows = (
  rows: EquipmentTableApproval['rows'],
  diff: EquipmentTableApproval['diff']
): EquipmentOrderRow[] => [
  ...rows
    .filter((row) => row.name.trim() !== '')
    .map((row) => ({
      id: row.id,
      kizaiId: row.kizaiId,
      diffKey: toDiffKey(row),
      removed: false,
      kizaiName: getIndentedName(row),
      mem: row.remark,
      mem2: '',
      orderedQty: Object.values(row.qty).reduce((sum, value) => sum + (Number(value) || 0), 0),
      spareQty: Number(row.spare) || 0,
    })),
  ...(diff?.removedRows ?? []).map((row) => ({
    id: `removed:${row.key}`,
    kizaiId: row.kizaiId,
    diffKey: row.key,
    removed: true,
    kizaiName: row.name,
    mem: '',
    mem2: '',
    orderedQty: 0,
    spareQty: 0,
  })),
];

type Props = {
  approval: EquipmentTableApproval;
  stockMap: EquipmentStockMap;
  history: EquipmentTableHistoryEntry[];
  /** 連携済みの場合の、機材明細への反映の下見（参照専用。未連携ならnull） */
  mergePreview: MergePreview | null;
};

const EquipmentOrderDetail = ({ approval, stockMap, history, mergePreview }: Props) => {
  const router = useRouter();
  const head = approval.head;
  const [rows, setRows] = useState<EquipmentOrderRow[]>(() => toOrderRows(approval.rows, approval.diff));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [actionType, setActionType] = useState<'承認' | '差戻し' | null>(null);
  const [comment, setComment] = useState('');
  // 承認時にkikikanの伝票を新しく作るか、既にある受注番号に機材明細だけ足すか
  const [juchuMode, setJuchuMode] = useState<'new' | 'existing'>('new');
  const [juchuInput, setJuchuInput] = useState('');
  const [juchuCheck, setJuchuCheck] = useState<KikikanJuchuCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [message, setMessage] = useState('');

  // 承認済なのにkikikanへの連携が済んでいない場合だけ、やり直せるようにする
  const needsRetry = approval.status === '承認済' && !approval.juchuLinked;

  const handleRetry = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await retryKikikanJuchu(approval.id);
      if (result.kikikanError) {
        setError(`機材管理への連携に失敗しました: ${result.kikikanError}`);
        return;
      }
      setMessage(`機材管理に受注 ${result.juchuHeadId} を連携しました（機材明細 ${result.meisaiCount}件）`);
      router.refresh();
    } catch {
      setError('機材管理への連携に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const openAction = (type: '承認' | '差戻し') => {
    setComment('');
    setError('');
    setJuchuMode('new');
    setJuchuInput('');
    setJuchuCheck(null);
    setActionType(type);
  };

  /** 入力された受注番号をkikikanと照合する。不一致は表示するだけで、kikikan側は更新しない */
  const handleCheckJuchu = async () => {
    const juchuHeadId = Number(juchuInput);
    if (!Number.isInteger(juchuHeadId) || juchuHeadId <= 0) {
      setError('受注番号は数字で入力してください。');
      return;
    }
    setChecking(true);
    setError('');
    try {
      setJuchuCheck(await checkKikikanJuchuLink(approval.id, juchuHeadId));
    } catch {
      setError('受注番号の照合に失敗しました。');
      setJuchuCheck(null);
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!actionType) return;
    setBusy(true);
    try {
      if (actionType === '差戻し') {
        await rejectEquipmentTable(approval.id, comment);
        setActionType(null);
        router.push('/equipment-table-request');
        return;
      }

      // 承認は成立したが、kikikanへの連携だけ失敗することがある
      const existingJuchuHeadId = juchuMode === 'existing' ? Number(juchuInput) : null;
      const result = await approveEquipmentTable(approval.id, comment, existingJuchuHeadId);
      setActionType(null);
      if (result.kikikanError) {
        setError(`承認しましたが、機材管理への連携に失敗しました: ${result.kikikanError}`);
        setBusy(false);
        return;
      }
      if (result.skippedRowCount > 0) {
        setError(
          `承認し、機材管理に受注 ${result.juchuHeadId} を作成しました（明細 ${result.meisaiCount}件）。` +
            `ただし ${result.skippedRowCount}件は機材マスタに紐づいていないため連携していません。`
        );
        setBusy(false);
        return;
      }
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
   * その日の在庫数。機材管理の機材マスタに紐づいていない行（手入力の名称）は出せない。
   *
   * 表示する値は「機材管理の在庫 ＋ この機材表が機材管理に立てている引き当て
   * − 画面の要求数」。連携前は足し戻す分が0なので、単に要求数を引くだけになる。
   * 連携後に足し戻さないと、機材管理側と画面側で二重に引かれてしまう。
   */
  const getStock = (row: EquipmentOrderRow, date: Date) => {
    const stock = row.kizaiId === null ? undefined : stockMap[row.kizaiId];
    if (!stock) return null;

    const iso = formatIsoDate(date);
    // 引き当てのある日だけ行があるので、無い日は保有数がそのまま在庫数になる
    const base = stock.stockByDate[iso] ?? stock.kizaiQty;
    const linked = stock.linkedByDate[iso] ?? 0;
    // 行の数量ではなく機材ごとの合計を引く（同じ機材が複数行あるとき、行ごとだと引き足りない）
    const requested = row.kizaiId === null ? 0 : (requestedByKizaiId[row.kizaiId] ?? 0);
    return base + linked - (isInRange(date) ? requested : 0);
  };

  /**
   * 機材IDごとの要求数の合計と行数。
   *
   * 同じ機材を別の行に分けて書くことがある（付ける場所ごとに分ける等）。
   * 在庫は機材に対する数字なので、行ごとに引くとどの行も引き足りない値になる。
   * 機材管理側も明細は行ごとに作るが、在庫は合計で減るので合わせている。
   */
  const { requestedByKizaiId, rowCountByKizaiId } = useMemo(() => {
    const requested: Record<number, number> = {};
    const rowCount: Record<number, number> = {};
    for (const row of rows) {
      if (row.kizaiId === null) continue;
      requested[row.kizaiId] = (requested[row.kizaiId] ?? 0) + row.orderedQty + row.spareQty;
      rowCount[row.kizaiId] = (rowCount[row.kizaiId] ?? 0) + 1;
    }
    return { requestedByKizaiId: requested, rowCountByKizaiId: rowCount };
  }, [rows]);

  /**
   * 前回の申請時点の数量。数量が変わった行と、削除された行で返す。
   * 変わっていない行はundefined（併記しない）。
   */
  const previousQty = (row: EquipmentOrderRow) =>
    row.removed
      ? approval.diff?.removedRows.find((removed) => removed.key === row.diffKey)
      : approval.diff?.changedKeys[row.diffKey];

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
          <Button
            variant="contained"
            color="success"
            onClick={() => openAction('承認')}
            disabled={busy || !approval.canApprove}
          >
            承認
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => openAction('差戻し')}
            disabled={busy || !approval.canApprove}
          >
            差し戻し
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {needsRetry && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            approval.canApprove && (
              <Button size="small" onClick={handleRetry} disabled={busy}>
                機材管理へ連携
              </Button>
            )
          }
        >
          {approval.juchuHeadId
            ? `機材管理に伝票 ${approval.juchuHeadId} はありますが、機材明細が作られていません。`
            : '機材管理への連携ができていません。'}
        </Alert>
      )}

      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}

      {approval.juchuLinked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          この機材表は機材管理の受注 {approval.juchuHeadId} に連携済みです。在庫はあちらの引き当てを一度戻したうえで、
          この画面の数量を引いて表示しています（二重に引かないため）。
        </Alert>
      )}

      {!approval.canApprove && (
        <Alert severity="info" sx={{ mb: 2 }}>
          この機材表の申請先に指定されていないため、承認・差戻しはできません（内容の閲覧とコメントはできます）。
        </Alert>
      )}

      {mergePreview && <MergePreviewPanel preview={mergePreview} />}

      {approval.diff && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>前回の申請（{approval.diff.previousAt}）からの変更</AlertTitle>
          {approval.diff.head.map((item) => (
            <Typography key={item.label} variant="body2">
              {item.label}：{item.before} → <strong>{item.after}</strong>
            </Typography>
          ))}
          <Typography variant="body2">
            機材：追加 {approval.diff.addedKeys.length}件　数量変更 {Object.keys(approval.diff.changedKeys).length}
            件　削除 {approval.diff.removedRows.length}件
            （表の中に印を付けています。削除された機材は数量0の行として並べています）
          </Typography>
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
                  align="right"
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
                  align="right"
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
                  align="right"
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
                    align="right"
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
                  <TableRow key={row.id} sx={{ opacity: row.removed ? 0.6 : 1 }}>
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
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Box sx={{ textDecoration: row.removed ? 'line-through' : 'none' }}>{row.kizaiName}</Box>
                        {approval.diff?.addedKeys.includes(row.diffKey) && (
                          <Chip label="追加" size="small" color="warning" />
                        )}
                        {row.removed && <Chip label="削除" size="small" color="error" />}
                      </Box>
                      {row.kizaiId !== null && (rowCountByKizaiId[row.kizaiId] ?? 0) > 1 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          同じ機材が{rowCountByKizaiId[row.kizaiId]}行（合計 {requestedByKizaiId[row.kizaiId]}）
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ position: 'sticky', left: STICKY_LEFT.total, zIndex: 1, bgcolor: TOTAL_COLUMN_COLOR }}
                    >
                      {total}
                    </TableCell>
                    <TableCell
                      align="right"
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
                        // 数字なので入力欄の中も右寄せにする
                        sx={{ width: 56, '& input': { textAlign: 'right' } }}
                      />
                      {previousQty(row) && (
                        <Typography variant="caption" color="warning.main" display="block">
                          前回 {previousQty(row)?.orderedQty}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
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
                        // 数字なので入力欄の中も右寄せにする
                        sx={{ width: 56, '& input': { textAlign: 'right' } }}
                      />
                      {previousQty(row) && (
                        <Typography variant="caption" color="warning.main" display="block">
                          前回 {previousQty(row)?.spareQty}
                        </Typography>
                      )}
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
                          align="right"
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
          {actionType === '承認' && !approval.juchuHeadId && (
            <>
              <Typography variant="subtitle2" mt={1}>
                機材管理の伝票
              </Typography>
              <RadioGroup
                value={juchuMode}
                onChange={(e) => {
                  setJuchuMode(e.target.value as 'new' | 'existing');
                  setJuchuCheck(null);
                }}
              >
                <FormControlLabel value="new" control={<Radio size="small" />} label="新しく伝票を作る" />
                <FormControlLabel
                  value="existing"
                  control={<Radio size="small" />}
                  label="既にある受注番号に機材明細だけ足す"
                />
              </RadioGroup>

              {juchuMode === 'existing' && (
                <>
                  <Box display="flex" gap={1} alignItems="flex-start" mb={1}>
                    <TextField
                      value={juchuInput}
                      onChange={(e) => {
                        setJuchuInput(e.target.value.replace(/\D/g, ''));
                        setJuchuCheck(null);
                      }}
                      label="受注番号"
                      size="small"
                      sx={{ width: 160 }}
                    />
                    <Button onClick={handleCheckJuchu} disabled={checking || !juchuInput}>
                      照合
                    </Button>
                  </Box>

                  {juchuCheck && !juchuCheck.found && (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      機材管理にこの受注番号が見つかりません。
                    </Alert>
                  )}
                  {juchuCheck?.found && (
                    <Alert severity={juchuCheck.mismatches.length ? 'warning' : 'success'} sx={{ mb: 1 }}>
                      {juchuCheck.mismatches.length === 0 ? (
                        `受注 ${juchuInput}（${juchuCheck.koenNam}）と一致しています。`
                      ) : (
                        <>
                          <Typography variant="body2" fontWeight="bold">
                            次の項目が食い違っています（機材管理側は更新しません）
                          </Typography>
                          {juchuCheck.mismatches.map((item) => (
                            <Typography key={item.label} variant="body2">
                              {item.label}：機材表「{item.kizaihyou || '（未入力）'}」／ 機材管理「
                              {item.kikikan || '（未入力）'}」
                            </Typography>
                          ))}
                        </>
                      )}
                    </Alert>
                  )}
                </>
              )}
            </>
          )}

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
            disabled={
              busy ||
              // 誤った受注番号のまま承認しないよう、照合が通るまで押せない
              (actionType === '承認' && !approval.juchuHeadId && juchuMode === 'existing' && !juchuCheck?.found)
            }
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
