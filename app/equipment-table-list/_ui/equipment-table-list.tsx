'use client';

import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { INITIAL_EQUIPMENT_TABLE_LIST, STATUS_COLOR } from '../_lib/mock-data';
import { EquipmentTableListRow } from '../_lib/types';

let copyIdCounter = 0;

const EquipmentTableList = () => {
  const router = useRouter();
  const [rows, setRows] = useState<EquipmentTableListRow[]>(INITIAL_EQUIPMENT_TABLE_LIST);
  const [historyTarget, setHistoryTarget] = useState<EquipmentTableListRow | null>(null);

  const handleCreateNew = () => {
    router.push('/equipment-table');
  };

  const handleCopyAndCreateNew = (source: EquipmentTableListRow) => {
    copyIdCounter += 1;
    const now = new Date();
    const nowText = now.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const copied: EquipmentTableListRow = {
      id: `${source.id}-COPY${copyIdCounter}`,
      eventName: source.eventName,
      place: source.place,
      clientName: source.clientName,
      createdAt: nowText,
      updatedAt: nowText,
      shippedAt: null,
      returnedAt: null,
      status: '作成中',
      salesStaffName: source.salesStaffName,
      history: [{ at: nowText, user: source.salesStaffName, action: `${source.id}からコピーして新規作成` }],
    };
    setRows((prev) => [copied, ...prev]);
    router.push('/equipment-table');
  };

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5">機材表履歴一覧</Typography>
        <Button startIcon={<AddIcon />} onClick={handleCreateNew}>
          新規作成
        </Button>
      </Box>

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
              <TableCell align="center">履歴</TableCell>
              <TableCell align="center">コピーして新規作成</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell>{row.place}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.createdAt}</TableCell>
                <TableCell>{row.updatedAt}</TableCell>
                <TableCell>{row.shippedAt ?? '-'}</TableCell>
                <TableCell>{row.returnedAt ?? '-'}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" color={STATUS_COLOR[row.status]} />
                </TableCell>
                <TableCell>{row.salesStaffName}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => setHistoryTarget(row)} title="履歴を見る">
                    <HistoryIcon fontSize="small" />
                  </IconButton>
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleCopyAndCreateNew(row)} title="コピーして新規作成">
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={historyTarget !== null} onClose={() => setHistoryTarget(null)}>
        <DialogTitle fontSize="medium">
          {historyTarget?.id} {historyTarget?.eventName} の履歴
        </DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>日時</TableCell>
                <TableCell>担当者</TableCell>
                <TableCell>内容</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historyTarget?.history.map((entry) => (
                <TableRow key={`${entry.at}-${entry.action}`}>
                  <TableCell>{entry.at}</TableCell>
                  <TableCell>{entry.user}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </Box>
  );
};
export default EquipmentTableList;
