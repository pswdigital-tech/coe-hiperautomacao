---
phase: 15
slug: seed-dados-workshop
status: secured
threats_open: 0
threats_total: 5
threats_closed: 5
asvs_level: 1
block_on: critical,high
created: 2026-06-05
---

# SECURITY — Phase 15: Seed dos Dados Reais do Workshop I (Unidasul)

**Audited:** 2026-06-05
**ASVS Level:** 1
**block_on:** critical, high
**Result:** SECURED — 5/5 threats closed (3 mitigate verified in code, 2 accept documented)

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-15-01 | Information Disclosure | mitigate | CLOSED | RLS `opportunities_select` filtra por `tenant_id = current_tenant_id()` — `supabase/migrations/0001_init.sql:315,332-344` (4 policies + RLS enabled); helper `current_tenant_id()` em `0001_init.sql:181`. INSERT da 0013 fixa `tenant_id` literal `55551da5-…` (not null) em todas as 64 — `0013_seed_unidasul_opportunities.sql:165-235`. Teste cross-tenant SC3: `asAcme()` → `data === []` e `count === 0` — `tests/security/unidasul-isolation.test.ts:99-128`. |
| T-15-02 | Information Disclosure | accept | CLOSED (aceite documentado) | PII real (nomes/e-mails) versionada na 0013. Risco aceito D-05 em `15-CONTEXT.md:30-31`; nota de segurança no handoff `15-01-MIGRATION-HANDOFF.md:135` ("## PII — T-15-02, decisão D-05"). Mitigado em runtime por RLS (T-15-01); não exportar fora do repo/Supabase. |
| T-15-03 | Tampering | mitigate | CLOSED | Lista de colunas do INSERT (`0013…sql:165-169`) NÃO contém `seq_id`/`rpa_score`/`score`/`priority_level` (grep verificado: 0 ocorrências). `rpa_score` é GENERATED ALWAYS STORED — `0011_schema_evolution_v02.sql:126-136` (inserir aborta o statement). `score`/`priority_level` vivem na view `opportunities_with_score` (não são colunas-base). |
| T-15-04 | Spoofing | accept | CLOSED (aceite documentado) | Senha de seed conhecida `0123456789` para o admin Unidasul. Risco aceito D-04 em `15-CONTEXT.md:27` (espelha convenção do admin FGCoop em 0002, ambiente piloto isolado por RLS); nota no handoff `15-01-MIGRATION-HANDOFF.md:139-141` declarando rotação como tarefa de pré-produção. |
| T-15-05 | Elevation of Privilege | mitigate | CLOSED | Trigger `trg_opportunities_seq_id` → `set_opportunity_seq_id()` SEMPRE sobrescreve `new.seq_id := next_seq_id(new.tenant_id)` (sem `if null`) — `0006_seq_id_atomic.sql:100-113` (bloqueia forge do cliente). O seed 0013 nem enumera `seq_id` na lista de colunas. |

---

## Accepted Risks Log

| Threat ID | Risk | Rationale | Decision | Revisit Trigger |
|-----------|------|-----------|----------|-----------------|
| T-15-02 | PII real (nomes/e-mails de solicitantes) em migration versionada no git | Dado do próprio cliente piloto, isolado por RLS no runtime. Sem anonimização. | D-05 (15-CONTEXT.md) | Se surgir ambiente de demo público → revisitar anonimização (deferido). Não exportar a 0013 fora do repo/projeto Supabase. |
| T-15-04 | Admin Unidasul com senha fraca de seed `0123456789` | Espelha convenção do admin FGCoop (0002); ambiente piloto isolado por RLS. | D-04 (15-CONTEXT.md) | Rotação de senha do admin antes de qualquer pré-produção / acesso externo. |

---

## Unregistered Flags

None. SUMMARY.md não possui seção `## Threat Flags` — nenhuma nova superfície de ataque detectada pelo executor durante a implementação.

---

## Notes

- Esta é uma fase de **dados** (seed write-only). Implementação é READ-ONLY para o auditor — nenhum arquivo de implementação foi modificado.
- A migration 0013 ainda é checkpoint:human-action (apply manual no Supabase Cloud). A verificação de mitigação é estática (código presente); a prova de RLS em runtime depende do teste cross-tenant rodar contra um DB com 0013 aplicada (skipIf sem `.env.test`).
- Nenhuma ameaça de severidade critical/high ficou aberta → não bloqueia (`block_on: critical,high`).
