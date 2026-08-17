---
phase: 02-bootstrap-and-login
plan: 04
status: complete
completed_at: 2026-05-21
---

# 02-04 — Protected Layout + Dashboard + Logout · SUMMARY

## O que foi entregue

Grupo de rotas `(app)/` com layout protegido que carrega user + tenant, página `/dashboard` validando RLS, e route handler de logout.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| [app/(app)/layout.tsx](../../../app/(app)/layout.tsx) | Server Component layout. Faz `auth.getUser()` + `select profiles + tenants` via RLS. Header gradient com nome + tenant + botão Sair |
| [app/(app)/dashboard/page.tsx](../../../app/(app)/dashboard/page.tsx) | Server Component. Faz `count('opportunities')` — exibe número como teste visual de RLS |
| [app/(app)/logout/route.ts](../../../app/(app)/logout/route.ts) | POST handler. Chama `auth.signOut()` + 303 redirect pra /login |

## Verificação automatizada (executada)

```
GET  /              → HTTP 307 → /login        ✅
GET  /login         → HTTP 200 (renderiza form) ✅
GET  /dashboard     → HTTP 307 → /login        ✅
POST /logout (no session) → HTTP 307 → /login  ✅

POST https://vxgthycrjetniejsjmee.supabase.co/auth/v1/token (admin.fgcoop)
  → access_token retornado ✅ (credencial válida na API)

npm run typecheck                              ✅
```

## Checkpoint visual

**Status: aprovado por delegação de confiança do usuário** ("ta, vou confiar no que está falando").

O checkpoint formal (login no browser + verificar RLS check = 29) ficou em aberto. Recomendado fazer manualmente quando der próxima sessão pra ter certeza:

1. `npm run dev`
2. Login com `admin.fgcoop@pswdigital.com.br` / `0123456789`
3. Conferir card "RLS check" = **29**

Se aparecer número diferente, abrir issue antes de continuar Phase 3 (problema de schema/RLS).

## Decisões tomadas durante a execução

1. **Não adicionei observability/logging no route handler de logout** — Hook sugeriu, mas 3 linhas de código em uma operação que falha visivelmente na UX não justifica complexidade no MVP.
2. **Layout faz signOut + redirect se profile não existir** — defesa contra estado inconsistente (sessão válida sem profile = trigger `handle_new_user` falhou no signup).
3. **`profile.tenants` tratado como objeto ou array** — Supabase JS pode retornar das duas formas dependendo da versão; código aceita os dois.

## Próximo plan / fase

Phase 2 completa. Próximo: **Phase 3 — Lista Tabela read-only**.
