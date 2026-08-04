'use client';

import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';

import { STATUS_COLOR } from '@/app/_lib/equipment-table-list/mock-data';
import { useEquipmentTableListStore } from '@/app/_lib/equipment-table-list/store';

const EquipmentTableRequest = () => {
  const router = useRouter();
  const rows = useEquipmentTableListStore((state) => state.rows);

  const pendingRows = rows.filter((row) => row.status === '申請中');

  return (
    <Box p={2}>
      <Typography variant="h5" mb={2}>
        機材表申請依頼
      </Typography>

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
            {pendingRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  申請中の機材表はありません
                </TableCell>
              </TableRow>
            )}
            {pendingRows.map((row) => (
              <TableRow
                key={row.id}
                hover
                onClick={() => router.push(`/equipment-table-request/${row.id}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell>{row.place}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.shippedAt ?? '-'}</TableCell>
                <TableCell>{row.returnedAt ?? '-'}</TableCell>
                <TableCell>{row.salesStaffName}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" color={STATUS_COLOR[row.status]} />
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
