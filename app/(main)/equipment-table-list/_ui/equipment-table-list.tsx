'use client';

import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
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
  IconButton,
  InputAdornment,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { fetchEquipmentTableHistory } from '@/app/_lib/equipment-table/funcs';
import { copyEquipmentTable, fetchEquipmentTableList } from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableHistoryEntry, EquipmentTableListRow } from '@/app/_lib/equipment-table-list/types';
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

const matchesQuery = (row: EquipmentTableListRow, query: string) => {
  const target = [row.cod, row.eventName, row.place, row.clientName, row.salesStaffName, row.status]
    .join(' ')
    .toLowerCase();
  return target.includes(query.toLowerCase());
};

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
  const [query, setQuery] = useState('');

  // silent=trueは自動更新用。スピナーを出さず、失敗しても画面に出さない（次の周期で取り直せる）
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      setRows(await fetchEquipmentTableList());
    } catch {
      if (!silent) setError('機材表の取得に失敗しました。');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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

  const filteredRows = query.trim() ? rows.filter((row) => matchesQuery(row, query.trim())) : rows;

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

      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="機材表ID・公演名・場所・顧客名・担当者名・ステータスで検索"
        size="small"
        fullWidth
        sx={{ mb: 2 }}
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

      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>機材表ID</TableCell>
              <TableCell>公演名</TableCell>
              <TableCell>場所</TableCell>
              <TableCell>顧客名</TableCell>
              <TableCell>作成日時</TableCell>
              <TableCell>更新日時</TableCell>
              <TableCell>出庫日</TableCell>
              <TableCell>入庫日</TableCell>
              <TableCell>状態ステータス</TableCell>
              <TableCell>受注部担当者名</TableCell>
              <TableCell>機材管理の受注No.</TableCell>
              <TableCell align="center">承認・申請内容</TableCell>
              <TableCell align="center">履歴</TableCell>
              <TableCell align="center">コピーして新規作成</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={14} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} align="center">
                  該当する機材表がありません
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => (
              <TableRow key={row.id} hover>
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
