import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ResetPasswordForm from './reset-password-form';

/**
 * Só é acessível com a sessão de recuperação criada pelo /auth/callback.
 * Sem sessão → volta pro /login (o proxy já faria isso, mas a checagem local
 * mantém a garantia caso o matcher mude).
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?erro=link_invalido');

  return <ResetPasswordForm email={user.email ?? ''} />;
}
