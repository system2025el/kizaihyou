'use client';

import { IconButton, IconButtonProps, Tooltip } from '@mui/material';
import { ReactNode } from 'react';

type ToolbarIconButtonProps = Omit<IconButtonProps, 'title' | 'children'> & {
  /** マウスを載せたときに出す説明。読み上げ用のラベルにも使う */
  label: string;
  icon: ReactNode;
  /** Next.jsのLinkなどを渡すとき用（`component={Link} href=...`） */
  component?: React.ElementType;
  href?: string;
  target?: string;
};

/**
 * 画面上部に並べる、アイコンだけのボタン。
 *
 * 機能が増えるたびに文字のボタンが並んで画面が見にくくなるので、出力・タイムラインなどの
 * 補助的な操作はアイコンだけにし、説明はツールチップで出す（課題A-13）。
 * 編集・保存・申請のような主な操作は、迷わないよう文字のボタンのままにしている。
 *
 * 無効のボタンはマウスのイベントを受けずツールチップが出ないので、spanで包む。
 */
export const ToolbarIconButton = ({ label, icon, disabled, ...props }: ToolbarIconButtonProps) => (
  <Tooltip title={label}>
    <span>
      <IconButton aria-label={label} disabled={disabled} {...props}>
        {icon}
      </IconButton>
    </span>
  </Tooltip>
);
