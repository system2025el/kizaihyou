'use client';

import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  { label: '機材表履歴一覧', href: '/equipment-table-list', icon: <ListAltIcon /> },
  { label: '機材表申請依頼', href: '/equipment-table-request', icon: <FactCheckIcon /> },
];

type AppShellProps = {
  children: React.ReactNode;
  /** ログイン中のユーザーの氏名。未ログインなら空文字（middlewareが/loginへ飛ばすので通常は入る） */
  userNam: string;
};

const AppShell = ({ children, userNam }: AppShellProps) => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" onClick={() => setOpen(true)} aria-label="メニューを開く" sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            機材表
          </Typography>
          {userNam && (
            <Box display="flex" alignItems="center" gap={0.5} ml="auto" color="text.secondary" minWidth={0}>
              <AccountCircleIcon fontSize="small" />
              <Typography variant="body2" noWrap title={`${userNam} でログイン中`}>
                {userNam}
              </Typography>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer open={open} onClose={() => setOpen(false)}>
        <Box width={DRAWER_WIDTH} role="presentation">
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.href}
                selected={pathname === item.href}
                onClick={() => handleNavigate(item.href)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box component="main" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
};
export default AppShell;
