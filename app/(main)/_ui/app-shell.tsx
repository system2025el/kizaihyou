'use client';

import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ListAltIcon from '@mui/icons-material/ListAlt';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@/app/_lib/auth/funcs';

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
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setUserMenuAnchor(null);
      // ログイン画面に戻ったあと「戻る」でログイン中の画面に戻れないよう、履歴を差し替える。
      // refreshでServer Componentsのキャッシュ（ヘッダーの氏名など）も捨てる
      router.replace('/login');
      router.refresh();
    } catch {
      setSignOutError('ログアウトに失敗しました。もう一度お試しください。');
      setSigningOut(false);
    }
  };

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
            <Box ml="auto" minWidth={0}>
              <Button
                color="inherit"
                startIcon={<AccountCircleIcon fontSize="small" />}
                onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                aria-haspopup="menu"
                title={`${userNam} でログイン中`}
                sx={{ color: 'text.secondary', textTransform: 'none', maxWidth: '100%' }}
              >
                <Typography variant="body2" noWrap>
                  {userNam}
                </Typography>
              </Button>
              <Menu
                anchorEl={userMenuAnchor}
                open={!!userMenuAnchor}
                onClose={() => setUserMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem onClick={handleSignOut} disabled={signingOut}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="ログアウト" />
                </MenuItem>
              </Menu>
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

      <Snackbar open={!!signOutError} autoHideDuration={6000} onClose={() => setSignOutError('')}>
        <Alert severity="error" onClose={() => setSignOutError('')}>
          {signOutError}
        </Alert>
      </Snackbar>
    </Box>
  );
};
export default AppShell;
