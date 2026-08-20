'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextFieldElement, useForm } from 'react-hook-form-mui';

import { ensureCurrentUser } from '@/app/_lib/auth/funcs';
import { createClient } from '@/app/_lib/db/supabase-client';

import { UserSchema, UserValues } from '../_lib/types';

const Login = () => {
  const router = useRouter();
  const [error, setError] = useState('');

  const { control, handleSubmit } = useForm<UserValues>({
    mode: 'onChange',
    reValidateMode: 'onChange',
    resolver: zodResolver(UserSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: UserValues) => {
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) {
      setError('メールアドレスかパスワードが違います。');
      return;
    }
    // ログイン直後にユーザープロファイル（m_user）を用意しておく
    await ensureCurrentUser();
    router.refresh();
    router.push('/equipment-table-list');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="column" spacing={4} justifyContent="center" alignItems="center" width="100%" height="100vh">
        <Typography variant="h5">機材表 ログイン</Typography>
        <Typography variant="caption" color="error">
          {error}
        </Typography>
        <Box width="30%" minWidth={280}>
          <Typography>ログインID（メールアドレス）</Typography>
          <TextFieldElement name="email" control={control} type="email" required fullWidth />
        </Box>
        <Box width="30%" minWidth={280}>
          <Typography>パスワード</Typography>
          <TextFieldElement name="password" control={control} type="password" required fullWidth />
        </Box>
        <Box display="flex" width="30%" minWidth={280} justifyContent="flex-end">
          <Button type="submit">ログイン</Button>
        </Box>
      </Stack>
    </form>
  );
};
export default Login;
