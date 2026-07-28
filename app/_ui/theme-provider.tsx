'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { jaJP } from '@mui/material/locale';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

const theme = createTheme(
  {
    typography: {
      fontFamily: 'var(--font-noto-sans-jp)',
    },
    cssVariables: true,
    palette: {
      mode: 'light',
    },
  },
  jaJP
);

const ThemeProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};
export default ThemeProvider;
