---
phase: 03-lista-tabela
status: ready_to_execute
total_plans: 3
waves: 3
---

# Phase 3 — Lista Tabela (read-only)

## Goal

Usuário logado vê as **29 oportunidades reais do FGCoop** numa tabela com **paridade visual ao mockup** ([fgcoop-coe-v2.html](../../../fgcoop-coe-v2.html)). KPI bar no topo mostra contadores reais (29 total, 9 personas, 20 formulários, score médio, contagens por status e ferramenta). Sem interações ainda — só leitura.

## Por que esta fatia agora

- Conecta a stack à entrega final: pela primeira vez o usuário vê **valor** (suas oportunidades) em vez de só um count.
- Não tem nenhuma feature de escrita ou filtro funcional — descomplica.
- Estabelece o padrão de **fetch via Server Component + RLS** que toda fase seguinte reusa.
- Cria os componentes de célula (badges de fonte/ferramenta/status/score) que vão ser reaproveitados em Cards e Kanban (Phase 5).

## Decisão de rota

`/opportunities` vai ser a **rota principal pós-login**. `/dashboard` fica como redirect → `/opportunities` (pra não quebrar links existentes). Plan 03-03 trata.

## Estrutura de execução (3 plans, 3 waves)

```
Wave 1  ──────────────────►  03-01: Data Layer + types
                              (lib/opportunities/queries.ts + types.ts)

Wave 2  ──────────────────►  03-02: Cell Components (badges + score circle)
                              (components/opportunities/cells.tsx)

Wave 3  ──────────────────►  03-03: Page /opportunities + KPI bar + checkpoint
                              (app/(app)/opportunities/page.tsx + components/opportunities/{kpi-bar,table}.tsx)
                              + redirect /dashboard → /opportunities
```

## Must-haves (verificação pós-execução)

**Truths observáveis:**
- Acessar `/opportunities` logado mostra tabela com **29 linhas**
- Cada linha exibe: `#seq_id`, fonte (badge persona/formulário), solicitante, área/subárea, processo, número de pessoas, complexidade (badge), ferramenta (badge), status (badge colorido), score (com cor por nível) e nível de prioridade (Alta/Média/Baixa)
- Score é **calculado em tempo real** pela view `opportunities_with_score` — para a oportunidade #10 (Taíse, baixo+medio+pequeno+4) o score sai como **85** (não null, não 0)
- KPI bar mostra: `Total=29`, `Personas=9`, `Formulários=20`, `Score Médio=N`, contadores de Alta/Média/Baixa, contadores por status, contadores por ferramenta (RPA/n8n/ambos)
- Visualmente é **fiel ao mockup**: header em gradiente azul (já feito), KPI bar branca com números grandes em azul, tabela com header escuro
- `/dashboard` redireciona pra `/opportunities`

**Artifacts necessários:**
- `lib/opportunities/queries.ts` (Server-only, fetch via `opportunities_with_score`)
- `lib/opportunities/types.ts` (re-exports + tipos derivados úteis)
- `components/opportunities/cells.tsx` (badges + circle de score)
- `components/opportunities/kpi-bar.tsx`
- `components/opportunities/table.tsx`
- `app/(app)/opportunities/page.tsx`

**Key links:**
- `page.tsx` chama `fetchOpportunities()` de `lib/opportunities/queries.ts`
- `table.tsx` recebe `opportunities[]` e renderiza usando `cells.tsx`
- `kpi-bar.tsx` calcula derivações do array localmente (count by status, etc.)

## User setup

Nenhum nesta fase. Tudo automatizável.

## Out of scope

- **Sort interativo** (clicar no header pra ordenar) — Phase 7
- **Filtros** (busca, área, ferramenta, prioridade, status) — Phase 7
- **View switcher** (tabela/cards/kanban) — Phase 5
- **Cards view e Kanban** — Phase 5
- **Modal de detalhe** ao clicar na linha — Phase 4
- **Mudança de status** — Phase 5
- **Indicadores de loading/skeleton** — Phase 8
- **Paginação** — não precisamos (29 itens, qualquer growth real é Phase 8)

## Após esta fase

- **Phase 4** (Modal de detalhe) abre em cima ao clicar numa linha — reusa as queries de cá.
- **Phase 5** (Cards/Kanban) reusa `cells.tsx` em outros layouts.
- **Phase 7** (filtros) acopla na infra de queries.

## Tabela do mockup — referência

Colunas e ordem (fonte: `<thead>` no mockup, linhas 324-338):

| # | Header | Campo origem | Render |
|---|---|---|---|
| 1 | ID | `seq_id` | `#0001` zero-padded a 4 dígitos |
| 2 | Fonte | `source` | badge `persona`/`formulário` com cor |
| 3 | Solicitante | `solicitante` | nome + iniciais (avatar opcional) |
| 4 | Área / Subárea | `area`, `subarea` | duas linhas |
| 5 | Processo / Oportunidade | `processo` | texto + truncate |
| 6 | Freq. | `frequencia` | texto |
| 7 | Pessoas | `num_pessoas` | texto |
| 8 | Complex. | `complexidade` | badge cor (verde/amarelo/vermelho) |
| 9 | Ferramenta | `ferramenta` | badge cor (RPA roxo / n8n laranja / ambos ciano) |
| 10 | Status | `status` | badge cor + ícone |
| 11 | Score | `score` (da view) | número + dot colorido |
| 12 | Prior. | `priority_level` (da view) | pill Alta/Média/Baixa |
| 13 | Ação | — | `Abrir` (no-op no MVP — vira modal na Phase 4) |
