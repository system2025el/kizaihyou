'use client';

import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import RuleFolderIcon from '@mui/icons-material/RuleFolder';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { fetchEquipmentTableHistory } from '@/app/_lib/equipment-table/funcs';
import {
  DEFAULT_SORT,
  EMPTY_FILTER,
  EquipmentTableListFilter,
  EquipmentTableListSort,
  EquipmentTableListSortKey,
  filterEquipmentTableList,
  hasFilter,
  sortEquipmentTableList,
} from '@/app/_lib/equipment-table-list/filter';
import {
  copyEquipmentTable,
  fetchEquipmentTableList,
  restoreEquipmentTable,
} from '@/app/_lib/equipment-table-list/funcs';
import {
  EquipmentTableHistoryEntry,
  EquipmentTableListRow,
  EquipmentTableStatus,
  KIZAIHYOU_STS,
} from '@/app/_lib/equipment-table-list/types';
import { useAutoRefresh } from '@/app/_lib/hooks/use-auto-refresh';

/**
 * 承認済・申請中の行に出す「その時点の内容」へのリンク。
 * 承認後も機材表は編集できるので、一覧の内容と承認された内容はずれていく。
 */
const snapshotLinkLabel = (row: EquipmentTableListRow) => {
  if (!row.shinseiHisId) return null;
  if (row.status === '承認済') return '承認された内容を開く';
  if (row.status === '申請中') return '申請した内容を開く';
  return null;
};

/** 絞り込みに使えるステータス。マスタの表示順（作成中→申請中→…）に合わせる */
const STATUS_OPTIONS = Object.keys(KIZAIHYOU_STS) as EquipmentTableStatus[];

/** 並び替えできる列の見出し。並び替えないアクション列はここに入れない */
const SORTABLE_HEADERS: { key: EquipmentTableListSortKey; label: string }[] = [
  { key: 'cod', label: '機材表ID' },
  { key: 'eventName', label: '公演名' },
  { key: 'place', label: '場所' },
  { key: 'clientName', label: '顧客名' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
  { key: 'shippedAt', label: '出庫日' },
  { key: 'returnedAt', label: '入庫日' },
  { key: 'status', label: '状態ステータス' },
  { key: 'salesStaffName', label: '受注部担当者名' },
  { key: 'juchuHeadId', label: '機材管理の受注No.' },
];

const EquipmentTableList = () => {
  const router = useRouter();
  const [rows, setRows] = useState<EquipmentTableListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyTarget, setHistoryTarget] = useState<EquipmentTableListRow | null>(null);
  // 履歴は一覧では先読みせず、ダイアログを開いたときにその機材表の分だけ取る
  const [history, setHistory] = useState<EquipmentTableHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filter, setFilter] = useState<EquipmentTableListFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<EquipmentTableListSort>(DEFAULT_SORT);
  // 削除済み（del_flg = 1）は既定で出さない。戻したいときだけ含めて取り直す
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // silent=trueは自動更新用。スピナーを出さず、失敗しても画面に出さない（次の周期で取り直せる）
  const load = useCallback(
    async (silent = false, withDeleted = includeDeleted) => {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        setRows(await fetchEquipmentTableList(withDeleted));
      } catch {
        if (!silent) setError('機材表の取得に失敗しました。');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [includeDeleted]
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);
  useAutoRefresh(refresh);

  const openHistory = async (row: EquipmentTableListRow) => {
    setHistoryTarget(row);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await fetchEquipmentTableHistory(row.id));
    } catch {
      setError('操作履歴の取得に失敗しました。');
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredRows = sortEquipmentTableList(filterEquipmentTableList(rows, filter), sort);

  /** ステータスごとの件数。ステータス以外の絞り込みは効かせたうえで数える */
  const statusCounts = filterEquipmentTableList(rows, { ...filter, statuses: [] }).reduce<
    Partial<Record<EquipmentTableStatus, number>>
  >((counts, row) => ({ ...counts, [row.status]: (counts[row.status] ?? 0) + 1 }), {});

  const toggleStatus = (status: EquipmentTableStatus) =>
    setFilter((current) => ({
      ...current,
      statuses: current.statuses.includes(status)
        ? current.statuses.filter((value) => value !== status)
        : [...current.statuses, status],
    }));

  /** 同じ列をもう一度押したら昇順・降順を入れ替える */
  // 「該当なし」のcolSpanに使う。削除済み表示中だけ操作列が1つ増える
  const columnCount = SORTABLE_HEADERS.length + (includeDeleted ? 4 : 3);

  const toggleIncludeDeleted = () => {
    const next = !includeDeleted;
    setIncludeDeleted(next);
    load(false, next);
  };

  const handleRestore = async (row: EquipmentTableListRow) => {
    setBusy(true);
    setError('');
    try {
      await restoreEquipmentTable(row.id);
      await load(false, includeDeleted);
    } catch {
      setError('機材表の復元に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const toggleSort = (key: EquipmentTableListSortKey) =>
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    );

  // レコードは機材表画面で最初に保存したときに作る（書きかけを一覧に出さないため）
  const handleCreateNew = () => router.push('/equipment-table/new');

  const handleCopyAndCreateNew = async (source: EquipmentTableListRow) => {
    setBusy(true);
    setError('');
    try {
      const id = await copyEquipmentTable(source.id, source.cod);
      router.push(`/equipment-table/${id}`);
    } catch {
      setError('機材表のコピーに失敗しました。');
      setBusy(false);
    }
  };

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5">機材表履歴一覧</Typography>
        <Button startIcon={<AddIcon />} onClick={handleCreateNew} disabled={busy}>
          新規作成
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box display="flex" flexWrap="wrap" alignItems="center" gap={1} mb={1}>
        {STATUS_OPTIONS.map((status) => {
          const selected = filter.statuses.includes(status);
          return (
            <Chip
              key={status}
              label={`${status} ${statusCounts[status] ?? 0}`}
              size="small"
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => toggleStatus(status)}
            />
          );
        })}
      </Box>

      <Box display="flex" flexWrap="wrap" alignItems="center" gap={1} mb={1}>
        <TextField
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          placeholder="機材表ID・公演名・場所・顧客名・担当者名・受注No.（空白区切りで絞り込み）"
          size="small"
          sx={{ flexGrow: 1, minWidth: 280 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          label="出庫日（から）"
          type="date"
          value={filter.shippedFrom}
          onChange={(e) => setFilter({ ...filter, shippedFrom: e.target.value })}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="出庫日（まで）"
          type="date"
          value={filter.shippedTo}
          onChange={(e) => setFilter({ ...filter, shippedTo: e.target.value })}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button size="small" onClick={() => setFilter(EMPTY_FILTER)} disabled={!hasFilter(filter)}>
          条件をクリア
        </Button>
        <FormControlLabel
          control={<Switch size="small" checked={includeDeleted} onChange={toggleIncludeDeleted} />}
          label="削除済も表示"
          slotProps={{ typography: { variant: 'body2' } }}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" mb={1}>
        {hasFilter(filter) ? `${rows.length}件中 ${filteredRows.length}件` : `${rows.length}件`}
      </Typography>

      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {SORTABLE_HEADERS.map((header) => (
                <TableCell key={header.key} sortDirection={sort.key === header.key ? sort.direction : false}>
                  <TableSortLabel
                    active={sort.key === header.key}
                    direction={sort.key === header.key ? sort.direction : 'asc'}
                    onClick={() => toggleSort(header.key)}
                  >
                    {header.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell align="center">承認・申請内容</TableCell>
              <TableCell align="center">履歴</TableCell>
              <TableCell align="center">コピーして新規作成</TableCell>
              {includeDeleted && <TableCell align="center">削除</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columnCount} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} align="center">
                  {hasFilter(filter) ? '条件に合う機材表がありません' : '機材表がありません'}
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => (
              <TableRow key={row.id} hover sx={row.deleted ? { opacity: 0.5 } : undefined}>
                <TableCell>{row.cod}</TableCell>
                <TableCell>
                  <Link component="button" onClick={() => router.push(`/equipment-table/${row.id}`)} underline="hover">
                    {row.eventName || '(公演名未入力)'}
                  </Link>
                </TableCell>
                <TableCell>{row.place}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.createdAt}</TableCell>
                <TableCell>{row.updatedAt}</TableCell>
                <TableCell>{row.shippedAt ?? '-'}</TableCell>
                <TableCell>{row.returnedAt ?? '-'}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" color={row.statusColor} />
                </TableCell>
                <TableCell>{row.salesStaffName}</TableCell>
                <TableCell>
                  {row.juchuLinked ? (
                    row.juchuHeadId
                  ) : row.status === '承認済' ? (
                    // 承認済なのに連携できていない＝承認画面から連携をやり直す必要がある
                    <Typography variant="body2" color="error">
                      未連携{row.juchuHeadId ? `（伝票 ${row.juchuHeadId}・明細なし）` : ''}
                    </Typography>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell align="center">
                  {snapshotLinkLabel(row) && (
                    <IconButton
                      size="small"
                      component={NextLink}
                      href={`/equipment-table/${row.id}/snapshot/${row.shinseiHisId}`}
                      target="_blank"
                      title={snapshotLinkLabel(row) ?? ''}
                    >
                      <RuleFolderIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => openHistory(row)} title="履歴を見る">
                    <HistoryIcon fontSize="small" />
                  </IconButton>
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={() => handleCopyAndCreateNew(row)}
                    title="コピーして新規作成"
                    disabled={busy}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </TableCell>
                {includeDeleted && (
                  <TableCell align="center">
                    {row.deleted ? (
                      <Tooltip title="削除を取り消して一覧に戻す">
                        <span>
                          <IconButton size="small" onClick={() => handleRestore(row)} disabled={busy}>
                            <RestoreFromTrashIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={historyTarget !== null} onClose={() => setHistoryTarget(null)} maxWidth="md">
        {historyTarget && (
          <>
            <DialogTitle fontSize="medium">
              {historyTarget.cod} {historyTarget.eventName} の履歴
            </DialogTitle>
            <DialogContent>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>日時</TableCell>
                    <TableCell>担当者</TableCell>
                    <TableCell>内容</TableCell>
                    <TableCell>コメント</TableCell>
                    <TableCell align="center">機材表</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyLoading && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  )}
                  {!historyLoading && history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        履歴はありません
                      </TableCell>
                    </TableRow>
                  )}
                  {history.map((entry, index) => (
                    <TableRow key={`${entry.at}-${entry.action}-${index}`}>
                      <TableCell>{entry.at}</TableCell>
                      <TableCell>{entry.user}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{entry.comment}</TableCell>
                      <TableCell align="center">
                        {entry.hasSnapshot && (
                          <IconButton
                            size="small"
                            component={NextLink}
                            href={`/equipment-table/${historyTarget.id}/snapshot/${entry.hisId}`}
                            target="_blank"
                            title="この時点の機材表を見る"
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
};
export default EquipmentTableList;
