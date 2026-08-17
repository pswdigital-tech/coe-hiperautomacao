---
phase: 18
slug: staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-07
---

# Phase 18 — Validation Strategy

> Contrato de validação por fase para amostragem de feedback durante a execução.
> Derivado da seção `## Validation Architecture` de [18-RESEARCH.md](18-RESEARCH.md).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existente) |
| **Quick run command** | `npm run test -- tests/security/psw-staff-admin-grant.test.ts` |
| **Full suite command** | `npm run test` |
| **Type gate** | `npm run typecheck` (`tsc --noEmit`) — obrigatório, `lib/database.types.ts` é hand-maintained |
| **Estimated runtime** | ~30–90 s (suite completa; os testes de RLS batem no Supabase Cloud) |

**Restrição estrutural herdada (RESEARCH §7):** existe **um único** usuário
`psw_staff` de teste (`asPswStaff()` em [tests/helpers/auth-as.ts:14](tests/helpers/auth-as.ts#L14)),
e [tests/security/psw-staff-isolation.test.ts](tests/security/psw-staff-isolation.test.ts)
afirma **no topo do arquivo** que ele enxerga exatamente `[X, Z]`. Consequência:
uma linha de concessão vazada quebra um arquivo que esta fase não deveria tocar.
Por isso os testes novos vão em **arquivo próprio**, medindo
baseline → conceder → revogar → baseline, em vez de cravar contagens absolutas.

---

## Sampling Rate

- **Após cada commit de task:** `npm run typecheck` + o teste do arquivo tocado
- **Após cada wave:** `npm run test` (suite completa)
- **Após cada apply de migration pelo PO:** o bloco de verificação pós-apply da
  própria migration (padrão 0044) + `npm run test -- tests/security/`
- **Antes de `/gsd-verify-work`:** suite completa verde + `typecheck` limpo
- **Max feedback latency:** ~90 s

---

## Per-Task Verification Map

> Preenchido pelo planner ao gerar os PLAN.md. As linhas abaixo são o **contrato
> mínimo** que a fase precisa provar; o planner mapeia task por task.

| Verificação | Requisito | Tipo | Comando | Status |
|-------------|-----------|------|---------|--------|
| `psw_tenant_admins` existe, com RLS ativa e 4 policies | GRANT-01 | schema | `npm run test -- tests/schema/` | ⬜ pending |
| Escrita em `psw_tenant_admins` só por `platform_admin` (staff-admin recebe erro do banco) | GRANT-06 | security | `npm run test -- tests/security/psw-staff-admin-grant.test.ts` | ⬜ pending |
| **Não-regressão:** `psw_staff` SEM concessão vê o mesmo conjunto de antes | GRANT-02, GRANT-10 | security | idem (baseline medido no próprio teste) | ⬜ pending |
| **Não-regressão:** contagens de `member` e `tenant_admin` inalteradas | GRANT-10 | security | `npm run test -- tests/security/tenant-isolation.test.ts` | ⬜ pending |
| Staff-admin de A vê tudo de A **e** as atribuídas em B | GRANT-03 | security | `npm run test -- tests/security/psw-staff-admin-grant.test.ts` | ⬜ pending |
| Staff-admin de A **não** vê nada de C (sem concessão nem atribuição) | GRANT-03 | security | idem | ⬜ pending |
| Staff-admin exerce poderes de `tenant_admin` em A (convite, equipe, branding, logs) | GRANT-04 | security | idem | ⬜ pending |
| Staff-admin recebe erro do banco ao tentar os mesmos poderes em B | GRANT-04 | security | idem | ⬜ pending |
| Server Action de admin com tenant-alvo errado **falha**, não responde `{ok:true}` com 0 linhas | GRANT-05 | unit/integration | `npm run test -- tests/security/` | ⬜ pending |
| Revogação preserva a atribuição nominal na mesma empresa | GRANT-08 | security | idem | ⬜ pending |
| Concessão órfã (papel deixou de ser `psw_staff`) não concede nada (D-S) | GRANT-01 | security | idem | ⬜ pending |
| `tsc --noEmit` limpo com a tabela nova em `lib/database.types.ts` | GRANT-01 | type | `npm run typecheck` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/security/psw-staff-admin-grant.test.ts` — arquivo novo; **não**
      editar `psw-staff-isolation.test.ts` (ver restrição estrutural acima)
- [ ] Fixture de concessão: criar/limpar linhas de `psw_tenant_admins` via
      `serviceRoleClient()`, com cleanup garantido — uma linha vazada quebra
      `psw-staff-isolation.test.ts`
- [ ] Segundo tenant de teste com oportunidades **não** atribuídas ao staff, para
      provar "vê tudo de A" de forma não-vazia (reusar `seedTestTenants()`)
- [ ] Helpers reusados, não recriados: `asPswStaff()`, `serviceRoleClient()`,
      `seedTestTenants()`, `singleFork`, `describe.skipIf`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apply de cada migration | GRANT-01..04 | WRITE-ONLY MODE — o PO aplica no SQL Editor do Supabase Cloud; o agente não tem credencial | Rodar o bloco "Verificação pós-apply" da própria migration, no padrão da 0044, e conferir a contagem esperada |
| `EXPLAIN (analyze)` do inlining de `is_tenant_admin_of()` | GRANT-04 | Depende do planner do Postgres no banco real; a mecânica está marcada `[ASSUMED: A2]` na pesquisa | Bloco `EXPLAIN` incluído na migration; confirmar que aparece subplano hasheado avaliado 1x por statement, não chamada por linha |
| Tela `/admin/staff` — conceder, revogar com confirmação quantificada, duas origens separadas | GRANT-07, GRANT-08, GRANT-09 | Verificação visual do contrato de UI | Gate visual no fechamento da fase, no padrão do 17-08 |
| Ações de escrita desabilitadas com "Todas as empresas" (D-R) | GRANT-05 | Estado de UI | Selecionar "Todas as empresas" e confirmar que as ações de escrita das telas de admin ficam desabilitadas com explicação em pt-BR |

---

## Validation Sign-Off

- [ ] Toda task tem verify automatizado ou dependência declarada de Wave 0
- [ ] Continuidade de amostragem: não há 3 tasks seguidas sem verify automatizado
- [ ] Wave 0 cobre todas as referências MISSING
- [ ] Nenhum flag de watch-mode
- [ ] Feedback latency < 90 s
- [ ] `nyquist_compliant: true` no frontmatter

**Approval:** pending
