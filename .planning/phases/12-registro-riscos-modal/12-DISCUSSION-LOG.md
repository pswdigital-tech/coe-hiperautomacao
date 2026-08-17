# Phase 12: Registro de Riscos (UI do modal) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 12-registro-riscos-modal
**Areas discussed:** Interação no modal, Preview da prioridade, Salvar/refresh/excluir, Labels/enums/Responsável

---

## Interação no modal

| Option | Description | Selected |
|--------|-------------|----------|
| Inline na aba Risco | RiscoTab vira client component com formulário inline (estilo _giba) | |
| Sub-rota dedicada | Rota dedicada para o CRUD, fora do fluxo inline da aba | ✓ |
| Via wizard de edição | Adicionar step de riscos ao wizard existente | |

**User's choice:** Sub-rota dedicada
**Notes:** Desvia do mockup (que é inline) — desvio explícito e aceito. Follow-up esclareceu o shape (abaixo).

### Follow-up: shape da sub-rota

| Option | Description | Selected |
|--------|-------------|----------|
| Aba lista + botões abrem sub-rota | Aba Risco mantém a tabela (RISK-05); botões abrem a sub-rota de formulário | ✓ |
| Aba Risco vira link para a página | Aba só com resumo + botão "Gerenciar riscos"; CRUD e lista na sub-rota | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rota interceptada (modal aninhado) | Segue o padrão @modal existente; URL direta = fullscreen | ✓ |
| Página cheia dedicada | Rota normal /opportunities/[id]/riscos, navegação fullscreen | |

**User's choice:** Aba lista + botões abrem sub-rota; rota interceptada (modal aninhado)
**Notes:** Tab = leitura (lista), sub-rota = formulários. Risco técnico (nesting de intercepting routes) anotado para o researcher.

---

## Preview da prioridade

| Option | Description | Selected |
|--------|-------------|----------|
| Espelho no client + trigger autoritativo | Matriz em TS para preview ao vivo, trigger SQL grava | |
| Só após salvar | Prioridade aparece só depois do round-trip ao server | ✓ |

**User's choice:** Só após salvar
**Notes:** Ainda satisfaz RISK-02 (auto-calculada, não escolhida pelo usuário). Campo Prioridade read-only no form.

---

## Salvar / refresh / excluir

| Option | Description | Selected |
|--------|-------------|----------|
| router.refresh + confirmar exclusão | revalidatePath + router.refresh; excluir pede confirmação | ✓ |
| router.refresh + excluir imediato | Igual, mas exclusão imediata (fiel ao mockup) | |
| Estado otimista local | Atualiza no client e reconcilia depois | |

**User's choice:** router.refresh + confirmar exclusão
**Notes:** Modal permanece aberto após a operação.

---

## Labels / enums / Responsável

| Option | Description | Selected |
|--------|-------------|----------|
| Texto livre com sugestões | Input livre (tenant-agnóstico), hints PSW/UnidaSul | ✓ |
| Dropdown fixo PSW/UnidaSul | Select fixo com as duas opções do mockup | |

**User's choice:** Texto livre com sugestões
**Notes:** Enums internos sempre minúsculos + camada de labels PT na UI (decidido junto na pergunta).

## Executor's Discretion

- Estilo visual fino (badges, espaçamentos, ícones).
- Tratamento de erros de validação/servidor no formulário.
- Ordenação default da tabela de riscos.
- Geração do rótulo "Rxxx".

## Deferred Ideas

- Preview ao vivo da prioridade (descartado nesta fase).
- Destino do campo legado `risco` (texto livre) → Phase 13.
- Riscos em KPI/tabela/Relatório → Phases 13/14.
