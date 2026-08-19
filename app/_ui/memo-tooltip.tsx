'use client';

import EditNoteIcon from '@mui/icons-material/EditNote';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material';
import { useState } from 'react';

type MemoTooltipProps = {
  title: string;
  memo: string;
  onSave: (memo: string) => void;
  /** 閲覧のみ（申請中など編集できない状態） */
  readOnly?: boolean;
};

// kikikan(C:\EL)の app/(main)/(eq-order-detail)/_ui/memo-tooltip.tsx と同じUIパターン
export const MemoTooltip = ({ title, memo, onSave, readOnly = false }: MemoTooltipProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(memo);

  const handleOpen = () => {
    setDraft(memo);
    setOpen(true);
  };
  const handleClose = () => setOpen(false);
  const handleSave = () => {
    onSave(draft);
    setOpen(false);
  };

  return (
    <>
      <Tooltip title={memo} arrow>
        <IconButton onClick={handleOpen} sx={{ padding: 0 }} color={memo ? 'primary' : 'default'}>
          <EditNoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle fontSize="medium">{title}</DialogTitle>
        <DialogContent>
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            slotProps={{ input: { readOnly } }}
          />
        </DialogContent>
        <DialogActions>
          {!readOnly && (
            <Button onClick={handleSave} variant="contained">
              保存
            </Button>
          )}
          <Button onClick={handleClose}>{readOnly ? '閉じる' : 'キャンセル'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
