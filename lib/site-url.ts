import 'server-only';
import { headers } from 'next/headers';

/**
 * Origin absoluto da requisição atual (ex.: https://coe-hiperautomacao.vercel.app).
 * Usado para montar o `redirectTo` dos e-mails transacionais do Supabase.
 *
 * Ordem de precedência:
 *   1. NEXT_PUBLIC_SITE_URL  — override explícito (domínio do cliente)
 *   2. x-forwarded-host/proto — cadeia de proxy da Vercel
 *   3. host                   — dev local
 *
 * IMPORTANTE: todo domínio usado aqui precisa estar na allowlist
 * "Redirect URLs" do Supabase (Auth → URL Configuration), senão o link do
 * e-mail cai no SITE_URL padrão do projeto.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  return `${proto}://${host}`;
}

/**
 * Sanitiza um destino pós-login vindo da query string. Só aceita caminho
 * relativo simples — bloqueia open redirect (`//evil.com`, `https://evil.com`).
 */
export function safeNextPath(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
