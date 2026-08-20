'use client';

import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
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
import { useCallback, useEffect, useState } from 'react';

import { fetchApprovalRequestList } from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableListRow } from '@/app/_lib/equipment-table-list/types';
import { useAutoRefresh } from '@/app/_lib/hooks/use-auto-refresh';

const matchesQuery = (row: EquipmentTableListRow, query: string) => {
  const target = [row.cod, row.eventName, row.place, row.clientName, row.requesterName, row.salesStaffName]
    .join(' ')
    .toLowerCase();
  return target.includes(query.toLowerCase());
};

const EquipmentTableRequest = () => {
  const router = useRouter();
  const [rows, setRows] = useState<EquipmentTableListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // silent=trueは自動更新用。失敗しても画面に出さない（次の周期で取り直せる）
  const load = useCallback(async (silent = false) => {
    try {
      setRows(await fetchApprovalRequestList());
    } catch {
      if (!silent) setError('申請中の機材表の取得に失敗しました。');
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

  const filteredRows = query.trim() ? rows.filter((row) => matchesQuery(row, query.trim())) : rows;

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} gap={2}>
        <Box>
          <Typography variant="h5">機材表申請依頼</Typography>
          <Typography variant="body2" color="text.secondary">
            自分が申請先に指定されている機材表だけを表示しています。
          </Typography>
        </Box>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          placeholder="機材表ID・公演名・場所・顧客名・依頼者・受注部担当者"
          sx={{ minWidth: 360 }}
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
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>機材表ID</TableCell>
              <TableCell>公演名</TableCell>
              <TableCell>場所</TableCell>
              <TableCell>顧客名</TableCell>
              <TableCell>出庫日</TableCell>
              <TableCell>入庫日</TableCell>
              <TableCell>依頼者名</TableCell>
              <TableCell>受注部担当者名</TableCell>
              <TableCell>状態ステータス</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  {rows.length === 0
                    ? '自分あてに申請されている機材表はありません'
                    : '検索条件に一致する機材表はありません'}
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={() => router.push(`/equipment-table-request/${row.id}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{row.cod}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell>{row.place}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.shippedAt ?? '-'}</TableCell>
                <TableCell>{row.returnedAt ?? '-'}</TableCell>
                <TableCell>{row.requesterName}</TableCell>
                <TableCell>{row.salesStaffName}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" color={row.statusColor} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
export default EquipmentTableRequest;
