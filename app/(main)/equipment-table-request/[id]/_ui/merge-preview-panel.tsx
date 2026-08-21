'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { MergePreview, MergePreviewRow } from '../_lib/merge-preview';

/** 数量の表示。行が無い場合は「—」 */
const Qty = ({ qty }: { qty: MergePreviewRow['current'] }) =>
  qty ? (
    <>
      受注 {qty.orderedQty} / 予備 {qty.spareQty}
    </>
  ) : (
    <Box component="span" color="text.disabled">
      —
    </Box>
  );

/** 機材表側で何が起きたか */
const toState = (row: MergePreviewRow) => {
  if (!row.previous && !row.current) return { label: '機材管理のみ', color: 'default' as const };
  if (!row.previous) return { label: '追加', color: 'warning' as const };
  if (!row.current) return { label: '削除', color: 'error' as const };
  if (row.previous.orderedQty !== row.current.orderedQty || row.previous.spareQty !== row.current.spareQty)
    return { label: '数量変更', color: 'info' as const };
  return { label: '変更なし', color: 'default' as const };
};

type MergePreviewPanelProps = {
  preview: MergePreview;
};

/**
 * 再申請の内容を機材明細へどう反映するかの下見（**参照専用**）。
 *
 * 連携後は機材管理が正で、受注部が向こうで手を入れている。ここでは
 * 機材表側の変化と機材管理の現在を並べて見せるだけで、書き込みはしない。
 * 実際の反映は受注部が機材管理の機材明細画面で行う。
 */
export const MergePreviewPanel = ({ preview }: MergePreviewPanelProps) => {
  const changed = preview.rows.filter((row) => toState(row).label !== '変更なし');

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight="bold">
        機材明細への反映（機材管理 受注 {preview.juchuHeadId} ／ {preview.headNam}）
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        この機材表は既に機材管理へ連携済みです。
        <Box component="span" fontWeight="bold" color="text.primary">
          承認しても機材明細は自動更新されません。
        </Box>
        下の内容を見て、機材管理の機材明細画面で反映してください。
      </Typography>

      {preview.headMismatches.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>機材以外に食い違いがあります（機材管理側で変更してください）</AlertTitle>
          {preview.headMismatches.map((item) => (
            <Typography key={item.label} variant="body2">
              {item.label}：機材表「{item.kizaihyou || '（未入力）'}」／ 機材管理「{item.kikikan || '（未入力）'}」
            </Typography>
          ))}
        </Alert>
      )}

      {changed.length === 0 ? (
        <Alert severity="success">機材の変更はありません。</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 220 }}>機材</TableCell>
              <TableCell sx={{ minWidth: 90 }}>状態</TableCell>
              <TableCell sx={{ minWidth: 140 }}>前回の申請</TableCell>
              <TableCell sx={{ minWidth: 140 }}>今回の申請</TableCell>
              <TableCell sx={{ minWidth: 180 }}>機材管理の現在</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {changed.map((row) => {
              const state = toState(row);
              return (
                <TableRow key={`${row.kizaiId ?? row.kizaiNam}`}>
                  <TableCell>{row.kizaiNam}</TableCell>
                  <TableCell>
                    <Chip label={state.label} size="small" color={state.color} />
                  </TableCell>
                  <TableCell>
                    <Qty qty={row.previous} />
                  </TableCell>
                  <TableCell>
                    <Qty qty={row.current} />
                  </TableCell>
                  <TableCell>
                    <Qty qty={row.kikikan} />
                    {row.adjustedByJuchu && (
                      <Typography variant="caption" color="warning.main" display="block">
                        受注部が調整済み
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
};
