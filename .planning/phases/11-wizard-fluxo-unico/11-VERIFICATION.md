---
phase: 11-wizard-fluxo-unico
verified: 2026-06-05T04:45:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir 'Nova Oportunidade' e percorrer o wizard inteiro até Finalizar"
    expected: "Exatamente 5 steps na ordem Identificação → Processo → Critérios → Benefícios → Priorização, sem qualquer escolha Tipo/Classificação (persona/formulário). Ao finalizar, a oportunidade é criada e redireciona para /opportunities/{id}."
    why_human: "Navegação multi-step com estado React + Server Action + INSERT RLS só se confirma rodando o app; o verificador checa a estrutura no código mas não o fluxo ao vivo."
  - test: "No step Benefícios, clicar num benefício já selecionado para desmarcá-lo e então Finalizar"
    expected: "(Conhecido — WR-01) O submit é REJEITADO pelo Zod (benefício vira 0, schema exige min(1)) e o usuário vê um erro. O happy path (cada benefício pontuado uma vez, sem desmarcar) finaliza normalmente."
    why_human: "Confirma o comportamento do bug WR-01 do code review na interação real de desmarcar; não é coberto por teste automatizado."
  - test: "Preencher fte_horas em Benefícios e abrir Priorização; conferir o bucket FTE derivado e o score"
    expected: "O bloco 'Impacto FTE (derivado)' mostra o bucket correto (<10h=Muito Baixo +4 · 10–40=Baixo +8 · 40–100=Médio +12 · 100–200=Alto +16 · ≥200=Muito Alto +20) e o ScorePreview reflete os 5 fatores. Após finalizar, a coluna `fte` no banco bate com o bucket exibido."
    why_human: "Derivação visual + persistência coerente (display === coluna fte) exige rodar o wizard e inspecionar o registro gravado; o verificador confirma que ambos usam a MESMA deriveFteBucket, mas não a paridade ao vivo."
  - test: "Tentar avançar de Identificação sem nome ou sem área; e de Processo sem o campo Processo"
    expected: "Avanço bloqueado com mensagens pt-BR claras: 'Nome obrigatório', 'Área obrigatória', 'Processo obrigatório'. (Obs: o campo Processo é digitado no step Identificação; a trava de Processo só dispara ao sair do step Processo, pois é onde validateStep('processo') roda.)"
    why_human: "Gate de validação por step é comportamento de UI em tempo real; o código está wired (validateStep + next()), mas a experiência de bloqueio se confirma na interação."
---

# Phase 11: wizard-fluxo-unico Verification Report

**Phase Goal:** O usuário cria uma oportunidade por um único wizard de 5 steps que coleta identificação, processo, os 8 critérios, os 8 benefícios + FTE e a priorização de 5 fatores — substituindo o split persona/formulário.
**Verified:** 2026-06-05T04:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                              | Status     | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1   | Criar oportunidade percorre exatamente 5 steps Identificação→Processo→Critérios→Benefícios→Priorização, sem ramificação persona/formulário | ✓ VERIFIED | `state.ts:76-82` STEPS_CREATE com as 5 entradas na ordem exata; `stepsFor` retorna STEPS_CREATE para `mode==='create'` independente de source (`state.ts:96-98`); `defaultFormData` fixa `source:'formulario'` (`state.ts:114`); rota `app/(app)/opportunities/new/page.tsx` renderiza `WizardShell mode="create"`; teste `state.test.ts` (11 specs) verde |
| 2   | Critérios coleta 8 critérios SIM/NÃO/PARCIAL; Benefícios coleta 8 benefícios escala 1–5 + estimativa de FTE em h/mês | ✓ VERIFIED | CriteriosStep: 8 chaves camelCase (`CriteriosStep.tsx:16-35`), `next()` cicla sim→nao→parcial (`:37-41`), grava `data.criterios` (`:56`). BeneficiosStep: 8 chaves (`:13-32`), botões 1–5 (`:91-109`), input numérico `fte_horas` (`:66-74`). Zero `formulario_extras` em ambos (grep exit=1) |
| 3   | Priorização coleta os 5 fatores incl. bucket FTE, com pesos visíveis, e exibe o score | ✓ VERIFIED | 4 fatores manuais com pesos nos rótulos (`PriorizacaoStep.tsx:15-26`, objetivo 1–5 `:71-90`); bucket FTE derivado read-only com peso +4..+20 (`:32-38, 97-124`); `<ScorePreview fte={fteBucket}>` (`:127-133`); `score.ts:37` inclui peso FTE no calcScore 5 fatores |
| 4   | Validações por step bloqueiam avanço sem campos obrigatórios (nome+área no step 1; processo no step 2), pt-BR | ✓ VERIFIED | `validateStep('identificacao')` → 'Nome obrigatório'/'Área obrigatória'/'E-mail inválido' (`state.ts:185-197`); `validateStep('processo')` → 'Processo obrigatório' (`:199-203`); wired em `WizardShell.next()` (`:76-87`); teste state.test.ts cobre ambos branches |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/opportunities/fte.ts` | deriveFteBucket horas→bucket fonte única | ✓ VERIFIED | Deriva FteBucket de fteBucketEnum.options; 5 faixas com bordas lower-inclusive/upper-exclusive; guard p/ não-finito/negativo. 7 specs verdes |
| `components/opportunities/wizard/state.ts` | STEPS_CREATE single-flow + defaultFormData formulario + validateStep processo | ✓ VERIFIED | STEPS_CREATE (5), stepsFor create-único, source='formulario', branches identificacao+processo pt-BR |
| `steps/CriteriosStep.tsx` | 8 critérios camelCase → data.criterios | ✓ VERIFIED | 8 chaves, sim/nao/parcial, click-to-cycle, top-level, sem formulario_extras |
| `steps/BeneficiosStep.tsx` | 8 benefícios → data.beneficios + fte_horas | ✓ VERIFIED | 8 chaves, barras 1–5, captura fte_horas. Warning WR-01 no path de desmarcar (escreve 0) |
| `steps/ProcessoStep.tsx` | select Frequência→tempo + Ferramenta default n8n | ✓ VERIFIED | `onChange({ tempo: ... })` fonte única (`:62-65`); Ferramenta select default n8n (`:68-75`) |
| `steps/PriorizacaoStep.tsx` | 4 fatores + bucket FTE read-only + ScorePreview fte | ✓ VERIFIED | Tempo Estimado removido; deriveFteBucket importado; fte passado ao preview |
| `WizardShell.tsx` | deriva prioridade_fte no submit do create | ✓ VERIFIED | `onSubmit` ramo create injeta `prioridade_fte: deriveFteBucket(...)` no payload (`:122-128`); edit intocado |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| state.ts | stepsFor(_, 'create') | retorna 5 steps sem tipo/classificacao | ✓ WIRED | STEPS_CREATE = identificacao/processo/criterios/beneficios/priorizacao |
| Priorização/Shell | lib/opportunities/fte.ts | import deriveFteBucket | ✓ WIRED | Importado e usado em ambos (display + submit) |
| CriteriosStep | data.criterios top-level | onChange({ criterios }) | ✓ WIRED | `CriteriosStep.tsx:56` |
| BeneficiosStep | data.beneficios + data.fte_horas | onChange({ beneficios }) / onChange({ fte_horas }) | ✓ WIRED | `:38, 44-52` |
| ProcessoStep | data.tempo (fator frequência) | select grava onChange({ tempo }) | ✓ WIRED | `:62-65` |
| PriorizacaoStep | ScorePreview prop fte | fte={fteBucket} | ✓ WIRED | `:132` |
| WizardShell onSubmit create | createOpportunity prioridade_fte | deriveFteBucket(fte_horas) | ✓ WIRED | `:122-128` → actions.ts:359 `fte: data.prioridade_fte` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| WizardShell submit | prioridade_fte | deriveFteBucket(data.fte_horas) → createOpportunity → INSERT col `fte` (actions.ts:359) | Yes — derived from user input, persisted | ✓ FLOWING |
| CriteriosStep/BeneficiosStep | criterios/beneficios | user input → data.* → actions.ts:360-361 INSERT | Yes | ✓ FLOWING |
| PriorizacaoStep | fteBucket / score | deriveFteBucket + calcScore (5 factors) | Yes — computed live from state | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| deriveFteBucket 5 faixas + bordas | `npx vitest run tests/opportunities/fte.test.ts` | 7 passed | ✓ PASS |
| stepsFor create=5 steps + validateStep | `npx vitest run tests/wizard/state.test.ts` | 11 passed | ✓ PASS |
| calcScore inclui peso FTE (5º fator) | grep score.ts:37 `ft:{muito_baixo:4..muito_alto:20}` | presente | ✓ PASS |
| Full wizard walk + submit + persist | (requer app rodando) | — | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| WIZARD-01 | 11-01, 11-03 | Wizard único de 5 steps (substitui split persona/formulário) | ✓ SATISFIED | STEPS_CREATE + stepsFor single-flow + source fixo formulario |
| WIZARD-02 | 11-03 | Priorização coleta 5 fatores incl. bucket FTE, pesos visíveis | ✓ SATISFIED | 4 manuais c/ peso + bucket FTE derivado read-only c/ peso + ScorePreview fte |
| WIZARD-03 | 11-02 | Benefícios coleta 8 benefícios (1–5) + FTE em h/mês | ✓ SATISFIED | 8 chaves 1–5 em data.beneficios + input fte_horas |
| WIZARD-04 | 11-01, 11-02 | Critérios 8 (SIM/NÃO/PARCIAL); validações por step (nome+área; processo) | ✓ SATISFIED | CriteriosStep 8 sim/nao/parcial + validateStep identificacao/processo pt-BR |

Nenhum requisito órfão: REQUIREMENTS.md mapeia WIZARD-01..04 → Phase 11, todos reivindicados nos plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| BeneficiosStep.tsx | 97 | desmarcar escreve `0`; schema exige `min(1)` → submit rejeitado | ⚠️ Warning | WR-01. Happy path (pontuar uma vez, sem desmarcar) funciona; desmarcar+finalizar é bloqueado pelo Zod com erro genérico. Não falha o goal da fase, mas é correctness bug numa interação plausível |
| BeneficiosStep.tsx | 44-52 | fte_horas aceita negativo no client (min não enforçado no teclado) | ℹ️ Info | IN-01. Schema server (min(0)) rejeita; deriveFteBucket clampa ≤0 → muito_baixo. Display sã |
| WizardShell.tsx | 122-128 | payload spread carrega persona_extras + formulario_extras, cast as OpportunityInput | ℹ️ Info | IN-02. Seguro hoje no create (source='formulario' fixo, persona_extras nunca populado). Trap latente se futuro step setar persona_extras no create |

### Human Verification Required

1. **Walk do wizard completo** — abrir Nova Oportunidade, percorrer os 5 steps na ordem e Finalizar. Esperado: 5 steps sem Tipo/Classificação, criação + redirect para /opportunities/{id}.
2. **Desmarcar benefício + Finalizar (WR-01)** — confirmar que desmarcar um benefício e finalizar é rejeitado pelo Zod; happy path finaliza.
3. **Bucket FTE + score** — preencher fte_horas, conferir bucket derivado/peso em Priorização e a coerência com a coluna `fte` no banco após finalizar.
4. **Gates de validação pt-BR** — tentar avançar sem nome/área (step 1) e sem processo (step 2); confirmar bloqueio com mensagens pt-BR.

### Gaps Summary

Nenhum gap que impeça o goal. Os 4 success criteria estão estruturalmente verificados no código vivo (não apenas nos SUMMARYs): a sequência única de 5 steps, os 8 critérios sim/nao/parcial, os 8 benefícios 1–5 + fte_horas, os 5 fatores com pesos visíveis e o score, e as validações pt-BR por step — tudo wired e com data-flow real até a persistência (deriveFteBucket → coluna `fte`). Testes 18/18 verdes.

Status é **human_needed** (não passed) porque o entregável é um wizard interativo client-side cujo fluxo multi-step, gates de validação em tempo real e persistência via Server Action só se confirmam rodando o app. A única observação de qualidade é o Warning WR-01 (desmarcar benefício grava 0 e quebra o submit no Zod min(1)) — registrado para o desenvolvedor decidir; não falha o goal (happy path funciona) e não é coberto/deferido por nenhuma fase posterior (12–15 tratam riscos/telas/relatório/seed).

---

_Verified: 2026-06-05T04:45:00Z_
_Verifier: agente gsd-verifier_
