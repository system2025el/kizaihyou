/** ログイン中のユーザー（画面・履歴記録で使う最小限の情報） */
export type CurrentUser = {
  userId: string;
  email: string;
  userNam: string;
};
