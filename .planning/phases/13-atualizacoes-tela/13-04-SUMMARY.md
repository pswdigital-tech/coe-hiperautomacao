---
phase: 13-atualizacoes-tela
plan: 04
subsystem: modal-display
tags: [modal, view-05, read-only, first-class-v02, wave-1]

# Dependency graph
requires:
  - phase: 11-wizard-fluxo-unico
    provides: "modelo first-class v0.2 (criterios camelCase sim/nao/parcial, beneficios 1–5, fte_horas) + CriteriosStep/BeneficiosStep autoritativos"
  - phase: 10-backend-queries-validation-score
    provides: "lib/opportunities/score.ts calcScore/priorityLevel (SCORE-04 parity-tested) + view opportunities_with_score (score/priority_level)"
  - phase: 12-registro-riscos-modal
    provides: "RiscoTab estruturada (tabela opportunity_risks) — inalterada por este plano"
provides:
  - "Modal de detalhe com conjunto ÚNICO de 8 abas (MODAL_TABS) para qualquer oportunidade — sem ramificação por source"
  - "CriteriosTab/BeneficiosTab/ScoreTab lendo as colunas first-class v0.2 (criterios/beneficios/fte/fte_horas), não mais o jsonb legado"
  - "ObservacaoTab acomodando o campo legado de texto livre `risco` (≠ tabela opportunity_risks) ao lado de `observacao` (D-10)"
affects: [13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display tab lê coluna Json|null da view via cast tipado para o shape camelCase + empty state pt-BR quando null (persona legada)"
    - "ScoreTab: total DB-authoritative (o.score/o.priority_level) + breakdown por-fator espelhando os pesos de score.ts; calcScore como verificação de paridade (sem terceira cópia da fórmula)"

key-files:
  created:
    - .planning/phases/13-atualizacoes-tela/13-04-SUMMARY.md
  modified:
    - components/opportunities/modal/types.ts
    - components/opportunities/modal/OpportunityDetail.tsx
    - components/opportunities/modal/tabs/CriteriosTab.tsx
    - components/opportunities/modal/tabs/BeneficiosTab.tsx
    - components/opportunities/modal/tabs/ScoreTab.tsx
    - components/opportunities/modal/tabs/ObservacaoTab.tsx

key-decisions:
  - "MODAL_TABS único de 8 na ordem do mockup (_giba:959-968); isPersona/PerfilTab/DesafiosTab/CoeTab desligados (arquivos preservados no disco, dados em persona_extras — D-09)"
  - "Critérios/Benefícios passam a ler o.criterios/o.beneficios (first-class camelCase) com cast tipado sobre Json|null; null → empty state pt-BR (D-08)"
  - "ScoreTab usa calcScore/priorityLevel de score.ts e prefere o.score/o.priority_level da view para o total (T-13-04b — sem terceira cópia da fórmula)"
  - "Campo legado `risco` (nota livre, 0009) vai para a aba Observação; a aba Risco fica 100% dedicada à tabela estruturada da Phase 12 (D-10)"

patterns-established:
  - "Aba de exibição: cast tipado da coluna Json first-class → shape camelCase + empty state pt-BR por null"

requirements-completed: [VIEW-05]

# Metrics
duration: ~12min
completed: 2026-06-05
---

# Phase 13 Plan 04: Modal Display — 8 abas unificadas + realinhamento first-class v0.2 Summary

**Colapsou os dois conjuntos de abas (TABS_PERSONA/TABS_FORMULARIO) em um único MODAL_TABS de 8 na ordem do mockup, e realinhou Critérios/Benefícios/Score para lerem as colunas first-class do v0.2 (`criterios`/`beneficios`/`fte`/`fte_horas` + score de 5 fatores via `score.ts`), movendo o campo legado de texto livre `risco` para a aba Observação. O modal segue 100% READ-ONLY (edição é o Plan 13-05).**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-05
- **Tasks:** 3
- **Files modified:** 6 (1 criado — este SUMMARY; 6 modificados)

## Accomplishments

- **D-07/D-08/D-09 — conjunto único de 8 abas:** `OpportunityDetail` deixou de ramificar por `opportunity.source`. Um único `MODAL_TABS` (`Processo → Critérios → Automação → Benefícios → Score → Fases → Risco → Observação`, ícones/ordem de `_giba:959-968`) é montado para qualquer oportunidade; `defaultTab` é sempre `processo`. Perfil/Desafios/CoE saíram da exibição — imports + `case`s removidos, `TabId` union estreitado para as 8 ids first-class. Os arquivos `PerfilTab`/`DesafiosTab`/`CoeTab` permanecem no disco e os dados em `persona_extras` (apenas desligados).
- **D-11 — Critérios/Benefícios lendo first-class:** `CriteriosTab` agora lê `o.criterios` (8 chaves camelCase, valores `sim`/`nao`/`parcial` minúsculos — autoridade `CriteriosStep.tsx:27-49`) em vez do legado `formulario_extras.criterios` (UPPERCASE, 10 keys). `BeneficiosTab` lê `o.beneficios` (camelCase 1–5) + `o.fte_horas`. Personas legadas (first-class null) renderizam empty state pt-BR (D-08).
- **D-11 — Score de 5 fatores:** `ScoreTab` reconstruído com `calcScore`/`priorityLevel` de `@/lib/opportunities/score`. Mostra os 5 fatores (esforço, complexidade, tempo/frequência, objetivo e o 5º fator **FTE bucket**), cada um com seu peso (espelhando os mapas de `score.ts`/`_giba:483-490`). O total exibido prefere `o.score`/`o.priority_level` da view (DB-authoritative); `calcScore` serve de verificação de paridade. Placeholder "Edição dos pesos virá na Phase 6" removido.
- **D-10 — risco legado na Observação:** `ObservacaoTab` renderiza dois blocos de texto livre — `observacao` e `risco` (nota livre legada da 0009, com label "Risco (nota livre)" e hint apontando que o registro estruturado vive na aba Risco). Cada bloco tem seu próprio empty state pt-BR.

## Task Commits

1. **Task 1: Colapsa modal em conjunto único de 8 abas (D-07/D-08/D-09)** — `fb04696` (feat)
2. **Task 2: Realinha Critérios/Benefícios às colunas first-class v0.2 (D-11)** — `887dafa` (feat)
3. **Task 3: Score 5 fatores via score.ts + risco legado na Observação (D-10/D-11)** — `239077a` (feat)

**Plan metadata:** commit docs final (STATE/ROADMAP/SUMMARY).

## Files Created/Modified

- `components/opportunities/modal/types.ts` (modificado) — `TabId` estreitado para as 8 ids first-class (remove `perfil`/`desafios`/`coe`).
- `components/opportunities/modal/OpportunityDetail.tsx` (modificado) — `MODAL_TABS` único; remove `isPersona`/`TABS_PERSONA`/`TABS_FORMULARIO` e imports/cases de Perfil/Desafios/CoE; `renderTab` reordenado para as 8 abas.
- `components/opportunities/modal/tabs/CriteriosTab.tsx` (modificado) — lê `o.criterios` (8 camelCase, `sim/nao/parcial`); empty state pt-BR quando null; drop do `CriterioValor` UPPERCASE legado.
- `components/opportunities/modal/tabs/BeneficiosTab.tsx` (modificado) — lê `o.beneficios` (camelCase 1–5) + `o.fte_horas`; empty state pt-BR quando null.
- `components/opportunities/modal/tabs/ScoreTab.tsx` (modificado) — 5-factor breakdown via `score.ts`; total DB-authoritative; placeholder "Phase 6" removido.
- `components/opportunities/modal/tabs/ObservacaoTab.tsx` (modificado) — blocos `observacao` + `risco` (nota livre legada) com empty states pt-BR.

## Decisions Made

- **`criterios`/`beneficios` são `Json | null` na view** (hand-maintained `lib/database.types.ts`). As abas fazem cast tipado para o shape camelCase esperado (`Partial<Record<Key, Valor>> | null`) — o modelo v0.2 não impõe um tipo estrito nessas colunas, então o cast é o ponto de contato. `null` (persona legada) cai no empty state.
- **Total do score DB-authoritative:** `o.score`/`o.priority_level` da view são a fonte do número exibido; `calcScore` só recalcula como fallback (`o.score ?? computed`) e os mapas de peso por-fator são uma cópia LITERAL dos de `score.ts`/`_giba:483-490` usados apenas para a barra de contribuição — não há terceira cópia da fórmula que possa divergir (mitiga T-13-04b).
- **Modal segue READ-ONLY:** nenhum controle de edição/save adicionado. O texto de empty state da `ObservacaoTab` foi simplificado para "Nada registrado." (o anterior mencionava o botão Editar, que ainda não existe neste plano) — coerente com o estado read-only até o Plan 13-05.

## Deviations from Plan

None - plan executed exactly as written. (As mudanças foram aplicadas exatamente nos 6 arquivos previstos no frontmatter; o cast tipado sobre `Json|null` é a forma natural de consumir as colunas first-class na view hand-maintained, não um desvio de escopo.)

## Threat Surface

- **T-13-04 (Info disclosure) — accept:** mantido. As linhas já são tenant-autorizadas pelo fetch (RLS + whitelist de colunas, Phase 7.5/10); este plano só muda QUAIS campos já buscados são exibidos.
- **T-13-04b (Tampering/Integrity do score) — mitigate:** atendido. `ScoreTab` usa `calcScore` (SCORE-04 parity-tested) e prefere o total DB-computado; sem terceira cópia da fórmula.

Nenhuma superfície de segurança nova introduzida (plano read-only, sem novo write path).

## Known Stubs

None — todas as abas leem dados reais; os empty states pt-BR são o caminho correto (D-08), não stubs.

## Verification

- `npx tsc --noEmit` — exit 0 (clean).
- `npm run test` — **146 passed / 32 skipped / 2 failed (intencionais)**. Os 2 failed são os RED de `tests/opportunities/kpis.test.ts` (`'personas'/'byTool' in result === false`) que pertencem ao escopo do Plan 13-02 (drop dos buckets legados de `computeKpis`) — idênticos à baseline do 13-01. **Zero novas falhas introduzidas por este plano.**
- UAT manual (VALIDATION.md): abrir uma persona legada FGCoop → as 8 abas renderizam, com empty states pt-BR em Critérios/Benefícios onde o first-class é null. (Pendente de verificação visual do PO — recomendado.)

## Next Phase Readiness

- **Plan 13-05 (modal editável, modo global D-12):** destravado — o conjunto único de 8 abas + as abas lendo first-class são a base sobre a qual o modo de edição (Editar/Salvar/Cancelar via `updateOpportunity` + recipe do WizardShell) será construído. Derivados (score/rpa_score/bucket FTE) permanecem read-only e recalculam (D-15).

## Self-Check: PASSED

- `components/opportunities/modal/OpportunityDetail.tsx` — FOUND
- `components/opportunities/modal/types.ts` — FOUND
- `components/opportunities/modal/tabs/CriteriosTab.tsx` — FOUND
- `components/opportunities/modal/tabs/BeneficiosTab.tsx` — FOUND
- `components/opportunities/modal/tabs/ScoreTab.tsx` — FOUND
- `components/opportunities/modal/tabs/ObservacaoTab.tsx` — FOUND
- Commit `fb04696` — FOUND
- Commit `887dafa` — FOUND
- Commit `239077a` — FOUND

---
*Phase: 13-atualizacoes-tela*
*Completed: 2026-06-05*
