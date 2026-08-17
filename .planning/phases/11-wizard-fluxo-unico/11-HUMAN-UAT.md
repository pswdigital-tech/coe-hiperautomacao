---
status: partial
phase: 11-wizard-fluxo-unico
source: [11-VERIFICATION.md]
started: 2026-06-05T04:45:00Z
updated: 2026-06-05T04:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Walk do wizard completo até Finalizar
expected: Exatamente 5 steps na ordem Identificação → Processo → Critérios → Benefícios → Priorização, sem qualquer escolha Tipo/Classificação (persona/formulário). Ao finalizar, a oportunidade é criada e redireciona para /opportunities/{id}.
result: [pending]

### 2. Desmarcar um benefício já selecionado e então Finalizar (WR-01 — CORRIGIDO)
expected: (WR-01 corrigido em 2026-06-05) Desmarcar um benefício REMOVE a chave (não grava 0); o submit é aceito normalmente e a oportunidade é criada. Conferir também que o benefício desmarcado some do registro `beneficios` gravado.
result: [pending]

### 3. Bucket FTE derivado + score em Priorização
expected: Preencher fte_horas em Benefícios; em Priorização o bloco "Impacto FTE (derivado)" mostra o bucket correto (<10h=Muito Baixo +4 · 10–40=Baixo +8 · 40–100=Médio +12 · 100–200=Alto +16 · ≥200=Muito Alto +20) e o ScorePreview reflete os 5 fatores. Após finalizar, a coluna `fte` no banco bate com o bucket exibido.
result: [pending]

### 4. Gates de validação pt-BR por step
expected: Tentar avançar de Identificação sem nome ou sem área, e de Processo sem o campo Processo. Avanço bloqueado com mensagens pt-BR claras: 'Nome obrigatório', 'Área obrigatória', 'Processo obrigatório'.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
