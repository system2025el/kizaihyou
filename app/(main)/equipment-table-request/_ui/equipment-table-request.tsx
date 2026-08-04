'use client';

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

import { STATUS_COLOR } from '@/app/_lib/equipment-table-list/mock-data';
import { useEquipmentTableListStore } from '@/app/_lib/equipment-table-list/store';
import { EquipmentTableListRow } from '@/app/_lib/equipment-table-list/types';

// 本来はログイン中の受注部担当者名。現状は認証と連携していないため仮の値。
const APPROVER_NAME = '承認担当者';

const nowText = () =>
  new Date().toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const EquipmentTableRequest = () => {
  const rows = useEquipmentTableListStore((state) => state.rows);
  const setStatus = useEquipmentTableListStore((state) => state.setStatus);
  const [rejectTarget, setRejectTarget] = useState<EquipmentTableListRow | null>(null);
  const [reason, setReason] = useState('');

  const pendingRows = rows.filter((row) => row.status === '申請中');

  const handleApprove = (row: EquipmentTableListRow) => {
    setStatus(row.id, '承認済', { at: nowText(), user: APPROVER_NAME, action: '承認' });
  };

  const openReject = (row: EquipmentTableListRow) => {
    setReason('');
    setRejectTarget(row);
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    setStatus(rejectTarget.id, '差戻し', {
      at: nowText(),
      user: APPROVER_NAME,
      action: reason ? `差戻し: ${reason}` : '差戻し',
    });
    setRejectTarget(null);
  };

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
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pendingRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  申請中の機材表はありません
                </TableCell>
              </TableRow>
            )}
            {pendingRows.map((row) => (
              <TableRow key={row.id} hover>
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
                <TableCell align="center">
                  <Box display="flex" gap={1} justifyContent="center">
                    <Button size="small" variant="contained" color="success" onClick={() => handleApprove(row)}>
                      承認
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => openReject(row)}>
                      差し戻し
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={rejectTarget !== null} onClose={() => setRejectTarget(null)}>
        <DialogTitle fontSize="medium">
          {rejectTarget?.id} {rejectTarget?.eventName} を差し戻し
        </DialogTitle>
        <DialogContent>
          <TextField
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            label="差し戻し理由（任意）"
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleReject} variant="contained" color="error">
            差し戻す
          </Button>
          <Button onClick={() => setRejectTarget(null)}>キャンセル</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default EquipmentTableRequest;
