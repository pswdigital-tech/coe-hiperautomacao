---
phase: 11-wizard-fluxo-unico
plan: 02
subsystem: ui
tags: [wizard, criterios, beneficios, fte, first-class, schema]

# Dependency graph
requires:
  - phase: 11-wizard-fluxo-unico
    provides: "fluxo único de 5 steps (state.ts) + WizardFormData aceitando criterios/beneficios/fte_horas top-level (Plan 11-01)"
  - phase: 10-backend-queries-validation-score
    provides: "opportunityInputSchema first-class (criterios/beneficios/fte_horas) + criterioEnum; createOpportunity lê data.criterios/data.beneficios/data.fte_horas top-level"
provides:
  - "CriteriosStep grava os 8 critérios v0.2 (camelCase, sim/nao/parcial) em data.criterios top-level via click-to-cycle"
  - "BeneficiosStep grava os 8 benefícios v0.2 (camelCase, escala 1–5) em data.beneficios top-level via barras"
  - "BeneficiosStep captura fte_horas (h/mês) top-level; bucket FTE NÃO derivado aqui (D-01/D-03)"
affects: [11-03, wizard, criterios, beneficios, priorizacao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Steps de criação escrevem direto nos campos first-class top-level (criterios/beneficios/fte_horas) — fim do uso de formulario_extras como container de criação"
    - "Chaves do step espelham EXATAMENTE as do schema Zod (.strict()) — defesa contra mass-assignment por chaves canônicas"

key-files:
  created: []
  modified:
    - components/opportunities/wizard/steps/CriteriosStep.tsx
    - components/opportunities/wizard/steps/BeneficiosStep.tsx

key-decisions:
  - "CriteriosStep passa de 10 chaves snake_case UPPERCASE → 8 chaves camelCase lowercase do schema; os 2 critérios extras (processo_uniforme/digitacao_manual) que não existem no v0.2 foram removidos"
  - "Valores do criterioEnum gravados em minúsculo (sim/nao/parcial); labels pt-BR mantidos no visual"
  - "Captura de fte_horas feita com input numérico inline (type=number, step=0.5, min=0) em vez de TextField — TextField não expõe min/step; vazio → undefined"
  - "Nenhuma derivação de bucket FTE no step Benefícios — derivação/exibição fica no step Priorização (D-01/D-03, Plan 11-03)"

patterns-established:
  - "First-class top-level: steps de criação não tocam mais formulario_extras (zero referências em CriteriosStep/BeneficiosStep)"

requirements-completed: [WIZARD-03, WIZARD-04]

# Metrics
duration: 8min
completed: 2026-06-05
---

# Phase 11 Plan 02: Steps Critérios & Benefícios first-class Summary

**CriteriosStep e BeneficiosStep reescritos para o modelo first-class v0.2: gravam nos campos top-level `data.criterios` (8 chaves camelCase, sim/nao/parcial) e `data.beneficios` (8 chaves camelCase, 1–5), com captura de `fte_horas` (h/mês) no step Benefícios — UX click-to-cycle e barras 1–5 preservadas, zero referência a `formulario_extras`.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-05T00:51:40Z
- **Completed:** 2026-06-05T00:59:40Z
- **Tasks:** 2
- **Files modified:** 2 (0 criados, 2 modificados)

## Accomplishments
- **CriteriosStep:** migrado de 10 chaves snake_case UPPERCASE em `formulario_extras.criterios` → 8 chaves camelCase EXATAS do schema (`causaReclamacoes, totalmenteManual, regrasClaras, decisaoHumana, padronizacaoDocs, validacaoDados, schedulable, temDocumentacao`). Valores do `criterioEnum` em minúsculo (`sim/nao/parcial`); `next()` e `visual()` ajustados. Grava em `data.criterios` top-level. UX click-to-cycle mantida 1:1.
- **BeneficiosStep:** migrado para 8 chaves camelCase (`reducaoTempo, eliminacaoErros, produtividade, qualidadeDados, reducaoCustos, reducaoRetrabalho, compliance, objetivosEstrategicos`) em `data.beneficios` top-level; barras 1–5 e cores preservadas. Adicionada captura de **FTE em h/mês** (`fte_horas`) no topo do step com input numérico (step=0.5, min=0) + texto de ajuda pt-BR; vazio → `undefined`.
- **Sem derivação de bucket aqui:** o bucket FTE (5º fator) é derivado/exibido no step Priorização (D-01/D-03), não no Benefícios.
- **Zero `formulario_extras`** nos dois steps de criação — alinhado ao contrato lido por `createOpportunity`.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: CriteriosStep first-class (8 critérios camelCase em data.criterios)** - `cdf4aa9` (feat)
2. **Task 2: BeneficiosStep first-class (8 benefícios camelCase + captura fte_horas)** - `b5027ba` (feat)

## Files Created/Modified
- `components/opportunities/wizard/steps/CriteriosStep.tsx` - 8 critérios camelCase, valores sim/nao/parcial, grava em `data.criterios` top-level; click-to-cycle preservado.
- `components/opportunities/wizard/steps/BeneficiosStep.tsx` - 8 benefícios camelCase 1–5 em `data.beneficios` top-level + captura de `fte_horas`; barras 1–5 preservadas; sem derivação de bucket.

## Decisions Made
- **`WizardFormData` já expunha os campos top-level** (`criterios`/`beneficios`/`fte_horas`) herdados de `FormularioInput` via `Omit` — nenhuma mudança em `state.ts` foi necessária; bastou trocar leitura/gravação dos steps.
- **Captura de `fte_horas` com input numérico inline** em vez de `TextField` — o primitivo `TextField` (fields.tsx) não expõe `min`/`step` para o `<input type=number>`. Mantido o mesmo `inputClass` visual para consistência. Vazio/`NaN`/não-finito → `undefined` (o schema valida `numeric` server-side; bucket re-derivado depois — T-11-04).
- **Critérios extras removidos:** `processo_uniforme` e `digitacao_manual` (do modelo v0.1, 10 chaves) não existem no schema v0.2 (8 chaves) e foram descartados conforme D-09.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Threat Model Compliance
- **T-11-03 (mass-assignment criterios/beneficios):** mitigado — steps escrevem APENAS nas 8 chaves camelCase EXATAS de cada objeto; o `.strict()` no schema rejeita chaves desconhecidas no server. Nenhuma chave inventada nem campo server-derived tocado.
- **T-11-04 (fte_horas):** mitigado — o step só faz `Number(v)` e grava `fte_horas` top-level; validação `numeric` é server-side; o bucket de score é derivado/re-validado depois (D-01), nunca confiado a partir do client.

## Issues Encountered
- `npx tsc --noEmit` reporta **1 erro pré-existente** em `app/(app)/layout.tsx(7,4): TS2304: Cannot find name 'LayoutProps'` — helper de tipo gerado pelo Next.js 16 em `.next/types`, não enxergado por um `tsc` puro sem build prévio. Já registrado por 11-01 (`deferred-items.md`); fora do escopo (SCOPE BOUNDARY). Os arquivos tocados por este plano não introduzem nenhum erro de tipo (verificado filtrando o erro de layout).

## User Setup Required
None - nenhuma configuração externa necessária.

## Next Phase Readiness
- **11-03** (Processo/Priorização) destravado: os steps Critérios/Benefícios já gravam first-class e `fte_horas` está capturado top-level — o step Priorização pode derivar/exibir o bucket FTE (via `deriveFteBucket` de 11-01) e o submit (`createOpportunity`) já lê `data.criterios`/`data.beneficios`/`data.fte_horas`.

## Self-Check: PASSED

Ambos os arquivos modificados existem em disco; os 2 commits de task (`cdf4aa9`, `b5027ba`) presentes no histórico git. `tsc` sem erros em escopo; zero referências a `formulario_extras` nos dois steps; 8 chaves camelCase conferem com schema.ts §245-273.

---
*Phase: 11-wizard-fluxo-unico*
*Completed: 2026-06-05*
