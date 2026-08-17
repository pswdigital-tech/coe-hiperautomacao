# Phase 11: Wizard de Fluxo Único (5 steps) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões são capturadas em CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-06-04
**Phase:** 11-wizard-fluxo-unico
**Areas discussed:** Escopo, FTE, Persona/source, Campos Automação, Interação Critérios/Benefícios

---

## Escopo (fronteira da fase)

| Option | Description | Selected |
|--------|-------------|----------|
| Só o wizard de criar | Reestrutura apenas o fluxo 'Nova Oportunidade'; modal/edição → Phase 13 | ✓ |
| Wizard de criar + edição | Realinha também mode='edit' agora (overlap c/ Phase 13) | |

**User's choice:** Só o wizard de criar.
**Notes:** Modal de detalhe + 8 abas + stepsFor('edit') ficam para a Phase 13 (VIEW-04).

---

## FTE — horas/mês × bucket (5º fator)

| Option | Description | Selected |
|--------|-------------|----------|
| Derivar bucket das horas | Só fte_horas no Benefícios; bucket derivado + exibido na Priorização (faixas do mockup) | ✓ |
| Derivar, mas permitir override | Deriva por padrão, usuário pode trocar o bucket | |
| Dois inputs manuais (paridade mockup) | Horas + select de bucket independentes, como _giba | |

**User's choice:** Derivar bucket das horas.
**Notes:** Fonte única (horas), sem campo manual, impossível divergir. Priorização exibe bucket+peso read-only p/ satisfazer WIZARD-02.

---

## Aposentar persona/source

| Option | Description | Selected |
|--------|-------------|----------|
| Fluxo único, sempre 'formulario' | Remove Tipo+Classificação; source fixo; discriminator fica só p/ legado | ✓ |
| Manter Tipo/Classificação | Continua perguntando tipo/classificação | |

**User's choice:** Fluxo único, sempre 'formulario'.
**Notes:** Variant persona permanece no schema só para ler/editar dados FGCoop legados.

---

## Campos de Automação (ferramenta, escopo_automacao[], beneficios_esperados[])

| Option | Description | Selected |
|--------|-------------|----------|
| Ferramenta no Processo; arrays fora do create | Select ferramenta no step Processo (default n8n); arrays viram null | ✓ |
| Dropar tudo de automação do create | Nem ferramenta; tudo vira IA/edição | |
| Manter ferramenta + arrays no wizard | Adiciona os arrays em algum step | |

**User's choice:** Ferramenta no Processo; arrays fora do create.
**Notes:** Respeita a intenção da 7.6 (tirar campos técnicos do usuário). REALIGN-7.6 segue deferido; Phase 11 não reativa IA, só mantém compat de schema (MODEL-10).

---

## Interação Critérios & Benefícios

| Option | Description | Selected |
|--------|-------------|----------|
| Reaproveitar componentes atuais, reescritos | Click-to-cycle + barras 1–5, reescritos p/ 8 chaves first-class lowercase | ✓ |
| Replicar os dropdowns do mockup | Selects SIM/NÃO/PARCIAL e 1-5 idênticos ao _giba | |

**User's choice:** Reaproveitar componentes atuais, reescritos.
**Notes:** UX superior aos dropdowns; migrar Critérios de 10 UPPERCASE/formulario_extras → 8 camelCase first-class; Benefícios → beneficios top-level.

---

## Executor's Discretion

- Redundância `frequencia` (step Processo, descritivo) × `tempo` (fator de score, Priorização): planner deve preferir alimentar `tempo` a partir da frequência do Processo (fonte única). Sinalizado, não decidido pelo usuário.
- Layout/ordem interna de cada step, ícones, microcópia — discrição mantendo paridade estrutural com o mockup.

## Deferred Ideas

- Modal de detalhe + edição (8 abas) + stepsFor('edit') → Phase 13.
- REALIGN-7.6 / reativação do enrichment de IA → deferido (carryover v0.1).
- Override manual do bucket FTE → considerado e rejeitado; mudança incremental futura se necessário.
