'use client';

import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchEquipmentTableList } from '@/app/_lib/equipment-table-list/funcs';
import { EquipmentTableListRow } from '@/app/_lib/equipment-table-list/types';

const EquipmentTableRequest = () => {
  const router = useRouter();
  const [rows, setRows] = useState<EquipmentTableListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchEquipmentTableList();
        setRows(list.filter((row) => row.status === '申請中'));
      } catch {
        setError('申請中の機材表の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Box p={2}>
      <Typography variant="h5" mb={2}>
        機材表申請依頼
      </Typography>

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
              <TableCell>受注部担当者名</TableCell>
              <TableCell>状態ステータス</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  申請中の機材表はありません
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
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
