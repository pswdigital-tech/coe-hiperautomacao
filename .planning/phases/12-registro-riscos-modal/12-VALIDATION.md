---
phase: 12
slug: registro-riscos-modal
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Fonte: `12-RESEARCH.md` §Validation Architecture. Suíte do projeto = Vitest (pool='forks', singleFork=true).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x (pool='forks', singleFork=true) |
| **Config file** | `vitest.config.ts` (alias `server-only` → stub) |
| **Quick run command** | `npx tsc --noEmit && npx vitest run <arquivos tocados>` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30–60s (unit; integração em skipIf sem `.env.test`) |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` + `npx vitest run` dos arquivos tocados
- **After every plan wave:** `npm run test` (suite completa)
- **Before `/gsd-verify-work`:** suite verde + checkpoint human-verify (12-02)
- **Max feedback latency:** ~60 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-T1 | 01 | 1 | RISK-05 | — | Query whitelisted (sem `select('*')`), escopada por tenant via RLS | unit + tsc | `tsc --noEmit && vitest run tests/schema` | ✅ | ⬜ pending |
| 12-01-T2 | 01 | 1 | RISK-01, RISK-03 | V1 Mass Assignment / V4 Access Control | `createRisk/updateRisk/deleteRisk` rejeitam `priority`/`tenant_id`/`opportunity_id` (`riskInputSchema.strict()`); `tenant_id`/`opportunity_id` server-derived; UPDATE/DELETE com `.eq('tenant_id', …)` | unit (tdd) | `vitest run tests/schema tests/security/opportunity-risks-isolation.test.ts` | ✅ | ⬜ pending |
| 12-01-T3 | 01 | 1 | RISK-02 | — | Paridade matriz impacto×probabilidade ↔ trigger `set_risk_priority()` (prioridade nunca escolhida pelo usuário) | unit (pura) + skipIf SQL | `vitest run tests/schema/risk-priority-matrix.test.ts` | ✅ | ⬜ pending |
| 12-02-T1 | 02 | 2 | RISK-05 | — | `RiscoTab` renderiza tabela estruturada; `risks` fluem por props do RSC pai (sem async RSC) | unit + tsc | `tsc --noEmit && vitest run` | ✅ | ⬜ pending |
| 12-02-T2 | 02 | 2 | RISK-01, RISK-03 | V5 Input Validation | RiskForm/RiskFormDialog (overlay `z-[60]`, `?risco=`); Prioridade read-only (D-04) | manual + tsc | `tsc --noEmit` | ✅ | ⬜ pending |
| 12-02-T3 | 02 | 2 | RISK-03 | V4 Access Control | Exclusão com confirmação; rotas fullscreen reais (deep-link, sem `@modal` aninhado/`@riskModal`) | manual + tsc + grep | `tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/schema/risk-priority-matrix.test.ts` — paridade pura da matriz de prioridade (RISK-02), espelha `_giba:1180-1185` / trigger. **Já existe** (criado na Phase 9/10; 12-01 T3 confirma e roda).
- [x] `tests/security/opportunity-risks-isolation.test.ts` — isolamento tenant para `opportunity_risks` (RISK-01/03/04), modo skipIf. **Já existe**.

*Wave 0 já satisfeita pela infraestrutura existente — nenhum stub novo necessário para esta fase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dialog empilhado abre sobre o modal aberto via botões da aba (`?risco=new\|<id>`) e fecha mantendo aba/scroll | RISK-01, RISK-03 | Comportamento de roteamento/UX no browser (overlay z-[60] sobre modal z-50) | Abrir modal de oportunidade → aba Risco → "+ Adicionar"; salvar; confirmar que o dialog fecha e a tabela atualiza com o modal ainda aberto |
| Acesso direto à URL `/opportunities/[id]/riscos/new` (e `/riscos/[riskId]/edit`) renderiza fullscreen | RISK-01, RISK-03 | Contrato de deep-link só observável navegando direto à URL | Colar a URL numa aba nova → deve renderizar fullscreen (não modal/intercept quebrado) |
| Prioridade aparece correta **somente após salvar** (round-trip do trigger) | RISK-02 | Depende do trigger SQL ao vivo (round-trip de persistência) | Criar risco com impacto=alto/prob=provável → salvar → reabrir → prioridade = Crítica |
| Exclusão pede confirmação e a lista reflete a remoção | RISK-03 | Fluxo de confirmação no browser | Clicar 🗑️ → confirmar → risco some da tabela |

> Estas verificações estão cobertas pelo checkpoint `checkpoint:human-verify` (gate=blocking) ao final de 12-02.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (todas têm `tsc --noEmit`/`vitest run`)
- [x] Wave 0 covers all MISSING references (ambos os testes já existem)
- [x] No watch-mode flags (`vitest run`, não `vitest`)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
