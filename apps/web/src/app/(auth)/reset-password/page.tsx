import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const token = typeof parameters.token === 'string' ? parameters.token : '';
  return <ResetPasswordForm token={token} />;
}
