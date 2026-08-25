import React from 'react';

import { ensureCurrentUser } from '@/app/_lib/auth/funcs';

import AppShell from './_ui/app-shell';

/**
 * ハンバーガーメニュー付きの画面の外枠。
 *
 * ログイン中のユーザーはここ（サーバー側）で取得してヘッダーに渡す。
 * AppShellはクライアントコンポーネントなので、あちらで取りに行くと
 * 表示までに氏名が空の状態が一瞬挟まる。
 */
const MainLayout = async ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const user = await ensureCurrentUser();
  return <AppShell userNam={user?.userNam ?? ''}>{children}</AppShell>;
};
export default MainLayout;
