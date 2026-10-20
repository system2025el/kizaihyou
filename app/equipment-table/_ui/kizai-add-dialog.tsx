'use client';

import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  alpha,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { green } from '@mui/material/colors';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchKizaiSetOptions } from '@/app/_lib/equipment-table/funcs';
import { BumonOption, KizaiOption, KizaiSetOption } from '@/app/_lib/equipment-table/types';

/** 機材表に足す機材1行分 */
export type AddedKizai = {
  kizaiId: number;
  kizaiNam: string;
  bumonId: number | null;
  /** 0＝親機材、1＝セットオプション（付属品）。機材表の行のインデントになる */
  indent: number;
};

/** 一覧に並べる機材1件（親機材の候補と付属品の候補で共通） */
type ListedKizai = {
  kizaiId: number;
  kizaiNam: string;
  shozokuNam: string;
  kizaiGrpCod: number | null;
};

/** 親機材1つと、それに付けた付属品のまとまり */
type KizaiGroup = { parent: KizaiOption; children: KizaiSetOption[] };

/** 選択を切り替える（チェックボックスの行を押したとき） */
const toggle = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]);

/**
 * 機材の一覧表。kikikanの機材選択（EqptTable）と同じく、グループコードが変わるところに点線を引く
 */
const KizaiListTable = ({
  list,
  selectedIds,
  onToggle,
  height,
}: {
  list: ListedKizai[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  height: string | number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 部門の切り替え・検索で中身が変わったら先頭に戻す
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [list]);

  return (
    <TableContainer ref={containerRef} component={Paper} variant="outlined" square sx={{ height }}>
      <Table stickyHeader padding="none" size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>機材名</TableCell>
            <TableCell>在庫場所</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.flatMap((row, index) => {
            const selected = selectedIds.includes(row.kizaiId);
            const next = list[index + 1];
            const cells = [
              <TableRow
                hover
                key={row.kizaiId}
                onClick={() => onToggle(row.kizaiId)}
                role="checkbox"
                aria-checked={selected}
                selected={selected}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell padding="checkbox">
                  <Checkbox color="primary" checked={selected} />
                </TableCell>
                <TableCell>{row.kizaiNam}</TableCell>
                <TableCell sx={{ px: 1, whiteSpace: 'nowrap' }}>{row.shozokuNam}</TableCell>
              </TableRow>,
            ];
            if (!next || row.kizaiGrpCod !== next.kizaiGrpCod) {
              cells.push(
                <TableRow key={`divider-${index}`}>
                  <TableCell colSpan={3}>
                    <Box height={10} alignContent="center">
                      <Divider sx={{ borderStyle: 'dashed', borderColor: 'CaptionText', borderBottomWidth: 2 }} />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            }
            return cells;
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

type KizaiAddDialogProps = {
  open: boolean;
  /** 「名称」欄と同じ機材の候補（kikikanの表示順） */
  kizaiOptions: KizaiOption[];
  /** 部門の一覧（kikikanの表示順） */
  bumonOptions: BumonOption[];
  /** 機材表にすでにある機材のID。重複の確認に使う */
  existingKizaiIds: number[];
  onClose: () => void;
  /** 選び終わった機材を、機材表に入れる順で渡す */
  onConfirm: (kizai: AddedKizai[]) => void;
};

/**
 * 機材追加ダイアログ。kikikanの機材明細画面の「機材追加」（EqptSelectionDialog）と同じ操作にしている。
 *
 * 1. 部門を選ぶか機材名キーワードで検索し、機材を複数選んで「確定」
 * 2. 機材表にすでにある機材が含まれていれば、1件ずつ追加してよいか確かめる
 * 3. セットオプション（kikikanの`m_kizai_set`）がある機材は、付属品を選ばせる。
 *    「別セット選択」で同じ機材をもう1セット足せる。付属品はインデント付きで親機材の直下に入る
 * 4. kikikanと同じ表示順（部門のグループ→表示順）に並べ替えて機材表へ渡す
 *
 * 機材・部門の一覧は機材表画面が読み込み済みのものを使う。kikikanへ取りに行くのは
 * セットオプションだけ（確定時に、選んだ機材の分をまとめて1回）。
 * キーワード検索もkikikan（機材名のILIKE）と同じく大文字・小文字を区別しない部分一致で、画面内で絞る。
 */
const KizaiAddDialog = ({
  open,
  kizaiOptions,
  bumonOptions,
  existingKizaiIds,
  onClose,
  onConfirm,
}: KizaiAddDialogProps) => {
  const theme = useTheme();

  const [query, setQuery] = useState('');
  /** 検索した結果を出しているか（部門を選ぶと部門の一覧に戻る） */
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [selectedBumonId, setSelectedBumonId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** 重複の確認待ちの機材（先頭から1件ずつ聞く） */
  const [duplicateQueue, setDuplicateQueue] = useState<KizaiOption[]>([]);
  /** 確認中に「いいえ」を選んで外した機材 */
  const [excludedIds, setExcludedIds] = useState<number[]>([]);

  /** セットオプションの選択中の状態 */
  const [bundle, setBundle] = useState<{
    /** 付属品を選ばせる親機材（kikikanの表示順） */
    parents: KizaiOption[];
    setOptions: Record<number, KizaiSetOption[]>;
    /** いま選ばせている親機材のindex */
    index: number;
    /** ここまでに確定したまとまり（付属品の無い機材も含む） */
    groups: KizaiGroup[];
  } | null>(null);
  const [bundleSelectedIds, setBundleSelectedIds] = useState<number[]>([]);

  // 開き直したら前回の選択は持ち越さない
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSearchedQuery(null);
    setSelectedBumonId(null);
    setSelectedIds([]);
    setLoading(false);
    setError('');
    setDuplicateQueue([]);
    setExcludedIds([]);
    setBundle(null);
    setBundleSelectedIds([]);
  }, [open]);

  /** 表示順（kikikanのkizai_grp_cod, dsp_ord_num順）。並べ替えの基準にする */
  const orderById = useMemo(() => new Map(kizaiOptions.map((kizai, index) => [kizai.kizaiId, index])), [kizaiOptions]);
  const kizaiById = useMemo(() => new Map(kizaiOptions.map((kizai) => [kizai.kizaiId, kizai])), [kizaiOptions]);

  const list = useMemo(() => {
    if (searchedQuery !== null) {
      const keyword = searchedQuery.trim().toLowerCase();
      return keyword ? kizaiOptions.filter((kizai) => kizai.kizaiNam.toLowerCase().includes(keyword)) : kizaiOptions;
    }
    if (selectedBumonId === null) return [];
    return kizaiOptions.filter((kizai) => kizai.bumonId === selectedBumonId);
  }, [kizaiOptions, searchedQuery, selectedBumonId]);

  /** 選んだ機材を表示順に並べたもの（重複確認で外したものを除く） */
  const orderedSelection = (ids: number[]) =>
    ids
      .map((id) => kizaiById.get(id))
      .filter((kizai): kizai is KizaiOption => !!kizai)
      .sort((a, b) => (orderById.get(a.kizaiId) ?? 0) - (orderById.get(b.kizaiId) ?? 0));

  /** まとまりを表示順に並べ、平らにして機材表へ渡す */
  const finish = (groups: KizaiGroup[]) => {
    // 同じ親機材を「別セット選択」で複数作った場合は、作った順のまま隣り合わせる（安定ソート）
    const sorted = [...groups].sort(
      (a, b) => (orderById.get(a.parent.kizaiId) ?? 0) - (orderById.get(b.parent.kizaiId) ?? 0)
    );
    onConfirm(
      sorted.flatMap((group) => [
        { kizaiId: group.parent.kizaiId, kizaiNam: group.parent.kizaiNam, bumonId: group.parent.bumonId, indent: 0 },
        ...group.children.map((child) => ({
          kizaiId: child.kizaiId,
          kizaiNam: child.kizaiNam,
          bumonId: child.bumonId,
          indent: 1,
        })),
      ])
    );
  };

  /** 重複の確認が済んだ機材について、セットオプションを調べて次へ進む */
  const proceedToBundle = async (ids: number[]) => {
    const parents = orderedSelection(ids);
    if (!parents.length) return;

    setLoading(true);
    setError('');
    try {
      const setOptions = await fetchKizaiSetOptions(parents.map((kizai) => kizai.kizaiId));
      const withSet = parents.filter((kizai) => setOptions[kizai.kizaiId]?.length);
      const solo = parents.filter((kizai) => !setOptions[kizai.kizaiId]?.length);
      const soloGroups = solo.map((parent) => ({ parent, children: [] }));

      if (!withSet.length) {
        finish(soloGroups);
        return;
      }
      setBundleSelectedIds([]);
      setBundle({ parents: withSet, setOptions, index: 0, groups: soloGroups });
    } catch {
      setError('機材管理からセットオプションを取得できませんでした。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const duplicates = orderedSelection(selectedIds).filter((kizai) => existingKizaiIds.includes(kizai.kizaiId));
    if (duplicates.length) {
      setExcludedIds([]);
      setDuplicateQueue(duplicates);
      return;
    }
    void proceedToBundle(selectedIds);
  };

  /** 重複の確認で「はい」（追加する）／「いいえ」（外す）を選んだとき */
  const handleDuplicateAnswer = (add: boolean) => {
    const [current, ...rest] = duplicateQueue;
    const excluded = add ? excludedIds : [...excludedIds, current.kizaiId];
    setExcludedIds(excluded);
    setDuplicateQueue(rest);
    if (rest.length) return;

    const remaining = selectedIds.filter((id) => !excluded.includes(id));
    setSelectedIds(remaining);
    void proceedToBundle(remaining);
  };

  /** いま選んでいる付属品で、いま選ばせている親機材のまとまりを1つ作る */
  const takeCurrentGroup = () => {
    if (!bundle) return null;
    const parent = bundle.parents[bundle.index];
    const children = (bundle.setOptions[parent.kizaiId] ?? []).filter((option) =>
      bundleSelectedIds.includes(option.kizaiId)
    );
    return { parent, children };
  };

  /** 「別セット選択」：いまのセットを確定し、同じ機材でもう1セット選ばせる */
  const handleAnotherSet = () => {
    const group = takeCurrentGroup();
    if (!bundle || !group) return;
    setBundle({ ...bundle, groups: [...bundle.groups, group] });
    setBundleSelectedIds([]);
  };

  /** 「確定」：いまのセットを確定し、次の機材へ（最後なら機材表へ渡す） */
  const handleBundleConfirm = () => {
    const group = takeCurrentGroup();
    if (!bundle || !group) return;
    const groups = [...bundle.groups, group];
    if (bundle.index + 1 < bundle.parents.length) {
      setBundle({ ...bundle, index: bundle.index + 1, groups });
      setBundleSelectedIds([]);
      return;
    }
    setBundle(null);
    finish(groups);
  };

  const currentParent = bundle?.parents[bundle.index] ?? null;
  const currentDuplicate = duplicateQueue[0] ?? null;

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Box px={2} pt={1} display="flex" flexDirection="column" height="100%">
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">機材追加</Typography>
          <Button onClick={onClose}>戻る</Button>
        </Box>

        <Paper variant="outlined" sx={{ px: 2, py: 1 }}>
          <Box
            component="form"
            display="flex"
            alignItems="center"
            gap={2}
            onSubmit={(e) => {
              e.preventDefault();
              setSearchedQuery(query);
              setSelectedBumonId(null);
            }}
          >
            <Typography whiteSpace="nowrap">機材名キーワード</Typography>
            <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ flex: 1 }} />
            <Button type="submit" startIcon={<SearchIcon />}>
              検索
            </Button>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box display="flex" justifyContent="flex-end" alignItems="center" gap={2} py={0.5}>
          <Typography variant="body2" color="text.secondary">
            {selectedIds.length}件選択中
          </Typography>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={!selectedIds.length || loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            確定
          </Button>
        </Box>

        <Box display="flex" gap={1} flex={1} minHeight={0} pb={2}>
          <Box flex={5} minWidth={0}>
            <TableContainer component={Paper} variant="outlined" square sx={{ height: '100%' }}>
              <Table stickyHeader padding="none" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ px: 1 }}>部門名</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bumonOptions.map((bumon) => (
                    <TableRow
                      hover
                      key={bumon.bumonId}
                      onClick={() => {
                        setSelectedBumonId(bumon.bumonId);
                        setSearchedQuery(null);
                      }}
                      sx={{
                        cursor: 'pointer',
                        bgcolor:
                          searchedQuery === null && selectedBumonId === bumon.bumonId
                            ? alpha(theme.palette.primary.light, 0.4)
                            : undefined,
                      }}
                    >
                      <TableCell sx={{ px: 1, py: 0.5 }}>{bumon.bumonNam}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
          <Box flex={7} minWidth={0}>
            <KizaiListTable
              list={list}
              selectedIds={selectedIds}
              onToggle={(id) => setSelectedIds((prev) => toggle(prev, id))}
              height="100%"
            />
          </Box>
        </Box>
      </Box>

      {/* 重複の確認（kikikanのDuplicateDialogと同じく1件ずつ聞く） */}
      <Dialog open={!!currentDuplicate}>
        <DialogTitle>{currentDuplicate?.kizaiNam}</DialogTitle>
        <DialogContent>
          <Typography>機材表にすでにある機材です。重複して追加してもよろしいでしょうか？</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleDuplicateAnswer(true)}>はい</Button>
          <Button onClick={() => handleDuplicateAnswer(false)}>いいえ</Button>
        </DialogActions>
      </Dialog>

      {/* セットオプション（kikikanのBundleDialogと同じ操作） */}
      <Dialog open={!!bundle} onClose={() => setBundle(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              セットオプション
              {bundle && bundle.parents.length > 1 && (
                <Typography component="span" variant="body2" color="text.secondary" ml={1}>
                  {bundle.index + 1} / {bundle.parents.length}
                </Typography>
              )}
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button variant="contained" sx={{ bgcolor: green[500] }} onClick={handleAnotherSet}>
                別セット選択
              </Button>
              <Button variant="contained" onClick={handleBundleConfirm}>
                確定
              </Button>
            </Stack>
          </Box>
          <Typography variant="h6" sx={{ wordBreak: 'break-all' }}>
            {currentParent?.kizaiNam}
          </Typography>
          {bundle && currentParent && bundle.groups.some((group) => group.parent.kizaiId === currentParent.kizaiId) && (
            <Typography variant="body2" color="text.secondary">
              この機材は
              {bundle.groups.filter((group) => group.parent.kizaiId === currentParent.kizaiId).length}
              セット選択済みです。続けてもう1セット選べます。
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <KizaiListTable
            list={currentParent ? (bundle?.setOptions[currentParent.kizaiId] ?? []) : []}
            selectedIds={bundleSelectedIds}
            onToggle={(id) => setBundleSelectedIds((prev) => toggle(prev, id))}
            height={260}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
export default KizaiAddDialog;
