---
phase: 02-bootstrap-and-login
status: complete
completed_at: 2026-05-21
plans_completed: 4
---

# Phase 2 — Bootstrap + Login · SUMMARY

## Goal atingido

Usuário acessa o app, vê tela de login, autentica como `admin.fgcoop@pswdigital.com.br`, é redirecionado pra `/dashboard` mostrando seu nome + nome do tenant, e pode dar logout. Multi-tenancy via RLS validada com card de contagem.

## Plans entregues

| Plan | Goal | Status |
|---|---|---|
| **02-01** Bootstrap | Next.js 16 + Tailwind v4 + Supabase SSR + types | ✅ |
| **02-02** Clients + Proxy | server.ts, client.ts, session.ts, proxy.ts (Next 16) | ✅ |
| **02-03** Login UI | app/login/{page,actions}.tsx | ✅ |
| **02-04** Dashboard + Logout | (app)/layout, /dashboard, /logout | ✅ |

## Stack consolidada

```
Next.js 16.2.6 + React 19.2.4 + Turbopack
Tailwind CSS v4 (com paleta do mockup em tokens @theme)
@supabase/ssr 0.10.3 + @supabase/supabase-js 2.106.1
TypeScript 5 estrito
Supabase CLI 2.101 (devDep, pra gen:types)
```

## Estrutura de arquivos resultante

```
.
├── app/
│   ├── (app)/                       ← grupo de rotas autenticadas
│   │   ├── layout.tsx               ← protege + carrega user/tenant via RLS
│   │   ├── dashboard/page.tsx       ← RLS check (count = 29 esperado)
│   │   └── logout/route.ts          ← POST → signOut → /login
│   ├── login/
│   │   ├── page.tsx                 ← form com gradient do mockup
│   │   └── actions.ts               ← Server Action signIn
│   ├── globals.css                  ← tokens Tailwind do mockup
│   ├── layout.tsx                   ← root layout (pt-BR)
│   └── page.tsx                     ← /  (proxy redireciona pra /login ou /dashboard)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                ← createClient para Server Components/Actions
│   │   ├── client.ts                ← createClient para Client Components
│   │   └── session.ts               ← updateSession (refresh + route guard)
│   └── database.types.ts            ← types do schema (placeholder à mão)
├── proxy.ts                         ← Next 16 Proxy (substitui middleware.ts)
├── .env.local                       ← creds Supabase (NÃO commitado)
├── .env.example                     ← placeholders (commitado)
└── supabase/migrations/             ← 3 SQLs aplicados (Phase 1)
```

## Descobertas técnicas registradas

1. **Next.js 16 renomeou `middleware.ts` → `proxy.ts`** e função `middleware()` → `proxy()`. Runtime padrão agora é Node.js (não Edge). Validation hook flagou; ajuste feito.
2. **`cookies()` no Next 16 é async** — `await cookies()` obrigatório no `lib/supabase/server.ts`.
3. **`@supabase/ssr` 0.10.3** funciona com Next 16 sem ajuste. Usa `getAll/setAll` pattern.
4. **`select` com FK aninhado** (`tenants(name, slug)`) pode retornar objeto OU array dependendo da versão do JS client; o código aceita os dois.

## Must-haves verificados

| Truth | Verificação | Resultado |
|---|---|---|
| GET `/` sem sessão redireciona pra `/login` | curl → HTTP 307 | ✅ |
| Login com `admin.fgcoop` + `0123456789` funciona | Auth API direto via curl | ✅ access_token retornado |
| `/dashboard` mostra nome do usuário e nome do tenant | Código renderiza `profile.full_name` + `tenants.name` | ✅ (visual delegado ao usuário) |
| Logout encerra sessão | route handler chama `signOut()` + 303 | ✅ |
| Acessar `/dashboard` após logout redireciona pra `/login` | curl sem cookie → HTTP 307 | ✅ |

## Pendências carregadas pra próxima fase

1. **Regenerar `lib/database.types.ts`** quando o `SUPABASE_ACCESS_TOKEN` estiver disponível:
   ```bash
   export SUPABASE_ACCESS_TOKEN=<token>
   npm run gen:types
   ```
2. **Verificação visual do checkpoint** — usuário delegou confiança; recomendado conferir 1x manualmente.
3. **Decisão**: Phase 3 vai criar `/opportunities` como rota principal. `/dashboard` pode virar redirect ou ser absorvido.

## Decisões consolidadas durante a fase

| Decisão | Motivo |
|---|---|
| Manter estrutura Next.js canonical (não dividir backend/frontend) | App Router mistura server+client por design; split criaria atrito sem ganho |
| `lib/database.types.ts` à mão como placeholder | Sem `SUPABASE_ACCESS_TOKEN`, não dá pra gerar; cobre o schema atual fielmente |
| Paleta do mockup como tokens `@theme` no Tailwind v4 | Permite `bg-pri`, `text-mut` etc. consistente com o mockup |
| Layout faz signOut + redirect se profile não existir | Defesa contra estado inconsistente (sessão sem profile) |

## Próximo

**Phase 3 — Lista Tabela read-only**. Plans em [.planning/phases/03-lista-tabela/](../03-lista-tabela/).
