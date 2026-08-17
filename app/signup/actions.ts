'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { passwordPolicyError } from '@/lib/auth/password-policy';

export type SignUpResult =
  | { error: string }
  | { ok: true; needsConfirmation: true }
  | void;

/**
 * Cadastro self-service GATED por convite. A trava real é server-side: o trigger
 * `handle_new_user` (migration 0022) rejeita e-mails sem convite pendente. Aqui
 * só validamos formato e traduzimos o erro do trigger numa mensagem amigável.
 */
export async function signUp(formData: FormData): Promise<SignUpResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();

  if (!fullName) {
    return { error: 'Informe seu nome completo.' };
  }
  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }
  const weak = passwordPolicyError(password);
  if (weak) {
    return { error: weak };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null } },
  });

  if (error) {
    // Trigger sem convite → "Database error saving new user". Não distinguimos
    // do resto pra não vazar info; a causa dominante é e-mail não autorizado.
    return {
      error:
        'Não foi possível criar a conta. Confirme com o administrador se o seu e-mail foi liberado.',
    };
  }

  // Confirmação de e-mail desligada → sessão já vem → entra direto.
  if (data.session) {
    redirect('/opportunities');
  }

  // Confirmação de e-mail ligada → usuário precisa confirmar antes de logar.
  return { ok: true, needsConfirmation: true };
}
