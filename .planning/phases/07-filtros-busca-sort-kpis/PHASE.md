---
phase: 07-filtros-busca-sort-kpis
status: ready_to_execute
total_plans: 3
waves: 3
---

# Phase 7 — Filtros + Busca + Sort + KPIs reativos

## Goal

Toolbar ganha **paridade funcional com o mockup**:
- **Busca livre** (campo de texto): match em `solicitante`, `processo`, `area`
- **4 dropdowns**: Fonte (Persona/Formulário), Área, Ferramenta, Prioridade (Alta/Média/Baixa), Status
- **Sort dropdown** + click no header da tabela
- **Botão "↺ Limpar"** que reseta tudo
- **KPI bar recalcula** sobre o subset filtrado (Total, contadores, score médio — tudo refletindo o filtro ativo)
- Tudo persistido na **URL** (`?q=...&area=...&tool=...&priority=...&status=...&sort=score_desc`) → shareable

## Por que esta fatia agora

Com 29 itens (e mais sendo criados), o usuário precisa de filtro pra navegar. Kanban filtrado por área é especialmente útil pra gestores de área. Sort por seq_id é útil pra encontrar uma oportunidade específica.

## Decisão técnica chave

**Filtros aplicados no server** (`?` params + `fetchOpportunities` recebe filtros), não client-side. Razões:
- 1 viagem ao banco, dados filtrados já vêm prontos
- KPI bar usa o mesmo subset (sem dois cálculos)
- URL é a fonte da verdade → shareable, refresh-safe
- Custa zero performance pra 29 itens; ainda funciona bem em milhares

## Estrutura de execução (3 plans, 3 waves)

```
Wave 1  ──────────────────►  07-01: Filter state + Toolbar UI completa
                              (lib/opportunities/filters.ts — parser/serializer URL params
                               + toolbar.tsx ganha 5 controles + botão Limpar)

Wave 2  ──────────────────►  07-02: Aplicar filtros + sort no fetch + KPIs reativos
                              (fetchOpportunities aceita filter object,
                               page.tsx passa filters parseados,
                               KpiBar reflete subset filtrado)

Wave 3  ──────────────────►  07-03: Sort interativo nos headers da tabela + checkpoint
                              (table headers clicáveis com seta indicando direção,
                               sort dropdown sincronizado)
```

## Must-haves

**Truths observáveis:**
- Digitar no campo "Buscar por nome, processo ou área..." filtra os resultados em real-time (com debounce 200ms)
- Trocar dropdown de Fonte/Área/Ferramenta/Prioridade/Status filtra imediatamente; URL atualiza com `?...`
- KPI bar mostra contadores do **subset filtrado** (ex: filtrar por "Persona" → Total muda pra 9)
- "↺ Limpar" zera todos os filtros e busca
- Tabela: click no header de uma coluna ordenável (ID/Solicitante/Área/Processo/Score/Status) alterna asc/desc; ícone da seta aparece
- Sort persiste no URL (`?sort=score_desc`); recarregar mantém
- Refresh / share URL preserva filtros + sort
- View Cards e Kanban também respeitam o mesmo filter set
- Vazio: estado "Nenhuma oportunidade encontrada com esses filtros."

**Artifacts:**
- `lib/opportunities/filters.ts` (parsers/serializers `URLSearchParams ↔ OpportunityFilters`)
- `lib/opportunities/queries.ts` (atualizar `fetchOpportunities` pra aceitar filters)
- `components/opportunities/toolbar.tsx` (busca + 5 dropdowns + Limpar)
- `app/(app)/opportunities/page.tsx` (parsing + passar filters pro fetch)
- `components/opportunities/table.tsx` (sort interativo nos headers)

**Key links:**
- toolbar dispara `router.replace('/opportunities?' + qs)` em todo change
- page.tsx parseia `searchParams` → `filters` → passa pra `fetchOpportunities(filters)`
- KpiBar recebe array já filtrado, `computeKpis` opera só sobre ele

## Decisões prévias

- **Debounce no campo de busca** (200ms) — evita N viagens ao server por keystroke
- **Filtros como AND** — múltiplos ativos = todos precisam bater
- **Áreas no dropdown** = lista DISTINCT do banco (pega via `fetchOpportunities` server-side ou query separada `fetchAreas`)
- **"Prioridade"** filtra por `priority_level` da view (já calculado)
- **Sort default**: score desc → seq_id asc (continua igual)
- **`current view` (?view=)** é independente dos filtros — coexistem na URL

## Out of scope

- **Filtros salvos** ("favoritos"/"presets") — pós-MVP
- **Multi-select por dropdown** (ex: status = "novo" OU "em_analise") — pós-MVP
- **Filtro por intervalo de score** (ex: 40-70) — pós-MVP, hoje usa o bucket da prioridade
- **Server-side pagination** — 29 itens não precisa; com 500+ a gente revisita

## Mapeamento mockup

| Elemento | Mockup |
|---|---|
| Input "Buscar..." | linha 278 |
| Dropdown Fonte | linha 280-283 |
| Dropdown Área | linha 284-286 |
| Dropdown Ferramenta | linha 287-289 |
| Dropdown Prioridade | linha 290-293 |
| Dropdown Status | linha 294-297 |
| Sort dropdown | linha 299-308 |
| Botão "Limpar" | linha 308 |
| KPIs reativas | função `updateKPIs()` linha 617 |

## Após esta fase

**Phase 8 — Polish + Deploy**. Loading states, error boundaries, mobile responsivo, deploy na Vercel.
