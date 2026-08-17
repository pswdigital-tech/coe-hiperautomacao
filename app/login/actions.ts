'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { EMPRESA_COOKIE } from '@/lib/tenants/scope';

export type SignInResult = { error: string } | void;

export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe e-mail e senha.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Não expor detalhes (rate limit, user not found, etc.) — mensagem genérica
    return { error: 'E-mail ou senha incorretos.' };
  }

  // Rede de segurança: o logout já apaga o recorte de empresa, mas ele pode
  // ter sobrado (sessão expirada, aba fechada). Toda nova sessão começa em
  // "Todas as empresas" — nunca herda o filtro de quem usou o navegador antes.
  (await cookies()).delete(EMPRESA_COOKIE);

  // redirect() em Server Action joga um erro especial — não envolva em try/catch
  redirect('/opportunities');
}
