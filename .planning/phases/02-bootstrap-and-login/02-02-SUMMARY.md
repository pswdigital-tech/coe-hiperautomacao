---
phase: 02-bootstrap-and-login
plan: 02
status: complete
completed_at: 2026-05-21
---

# 02-02 — Supabase Clients + Proxy · SUMMARY

## Desvio importante do PLAN

**O PLAN dizia "middleware.ts". Realidade do Next.js 16: arquivo se chama `proxy.ts` e a função se chama `proxy`** (não `middleware`).

Validation hook do `routing-middleware` flagou. Confirmado em `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`:

> "Starting with Next.js 16, Middleware is now called Proxy to better reflect its purpose. The functionality remains the same."

Outras mudanças:
- Runtime padrão agora é Node.js (não mais Edge).
- `runtime` config option não pode ser definido em arquivo proxy (erro se tentar).
- API funcional (NextRequest, NextResponse, matcher) é idêntica.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| [lib/supabase/server.ts](../../../lib/supabase/server.ts) | Cliente Supabase para Server Components / Server Actions / Route Handlers |
| [lib/supabase/client.ts](../../../lib/supabase/client.ts) | Cliente Supabase para Client Components (browser) |
| [lib/supabase/session.ts](../../../lib/supabase/session.ts) | Helper `updateSession()` — refresca sessão + route guard. Renomeado de `middleware.ts` pra evitar colisão com a convenção Next |
| [proxy.ts](../../../proxy.ts) | Next 16 Proxy (substitui `middleware.ts`). Chama `updateSession` |

## Route guard implementado

| Caso | Comportamento |
|---|---|
| `/` sem sessão | 307 → `/login` |
| `/` com sessão | 307 → `/dashboard` |
| `/login` sem sessão | passa (renderiza login) |
| `/login` com sessão | 307 → `/dashboard` |
| `/dashboard`, `/qualquer-rota` sem sessão | 307 → `/login` |
| `/dashboard`, `/qualquer-rota` com sessão | passa |
| `/_next/*`, `/favicon.ico`, `*.svg/.png/...` | passa (matcher exclui) |

## Acceptance criteria

| Critério | Status |
|---|---|
| Importar `createClient` de `lib/supabase/server.ts` retorna cliente tipado | ✅ |
| Importar `createClient` de `lib/supabase/client.ts` retorna cliente para Client Components | ✅ |
| `proxy.ts` intercepta requests, refresca sessão, redireciona não-autenticados | ✅ |
| `proxy.ts` exporta função `proxy` (não `middleware`) — alinhado com Next 16 | ✅ |
| `proxy.ts` tem `config.matcher` excluindo assets | ✅ |
| `npm run typecheck` passa | ✅ |
| Smoke test: `curl /` redireciona para `/login` | ✅ HTTP 307 |
| Smoke test: `curl /dashboard` redireciona para `/login` | ✅ HTTP 307 |

## Próximo plan

**02-03** — Login UI + Server Action (`app/login/page.tsx`, `app/login/actions.ts`). Vai consumir `createClient` de `lib/supabase/server.ts`.
