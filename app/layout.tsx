import './globals.css';

import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: {
    template: '%s - 器材表',
    default: '器材表',
  },
  description: '',
};

const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
};
export default Layout;
