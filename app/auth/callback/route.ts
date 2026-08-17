import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/site-url';

/**
 * Callback dos links de e-mail do Supabase Auth (recuperação de senha, convite,
 * confirmação). Suporta os dois formatos de template:
 *
 *   • `?code=...`                → fluxo PKCE (template padrão `{{ .ConfirmationURL }}`),
 *                                  exige o cookie code_verifier gravado na Server Action.
 *   • `?token_hash=&type=`       → template `{{ .TokenHash }}`; funciona mesmo se o link
 *                                  for aberto em outro navegador/dispositivo.
 *
 * Em ambos os casos a troca é feita SERVER-SIDE: o token do link nunca vira
 * sessão no browser sem passar por aqui, e é single-use (o Supabase invalida).
 * Falha → volta pro /login com mensagem genérica (sem vazar o motivo).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'), '/opportunities');

  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  if (!ok) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?erro=link_invalido';
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = next;
  url.search = '';
  return NextResponse.redirect(url);
}
