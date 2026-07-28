import z from 'zod';

export const UserSchema = z.object({
  email: z.string().email({ message: '正しいメールアドレスを入力してください。' }),
  password: z.string().min(1, { message: 'パスワードを入力してください。' }),
});
export type UserValues = z.infer<typeof UserSchema>;
