---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
verified: 2026-08-07T20:30:00Z
status: human_needed
score: 7/10 must-haves verified
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "GRANT-03 — psw_staff com concessão em A enxerga TODAS as filhas (fases/anotações/tarefas/riscos/documentos/histórico/atribuições) de oportunidades de A que não lhe foram atribuídas nominalmente, não só a linha-raiz de `opportunities`"
    test: "Conceder FGCoop (ou outro tenant com dados) a um psw_staff de teste; abrir uma oportunidade de A NÃO atribuída a ele; confirmar que as abas de anotações/tarefas/riscos/documentos/histórico carregam dados reais, não vazias"
    expected: "Todas as 7 abas filhas mostram os dados de A, exatamente como um tenant_admin de A veria"
    why_human: "A migration 0046 escreve corretamente as duas metades da RLS (permissiva + restritiva com 3º disjunto) nas 7 tabelas filhas — confirmado por leitura direta do arquivo — mas o próprio executor da fase registrou isto como 'GAP DECISIVO' (18-03-SUMMARY.md, coverage D6): nenhuma contagem de linhas visíveis nas 7 filhas foi medida em produção após o apply (WINDOWS ids 19/20/21). Presença + wiring não provam que o Postgres de fato concede as linhas em runtime."
  - truth: "GRANT-04 — dentro do tenant onde tem concessão, o staff-admin de fato consegue convidar (aceito), é rejeitado ao tentar convidar psw_staff/platform_admin, atualiza branding, e lê o log — e as mesmas tentativas são negadas num tenant B sem concessão"
    test: "Logar como staff-admin com concessão em A; em /team convidar e revogar um convite pendente; em /configuracoes trocar cor e subir logo; em /logs ver o log de A; repetir as mesmas ações num tenant B sem concessão"
    expected: "Tudo funciona e persiste em A (releitura confirma); tudo é negado em B (erro explícito no INSERT de convite, zero linhas nas leituras/updates)"
    why_human: "A RLS da 0047 foi confirmada estruturalmente em produção via pg_policies (as 11 policies presentes, chamando is_tenant_admin_of, barreira de escalada de convite literal) e a camada TS (isTenantAdminOf/resolveAdminTenantId, team/actions.ts, configuracoes/actions.ts) foi confirmada por typecheck/build/grep — mas a 'Decisiva #3' e o 'negativo em B' do handoff 18-05 nunca rodaram (WINDOWS ids 26/27), e os <human-check> das Tasks 2/3 de 18-06/18-07 também não (WINDOWS ids 32/35/36). Nenhum staff-admin real exerceu esses poderes pelo app nesta fase."
  - truth: "GRANT-05 — uma Server Action de admin com um psw_staff-admin autenticado nunca responde sucesso silencioso (zero linhas afetadas com error===null) ao gravar no tenant-alvo"
    test: "Rodar tests/security/admin-actions-tenant-scope.test.ts contra um banco real (staff-admin gravando cor/logo/convite em A, e tentando gravar em B sem concessão)"
    expected: "As 17 specs (persistência confirmada por releitura via serviceRoleClient(), nunca por error===null) passam"
    why_human: "Os 17 specs existem, tipam e coletam corretamente, mas TODOS estão em describe.skipIf(!HAS_DB) — .env.test não existe (decisão vinculante prova-por-sql-no-handoff, Plan 18-02). O mecanismo (resolveAdminTenantId + early-return) está corretamente implementado no código-fonte, mas o comportamento de escrita real do staff-admin nunca foi exercitado em runtime nesta fase."
human_verification:
  - test: "Roteiro Visual A–H completo (18-08-PLAN.md Task 3, WINDOWS id 37) — conceder, diagnosticar as duas origens, ver o que passou a ver, exercer os poderes em A, estado sem empresa selecionada, revogar com impacto quantificado, não-regressão de member/viewer/tenant_admin, concessão órfã"
    expected: "Os 8 passos descritos em 18-08-SUMMARY.md (seção 'Roteiro Visual A–H') se comportam como especificado — em particular os itens C, D, F, G e H, que a própria fase marca como os que fecham GRANT-03/04/08/10 do lado comportamental"
    why_human: "Sem acesso a browser/servidor autenticado em nenhuma sessão de execução desta fase. É o único item que a própria Phase 18 identifica como pendência para 'fechar a fase inteira'."
  - test: "Verificações de handoff não executadas: 18-03 V2/V5/V6/V7 (propagação positiva/negativa/não-regressão nas 7 filhas), 18-05 C3/C5/idempotência, 18-02 V10-V13"
    expected: "Contagens em pg_policies/pg_constraint e via impersonação de sessão confirmam exatamente o que os handoffs preveem"
    why_human: "Requer acesso ao SQL Editor de produção com uma sessão real de staff-admin/member/tenant_admin — não disponível nesta verificação. Nota de método: 18-05-SUMMARY.md registra que a técnica de impersonação por `set_config` usada nos handoffs 18-02/18-03/18-05 NÃO funciona no SQL Editor do Supabase Cloud — qualquer verificação D5/D6/D7-style desses três handoffs deve ser tratada como não-provada, não como 'provável', até ser refeita por outra técnica."
  - test: "Confirmar com o PO se `platform_admin` deveria ganhar acesso a `/team` nesta fase"
    expected: "PO decide entre as duas leituras conflitantes do texto do plano 18-07 (ação da Task 2 dizia 'super-admin entra sempre'; a prohibitions list do mesmo plano dizia o oposto)"
    why_human: "Ambiguidade textual do próprio plano, não um bug de código — ver seção 'Contradição adjudicada' abaixo para a leitura que este verificador considera correta."
---

# Phase 18: Staff PSW como Admin de Tenant (concessão pessoa × empresa) Verification Report

**Phase Goal:** um `psw_staff` passa a ser admin de N empresas ao mesmo tempo. Sem concessão ele continua vendo só as oportunidades atribuídas a ele (comportamento da `0044`, intocado); com concessão no tenant A ele vê tudo de A e exerce ali os poderes de `tenant_admin` (convites, equipe, configurações/branding, logs), sem perder as atribuições em outras empresas. Só o `platform_admin` concede e revoga, na tela `/admin/staff`.

**Verified:** 2026-08-07
**Status:** human_needed
**Re-verification:** No — initial verification

## Nota de método sobre este veredito

Esta fase operou sob um regime de prova explícito e ratificado pelo PO: **`prova-por-sql-no-handoff`**, não testes automatizados (`.env.test` não existe; toda suíte de integração em `tests/security/` está em `skip`; rodar contra produção destruiria dados reais do FGCoop por colisão de UUID de fixture). Este veredito **não penaliza** a fase por specs em skip — isso é o regime ratificado, não uma lacuna disfarçada. O julgamento abaixo separa três camadas de evidência, da mais forte para a mais fraca, seguindo a mesma hierarquia que a própria fase documentou:

1. **Observação direta pelo PO no app rodando** (mais forte) — usada para GRANT-02/03 no nível de `opportunities` (18-02-SUMMARY, D5: concessão em FGCoop revelou as 32 oportunidades; revogar voltou ao baseline).
2. **Prova estática a partir de estado vivo do banco** (`pg_get_functiondef`, `pg_policies` colados pelo PO pós-apply) — usada para GRANT-01/02/06/10 (byte-equivalência por construção, barreira de escalada de convite confirmada literalmente em produção).
3. **Testes de unidade sobre função pura, sem banco** — usada para GRANT-05 (ramos sem banco de `isTenantAdminOf`/`resolveAdminTenantId`), GRANT-07/08 (`lib/staff-admin/origins.ts`, 16/16), GRANT-02 (`psw-staff-restrictive-rule.test.ts`, 7/7).

O que **não** conta como evidência aqui, e não foi tratado como tal: `npm run test:security` saindo 0 com specs em skip; SUMMARY.md alegando "verde"; qualquer verificação D5/D6/D7-style dos handoffs 18-02/18-03/18-05 baseada em impersonação por `set_config` (o próprio 18-05-SUMMARY.md provou que essa técnica não funciona no SQL Editor do Supabase Cloud — retorna `null` para `auth.uid()`/`current_user_role()`).

## Contradição adjudicada (18-07: `/team` para `platform_admin`)

O plano 18-07 continha um texto de ação ("guard passa a ser: super-admin entra sempre") em conflito direto com sua própria lista de proibições ("NÃO alterar o comportamento... nem para super-admin") e com o comentário pré-existente do arquivo ("platform_admin não usa esta tela: ele tem /admin/invites"). O executor resolveu a favor de **zero-regressão**: `/team` continua redirecionando `platform_admin`.

**Este verificador concorda com a leitura de zero-regressão.** Três razões: (1) GRANT-10 e a Phase 17 (D-J/SC-12) tratam "nenhum papel existente muda de comportamento" como não-negociável em toda a fase — a ação da Task 2 de 18-07 é o único lugar em toda a Phase 18 que sugere o oposto, e prohibitions dentro do mesmo plano normalmente têm precedência sobre prosa de ação quando os dois colidem; (2) o `platform_admin` já tem alcance equivalente (e mais amplo) via `/admin/invites`, então não há lacuna funcional deixada; (3) a mudança oposta seria uma expansão de escopo do `platform_admin` — que o CONTEXT.md marca explicitamente como fora de escopo ("Ampliar o alcance do platform_admin — ele já vê tudo (0021) e não é o objeto desta fase"). **Não bloqueia nenhum requisito** — recomenda-se apenas que o PO confirme por escrito para fechar a ambiguidade textual do plano.

## Goal Achievement

### Observable Truths (GRANT-01 a GRANT-10)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GRANT-01 — concessão N:N pessoa×empresa existe, sem duplicar `profiles`/alterar `tenant_id` | ✓ VERIFIED | `supabase/migrations/0045_psw_tenant_admins_grant.sql` (lido diretamente): tabela `psw_tenant_admins`, `unique(profile_id,tenant_id)`, `granted_by on delete set null`; `profiles.tenant_id` não tocado. PO confirmou colunas/tipos/nulidade em produção (18-02-MIGRATION-HANDOFF verificação 1). `lib/database.types.ts` tem o bloco (confirmado por `npm run typecheck` exit 0). |
| 2 | GRANT-02 — `psw_staff` sem concessão continua idêntico ao comportamento da `0044` | ✓ VERIFIED | Os dois disjuntos originais da `0044` aparecem **literais** dentro das restritivas reemitidas de `0045` (Bloco 7) e `0046` (Bloco B) — confirmado por leitura direta dos dois arquivos nesta verificação. `tests/schema/psw-staff-restrictive-rule.test.ts` (7/7 passed, roda sem banco) trava isso para a `0044` original. Por construção, as policies novas só concedem quando `is_tenant_admin_of(tenant_id)` é `true`, o que exige uma linha em `psw_tenant_admins` — inexistente para quem nunca recebeu concessão. |
| 3 | GRANT-03 — com concessão em A, staff-admin vê tudo de A + atribuições em outras empresas, listagem unificada | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Nível `opportunities` (linha-raiz): observação direta do PO no app (18-02-SUMMARY D5) — concessão revelou as 32 oportunidades de FGCoop, revogação voltou ao baseline. Nível das 7 tabelas filhas (`0046`): as duas metades da RLS estão corretamente escritas (lido diretamente) mas o próprio executor rotulou a ausência de prova de runtime como "GAP DECISIVO" (18-03-SUMMARY, coverage D6) — nenhuma contagem de linhas nas 7 filhas foi medida em produção (WINDOWS ids 19/20/21). |
| 4 | GRANT-04 — staff-admin exerce poderes de `tenant_admin` (convites, equipe, config/branding, logs) dentro do tenant administrado | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | RLS da `0047` confirmada estruturalmente em produção via `pg_policies` (11 policies presentes chamando `is_tenant_admin_of`, barreira de escalada de convite `role <> ALL(...)` presente literalmente — 18-05-MIGRATION-HANDOFF Decisiva #2, colada pelo PO). Camada de servidor (`lib/security/role.ts`, `team/actions.ts`, `configuracoes/actions.ts`, leitura escopada de 4 telas, shell/Sidebar) confirmada por `npm run typecheck`/`npm run build` limpos e greps estruturais (verificados nesta sessão). Nenhum staff-admin real exerceu esses poderes pelo app — Decisiva #3/negativo-em-B (18-05) e os `<human-check>` de 18-06/18-07 nunca rodaram (WINDOWS ids 26/27/32/35/36). |
| 5 | GRANT-05 — Server Actions de admin usam tenant-alvo explícito e validado, nunca sucesso silencioso de zero linhas | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `resolveAdminTenantId`/`ADMIN_SCOPE_DENIED_MESSAGE` implementados corretamente (lido em `lib/security/role.ts`); ramos sem banco (papéis de cliente) provados por 12 specs passando em `tests/security/resolve-admin-tenant.test.ts` (confirmado nesta sessão: `npx vitest run` → 40 passed). O ramo NOVO (staff-admin gravando com tenant-alvo resolvido, com releitura por `serviceRoleClient()`) está em `tests/security/admin-actions-tenant-scope.test.ts`, 17 specs, **100% em skip** — nunca exercitado contra banco real. |
| 6 | GRANT-06 — só `platform_admin` concede/revoga; sem escalada lateral | ✓ VERIFIED | `psw_tenant_admins_insert`/`_delete` restritas a `is_platform_admin()` (lido em `0045`, Bloco 5). A barreira de escalada de convite (`invited_emails_insert_tenant_admin` com `role not in ('platform_admin','psw_staff')`) foi confirmada **na definição viva pós-apply** via `pg_policies`, colada literalmente pelo PO (18-05-MIGRATION-HANDOFF Decisiva #2) — é prova de estado vivo do banco, a evidência mais forte disponível para uma garantia estrutural de RLS. |
| 7 | GRANT-07 — `/admin/staff` restrita a `platform_admin`, duas origens sempre separadas | ✓ VERIFIED | Rota existe no build (`npm run build` → `/admin/staff` gerada, confirmado nesta sessão). Guard herdado de `app/(app)/admin/layout.tsx` (Phase 17, D-N). `app/(app)/admin/staff/page.tsx` lido diretamente nesta sessão: os dois blocos ("Admin nas empresas" / "Atribuições individuais") são renderizados incondicionalmente, nunca somados. `lib/staff-admin/origins.ts` — 16/16 testes de unidade passam (confirmado nesta sessão). Verificação visual real (roteiro B) pendente. |
| 8 | GRANT-08 — revogação exige confirmação quantificada; atribuição sobrevive | ✓ VERIFIED | `revokeTenantAdmin` (lido em `actions.ts`) só executa `.delete()` em `psw_tenant_admins`, nunca toca `opportunity_assignees` — confirmado por leitura direta e pela varredura de ponto único de escrita do 18-08 (grep confirmado nesta sessão: só `assignee-actions.ts` escreve na tabela de atribuição). `countOpportunitiesLostOnRevoke`/`formatRevokeImpact` cobertos pelos 16 testes de `staff-access-origins.test.ts`. Diálogo visual (roteiro F) pendente. |
| 9 | GRANT-09 — atribuição de oportunidade só é editada no `AssigneesPanel`; tela de admin nunca escreve nela | ✓ VERIFIED | `app/(app)/admin/staff/actions.ts` não contém a string `opportunity_assignees` em nenhuma linha (confirmado por grep nesta sessão). `lib/opportunities/assignee-actions.ts` (Plan 18-08) alinhado com a RLS via `isTenantAdminOf`/`WRITE_SCOPE_DENIED_MESSAGE` (lido diretamente). Varredura de 18-08 (reproduzida nesta sessão) não encontra segundo ponto de escrita. |
| 10 | GRANT-10 — zero regressão em `member`/`viewer`/`tenant_admin`/`platform_admin` | ✓ VERIFIED | Byte-equivalência provada por construção (18-05-SUMMARY): leitura das 3 funções vivas via `pg_get_functiondef` + tabela de equivalência papel-a-papel, mostrando que `is_tenant_admin_of(t)` reduz exatamente ao predicado antigo para `tenant_admin`/`member`/`viewer`/`platform_admin`. Auditoria de derivação de tenant (18-08) não encontrou ocorrência não-explicada de `profile.tenantId`. `npm run typecheck`/`npm run build` limpos. Roteiro visual item G (login real como cada papel) ainda pendente — não muda o veredito porque a prova por construção é matematicamente exaustiva (vale para todo tenant, não uma amostra). |

**Score:** 7/10 truths verified (3 present, behavior-unverified: GRANT-03/04/05)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0045_psw_tenant_admins_grant.sql` | Tabela + 3 helpers + trigger + RLS + fatia SELECT/UPDATE em opportunities/tenants | ✓ VERIFIED | Lido integralmente; aplicado em produção (confirmado via handoff colado pelo PO) |
| `supabase/migrations/0046_psw_admin_child_tables.sql` | 22 permissivas + 7 restritivas reemitidas + `profiles_select_psw_admin` | ✓ VERIFIED (texto) / ⚠️ propagação em runtime não confirmada | Lido integralmente; aplicado (V1/V4 confirmados pelo PO); V2/V5/V6/V7 não confirmados |
| `supabase/migrations/0047_tenant_admin_predicate_swap.sql` | 11 policies vivas trocadas por nome + 3 policies novas de Storage | ✓ VERIFIED | Lido integralmente; aplicado e confirmado via `pg_policies` (Decisiva #2) |
| `lib/security/role.ts` (`isTenantAdminOf`/`resolveAdminTenantId`/`resolveAdminTenantIdFromSelector`) | Par tenant-aware espelhando a RLS | ✓ VERIFIED | Lido integralmente; 40 testes relevantes passando (verificado nesta sessão) |
| `lib/staff-admin/origins.ts` | Lógica pura das duas origens/redundância/impacto | ✓ VERIFIED | Lido integralmente; 16/16 testes passando |
| `app/(app)/admin/staff/{page,actions}.tsx`, `GrantForm.tsx`, `RevokeGrantButton.tsx` | Tela de concessão/revogação | ✓ VERIFIED (código) / pendente (visual) | Lidos; rota no build; sem escrita em `opportunity_assignees` |
| `app/(app)/team/actions.ts`, `configuracoes/actions.ts` | Escopo de escrita por tenant-alvo | ✓ VERIFIED (código) / ⚠️ (runtime) | Confirmado por grep/typecheck; specs de comportamento em skip |
| `components/shell/Sidebar.tsx`, `app/(app)/layout.tsx` | Seletor + menus estendidos ao staff-admin | ✓ VERIFIED | `canAdminister`, `fetchTenantsByIds`, item "Staff PSW" confirmados por grep nesta sessão |
| `lib/opportunities/assignee-actions.ts` | Gate de atribuição alinhado com a RLS de 0047 | ✓ VERIFIED | `isTenantAdminOf`/`WRITE_SCOPE_DENIED_MESSAGE` confirmados por grep nesta sessão |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `psw_tenant_admins` (RLS) | `is_tenant_admin_of()` | consumida pelas 11+22+3 policies | WIRED | Confirmado por leitura das 3 migrations |
| `lib/security/role.ts` `isTenantAdminOf` | `psw_tenant_admins` (SELECT) | client autenticado, sem privilégio | WIRED | Lido diretamente; a policy de auto-leitura permite |
| `team/actions.ts`/`configuracoes/actions.ts` | `resolveAdminTenantIdFromSelector` | resolve tenant-alvo antes de mutar | WIRED | Confirmado por grep + leitura de `role.ts` |
| `Sidebar.tsx` gate `canAdminister` | `app/(app)/layout.tsx` (cálculo server-side) | prop | WIRED | Confirmado por grep nesta sessão |
| `/admin/staff` `RevokeGrantButton` | `countRevokeImpact`/`revokeTenantAdmin` (Server Actions) | chamada sob demanda | WIRED | Lido em `actions.ts`; nunca toca `opportunity_assignees` |
| `assignee-actions.ts` | RLS `opportunity_assignees_{insert,update,delete}` (0047) | `isTenantAdminOf(profile, opp.tenant_id)` | WIRED | Confirmado por grep + leitura |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` | `tsc --noEmit` | exit 0, sem erros | ✓ PASS |
| `npm run build` | build completo | exit 0, `/admin/staff` gerada entre as 22 rotas | ✓ PASS |
| Testes puros da fase (sem banco) | `npx vitest run` nos 4 arquivos sem-DB | 40 passed \| 6 skipped (46) | ✓ PASS |
| Suítes de integração da fase | `npx vitest run` nos 4 arquivos com-DB | 0 passed \| 105 skipped (105) — consistente com o regime ratificado, não uma falha | ? SKIP (esperado, não penalizado) |
| Debt markers (TBD/FIXME/XXX) nos arquivos da fase | grep | nenhum encontrado | ✓ PASS |
| `npm run test:security`/`npm test` completos | — | **NÃO EXECUTADOS nesta verificação**, por instrução explícita do regime da fase (risco real de apagar dados de produção via colisão de UUID `FGCOOP_TEST_ID`) | N/A — corretamente evitado |

### Probe Execution

Não aplicável — esta fase não usa `scripts/*/tests/probe-*.sh`; o mecanismo de prova declarado é SQL manual no handoff (`prova-por-sql-no-handoff`), não probes de script.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| GRANT-01 | 18-01, 18-02 | ✓ SATISFIED | Ver truth #1 |
| GRANT-02 | 18-01, 18-02, 18-03 | ✓ SATISFIED | Ver truth #2 |
| GRANT-03 | 18-02, 18-03 | ? NEEDS HUMAN (parcial) | Ver truth #3 |
| GRANT-04 | 18-05, 18-06, 18-07, 18-08 | ? NEEDS HUMAN (parcial) | Ver truth #4 |
| GRANT-05 | 18-06 | ? NEEDS HUMAN (parcial) | Ver truth #5 |
| GRANT-06 | 18-02, 18-05 | ✓ SATISFIED | Ver truth #6 |
| GRANT-07 | 18-04 | ✓ SATISFIED | Ver truth #7 |
| GRANT-08 | 18-04 | ✓ SATISFIED | Ver truth #8 |
| GRANT-09 | 18-04, 18-08 | ✓ SATISFIED | Ver truth #9 |
| GRANT-10 | 18-01, 18-03, 18-05, 18-08 | ✓ SATISFIED | Ver truth #10 |

Nenhum GRANT-ID órfão: os 10 requisitos declarados em `.planning/REQUIREMENTS.md` para a Phase 18 aparecem todos no frontmatter `requirements:` de pelo menos um plano (confirmado por leitura dos 8 SUMMARYs).

### Anti-Patterns Found

Nenhum bloqueador. Varredura de `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` nos arquivos-chave da fase (migrations 0045-0047, `lib/security/role.ts`, `lib/staff-admin/origins.ts`, `app/(app)/admin/staff/*`, `Sidebar.tsx`, `layout.tsx`, `assignee-actions.ts`) não encontrou nenhum marcador de dívida real (dois falsos-positivos de "TODOS" em comentários, confirmados como não-marcadores).

### Human Verification Required

Ver `human_verification` no frontmatter para o texto completo. Resumo:

1. **Roteiro Visual A–H completo** (WINDOWS id 37) — a própria fase o identifica como a única pendência para fechar a Phase 18 inteira.
2. **Verificações de handoff SQL não executadas** (18-02 V10-V13, 18-03 V2/V5/V6/V7, 18-05 C3/C5/idempotência/Decisiva #3/negativo-em-B) — nota de método: a técnica de impersonação por `set_config` usada nesses handoffs está comprovadamente quebrada no SQL Editor do Supabase Cloud; qualquer nova tentativa deve usar inspeção estática ou login real pelo app, não repetir a mesma técnica.
3. **Confirmação do PO sobre `/team` e `platform_admin`** — ambiguidade textual do plano 18-07, adjudicada acima a favor de zero-regressão; recomenda-se apenas ratificação explícita.

### Gaps Summary

Não há gaps que bloqueiem a fase (nenhum artefato ausente, nenhum stub, nenhuma policy faltando, nenhum key-link desconectado, `typecheck`/`build` limpos, zero debt markers). O que resta é comportamental: três das dez capacidades da fase (GRANT-03 para as 7 tabelas filhas, GRANT-04 no exercício real dos poderes, GRANT-05 no caminho de escrita do staff-admin) estão **corretamente implementadas e estruturalmente confirmadas em produção**, mas **nunca foram exercitadas em runtime** — nem por teste automatizado (regime ratificado: specs em skip até `.env.test` existir), nem por observação humana pelo app (roteiro A–H pendente). A fase é honesta sobre isso: o próprio 18-08-SUMMARY.md nomeia isto como "GAP DECISIVO" e "ÚNICA pendência" antes de considerar a Phase 18 encerrada. Este veredito concorda com essa autoavaliação — o trabalho de código está completo e bem verificado onde a verificação estática alcança; falta exclusivamente a confirmação humana pelo app para fechar as capacidades novas mais centrais da fase (ver tudo de A, exercer os poderes em A).

---

_Verified: 2026-08-07_
_Verifier: agente gsd-verifier_
