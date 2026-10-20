'use client';

import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import {
  INVITABLE_ROLES,
  KIZAIHYOU_ROLE,
  KizaihyouMember,
  KizaihyouRole,
  MemberCandidate,
  ROLE_LABELS,
} from '@/app/_lib/equipment-table/member';
import {
  addKizaihyouMember,
  changeKizaihyouMemberRole,
  fetchKizaihyouMembers,
  fetchMemberCandidates,
  removeKizaihyouMember,
} from '@/app/_lib/equipment-table/member-funcs';

/** 権限ごとにできること（ダイアログの説明に出す） */
const ROLE_DESCRIPTIONS: Record<KizaihyouRole, string> = {
  [KIZAIHYOU_ROLE.閲覧]: '見る・Excel/PDF出力・コメント・流用して新規作成',
  [KIZAIHYOU_ROLE.編集]: '閲覧に加えて、編集・保存',
  [KIZAIHYOU_ROLE.申請]: '編集に加えて、申請・取り下げ',
  [KIZAIHYOU_ROLE.持ち主]: '全部（メンバーの招待・削除・完了も）',
};

type MembersDialogProps = {
  open: boolean;
  kizaihyouId: number;
  /** ログイン中のユーザーが持ち主か（招待・権限変更・外すができる） */
  isOwner: boolean;
  onClose: () => void;
};

/**
 * 機材表のメンバーを見る・管理するダイアログ。
 * メンバーなら誰でも一覧を見られ、持ち主だけが招待・権限変更・外すをできる。
 */
const MembersDialog = ({ open, kizaihyouId, isOwner, onClose }: MembersDialogProps) => {
  const [members, setMembers] = useState<KizaihyouMember[]>([]);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [invitee, setInvitee] = useState<MemberCandidate | null>(null);
  const [inviteRole, setInviteRole] = useState<KizaihyouRole>(KIZAIHYOU_ROLE.編集);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [memberList, candidateList] = await Promise.all([
        fetchKizaihyouMembers(kizaihyouId),
        isOwner ? fetchMemberCandidates(kizaihyouId) : Promise.resolve([]),
      ]);
      setMembers(memberList);
      setCandidates(candidateList);
    } catch {
      setError('メンバーの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [kizaihyouId, isOwner]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /** 変更してから一覧を取り直す */
  const run = async (action: () => Promise<void>, failMessage: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch {
      setError(failMessage);
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = () => {
    if (!invitee) return;
    void run(async () => {
      await addKizaihyouMember(kizaihyouId, invitee.userId, inviteRole);
      setInvitee(null);
    }, '招待に失敗しました。');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle fontSize="medium">メンバー</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box mb={2}>
          {(Object.values(KIZAIHYOU_ROLE) as KizaihyouRole[]).map((role) => (
            <Typography key={role} variant="body2" color="text.secondary">
              <Chip label={ROLE_LABELS[role]} size="small" sx={{ mr: 1, minWidth: 64 }} />
              {ROLE_DESCRIPTIONS[role]}
            </Typography>
          ))}
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>氏名</TableCell>
                <TableCell>メールアドレス</TableCell>
                <TableCell sx={{ width: 140 }}>権限</TableCell>
                {isOwner && <TableCell sx={{ width: 56 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => {
                const editable = isOwner && member.role !== KIZAIHYOU_ROLE.持ち主;
                return (
                  <TableRow key={member.userId}>
                    <TableCell>{member.userNam}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {editable ? (
                        <Select
                          size="small"
                          value={member.role}
                          disabled={busy}
                          onChange={(e) =>
                            void run(
                              () => changeKizaihyouMemberRole(kizaihyouId, member.userId, Number(e.target.value)),
                              '権限の変更に失敗しました。'
                            )
                          }
                          fullWidth
                        >
                          {INVITABLE_ROLES.map((role) => (
                            <MenuItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <Chip label={ROLE_LABELS[member.role]} size="small" />
                      )}
                    </TableCell>
                    {isOwner && (
                      <TableCell>
                        {editable && (
                          <IconButton
                            size="small"
                            title="メンバーから外す"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => removeKizaihyouMember(kizaihyouId, member.userId),
                                'メンバーから外せませんでした。'
                              )
                            }
                          >
                            <PersonRemoveIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {isOwner && (
          <Box mt={3}>
            <Typography variant="subtitle2" mb={1}>
              メンバーを招待
            </Typography>
            <Box display="flex" gap={1} alignItems="center">
              <Autocomplete
                sx={{ flexGrow: 1 }}
                size="small"
                options={candidates}
                value={invitee}
                onChange={(_event, value) => setInvitee(value)}
                getOptionLabel={(option) => `${option.userNam}（${option.email}）`}
                isOptionEqualToValue={(option, value) => option.userId === value.userId}
                noOptionsText="招待できるユーザーがいません"
                renderInput={(params) => <TextField {...params} placeholder="氏名・メールアドレスで探す" />}
              />
              <Select
                size="small"
                value={inviteRole}
                onChange={(e) => setInviteRole(Number(e.target.value) as KizaihyouRole)}
                sx={{ width: 120 }}
              >
                {INVITABLE_ROLES.map((role) => (
                  <MenuItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </MenuItem>
                ))}
              </Select>
              <Button variant="contained" onClick={handleInvite} disabled={!invitee || busy}>
                招待
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              招待すると、その人の機材表履歴一覧にすぐ表示されます（通知は届かないので、本人には別途お伝えください）。
              候補に出るのは、この機材表システムにアカウントがある人だけです。
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
};
export default MembersDialog;
