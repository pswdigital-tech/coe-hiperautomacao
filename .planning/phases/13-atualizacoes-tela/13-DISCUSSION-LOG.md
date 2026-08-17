# Phase 13: Atualizações de Tela - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 13-atualizacoes-tela
**Areas discussed:** KPI bar, Tabela, Modal (8 abas + edição), Kanban

---

## Seleção de áreas

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Escopo da KPI bar | Substituir vs aditivo | ✓ |
| Colunas da tabela | FTE/RPA Fit, coluna Fonte, sort | ✓ |
| Modal: 8 abas + edição | Unificação, legado, escopo de edição | ✓ |
| Cards do kanban | Header só vs header + cards | ✓ |

**Escolha:** todas as 4 áreas.

---

## KPI bar

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Paridade total c/ mockup | 9 KPIs do _giba; some Personas/Formulários + RPA/n8n/ambos | ✓ |
| Aditivo (preserva atual) | Mantém tudo + adiciona FTE/status | |
| Híbrido | Barra do mockup + mantém contagens por ferramenta | |

**User's choice:** Paridade total c/ mockup.
**Notes:** Persona/formulário é conceito morto na criação (Phase 11); barra fica limpa e fiel ao contrato.

---

## Colunas da tabela

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Coluna Fonte: Remover | Alinha ao mockup | |
| Coluna Fonte: Manter | Distingue 29 personas legadas FGCoop | ✓ |
| Células: Paridade c/ mockup | FTE 'Xh' + RPA Fit badges por faixa + sort FTE/RPA Fit | ✓ |
| Células: Só o mínimo | Texto simples, sort só FTE | |

**User's choice:** Manter coluna Fonte + paridade total nas células novas.
**Notes:** Divergência consciente do mockup na coluna Fonte (útil enquanto houver legado misturado); FTE/mês e RPA Fit em paridade, ambas sortáveis (VIEW-03).

---

## Modal: 8 abas + edição

| Pergunta | Opção escolhida |
|----------|-----------------|
| Unificação das abas | **Sim, 8 abas p/ todos** (incl. personas legadas com empty states) |
| Abas só-persona (Perfil/Desafios/CoE) | **Remover da exibição** (dados ficam em persona_extras) |
| Campo legado 'risco' (texto livre) | **Mover p/ Observação** |
| Escopo de edição | **Editável pelas 8 abas** |

**Opções não escolhidas:** Condicional por source; Dobrar persona em Observação; Remover 'risco' da UI; Só leitura (realinhar).
**Notes:** Resolve a pendência deferida da Phase 12 (destino do campo `risco`). Edição é expansão de escopo além do texto literal de VIEW-05 — PO optou explicitamente; Phase 11 já havia deferido "edição 8 abas" para cá.

### Follow-up — mecânica de edição

| Pergunta | Opção escolhida | Alternativa rejeitada |
|----------|-----------------|------------------------|
| Modo de edição | **Global (Editar/Salvar no header)** — paridade _giba:969-973 | Por aba |
| Reuso + rota /edit | **Reusar updateOpportunity + componentes; manter /edit** | Aposentar /edit |

**Notes:** Zero retrabalho de backend (Phase 10). Constraint herdada (docs/PROJETO.md): derivados (score/rpa_score/bucket FTE) ficam read-only e recalculam, nunca viram input.

---

## Cards do kanban

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Header + cards (paridade) | FTE somado na coluna + chip FTE + badge RPA no card | ✓ |
| Só o header (mínimo VIEW-04) | Apenas FTE somado no header | |

**User's choice:** Header + cards (paridade).
**Notes:** Custo marginal baixo (dados já disponíveis); paridade visual completa com _giba:698-741.

---

## Executor's Discretion

- Microcópia/ícones/espaçamentos dos empty states e abas.
- Mecânica fina do estado de edição global (form state, dirty-check, fieldErrors).
- Layout da aba Observação acomodando `observacao` + `risco` legado.
- Reuso vs cópia dos componentes de campo do wizard nas abas editáveis.

## Deferred Ideas

- Aposentar a rota /edit (wizard) — mantida (D-14).
- Remover coluna "Fonte" — só quando o legado FGCoop sair.
- Dados de persona (Perfil/Desafios/CoE) em alguma view v0.2.
- Riscos/prioridade de risco em KPI/tabela; view Relatório (Phase 14); seed Unidasul (Phase 15).
