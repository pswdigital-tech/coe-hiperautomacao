# 10-04 — Verificação de Compatibilidade com IA (MODEL-10 / SC4)

**Phase 10 / Plan 10-04 Task 2.** Confirma que adicionar os campos novos do v0.2 ao
`opportunityInputSchema` (Plan 10-03) e regenerar os tipos (Plan 10-01) **não quebra** o
contrato de `enrichOpportunity()` — campos derivados preenchíveis manual agora / IA depois,
sem refatorar schema (MODEL-10).

## 1. `enrichOpportunity()` não lê os campos novos — read-set inalterado

`enrichOpportunity(opportunityId, tenantId)` (assinatura inalterada) lê APENAS
([lib/ai/enrichment.ts](../../../lib/ai/enrichment.ts#L47-L51)):

```
source, request_type, solicitante, area, subarea, processo,
frequencia, volume_medio, tempo_execucao, num_pessoas,
persona_extras, formulario_extras
```

Nenhum dos campos novos (`fte_horas`, `fonte`, `tipo_processo`, `beneficio_qualitativo`,
`criterios`, `beneficios`, `fte`, `rpa_score`) entra no read-set. Adicioná-los ao schema de
input e aos tipos **não altera** o que o enrichment lê nem a forma como ele roda. ✓ Compatível.

## 2. Write-set: 8 campos (era 9) — `tempo` deferido

O UPDATE de enriquecimento escreve agora **8 campos**: `ferramenta`, `escopo_automacao`,
`beneficios_esperados`, `observacao`, `risco`, `esforco`, `complexidade`, `objetivo`
(+ os 3 de controle: `ai_enrichment_status`, `ai_enriched_at`, `ai_enrichment_error`).

`esforco`/`complexidade` (effort_level/complexity_level) e `objetivo` (smallint) **não mudaram**
de domínio em 0011 → continuam compatíveis com o contrato da IA.

## 3. KNOWN ISSUE — REALIGN-7.6 (deferido)

`lib/ai/schema.ts` ([linha 31](../../../lib/ai/schema.ts#L31)) ainda gera `tempo` no domínio
**antigo de DURAÇÃO**:

```ts
tempo: z.enum(['pequeno', 'medio', 'grande']),
```

Mas 0011 mudou `opportunities.tempo` para **FREQUÊNCIA** (`frequency_bucket`:
diario|semanal|quinzenal|mensal|anual). Não há mapeamento 1:1 entre duração e frequência.

**Decisão da P10 (escopo: não reescrever o contrato da IA — REALIGN-7.6 é Future Requirement
deferido pelo PO):** `enrichOpportunity()` **deixou de sobrescrever `tempo`**
([lib/ai/enrichment.ts](../../../lib/ai/enrichment.ts#L152-L155) — linha do UPDATE removida).
A IA preenche os outros 8 campos; `tempo` permanece como definido pelo formulário/NULL até
o realinhamento.

- **Por que não regride a P10:** a IA real está desabilitada/deferida (os testes mockam OpenAI
  e o UPDATE do Supabase). Não há gravação real de `tempo` inválido no v0.2.
- **Ação para REALIGN-7.6 (antes de reativar o enrichment):** realinhar `lib/ai/schema.ts`
  (`tempo` → domínio de frequência) e restaurar o write em `lib/ai/enrichment.ts`.

## 4. Teste

`tests/ai/enrichment.test.ts` (AI-MODEL-01) atualizado: assere `updateCall.tempo` ===
`undefined` (documenta o deferimento) e os outros 8 campos inalterados. Verde em modo
unit-only (mocka OpenAI + Supabase).
