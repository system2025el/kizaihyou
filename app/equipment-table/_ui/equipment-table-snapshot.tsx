'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { downloadBase64File, PDF_MIME_TYPE, XLSM_MIME_TYPE } from '@/app/_lib/equipment-table/download';
import {
  createEquipmentTableFromSnapshot,
  EquipmentTableSnapshotDetail,
  exportEquipmentTableExcel,
  exportEquipmentTablePdf,
} from '@/app/_lib/equipment-table/funcs';
import { getActiveSum, getTotal, hasEquipmentRowContent } from '@/app/_lib/equipment-table/sheet';
import { formatDate } from '@/app/_lib/format';

type HeadItemProps = {
  label: string;
  value: string;
};

const HeadItem = ({ label, value }: HeadItemProps) => (
  <Box minWidth={160}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2" whiteSpace="pre-wrap">
      {value || '―'}
    </Typography>
  </Box>
);

type EquipmentTableSnapshotViewProps = {
  detail: EquipmentTableSnapshotDetail;
};

const EquipmentTableSnapshotView = ({ detail }: EquipmentTableSnapshotViewProps) => {
  const { head, columns, rows } = detail.snapshot;
  const shownRows = rows.filter(hasEquipmentRowContent);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 流用するのは現在の機材表ではなく、このページが表示しているスナップショットの内容
  const handleCopy = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await createEquipmentTableFromSnapshot(detail.hisId);
      router.push(`/equipment-table/${id}`);
    } catch {
      setError('流用しての新規作成に失敗しました。');
      setBusy(false);
    }
  };

  // 出力するのは現在の機材表ではなく、このページが表示しているスナップショットの内容
  const handleExportExcel = async () => {
    setBusy(true);
    setError('');
    try {
      const { fileName, base64 } = await exportEquipmentTableExcel(detail.cod, head, columns, rows);
      downloadBase64File(fileName, base64, XLSM_MIME_TYPE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excelの出力に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleExportPdf = async () => {
    setBusy(true);
    setError('');
    try {
      const { fileName, base64 } = await exportEquipmentTablePdf(detail.cod, head, columns, rows);
      downloadBase64File(fileName, base64, PDF_MIME_TYPE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDFの出力に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
        <IconButton component={Link} href={`/equipment-table/${detail.kizaihyouId}`} title="現在の機材表を開く">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">機材表 {detail.cod}</Typography>
        <Chip label={`${detail.at} 時点`} size="small" />
        <Chip label={detail.action} size="small" variant="outlined" />
        <Typography variant="body2" color="text.secondary">
          {detail.user}
        </Typography>
        <Box display="flex" gap={1} ml="auto">
          <Button startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={busy}>
            流用して新規作成
          </Button>
          <Button startIcon={<DownloadIcon />} onClick={handleExportExcel} disabled={busy}>
            Excel出力
          </Button>
          <Button startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={busy}>
            PDF出力
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary" mb={2}>
        この画面は保存・申請した時点の内容です。編集はできません。
      </Typography>

      {detail.comment && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            コメント
          </Typography>
          <Typography variant="body2" whiteSpace="pre-wrap">
            {detail.comment}
          </Typography>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box display="flex" flexWrap="wrap" gap={3}>
          <HeadItem label="公演名" value={head.eventName} />
          <HeadItem label="場所" value={head.place} />
          <HeadItem label="顧客名" value={head.clientName} />
          <HeadItem label="出庫日" value={formatDate(head.shippedAt) ?? ''} />
          <HeadItem label="入庫日" value={formatDate(head.returnedAt) ?? ''} />
          <HeadItem label="備考" value={head.memo} />
        </Box>
      </Paper>

      <TableContainer sx={{ maxHeight: '80vh' }}>
        <Table stickyHeader size="small" sx={{ width: 'max-content' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 140 }}>種類</TableCell>
              <TableCell sx={{ minWidth: 220 }}>名称</TableCell>
              <TableCell sx={{ minWidth: 200 }}>備考</TableCell>
              <TableCell align="right" sx={{ minWidth: 70 }}>
                TOTAL
              </TableCell>
              <TableCell align="right" sx={{ minWidth: 70 }}>
                ACTIVE
              </TableCell>
              <TableCell align="right" sx={{ minWidth: 70 }}>
                SPARE
              </TableCell>
              {columns.map((column) => (
                <TableCell key={column.id} align="right" sx={{ minWidth: 80 }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {shownRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6 + columns.length} align="center">
                  機材は入力されていません
                </TableCell>
              </TableRow>
            )}
            {shownRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.kind}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{row.remark}</TableCell>
                <TableCell align="right">{getTotal(row) || ''}</TableCell>
                <TableCell align="right">{getActiveSum(row) || ''}</TableCell>
                <TableCell align="right">{row.spare}</TableCell>
                {columns.map((column) => (
                  <TableCell key={column.id} align="right">
                    {row.qty[column.id] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
export default EquipmentTableSnapshotView;
