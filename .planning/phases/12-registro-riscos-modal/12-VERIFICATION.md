---
phase: 12-registro-riscos-modal
verified: 2026-06-05T13:10:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification: # No — initial verification
human_verification_note: "Checkpoint human-verify (12-02, blocking) já APROVADO pelo usuário (walkthrough do CRUD de riscos no navegador passou). Itens visuais/funcionais cobertos pela aprovação."
---

# Phase 12: Registro de Riscos (modal) Verification Report

**Phase Goal:** Entregar o registro de riscos estruturado na aba "Risco" do modal de oportunidade — tabela de riscos (substituindo o campo legado de texto livre), CRUD via dialog empilhado, prioridade auto-calculada (matriz impacto×probabilidade, read-only), e rotas fullscreen para deep-link. Fecha RISK-01, RISK-02, RISK-03, RISK-05.
**Verified:** 2026-06-05T13:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Server action cria risco validando por riskInputSchema, tenant_id/opportunity_id server-derived | ✓ VERIFIED | `risk-actions.ts:1` `'use server'`; `riskInputSchema.safeParse` ×2; `profile.tenant_id` ×4; `opportunity_id` do arg da rota; payload sem priority |
| 2  | Server action edita risco; trigger recalcula priority no UPDATE | ✓ VERIFIED | `updateRisk` enumera colunas sem priority; comentário 0011:294 (before insert OR update); `.eq('tenant_id', profile.tenant_id)` |
| 3  | Server action remove risco | ✓ VERIFIED | `deleteRisk` em `from('opportunity_risks').delete()`; 3 `export async function` no módulo |
| 4  | Query lê riscos com whitelist de colunas (incl. priority trigger-set) | ✓ VERIFIED | `RISK_COLUMNS` (queries.ts:52); `fetchRisksForOpportunity`/`fetchRiskById` usam `.select(RISK_COLUMNS)`; nenhum `select('*')` novo |
| 5  | Módulo de labels mapeia enums minúsculos → PT Title-Case reusável | ✓ VERIFIED | 5 mapas `Record<Enum,string>` + TIPO_BADGE_EMOJI + RESPONSAVEL_SUGGESTIONS; consumido por RiskTable e RiskForm |
| 6  | Aba Risco lista riscos em tabela (9+ colunas), campo legado removido | ✓ VERIFIED | RiscoTab importa RiskTable; `o.risco`/`opportunity.risco` ausente; RiskTable 10 `<th`; ID `R`+padStart(3); badges via labels |
| 7  | Form de risco empilhado sobre o modal (overlay z-[60]) por + Adicionar e ✏️ | ✓ VERIFIED | RiskFormDialog `fixed inset-0 z-[60]`; dirigido por `?risco=new|<id>` via useSearchParams; montado uma vez na RiscoTab |
| 8  | Cadastra risco; prioridade só após salvar (read-only no form) | ✓ VERIFIED | RiskForm read-only ("— (definida ao salvar)"/badge); sem calcRiskPrio/RISK_PRIO_MATRIX no client (D-04) |
| 9  | Edita risco e reflete na tabela sem fechar o modal (router.refresh) | ✓ VERIFIED | RiskForm submit via useTransition → updateRisk → router.refresh + onDone; dialog fecha via router.replace mantendo o modal |
| 10 | Remove risco após confirmação; tabela reflete | ✓ VERIFIED | DeleteRiskButton `'use client'`; overlay z-[60] de confirmação; `deleteRisk` → `router.refresh()` sem navegar para fora (D-05) |
| 11 | Deep-link /riscos/new e /riscos/[riskId]/edit renderiza fullscreen | ✓ VERIFIED | Ambas rotas RSC reais existem; new → RiskFormPage create; edit → fetchRiskById → notFound() cross-tenant; zero intercept aninhada / @riskModal |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/opportunities/risk-actions.ts` | create/update/deleteRisk ('use server') | ✓ VERIFIED | 191 linhas; 3 actions; Zod + tenant server-derived + revalidatePath ×8 |
| `lib/opportunities/queries.ts` | fetchRisksForOpportunity + fetchRiskById whitelisted | ✓ VERIFIED | RISK_COLUMNS; queries reais contra Supabase (data flowing) |
| `lib/opportunities/risk-labels.ts` | 5 mapas + badges + sugestões | ✓ VERIFIED | 101 linhas; 7 exports relevantes; helpers null-safe priorityLabel/priorityBadgeClass |
| `lib/opportunities/types.ts` | OpportunityRisk reexportado | ✓ VERIFIED | linha 41 |
| `components/.../tabs/RiscoTab.tsx` | tabela + botão Adicionar | ✓ VERIFIED | client; risks por props; campo legado removido |
| `components/.../risk/RiskTable.tsx` | tabela 9 colunas | ✓ VERIFIED | 10 `<th`; ID Rxxx; badges wired |
| `components/.../risk/RiskForm.tsx` | form reusável | ✓ VERIFIED | useTransition; createRisk/updateRisk; datalist; priority read-only |
| `components/.../risk/RiskFormDialog.tsx` | overlay z-[60] por ?risco | ✓ VERIFIED | useSearchParams; close via router.replace |
| `components/.../risk/RiskFormPage.tsx` | layout de página fullscreen | ✓ VERIFIED | 63 linhas; envolve RiskForm |
| `components/.../risk/DeleteRiskButton.tsx` | confirmação (D-06) | ✓ VERIFIED | deleteRisk; z-[60]; router.refresh |
| `app/(app)/.../riscos/new/page.tsx` | rota fullscreen criação | ✓ VERIFIED | RSC; RiskFormPage create |
| `app/(app)/.../riscos/[riskId]/edit/page.tsx` | rota fullscreen edição | ✓ VERIFIED | RSC; fetchRiskById; notFound() |
| `components/.../OpportunityDetail.tsx` | repassa risks às tabs | ✓ VERIFIED | prop risks + renderTab + case 'risco' |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| RSC pais (modal + fullscreen) | fetchRisksForOpportunity | Promise.all → props risks | ✓ WIRED |
| OpportunityDetail | RiscoTab | renderTab(... risks) → `<RiscoTab risks>` | ✓ WIRED |
| RiscoTab | RiskTable + RiskFormDialog | props risks | ✓ WIRED |
| RiskForm | createRisk / updateRisk | useTransition + server action | ✓ WIRED |
| RiskFormDialog | ?risco search param | useSearchParams / useRouter | ✓ WIRED |
| DeleteRiskButton | deleteRisk | useTransition → router.refresh | ✓ WIRED |
| edit route | fetchRiskById | RLS-scoped → notFound() | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| RiskTable | `risks` | fetchRisksForOpportunity → Supabase `.from('opportunity_risks').select(RISK_COLUMNS)` | Sim (query real; `data ?? []` só vazio quando não há riscos) | ✓ FLOWING |
| RiskForm (edit) | `initial` | risks.find na RiscoTab / fetchRiskById na rota fullscreen | Sim | ✓ FLOWING |
| RiskFormPage (edit fullscreen) | `risk` | fetchRiskById → `.maybeSingle()` RLS-scoped | Sim | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Types compilam | `npx tsc --noEmit` | exit 0, 0 erros | ✓ PASS |
| Matriz de prioridade parity | `vitest risk-priority-matrix.test.ts` | 17 passed | ✓ PASS |
| Mass-assignment defense | `vitest risk-mass-assignment.test.ts` | 15 passed | ✓ PASS |
| CRUD no navegador + deep-link + matriz ao vivo | walkthrough manual | aprovado pelo usuário | ✓ PASS (human-verify approved) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RISK-01 | 12-01, 12-02 | Cadastrar risco com todos os campos | ✓ SATISFIED | createRisk + RiskForm (9 campos, _giba:1242-1259) |
| RISK-02 | 12-01, 12-02 | Prioridade auto pela matriz impacto×probabilidade | ✓ SATISFIED | trigger set_risk_priority() autoridade; priority nunca no payload; read-only no form; parity test 16/16 |
| RISK-03 | 12-01, 12-02 | Editar e remover riscos | ✓ SATISFIED | updateRisk/deleteRisk + RiskForm edit + DeleteRiskButton (confirmação D-06) |
| RISK-05 | 12-02 | Aba Risco lista em tabela | ✓ SATISFIED | RiscoTab → RiskTable 9 colunas; campo legado removido (D-03) |

**Cobertura:** 4/4 REQ-IDs do plano satisfeitos. RISK-04 (isolamento por tenant / tabela + RLS) mapeado para Phase 9 em REQUIREMENTS.md — fora do escopo da Phase 12, corretamente não reivindicado pelos plans. Sem requisitos órfãos.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| — | Nenhum TODO/FIXME/placeholder/stub nos 8 arquivos do escopo | ℹ️ Info | Sem stubs; toda UI wired contra dados/actions reais |

Os 3 warnings do code review (12-REVIEW.md WR-01/02/03) são integridade same-tenant (RLS bloqueia vazamento cross-tenant) — advisory, rastreados, não-bloqueadores do goal conforme escopo confirmado.

### Decisões de contexto (D-01..D-08) honradas

D-01 tabela _giba ✓ · D-02 deep-link fullscreen (soft-path = dialog client; sem intercept aninhada) ✓ · D-03 campo legado removido ✓ · D-04 prioridade read-only só após salvar, sem matriz no client ✓ · D-05 router.refresh sem fechar modal ✓ · D-06 confirmação na exclusão ✓ · D-07 enums minúsculos + camada de labels ✓ · D-08 responsável texto livre + datalist (PSW/UnidaSul) ✓

### Human Verification Required

Nenhum item pendente. O checkpoint human-verify (blocking, definido no Plan 12-02) — walkthrough do CRUD de riscos no navegador (criar/editar/excluir, matriz de prioridade ao vivo, deep-link fullscreen, isolamento) — já foi APROVADO pelo usuário nesta sessão.

### Gaps Summary

Nenhum gap. Os 11 truths verificados, 13 artefatos presentes/substantivos/wired com dados reais fluindo, 7 key links wired, 4/4 requisitos satisfeitos, tsc clean, suites de risco verdes (32 testes) e o checkpoint humano aprovado. O goal da fase — registro de riscos estruturado na aba Risco (tabela, CRUD via dialog empilhado, prioridade auto read-only, deep-link fullscreen) — foi alcançado. RISK-01/02/03/05 fechados.

---

_Verified: 2026-06-05T13:10:00Z_
_Verifier: agente gsd-verifier_
