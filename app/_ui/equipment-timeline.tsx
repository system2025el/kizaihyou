'use client';

import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, Button, Divider, IconButton, Paper, TextField, Typography } from '@mui/material';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addEquipmentTableComment, fetchEquipmentTableHistory } from '@/app/_lib/equipment-table/funcs';
import { EquipmentTableHistoryEntry } from '@/app/_lib/equipment-table-list/types';

/**
 * タイムラインを取り直す間隔（ミリ秒）。
 *
 * Supabase Realtimeでも実現できるが、
 * (1) 表示している値はサーバー側でJSTに整形しているため結局取り直しになる、
 * (2) テーブルをレプリケーションに追加するDB側の設定が要る、
 * (3) ソケットが黙って切れたときに更新が止まるので結局フォールバックが要る、
 * ため、承認のやり取り程度の頻度ならこの間隔での取り直しで足りると判断した。
 * タブを見ていないときは動かさず、表に戻った時点で必ず1回取り直す。
 */
const POLL_INTERVAL_MS = 15000;

type EquipmentTimelineProps = {
  kizaihyouId: number;
  /** サーバーから渡った操作履歴（古い順） */
  history: EquipmentTableHistoryEntry[];
  onClose: () => void;
  onError: (message: string) => void;
};

/**
 * 機材表の操作履歴とコメントを1本の流れで見せる右ペイン。
 *
 * 機材表画面と機材表承認画面で同じものを使う（申請者と承認者が同じ流れで
 * やり取りできるようにするため）。コメントは操作履歴と同じ
 * `t_kizaihyou_his`に`act_nam='コメント'`で積まれる。
 */
export const EquipmentTimeline = ({ kizaihyouId, history, onClose, onError }: EquipmentTimelineProps) => {
  const [timeline, setTimeline] = useState(history);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);
  // 中身が変わっていない取り直しでスクロール位置を動かさないための比較用
  const timelineKeyRef = useRef(JSON.stringify(history));

  /** 中身が変わったときだけ差し替える */
  const applyTimeline = useCallback((entries: EquipmentTableHistoryEntry[]) => {
    const key = JSON.stringify(entries);
    if (key === timelineKeyRef.current) return;
    timelineKeyRef.current = key;
    setTimeline(entries);
  }, []);

  // 保存や申請で履歴が増えるので、サーバーから渡り直した内容で置き換える
  useEffect(() => {
    applyTimeline(history);
  }, [history, applyTimeline]);

  // 他の人の操作・コメントを拾うため、開いている間は定期的に取り直す
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      // タブが裏にある間は動かさない。コメント登録中は結果で上書きされるので飛ばす
      if (document.visibilityState !== 'visible' || busy) return;
      try {
        const entries = await fetchEquipmentTableHistory(kizaihyouId);
        if (!cancelled) applyTimeline(entries);
      } catch {
        // 裏で走る取り直しの失敗は画面に出さない（次の周期で取り直せる）
      }
    };

    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [kizaihyouId, busy, applyTimeline]);

  // 古い順に並ぶので、開いたとき・追記したときは末尾を表示する
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [timeline]);

  const handleAddComment = async () => {
    setBusy(true);
    try {
      applyTimeline(await addEquipmentTableComment(kizaihyouId, comment.trim()));
      setComment('');
    } catch {
      onError('コメントの登録に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" pl={2} pr={1} py={1}>
        <Typography variant="subtitle2">タイムライン</Typography>
        <IconButton size="small" onClick={onClose} title="タイムラインを閉じる">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

      <Box flexGrow={1} overflow="auto" px={2} py={1}>
        {timeline.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            履歴はまだありません
          </Typography>
        )}
        {timeline.map((entry, index) => (
          <Box key={`${entry.at}-${index}`} mb={1.5}>
            <Typography variant="caption" color="text.secondary" display="block">
              {entry.at}　{entry.user}
            </Typography>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Typography variant="body2" fontWeight="bold">
                {entry.action}
              </Typography>
              {entry.hasSnapshot && (
                // 編集中の内容を失わないよう別タブで開く
                <IconButton
                  size="small"
                  component={Link}
                  href={`/equipment-table/${kizaihyouId}/snapshot/${entry.hisId}`}
                  target="_blank"
                  title="この時点の機材表を見る"
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
            {entry.comment && (
              <Typography variant="body2" whiteSpace="pre-wrap">
                {entry.comment}
              </Typography>
            )}
          </Box>
        ))}
        <div ref={timelineEndRef} />
      </Box>
      <Divider />

      <Box p={1.5} display="flex" flexDirection="column" gap={1}>
        <TextField
          label="コメント"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          size="small"
          multiline
          minRows={2}
        />
        <Button variant="outlined" onClick={handleAddComment} disabled={busy || !comment.trim()}>
          コメントを登録
        </Button>
      </Box>
    </Paper>
  );
};
