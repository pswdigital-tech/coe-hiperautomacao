---
phase: 02-bootstrap-and-login
status: ready_to_execute
total_plans: 4
waves: 4
---

# Phase 2 — Bootstrap + Login

## Goal

End-to-end vertical funcionando: o usuário acessa a URL, vê tela de login, autentica como `admin.fgcoop@pswdigital.com.br` / `0123456789`, é redirecionado pra `/dashboard` que mostra **"Olá, Admin FGCoop · Tenant: FGCoop"** + botão de logout. Mexer fora do `/login` sem sessão redireciona pra `/login`.

## Por que esta fatia primeiro

- Toda tela com dados depende de sessão + tenant context (RLS depende disso).
- Sem login não tem como o cliente sequer ver as 29 oportunidades já no banco.
- É o "Hello World" da stack: confirma que Next.js 16 + Supabase + RLS + Vercel-ready estão alinhados.

## Estrutura de execução (4 plans, 4 waves)

```
Wave 1  ──────────────────────────────►  02-01: Project Bootstrap
                                          (Next.js 16 + Tailwind + deps + env + types)

Wave 2  ──────────────────────────────►  02-02: Supabase Clients + Middleware
                                          (server.ts, client.ts, middleware.ts)

Wave 3  ──┬───────────────────────────►  02-03: Login UI + Server Action
          │                               (app/login/page.tsx, actions.ts)
          └───────────────────────────►  02-04: Protected Layout + Dashboard + Logout
                                          (app/(app)/layout.tsx, dashboard/page.tsx)
                                          ↑ Wave 3 plans rodam em paralelo (arquivos disjuntos)

Wave 4  ──────────────────────────────►  Smoke test (checkpoint:human-verify)
                                          dentro de 02-04
```

## Must-haves (verificação pós-execução)

**Truths observáveis:**
- Acessar `/` sem sessão redireciona pra `/login`
- Login com `admin.fgcoop@pswdigital.com.br` / `0123456789` funciona
- `/dashboard` mostra nome do usuário ("Admin FGCoop") e nome do tenant ("FGCoop")
- Logout encerra a sessão e leva pra `/login`
- Acessar `/dashboard` depois do logout redireciona pra `/login`

**Artifacts necessários (devem existir e ter implementação real):**
- `package.json` (com Next.js 16, @supabase/ssr, tailwindcss)
- `.env.local` (com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- `lib/supabase/server.ts` (cliente SSR)
- `lib/supabase/client.ts` (cliente browser)
- `lib/database.types.ts` (types gerados do schema)
- `middleware.ts` (refresh de sessão + redirect)
- `app/login/page.tsx`
- `app/login/actions.ts` (Server Action signIn)
- `app/(app)/layout.tsx` (carrega user + tenant)
- `app/(app)/dashboard/page.tsx`
- `app/(app)/logout/route.ts` (ou Server Action)

**Key links:**
- `app/login/page.tsx` chama `actions.ts` `signIn` Server Action
- `actions.ts` chama `supabase.auth.signInWithPassword`
- `middleware.ts` chama `lib/supabase/middleware.ts` `updateSession`
- `app/(app)/layout.tsx` chama `lib/supabase/server.ts` `createClient` e busca em `profiles`

## User setup (humano precisa fazer)

```yaml
user_setup:
  - service: supabase
    why: "Precisamos das credenciais para o app conectar"
    env_vars:
      - name: NEXT_PUBLIC_SUPABASE_URL
        source: "Supabase Studio → Project Settings → API → Project URL"
      - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
        source: "Supabase Studio → Project Settings → API → anon public"
      - name: SUPABASE_PROJECT_REF
        source: "Supabase Studio → Project Settings → General → Reference ID (usado pra gen types)"
    dashboard_config: []
    local_dev:
      - "Supabase CLI (opcional, só para gen types): npm install -g supabase"
      - "Precisa de SUPABASE_ACCESS_TOKEN para gen types — Supabase Studio → Account → Access Tokens → Generate new token"
```

Sem os 3 valores acima, o Plan 02-01 trava. Tudo o resto é automatizável.

## Out of scope desta fase

- Layout final com header/sidebar bonito (vem na Phase 3 quando tiver dados pra renderizar)
- Signup público (cliente é cadastrado manualmente pelo CoE)
- Recuperação de senha (pós-MVP)
- Magic link (pós-MVP)
- OAuth / SSO (pós-MVP)
- Loading skeletons / animações
- Tradução i18n (já é pt-BR direto)

## Após esta fase

Phase 3 (Lista Tabela read-only) entra direto em cima do `/dashboard`. O dashboard de hoje vira a tela com a tabela de oportunidades.
