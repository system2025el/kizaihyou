/** ログイン中のユーザー（画面・履歴記録で使う最小限の情報） */
export type CurrentUser = {
  userId: string;
  email: string;
  userNam: string;
  /** 権限のビットマスク（m_user.permission）。判定は`hasPermission`で行う */
  permission: number;
};
