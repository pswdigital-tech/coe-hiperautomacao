# Phase 15: Seed dos Dados Reais do Workshop I (Unidasul) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 15-seed-dados-workshop
**Areas discussed:** Fonte dos dados, Acesso ao tenant Unidasul, PII real, Idempotência

---

## Seleção de áreas

| Área | Selecionada |
|------|-------------|
| Fonte dos 64 registros | ✓ |
| Acesso ao tenant Unidasul | ✓ |
| PII real (nomes/e-mails) | ✓ |
| Idempotência / re-execução | ✓ |

PO selecionou todas as 4.

---

## Fonte canônica dos 64 registros

| Option | Description | Selected |
|--------|-------------|----------|
| const DATA do mockup (_giba:439) | Array embutido, 64 objetos já na shape v0.2 | ✓ |
| Arquivo externo (CSV/planilha) | Fonte autoritativa separada indicada pelo PO | |
| Mockup + você revisa antes | Extrair p/ arquivo intermediário p/ conferência | |

**User's choice:** const DATA do mockup (_giba:439)
**Notes:** Não há arquivo externo; o mockup versionado é a fonte da verdade. Já no formato v0.2.

---

## Acesso ao tenant Unidasul

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant + admin user de login | Paridade com 0002; permite login + UAT visual; created_by legítimo | ✓ |
| Só tenant + opps (sem login) | Sem usuário; verificação só via SQL/RLS test | |
| Você decide | o agente escolhe | |

**User's choice:** Tenant + admin user de login

### Follow-up — Credenciais do admin

| Option | Description | Selected |
|--------|-------------|----------|
| Espelhar convenção FGCoop | admin.unidasul@pswdigital.com.br / 0123456789, UUID fixo próprio | ✓ |
| E-mail @unidasul + senha dev | Domínio da cliente | |
| Eu forneço depois | Placeholder no handoff | |

**User's choice:** Espelhar convenção FGCoop

---

## PII real (nomes/e-mails)

| Option | Description | Selected |
|--------|-------------|----------|
| Manter reais como estão | Dado do próprio cliente piloto, isolado por RLS | ✓ |
| Mascarar e-mails, manter nomes | Reduz exposição de contato | |
| Anonimizar nomes e e-mails | Máxima privacidade, perde rastreabilidade | |

**User's choice:** Manter reais como estão

---

## Idempotência / re-execução

| Option | Description | Selected |
|--------|-------------|----------|
| Guard: só insere se Unidasul=0 opps | Checa count do tenant antes do insert; pula se já populado | ✓ |
| On-conflict por chave composta | Índice único tenant+solicitante+processo | |
| Rodar-uma-vez (sem guard) | Aceita single-run | |

**User's choice:** Guard: só insere se Unidasul=0 opps
**Notes:** seq_id é trigger-assigned (sem chave natural) → ON CONFLICT não protege; guard por count é o mecanismo correto. Espelha sanity-check do 0002/0003.

---

## Executor's Discretion

- Mapeamento mecânico campo-a-campo (segue 0003).
- Número/nome da migration (0013), formato do handoff, estrutura do teste cross-tenant.

## Deferred Ideas

- Destino do tenant de teste 99999999 (housekeeping futuro).
- Anonimização de PII (se surgir demo público).
- Fase de Deploy (milestone próprio).
