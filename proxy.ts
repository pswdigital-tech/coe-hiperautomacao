import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session';

/**
 * Next.js 16 Proxy (substitui o antigo middleware.ts).
 * Roda antes de cada request:
 *   1. Refresca sessão Supabase e aplica route guard (via updateSession).
 *   2. Anexa headers de segurança (CSP, HSTS, XFO, XCTO, Referrer, Permissions).
 *
 * Phase 7.5 — Bloco E (hardening de headers).
 * Decisão locked (07.5-CONTEXT.md A6): CSP com `'unsafe-inline'` em script-src
 * é aceito como tech debt MVP. Sem nonce mantém static optimization disponível
 * para futuras rotas. Apertar com nonce-based CSP fica para Phase 8+.
 *
 * Documentação: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 */

const isDev = process.env.NODE_ENV === 'development';

// CSP montada como string única (sem quebras de linha — alguns parsers de
// header são chatos com whitespace). Em dev, adicionamos 'unsafe-eval' para o
// HMR do Next.js. Hosts permitidos:
//   - challenges.cloudflare.com → Turnstile widget (Plan 06)
//   - *.vercel.app              → preview deploys + Vercel Insights
//   - *.supabase.co + wss://    → REST + Realtime (necessário p/ KPIs reativos)
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    isDev ? " 'unsafe-eval'" : ''
  } https://challenges.cloudflare.com https://*.vercel.app`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': csp,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security':
    'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

export async function proxy(request: NextRequest) {
  // 1. Sessão Supabase + route guard (lógica preexistente).
  const response = await updateSession(request);

  // 2. Headers de segurança — aplicar AFTER updateSession porque a função
  //    pode construir um novo NextResponse para redirect. response.headers
  //    é Headers em qualquer branch (next/redirect ou next/rewrite).
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo exceto:
     *   - _next/static, _next/image (assets gerados)
     *   - favicon.ico
     *   - arquivos estáticos (svg/png/jpg/jpeg/gif/webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
