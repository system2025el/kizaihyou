import './globals.css';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import type { Metadata } from 'next';
import React from 'react';

import { notoSansJp } from './_ui/fonts';
import ThemeProvider from './_ui/theme-provider';

export const metadata: Metadata = {
  title: {
    template: '%s - 機材表',
    default: '機材表',
  },
  description: '',
};

const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html lang="ja">
      <body className={notoSansJp.variable}>
        <AppRouterCacheProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
};
export default Layout;
