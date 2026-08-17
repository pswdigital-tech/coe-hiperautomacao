---
phase: 17
slug: acesso-multi-tenant-do-staff-psw-por-atribui-o
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-06
---

# Phase 17 — Validation Strategy

> Contrato de validação da fase para amostragem de feedback durante a execução.
> Derivado de `17-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.2.0 (`pool: 'forks'` + `singleFork: true` — serializa specs contra a mesma instância Supabase) |
| **Config file** | `vitest.config.ts` (raiz) |
| **Quick run command** | `npx vitest run tests/security/psw-staff-isolation.test.ts` (arquivo a criar) |
| **Full suite command** | `npm run test` — `npm run test:security` roda só `tests/security/` |
| **Estimated runtime** | ~10–40s (suite de segurança; specs entram em `describe.skipIf` sem `.env.test`) |

**Regra do projeto:** testes de RLS **nunca** usam mock. Rodam contra Supabase
Cloud real, com client autenticado por JWT de usuário de teste
(`tests/setup/supabase-test-client.ts` → `authedClient(email, password)`), e
`serviceRoleClient()` só em `beforeAll`/`afterAll` e para provar que a linha do
outro tenant continua intacta depois de uma escrita que deveria falhar.

---

## Sampling Rate

- **Após cada commit de task:** `npx vitest run tests/security/psw-staff-isolation.test.ts` + `npx tsc --noEmit`
- **Após cada wave:** `npm run test:security` (zero regressão nas suítes de isolamento existentes)
- **Antes de `/gsd-verify-work`:** `npm run test` verde + `tsc --noEmit` limpo
- **Max feedback latency:** ~60s

---

## Per-Task Verification Map

> Preenchido pelo `gsd-planner` com os IDs reais das tasks. O mapa Req→teste
> abaixo é o contrato que as tasks precisam satisfazer.

| Requirement | Comportamento verificado | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| ACCESS-01 | `psw_staff` existe no enum; profile com esse papel loga sem erro | integration | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "loga sem erro"` | ❌ W0 |
| ACCESS-02 | Um único `auth.users`/`profiles` atende N empresas (sem cadastro duplicado) | integration | `… -t "cadastro único"` | ❌ W0 |
| ACCESS-03 | Trigger de coerência: mesmo tenant OK / outro tenant não-PSW REJEITA / `psw_staff` em qualquer tenant OK / `tenant_id` da linha ≠ da oportunidade REJEITA | integration (trigger) | `… -t "check_assignee_tenant"` | ❌ W0 |
| **ACCESS-04** | **Teste negativo decisivo:** `psw_staff` atribuído à oportunidade X do tenant A **não** vê a oportunidade Y do **mesmo** tenant A | integration (RLS) | `… -t "não vê oportunidade não atribuída do mesmo tenant"` | ❌ W0 |
| ACCESS-05 | Cada tabela filha (7 + `audit_log` condicional + Storage) só devolve linhas da oportunidade atribuída | integration (1 spec por tabela) | `… -t "tabelas filhas"` | ❌ W0 |
| ACCESS-06 | Escrita permitida no escopo e rejeitada fora — **relendo a linha via service-role**, nunca só `error === null` | integration | `… -t "escrita escopada"` | ❌ W0 |
| ACCESS-07 | Suítes de isolamento existentes continuam verdes **sem edição** | regressão | `npm run test:security` | ✅ existe |
| ACCESS-08 | Listagem do `psw_staff` traz oportunidades de tenants distintos; filtro por empresa restringe | integration/unit | `… -t "lista unificada"` | ❌ W0 |
| ACCESS-09 | `tenant_admin` **não** insere `invited_emails` com `role='psw_staff'`; `platform_admin` insere | integration (RLS) | `… -t "invited_emails"` | ❌ W0 |
| ACCESS-10 | `psw_staff` sem atribuição não ganha acesso via `is_platform_admin()` e vice-versa | integration (sanity) | `… -t "psw_staff != platform_admin"` | ❌ W0 |
| ACCESS-11 | `psw_staff` atribuído à oportunidade é aceito como `assignee_id` de tarefa dela; profile de outro tenant não-PSW continua rejeitado | integration (trigger) | `… -t "assignee de tarefa"` | ❌ W0 |
| SC-10 | `tsc --noEmit` limpo após `TenantRole` ganhar `psw_staff` | build check | `npx tsc --noEmit` | ✅ existe |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/security/psw-staff-isolation.test.ts` — arquivo único cobrindo ACCESS-01..06, 08..11, no padrão de `tests/security/platform-admin-cross-tenant.test.ts`
- [ ] `tests/helpers/auth-as.ts` — adicionar `asPswStaff()` (padrão de `asFgcoop`/`asAcme`)
- [ ] `tests/setup/seed-test-tenants.ts` — tenant/perfil de teste da PSW (`PSW_TEST_ID`, `PSW_STAFF_TEST_EMAIL`) + seed que promove o usuário a `role='psw_staff'`
- [ ] Framework install: **nenhum** — Vitest já configurado

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Apply das migrations `0039`/`0040+` no SQL Editor do Supabase Cloud | ACCESS-01..11 | Write-only mode — o projeto não aplica migration por CLI (type-gen/CLI sem privilégio) | Colar a `0039` sozinha e rodar; confirmar; só então colar a seguinte. Modelo: `16-01-MIGRATION-HANDOFF.md` |
| Lista unificada com coluna + filtro de empresa e badge de origem | ACCESS-08 | Verificação visual — não há UI-SPEC nesta fase (gate de UI dispensado deliberadamente) | Logar como `psw_staff` com atribuições em 2 tenants; conferir coluna Empresa, filtro e ausência do seletor `?empresa=` do platform_admin |
| Download de anexo de oportunidade atribuída (Storage) | ACCESS-05 | Depende do bucket privado real | Abrir oportunidade atribuída de outro tenant e baixar um documento — sem 403 |

---

## Riscos de ambiente

`.env.test` apontando para um projeto Supabase Cloud **de teste** segue pendente
desde a Phase 7.5. Sem ele, os specs desta fase entram em `describe.skipIf` —
aceitável para CI, **insuficiente** como prova de RLS. O gate humano do apply
das migrations deve coincidir com pelo menos uma execução real desta suíte.

---

## Validation Sign-Off

- [ ] Toda task tem verify `<automated>` ou dependência declarada de Wave 0
- [ ] Continuidade de amostragem: nunca 3 tasks seguidas sem verify automatizado
- [ ] Wave 0 cobre todas as referências MISSING
- [ ] Sem flags de watch-mode
- [ ] Latência de feedback < 60s
- [ ] `nyquist_compliant: true` no frontmatter

**Approval:** pending
