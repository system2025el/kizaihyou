import React from 'react';

import AppShell from './_ui/app-shell';

const MainLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return <AppShell>{children}</AppShell>;
};
export default MainLayout;
