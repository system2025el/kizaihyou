'use client';

import LinkOffIcon from '@mui/icons-material/LinkOff';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { fetchApprovalHandledList, fetchApprovalRequestList } from '@/app/_lib/equipment-table-list/funcs';
import { ApprovalHandledRow, EquipmentTableListRow } from '@/app/_lib/equipment-table-list/types';
import { useAutoRefresh } from '@/app/_lib/hooks/use-auto-refresh';

/** 空白区切りで、すべての語を含む行だけを残す（機材表履歴一覧と同じ考え方） */
const matchesQuery = (row: EquipmentTableListRow, query: string) => {
  const terms = query.split(/[\s　]+/).filter(Boolean);
  if (!terms.length) return true;
  const target = [row.cod, row.eventName, row.place, row.clientName, row.requesterName, row.salesStaffName]
    .join(' ')
    .toLowerCase();
  return terms.every((term) => target.includes(term.toLowerCase()));
};

/**
 * 承認したのに機材管理へ機材明細が入っていない状態か。
 *
 * 放置すると**機材管理側で在庫が押さえられていない**まま承認済として残るので、
 * 一覧の1列に埋めるだけでなく画面上部にも警告を出す。
 */
const isUnlinked = (row: EquipmentTableListRow) => row.status === '承認済' && !row.juchuLinked;

/** 「対応済み」タブの、機材管理への連携での絞り込み */
type LinkFilter = 'all' | 'linked' | 'unlinked';

const LINK_FILTERS: { value: LinkFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'linked', label: '連携済' },
  { value: 'unlinked', label: '未連携' },
];

/**
 * 未対応の行に出す「前回の対応」。
 *
 * 一度承認したあとの再申請かどうかで、承認の意味が変わる。
 * 初回なら承認すれば機材明細が作られるが、承認済からの再申請では
 * 機材管理側に既に明細があり、**承認しても自動では更新されない**。
 */
const PreviousHandling = ({ handled }: { handled: ApprovalHandledRow | undefined }) => {
  if (!handled)
    return (
      <Typography variant="body2" color="text.secondary">
        初回の申請
      </Typography>
    );

  const reapproval = handled.approvedCount > 0;
  return (
    <Tooltip
      title={`承認 ${handled.approvedCount}回 / 差戻し ${handled.rejectedCount}回${
        handled.juchuLinked ? ` ・ 機材管理の受注 ${handled.juchuHeadId} に連携済` : ''
      }`}
    >
      <Box>
        <Chip
          label={reapproval ? '承認済からの再申請' : '差戻し後の再申請'}
          size="small"
          color={reapproval ? 'warning' : 'default'}
          variant={reapproval ? 'filled' : 'outlined'}
        />
        <Typography variant="caption" color="text.secondary" display="block">
          {handled.handledAct} {handled.handledBy} {handled.handledAt}
        </Typography>
      </Box>
    </Tooltip>
  );
};

const EquipmentTableRequest = () => {
  const router = useRouter();
  const [tab, setTab] = useState<'pending' | 'handled'>('pending');
  const [pendingRows, setPendingRows] = useState<EquipmentTableListRow[]>([]);
  const [handledRows, setHandledRows] = useState<ApprovalHandledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 「対応済み」は受注部担当者の権限が要る。未対応と分けて扱い、片方の失敗で全部消えないようにする
  const [handledError, setHandledError] = useState('');
  const [query, setQuery] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  // silent=trueは自動更新用。失敗しても画面に出さない（次の周期で取り直せる）
  const load = useCallback(async (silent = false) => {
    // 未連携の警告はどちらのタブでも出したいので、両方まとめて取る
    const [pending, handled] = await Promise.allSettled([fetchApprovalRequestList(), fetchApprovalHandledList()]);

    if (pending.status === 'fulfilled') {
      setPendingRows(pending.value);
      if (!silent) setError('');
    } else if (!silent) {
      setError('申請中の機材表の取得に失敗しました。');
    }

    if (handled.status === 'fulfilled') {
      setHandledRows(handled.value);
      if (!silent) setHandledError('');
    } else if (!silent) {
      setHandledError('対応済みの機材表を取得できませんでした。受注部担当者の権限が必要です。');
    }

    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);
  useAutoRefresh(refresh);

  const unlinkedRows = handledRows.filter(isUnlinked);

  const visibleHandled = handledRows.filter((row) => {
    if (linkFilter === 'linked') return row.juchuLinked;
    if (linkFilter === 'unlinked') return isUnlinked(row);
    return true;
  });

  /**
   * 過去に承認・差戻しした機材表。未対応の行が「初回の申請」なのか
   * 「一度対応したあとの再申請」なのかを出すのに使う。
   * 対応済みタブと同じデータなので、追加で取りに行かない。
   */
  const handledById = new Map(handledRows.map((row) => [row.id, row]));

  /** 承認済からの再申請＝機材管理に機材明細が既にある。承認しても自動では更新されない */
  const reapprovals = pendingRows.filter((row) => (handledById.get(row.id)?.approvedCount ?? 0) > 0);

  const isHandled = tab === 'handled';
  const rows: EquipmentTableListRow[] = isHandled ? visibleHandled : pendingRows;
  const filteredRows = rows.filter((row) => matchesQuery(row, query));
  const columnCount = isHandled ? 12 : 10;

  const showUnlinked = () => {
    setTab('handled');
    setLinkFilter('unlinked');
    setQuery('');
  };

  return (
    <Box p={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} gap={2}>
        <Typography variant="h5">機材表申請依頼</Typography>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          placeholder="機材表ID・公演名・場所・顧客名・依頼者・受注部担当者（空白区切りで絞り込み）"
          sx={{ minWidth: 420 }}
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

      {unlinkedRows.length > 0 && (
        <Alert
          severity="error"
          icon={<LinkOffIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={showUnlinked}>
              表示する
            </Button>
          }
        >
          <AlertTitle>機材管理へ連携できていない機材表が {unlinkedRows.length} 件あります</AlertTitle>
          承認済ですが機材明細が作られていないため、機材管理側で在庫が押さえられていません。機材表を開いて連携をやり直してください（
          {unlinkedRows.map((row) => row.cod).join('、')}）。
        </Alert>
      )}

      {handledError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {handledError}
        </Alert>
      )}

      {!isHandled && reapprovals.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>一度承認したあとの再申請が {reapprovals.length} 件あります</AlertTitle>
          機材管理には前回の承認で作った機材明細が既にあります。
          <Box component="span" fontWeight="bold">
            承認しても機材明細は自動では更新されません。
          </Box>
          機材表を開いて、前回からの差分を見たうえで機材管理側に反映してください（
          {reapprovals.map((row) => row.cod).join('、')}）。
        </Alert>
      )}

      <Tabs value={tab} onChange={(_event, value: 'pending' | 'handled') => setTab(value)} sx={{ mb: 1 }}>
        <Tab value="pending" label={`未対応 ${pendingRows.length}`} />
        <Tab value="handled" label={`対応済み ${handledRows.length}`} />
      </Tabs>

      <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
        <Typography variant="body2" color="text.secondary">
          {isHandled
            ? '受注部の誰かが承認・差戻しした機材表です。連携が済んでいるかの確認に使います。'
            : '自分が申請先に指定されている、まだ対応していない機材表です。'}
        </Typography>
        {isHandled &&
          LINK_FILTERS.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              size="small"
              color={linkFilter === item.value ? 'primary' : 'default'}
              variant={linkFilter === item.value ? 'filled' : 'outlined'}
              onClick={() => setLinkFilter(item.value)}
            />
          ))}
        <Typography variant="body2" color="text.secondary">
          {(isHandled ? handledRows.length : pendingRows.length) === filteredRows.length
            ? `${filteredRows.length}件`
            : `${isHandled ? handledRows.length : pendingRows.length}件中 ${filteredRows.length}件`}
        </Typography>
      </Box>

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
              {!isHandled && <TableCell>前回の対応</TableCell>}
              {isHandled && (
                <>
                  <TableCell>対応</TableCell>
                  <TableCell>対応日時</TableCell>
                  <TableCell>機材管理の受注No.</TableCell>
                </>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columnCount} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} align="center">
                  {rows.length === 0
                    ? isHandled
                      ? '対応済みの機材表はありません'
                      : '自分あてに申請されている機材表はありません'
                    : '検索条件に一致する機材表はありません'}
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => {
              const handled = isHandled ? (row as ApprovalHandledRow) : null;
              return (
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
                  {!isHandled && (
                    <TableCell>
                      <PreviousHandling handled={handledById.get(row.id)} />
                    </TableCell>
                  )}
                  {handled && (
                    <>
                      <TableCell>
                        {handled.handledAct} / {handled.handledBy}
                      </TableCell>
                      <TableCell>{handled.handledAt}</TableCell>
                      <TableCell>
                        {row.juchuLinked ? (
                          row.juchuHeadId
                        ) : isUnlinked(row) ? (
                          <Typography variant="body2" color="error">
                            未連携{row.juchuHeadId ? `（伝票 ${row.juchuHeadId}・明細なし）` : ''}
                          </Typography>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
export default EquipmentTableRequest;
