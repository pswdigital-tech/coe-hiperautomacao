import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EMPRESA_COOKIE } from '@/lib/tenants/scope';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL('/login', request.url);
  // 303 força browser a fazer GET após POST
  const res = NextResponse.redirect(url, { status: 303 });
  // O recorte de empresa é escolha DAQUELA sessão de admin/staff. Se sobrevive
  // ao logout, o próximo usuário do navegador herda um filtro por uma empresa
  // que ele talvez nem enxergue — e a tela vem vazia sem explicação.
  res.cookies.delete(EMPRESA_COOKIE);
  return res;
}
