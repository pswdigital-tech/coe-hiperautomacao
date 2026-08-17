'use server';

import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/site-url';

export type ForgotPasswordResult = { ok: true } | { error: string };

/**
 * Dispara o e-mail de recuperação de senha.
 *
 * SEGURANÇA — a resposta é SEMPRE `{ ok: true }` quando o e-mail tem formato
 * válido, independente de existir conta ou não. Diferenciar as respostas
 * transformaria a tela num oráculo de enumeração de usuários. O rate limit de
 * envio é do próprio Supabase Auth (e o erro dele também é engolido aqui).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<ForgotPasswordResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Informe um e-mail válido.' };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // O client SSR grava o code_verifier (PKCE) em cookie httpOnly; o callback
  // troca o `code` do link por sessão. Se o usuário abrir o link em outro
  // navegador, o callback cai no fallback token_hash/verifyOtp.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  return { ok: true };
}
