# Tests — Phase 7.5 Security Hardening

Suíte de testes de integração contra Supabase local. **NÃO usa mocks de DB** — testa RLS
contra o Postgres real (decisão locked em CONTEXT.md Bloco A).

## Pré-requisitos

1. Docker rodando (Supabase local usa containers).
2. `supabase start` — inicia Postgres + Auth + Storage local.
3. Copiar `.env.test.example` para `.env.test` e preencher com as chaves de `supabase status`.

## Comandos

- `npm run test` — roda toda a suite.
- `npm run test:security` — só `tests/security/`.
- `npm run test:watch` — modo dev.
- `npm run test -- tests/security/atomicity.test.ts` — um arquivo.

## Como funciona

1. `global-setup.ts` valida que `.env.test` não aponta para prod e roda `seedTestTenants()`.
2. Cada teste autentica como `fgcoop-user@test.local` ou `acme-user@test.local` e usa o
   cliente JWT — ou seja, RLS está ligado e age como em produção.
3. `serviceRoleClient()` é usado apenas para setup/asserts cross-tenant.

## Layout

```
tests/
├── README.md                       (este arquivo)
├── setup/
│   ├── global-setup.ts            (vitest globalSetup — assertSafeEnv + seed)
│   ├── supabase-test-client.ts    (serviceRoleClient + authedClient)
│   └── seed-test-tenants.ts       (seed idempotente fgcoop-test + acme-test)
├── helpers/
│   └── auth-as.ts                 (asFgcoop, asAcme, asService — atalhos)
└── security/
    ├── tenant-isolation.test.ts   (Wave 3 — Plan 04)
    ├── mass-assignment.test.ts    (Wave 2 — Plan 03)
    ├── atomicity.test.ts          (Wave 1 — Plan 02)
    ├── public-form.test.ts        (Wave 5 — Plan 06)
    └── turnstile.test.ts          (Wave 5 — Plan 06)
```

## Anti-pattern: nunca mocke `supabase.from`

Mockar mascara o próprio bug que estes testes existem para pegar.
Os testes desta phase rodam contra Postgres real com RLS habilitado.

## Tenants e usuários de teste

| Tenant | ID                                     | Slug         | Usuário                    | Senha               |
|--------|----------------------------------------|--------------|----------------------------|---------------------|
| FGCoop | `11111111-1111-1111-1111-111111111111` | `fgcoop-test`| `fgcoop-user@test.local`   | `test-password-123` |
| Acme   | `22222222-2222-2222-2222-222222222222` | `acme-test`  | `acme-user@test.local`     | `test-password-123` |

Constantes exportadas em `tests/setup/seed-test-tenants.ts` — use-as nos specs em vez de
hardcodar strings.

## Segurança do ambiente de teste

`global-setup.ts` chama `assertSafeEnv()` antes de qualquer seed. Se
`NEXT_PUBLIC_SUPABASE_URL` não bater com `http://127.0.0.1`, `http://localhost` ou um
host `*-test.supabase.co`, o setup **aborta** com erro explícito. Defesa contra rodar
testes destrutivos contra produção.
