# Phase 16: Tarefas e Subtarefas por Oportunidade (Lista / Kanban / Gantt) - Research

**Researched:** 2026-08-04
**Domain:** Postgres self-referencing hierarquia + RLS multi-tenant + UI Kanban/Gantt zero-dep (Next.js 16 / Supabase)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (NÃO reabrir)

- **D-01 (Hierarquia, 2 níveis):** tabela única `opportunity_tasks` com `parent_task_id` self-FK. Uma subtarefa **nunca** pode ter filhas. A regra é garantida **no banco** (constraint/trigger), não só na UI. Sem árvore de profundidade livre.
- **D-02 (Gantt / rollup):** `start_date` e `due_date` são **manuais** em tarefa e subtarefa. A tarefa-pai **exibe** o span agregado (menor `start_date` / maior `due_date` das filhas) e o **% de conclusão agregado**. Ambos são **calculados em runtime** (view SQL ou client) e **nunca persistidos**. Nenhuma coluna `progress`, `computed_start` ou similar em `opportunity_tasks`.
- **D-03 (Status / Kanban):** enum fixo de 4 valores mapeando 1:1 nas colunas, nesta ordem: Backlog → Em Andamento → Bloqueio → Finalizado. Sem colunas configuráveis por tenant. Mover um card para Bloqueio exige o motivo do bloqueio (`blocked_reason`) antes de concluir a movimentação; o motivo aparece no card e no detalhe.
- **D-04 (Responsável):** um responsável por tarefa — `assignee_id` FK → `profiles(id)`, obrigatoriamente do mesmo tenant da tarefa, validado no banco (trigger) além do RLS. O select de responsável lista somente profiles do tenant corrente. Sem múltiplos responsáveis e sem nome livre.
- **D-05 (`profiles`, não `users`):** `assignee_id` referencia `profiles(id)` — `opportunity_assignees.profile_id → profiles(id)` (0032) é o precedente.
- **D-06 (numeração da migration):** a última migration no repo é `0036_public_opportunities_no_status_filter.sql`. A desta fase é **`0037`**.
- **D-07 (Gantt sem biblioteca nova):** já existem dois Gantt zero-dep em CSS/Tailwind — `components/opportunities/gantt/GanttChart.tsx` e `components/proposal/GanttChart.tsx`. O Gantt de tarefas segue esse padrão.
- **D-08 (seletor de pessoas já existe):** `lib/opportunities/assignees.ts` (`AssignableProfile`, 0032) já busca os profiles atribuíveis do tenant corrente. Reusar, não criar query nova.
- **D-09 (sem shadcn/ui):** `components/ui/` não existe — Tailwind escrito à mão. Não introduzir shadcn.
- **D-10 (analog end-to-end):** o vertical slice de riscos é o analog mais próximo: `risk-schema.ts` (Zod `.strict()`) → `risk-actions.ts` (server actions, tenant server-derived) → `queries.ts` (whitelist de colunas) → `modal/risk/` (tabela + form + dialog) → sub-rotas em `app/(app)/opportunities/[id]/riscos/...`.

### Executor's Discretion

- Onde as 3 views vivem (aba nova no modal vs. sub-rota dedicada `/opportunities/[id]/tarefas`).
- Como as 3 views se alternam (segmented control local, query param `?view=`, ou sub-rotas).
- Escala/zoom do eixo do Gantt (dia/semana/mês) e como lidar com tarefas sem data.
- Onde o rollup é calculado — view SQL ou função pura em `lib/`. Fonte única, não persistido; se houver espelho client+SQL, precisa de teste de paridade.
- Ordenação default de tarefas na Lista e dentro de cada coluna do Kanban.
- Rótulo/ID visível da tarefa (ex. "T001") e ícones/badges de status.
- Estado de expandir/comprimir: local (`useState`) vs. persistido na URL — requisito é apenas que seja por tarefa, não global.

### Deferred Ideas (OUT OF SCOPE)

- Hierarquia de N níveis (árvore livre).
- Múltiplos responsáveis por tarefa.
- Responsável por texto livre.
- Colunas de Kanban configuráveis por tenant.
- Coluna "Em Revisão".
- Rollup persistido (colunas `progress`/`computed_start`).
- Visão cross-oportunidade de tarefas ("minhas tarefas" / board do tenant).
- Dependências entre tarefas e caminho crítico.
- Drag no Gantt para mover/redimensionar datas.
- Notificar o responsável ao ser atribuído.
- Comentários/anexos/log de horas por tarefa.
- Qualquer rota/query cross-tenant ou de admin de plataforma.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-01 | Tarefa com título, descrição, status, datas, responsável | Migration DDL (§1), Zod schema modelado em `risk-schema.ts` (§7) |
| TASK-02 | Subtarefas — 2 níveis exatos, garantido no banco | Trigger `check_task_depth()` (§1) |
| TASK-03 | 1 responsável, mesmo tenant, select restrito | Trigger `check_task_tenant_coherence()` (§2) + reuso de `assignees.ts` (§2) |
| TASK-04 | Isolamento por tenant — RLS 4 policies, teste A≠B | RLS modelada em `opportunity_risks` real (§2) + teste em `opportunity-risks-isolation.test.ts` (§8) |
| TASK-05 | Criar tarefa e, a partir dela, subtarefas, form dedicado | Vertical slice de risco mapeado arquivo-a-arquivo (§7) |
| TASK-06 | Editar/remover; remover pai remove filhas com confirmação | `on delete cascade` no FK (§1) + `DeleteRiskButton.tsx` como modelo de confirmação (§7) |
| TASK-07 | Lista com expandir/comprimir por tarefa | §6 (local state `Set<string>`) |
| TASK-08 | Kanban 4 colunas fixas, drag muda status | `Board/Column/Card` de oportunidades como base (§5) |
| TASK-09 | Mover para Bloqueio exige motivo antes de concluir | Padrão de interceptação de drop (§5) |
| TASK-10 | Gantt com barras + expandir/comprimir | `GanttChart.tsx` adaptado (§4) |
| TASK-11 | Span + % agregado da pai, runtime, não persistido | `lib/opportunities/task-rollup.ts` recomendado (§3) |
</phase_requirements>

## Summary

A Fase 16 é, estruturalmente, uma repetição do vertical slice de **Riscos** (Phase 12) com três complicações novas: (1) a tabela é auto-referenciada com um limite de profundidade que o Postgres não consegue expressar como `CHECK` simples — exige um trigger; (2) o Kanban precisa interceptar o drop para Bloqueio com um prompt bloqueante antes de persistir; (3) há uma terceira view (Gantt) que precisa lidar com uma hierarquia de 2 níveis expansível, coisa que os dois Gantt existentes no repo não fazem hoje (eles são flat).

Tudo o que é infraestrutura já existe e deve ser reusado sem modificação: `@dnd-kit` (Kanban), o padrão de Gantt zero-dep por `leftPct`/`widthPct`, `lib/opportunities/assignees.ts` (seletor de pessoas do tenant), e o trigger de coerência de tenant de `opportunity_assignees` (0032). Nenhuma dependência nova é necessária em nenhuma camada.

O ponto mais importante descoberto nesta pesquisa, que NÃO estava no CONTEXT.md: a RLS real de `opportunity_risks` hoje (depois de 0015 + 0021) não é "tenant + qualquer papel pode escrever" nem "só admin escreve" — é um meio-termo específico: **qualquer role exceto `viewer` pode inserir/editar/remover**, e `platform_admin` tem um SELECT aditivo cross-tenant. Isso resolve a pergunta em aberto "quem pode criar tarefas" com uma resposta concreta e já precedentada no próprio banco, não uma escolha de design nova.

**Primary recommendation:** clonar a RLS/policies de `opportunity_risks` (tenant-scoped + `current_user_role() <> 'viewer'` no write) e o vertical slice de arquivos ponta-a-ponta de risco; resolver a profundidade de 2 níveis com um trigger `BEFORE INSERT OR UPDATE` (não CHECK, não coluna redundante); calcular o rollup em uma função pura `lib/opportunities/task-rollup.ts` (sem view SQL, sem teste de paridade); e colocar as 3 views em uma sub-rota fullscreen dedicada `/opportunities/[id]/tarefas?view=`, não dentro do modal de 768px.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Constraint de 2 níveis (D-01) | Database / Storage | — | Só o banco pode garantir isso contra qualquer caminho de escrita (app, script, futuro admin); CHECK com subquery é proibido pelo Postgres, então vira trigger |
| Coerência de tenant do `assignee_id` (D-04) | Database / Storage | API / Backend | Trigger é a garantia real; a query de "profiles atribuíveis" (client-side filtrado) é defesa em profundidade na API |
| Isolamento multi-tenant (TASK-04) | Database / Storage (RLS) | API / Backend | RLS é a fonte da verdade; `.eq('tenant_id', profile.tenant_id)` nas server actions é defesa em profundidade, não o controle real |
| Rollup (span + % conclusão, TASK-11) | API / Backend (Server Component, `lib/`) | — | Calculado sobre um array já buscado (poucas dezenas de linhas por oportunidade) — não precisa de SQL; ver §3 para a justificativa completa |
| Validação de `blocked_reason` condicional | API / Backend (Zod) | Browser (form) | Zod é a fonte da verdade da regra; a UI só reflete (`required` visual) |
| Kanban drag + interceptação de bloqueio | Browser / Client | API / Backend (server action) | dnd-kit e o estado otimista são client-only; a persistência do status é uma Server Action |
| Gantt (posicionamento das barras) | Browser / Client (render) | API / Backend (fetch das tarefas) | Cálculo de `leftPct`/`widthPct` é puro client-side sobre dados já buscados no servidor |
| 3 views (Lista/Kanban/Gantt) | Frontend Server (SSR, Server Component fetch) | Browser (interatividade) | Fetch único no Server Component; cada view client-side consome o mesmo array |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | `^6.3.1` [VERIFIED: package.json] | Drag-and-drop do Kanban de tarefas | Já é dependência do projeto; usado por `components/opportunities/kanban/*` — nenhuma API nova necessária |
| `zod` | `^4.4.3` [VERIFIED: package.json] | `task-schema.ts` (validação + tipos) | Já usado em todos os schemas do projeto; `.strict().superRefine()` já é o padrão vivo em `lib/opportunities/schema.ts:136` |
| `next` | `16.2.6` [VERIFIED: package.json] | App Router, Server Actions, Server Components | Stack do projeto (docs/PROJETO.md) |
| Supabase JS client | (via `@supabase/ssr`, já em uso) | Leitura/escrita de `opportunity_tasks` | Já usado em toda a camada `lib/opportunities/*` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/utilities` | `^3.2.2` [VERIFIED: package.json] | `CSS.Translate.toString` para o transform do card | Se o Card de tarefa precisar do mesmo helper que `KanbanCard.tsx` (hoje ele monta o transform manualmente, sem essa lib — ver Pitfall) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Trigger `BEFORE INSERT/UPDATE` para 2 níveis | `CHECK` com subquery | **Não é uma alternativa viável** — Postgres rejeita `CHECK` que referencia outras linhas da mesma tabela (`cannot use subquery in check constraint`), erro na criação da tabela. Descartado, não é escolha de estilo. |
| Trigger `BEFORE INSERT/UPDATE` | Coluna redundante `parent_is_root boolean` + FK composta (`parent_task_id, parent_is_root`) apontando para `(id, is_root)` com `is_root` derivado | Funciona em teoria (é o "truque" clássico de auto-FK com discriminador), mas exige uma coluna `is_root`/`depth` sincronizada por trigger de qualquer forma — não elimina o trigger, só move a checagem para uma FK. Mais complexo sem ganho; não recomendado. |
| Função pura TS para rollup | View SQL `opportunity_tasks_with_rollup` (analog de `opportunities_with_score`) | Viável, mas exige migration adicional + teste de paridade client/SQL (como `score-parity.test.ts`) para um cálculo que só é consumido no client sobre um array já pequeno — custo sem benefício aqui (ver §3) |
| Sub-rota fullscreen `/opportunities/[id]/tarefas` | Aba nova no modal (`max-w-3xl`) | Modal é estreito demais para Kanban (4 colunas × ~220px = 880px+) e Gantt (`min-w-[760/900px]`) — ver §6 |

**Installation:** nenhuma instalação nova. Todas as libs já são dependências do projeto.

**Version verification:** `@dnd-kit/core@^6.3.1`, `zod@^4.4.3`, `next@16.2.6` confirmados via `grep` direto em `package.json` do próprio repo [VERIFIED: package.json] — não há necessidade de checar o registry porque nada novo é instalado.

## Package Legitimacy Audit

**Não aplicável** — esta fase não instala nenhum pacote novo. Todas as dependências (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `zod`) já estão em `package.json` e já são usadas em produção pelo mesmo projeto (Kanban de oportunidades, todos os schemas Zod). Nenhum verdict `SLOP`/`SUS` a reportar.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│                                                                       │
│  /opportunities/[id]/tarefas?view=lista|kanban|gantt                │
│         │                                                            │
│         ├─ TaskList (expand/collapse por taskId, Set<string>)       │
│         ├─ TaskKanbanBoard (dnd-kit, estado otimista)                │
│         │      └─ onDragEnd → status='bloqueio'? ──┐                │
│         │                                            │                │
│         │            ┌───────────────────────────────┘                │
│         │            ▼                                                │
│         │      BlockedReasonDialog (modal client, motivo obrigatório) │
│         │            │ confirm(reason)      │ cancel                 │
│         │            ▼                      ▼                        │
│         │      optimistic update      nada muda (card já             │
│         │      + Server Action        "voltou" — nunca saiu           │
│         │            │                do estado local)               │
│         └─ TaskGantt (leftPct/widthPct sobre span, expand/collapse)  │
└─────────┬─────────────────────────────────────────────────────────────┘
          │ Server Action (createTask/updateTask/updateTaskStatus/deleteTask)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend Server (Next.js Server Component + Server Action)           │
│                                                                       │
│  page.tsx (Server Component)                                        │
│    → fetchTasksForOpportunity(opportunityId)  [1 query, whitelist]  │
│    → fetchAssignableProfiles(tenantId)        [reuso de 0032]       │
│    → task-rollup.ts: computeRollup(children[]) [puro, sem I/O]      │
│                                                                       │
│  task-actions.ts ('use server')                                     │
│    → taskInputSchema.safeParse(input)          [Zod, .strict()]     │
│    → requireEditorRole()                       [bloqueia viewer]    │
│    → tenant_id/opportunity_id server-derived   [nunca do payload]   │
│    → supabase.from('opportunity_tasks').insert/update/delete        │
└─────────┬─────────────────────────────────────────────────────────────┘
          │ SQL (RLS-scoped)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Database (Postgres / Supabase)                                      │
│                                                                       │
│  opportunity_tasks                                                   │
│    ├─ RLS: tenant_id = current_tenant_id() [+ platform_admin SELECT]│
│    ├─ trigger check_task_depth()            [2 níveis, D-01]        │
│    ├─ trigger check_task_tenant_coherence() [assignee/opp mesmo     │
│    │                                          tenant, D-04]          │
│    └─ FK parent_task_id ON DELETE CASCADE   [remove filhas, TASK-06]│
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
supabase/migrations/
└── 0037_opportunity_tasks.sql        # tabela + enum + triggers + RLS (write-only)

lib/opportunities/
├── task-schema.ts                    # Zod .strict(), espelha risk-schema.ts
├── task-actions.ts                   # 'use server' create/update/delete/updateStatus
├── task-labels.ts                    # enum(DB)→label PT + badges (espelha risk-labels.ts)
├── task-rollup.ts                    # NOVO — span + % conclusão, puro, sem I/O
├── queries.ts                        # + fetchTasksForOpportunity (mesma convenção de risco/doc/nota)
└── types.ts                          # + OpportunityTask, TaskStatus (via Database['public']['Tables'])

components/opportunities/tasks/
├── TaskList.tsx                      # linha pai + subtarefas indentadas, chevron
├── TaskFormDialog.tsx                # espelha RiskFormDialog.tsx (?tarefa=new|<id>)
├── TaskForm.tsx                      # espelha RiskForm.tsx (campos + blocked_reason condicional)
├── TaskFormPage.tsx                  # espelha RiskFormPage.tsx (deep-link fullscreen)
├── DeleteTaskButton.tsx              # espelha DeleteRiskButton.tsx (+ aviso "remove N subtarefas")
├── kanban/
│   ├── TaskKanbanBoard.tsx           # espelha kanban/Board.tsx + pendingDrop state
│   ├── TaskKanbanColumn.tsx          # espelha kanban/Column.tsx (4 colunas fixas)
│   ├── TaskKanbanCard.tsx            # espelha kanban/Card.tsx (+ badge blocked_reason)
│   └── BlockedReasonDialog.tsx       # NOVO — prompt obrigatório, cancelável
└── gantt/
    └── TaskGanttChart.tsx            # adaptado de opportunities/gantt/GanttChart.tsx (2 níveis)

app/(app)/opportunities/[id]/tarefas/
├── page.tsx                         # fullscreen, fetch único, branch por ?view=
├── new/page.tsx                     # deep-link criar tarefa raiz (TaskFormPage)
└── [taskId]/
    ├── edit/page.tsx                # deep-link editar tarefa/subtarefa
    └── new/page.tsx                 # deep-link criar subtarefa de [taskId]
```

### Pattern 1: 2-level depth guard via trigger (D-01) — research priority #1

**What:** um `BEFORE INSERT OR UPDATE` trigger em `opportunity_tasks` que rejeita qualquer linha que tentaria criar um 3º nível.

**Why a trigger, not a CHECK:** o Postgres **não permite** `CHECK` constraints que fazem subquery contra outras linhas da mesma tabela (ou de qualquer tabela) — a expressão de um `CHECK` precisa ser determinística por linha (`IMMUTABLE`-like, sem I/O de catálogo). Tentar `check (parent_task_id is null or (select parent_task_id from opportunity_tasks where id = parent_task_id) is null)` falha em tempo de `CREATE TABLE`/`ALTER TABLE` com `cannot use subquery in check constraint`. Isso não é uma preferência de estilo — é uma limitação de linguagem. A opção de uma coluna redundante `parent_is_root boolean` + FK composta (`(parent_task_id, is_root) references opportunity_tasks(id, is_root)`) tecnicamente funciona (é o "truque" clássico), mas ainda precisa de um trigger para manter `is_root` sincronizado a cada INSERT/UPDATE — ou seja, não elimina o trigger, só desloca a lógica. Um trigger direto é mais simples e é exatamente o padrão que o projeto já usa para regras "derivadas, nunca manuais, garantidas no banco" (`check_assignee_tenant()` em 0032, `set_risk_priority()` em 0011).

**On UPDATE (re-parentamento):** o trigger cobre os dois sentidos:
1. Dar um `parent_task_id` a uma linha cujo pai referenciado JÁ é uma subtarefa (pai não-raiz) → rejeitado.
2. Dar um `parent_task_id` a uma linha que JÁ tem filhas próprias (ela seria "rebaixada" a subtarefa enquanto ainda é mãe de outras) → rejeitado. Sem essa segunda checagem, um UPDATE poderia criar 3 níveis efetivos mesmo respeitando a checagem 1 isoladamente.

**On DELETE (cascade):** `parent_task_id uuid references opportunity_tasks(id) on delete cascade` — apagar uma tarefa-pai remove as subtarefas automaticamente no banco (satisfaz TASK-06 "remover a pai remove as filhas"). A confirmação explícita exigida pelo requisito é responsabilidade da UI (modelar `DeleteRiskButton.tsx`, adicionando ao texto do diálogo quantas subtarefas serão removidas junto).

**Concrete DDL:**
```sql
-- =============================================================================
-- 0037_opportunity_tasks.sql — tarefas e subtarefas de uma oportunidade (2 níveis)
-- =============================================================================
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- IDEMPOTENTE. Pré-requisitos: 0001 (current_tenant_id), 0015 (current_user_role),
-- 0021 (is_platform_admin), 0032 (padrão de trigger de coerência de tenant).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

do $$ begin if not exists (select 1 from pg_type where typname='task_status') then
  create type task_status as enum ('backlog','em_andamento','bloqueio','finalizado'); end if; end$$;

create table if not exists opportunity_tasks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  parent_task_id  uuid references opportunity_tasks(id) on delete cascade,
  title           text not null,
  description     text,
  status          task_status not null default 'backlog',
  start_date      date,
  due_date        date,
  assignee_id     uuid references profiles(id) on delete set null,
  blocked_reason  text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- defesa em profundidade — mesma regra do Zod (blocked_reason obrigatório em bloqueio),
  -- garantida também no banco (D-01 já fixa o precedente "não confiar só na UI/app").
  constraint opportunity_tasks_blocked_reason_chk check (
    status <> 'bloqueio' or (blocked_reason is not null and length(trim(blocked_reason)) > 0)
  )
);

create index if not exists opportunity_tasks_tenant_idx       on opportunity_tasks(tenant_id);
create index if not exists opportunity_tasks_opportunity_idx  on opportunity_tasks(opportunity_id);
create index if not exists opportunity_tasks_parent_idx       on opportunity_tasks(parent_task_id);
create index if not exists opportunity_tasks_assignee_idx     on opportunity_tasks(assignee_id);

-- -----------------------------------------------------------------------------
-- Guard de 2 níveis (D-01) — NÃO É CHECK: Postgres rejeita subquery em CHECK.
-- -----------------------------------------------------------------------------
create or replace function check_task_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_parent_id uuid;
  v_has_children     boolean;
begin
  if new.id = new.parent_task_id then
    raise exception 'Uma tarefa não pode ser subtarefa de si mesma.'
      using errcode = 'check_violation';
  end if;

  if new.parent_task_id is not null then
    -- Regra 1: o pai referenciado precisa ser ele mesmo uma tarefa RAIZ.
    select parent_task_id into v_parent_parent_id
    from opportunity_tasks where id = new.parent_task_id;

    if not found then
      raise exception 'Tarefa-pai inexistente.' using errcode = 'foreign_key_violation';
    end if;

    if v_parent_parent_id is not null then
      raise exception 'Uma subtarefa não pode ser filha de outra subtarefa (limite de 2 níveis).'
        using errcode = 'check_violation';
    end if;

    -- Regra 2 (cobre re-parentamento/UPDATE): esta linha não pode JÁ ter filhas
    -- — senão ela "rebaixaria" a subtarefa enquanto ainda é mãe de outras.
    select exists (
      select 1 from opportunity_tasks where parent_task_id = new.id
    ) into v_has_children;

    if v_has_children then
      raise exception 'Esta tarefa já tem subtarefas — não pode virar subtarefa de outra (limite de 2 níveis).'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_tasks_depth_guard on opportunity_tasks;
create trigger opportunity_tasks_depth_guard
  before insert or update on opportunity_tasks
  for each row execute function check_task_depth();
```

### Pattern 2: Tenant-coherence trigger para `assignee_id` (D-04/D-05) — research priority #2

**What:** adaptação direta de `check_assignee_tenant()` (0032). Diferenças em relação ao original: (a) `assignee_id` é **opcional** (nullable) em `opportunity_tasks`, ao contrário de `opportunity_assignees.profile_id` que é `not null`; (b) precisamos também garantir que `parent_task_id` (quando presente) aponta para uma tarefa da MESMA oportunidade — o CHECK de profundidade (Pattern 1) já valida hierarquia, mas não valida que pai e filho pertencem à mesma oportunidade.

```sql
create or replace function check_task_tenant_coherence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
  v_parent_opp     uuid;
begin
  select tenant_id into v_opp_tenant from opportunities where id = new.opportunity_id;
  if not found then
    raise exception 'Oportunidade inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id <> v_opp_tenant then
    raise exception 'tenant_id da tarefa não confere com o da oportunidade.'
      using errcode = 'check_violation';
  end if;

  if new.assignee_id is not null then
    select tenant_id into v_profile_tenant from profiles where id = new.assignee_id;
    if not found then
      raise exception 'Responsável inexistente.' using errcode = 'foreign_key_violation';
    end if;
    if v_profile_tenant <> v_opp_tenant then
      raise exception 'Responsável de outra empresa não pode ser atribuído a esta tarefa.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_task_id is not null then
    select opportunity_id into v_parent_opp from opportunity_tasks where id = new.parent_task_id;
    if v_parent_opp is distinct from new.opportunity_id then
      raise exception 'Subtarefa precisa pertencer à mesma oportunidade da tarefa-pai.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_tasks_tenant_guard on opportunity_tasks;
create trigger opportunity_tasks_tenant_guard
  before insert or update on opportunity_tasks
  for each row execute function check_task_tenant_coherence();
```

**Ordem dos dois triggers:** ambos são `BEFORE INSERT OR UPDATE` no mesmo evento; o Postgres executa múltiplos triggers do mesmo timing/evento em ordem alfabética do nome do trigger — `opportunity_tasks_depth_guard` roda antes de `opportunity_tasks_tenant_guard` (`d` < `t`). A ordem não importa aqui (checagens independentes), mas documentar evita surpresa se alguém adicionar um 3º trigger depois.

**RLS — quem pode escrever (a pergunta em aberto que o CONTEXT.md deixou):**

Investigar `opportunity_risks` (o analog explicitamente indicado em D-10) revelou que sua RLS **hoje** (depois de 0011 + 0015 + 0021) não é nem "qualquer membro" nem "só admin" — é:
- `SELECT`: `tenant_id = current_tenant_id()` **OR** `is_platform_admin()` (aditiva, 0021).
- `INSERT/UPDATE/DELETE`: `tenant_id = current_tenant_id() AND current_user_role() <> 'viewer'` (0015) — **qualquer role exceto `viewer`** escreve (member, tenant_admin, platform_admin).

Isso é **diferente** de `opportunity_assignees` (0032), cuja escrita é restrita a `tenant_admin`/`platform_admin` — porque atribuir pessoas a uma oportunidade é uma ação de gestão, não de execução. Tarefas são mais parecidas com riscos (qualquer pessoa do tenant registra e edita) do que com atribuições (só admin gerencia).

**Recomendação:** clonar o padrão de `opportunity_risks` — RLS tenant-scoped + `current_user_role() <> 'viewer'` no write, `is_platform_admin()` aditivo no SELECT (para paridade com as demais tabelas-filha de oportunidade e não criar uma inconsistência onde o platform_admin vê riscos/fases de todos os tenants mas não vê tarefas). Gate de app-layer: `requireEditorRole()` (já existe em `lib/security/role.ts`, usado por `risk-actions.ts`) — reusar sem modificação.

```sql
alter table opportunity_tasks enable row level security;

drop policy if exists opportunity_tasks_select on opportunity_tasks;
create policy opportunity_tasks_select on opportunity_tasks
  for select using (tenant_id = current_tenant_id() or is_platform_admin());

drop policy if exists opportunity_tasks_insert on opportunity_tasks;
create policy opportunity_tasks_insert on opportunity_tasks
  for insert with check (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

drop policy if exists opportunity_tasks_update on opportunity_tasks;
create policy opportunity_tasks_update on opportunity_tasks
  for update
  using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer')
  with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer');

drop policy if exists opportunity_tasks_delete on opportunity_tasks;
create policy opportunity_tasks_delete on opportunity_tasks
  for delete using (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );
```

Isso é uma recomendação, não uma decisão travada pelo PO — ver **Open Questions**.

### Pattern 3: Rollup sem persistência (D-02/TASK-11) — research priority #3

**Onde calcular:** `lib/opportunities/task-rollup.ts`, função pura, **sem view SQL**. Justificativa comparando com o precedente de `score.ts`:

| | `score` (`lib/opportunities/score.ts`) | Rollup de tarefas |
|---|---|---|
| Consumido por | Filtro/ordenação server-side (`ORDER BY score`), export CSV, KPIs agregados de TODAS as oportunidades | Só a exibição de UMA oportunidade já aberta (List/Gantt) |
| Precisa existir no SQL? | Sim — `opportunities_with_score` é usada em `.order()`/`.eq('priority_level', ...)` na query principal | Não — nenhum requisito pede ordenar/filtrar oportunidades por "% de conclusão das tarefas" |
| Tamanho do dataset por cálculo | Todas as oportunidades do tenant (pode ser centenas) | Filhos de UMA tarefa (tipicamente < 20) |
| Precisa de teste de paridade? | Sim — client (wizard preview) e servidor (view) podem divergir | Não é necessário — só existe UM lugar calculando (o Server Component que já buscou o array) |

Como só há **um único consumidor** (o mesmo processo que já buscou `opportunity_tasks` do array via `fetchTasksForOpportunity`), calcular em TS puro sobre o array já em memória é estritamente mais simples que criar uma view + migration + teste de paridade para o mesmo resultado. Isso também satisfaz D-02 trivialmente: não há "duas fórmulas" para divergir.

**Fórmula concreta (preenche a lacuna que o CONTEXT.md deixou em aberto):**

```typescript
// lib/opportunities/task-rollup.ts
import type { OpportunityTask } from './types';

export type TaskRollup = {
  /** null se a tarefa não tem filhas com data — não hachurar/quebrar layout. */
  spanStart: string | null;
  spanDue: string | null;
  /** 0–100, arredondado. null se a tarefa não tem filhas. */
  percentComplete: number | null;
  totalChildren: number;
  completedChildren: number;
};

/**
 * Rollup de UMA tarefa-pai a partir das SUAS subtarefas diretas (2 níveis —
 * nunca recursivo). "Completa" = status === 'finalizado' (único status que
 * conta como concluído; D-03 não define estados parciais).
 *
 * Tarefa sem filhas → retorna nulls (a UI trata como "tarefa simples", exibe
 * as próprias datas/status, sem rollup — TASK-11 só se aplica a quem TEM
 * subtarefas).
 */
export function computeTaskRollup(children: OpportunityTask[]): TaskRollup {
  if (children.length === 0) {
    return { spanStart: null, spanDue: null, percentComplete: null, totalChildren: 0, completedChildren: 0 };
  }

  const starts = children.map((c) => c.start_date).filter((d): d is string => d != null);
  const dues = children.map((c) => c.due_date).filter((d): d is string => d != null);

  const spanStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const spanDue = dues.length > 0 ? dues.reduce((a, b) => (a > b ? a : b)) : null;

  const completedChildren = children.filter((c) => c.status === 'finalizado').length;
  const percentComplete = Math.round((completedChildren / children.length) * 100);

  return { spanStart, spanDue, percentComplete, totalChildren: children.length, completedChildren };
}
```

Consumido assim (List/Gantt Server Component, depois de agrupar por `parent_task_id`):
```typescript
const childrenByParent = new Map<string, OpportunityTask[]>();
for (const t of tasks) {
  if (t.parent_task_id) {
    const arr = childrenByParent.get(t.parent_task_id) ?? [];
    arr.push(t);
    childrenByParent.set(t.parent_task_id, arr);
  }
}
const roots = tasks.filter((t) => t.parent_task_id === null);
const rollups = new Map(roots.map((r) => [r.id, computeTaskRollup(childrenByParent.get(r.id) ?? [])]));
```

**Se o planner decidir sortear/filtrar tarefas por % de conclusão no futuro** (fora de escopo desta fase), essa decisão precisará ser revisitada — nesse momento (não agora) uma view SQL passaria a fazer sentido.

### Pattern 4: Gantt de 2 níveis (D-07) — research priority #4

**Técnica reusável (idêntica nos dois arquivos existentes):** domínio temporal `[t0, t1]` calculado uma vez a partir do menor início e maior fim de TODAS as linhas visíveis; `xPct(t) = ((t - t0) / (t1 - t0)) * 100`; cada barra vira `{ leftPct, widthPct }` sobre esse domínio; `ongoing` (sem data de fim) ganha um preenchimento hachurado (`repeating-linear-gradient`) em vez de cor sólida; padding de 1 dia em cada ponta do domínio evita que a primeira/última barra colem na borda.

`components/opportunities/gantt/GanttChart.tsx` é o modelo mais próximo (domínio dinâmico por dados reais, 6 ticks formatados `dd/mm/aa`, linha vermelha de "hoje") — `components/proposal/GanttChart.tsx` é um modelo de **grid de meses fixo** para um roadmap plurianual conhecido de antemão; não se aplica bem a um plano de tarefas de escopo variável (dias a poucos meses). **Recomendação: adaptar `opportunities/gantt/GanttChart.tsx`, não `proposal/GanttChart.tsx`.**

**O que precisa ser adaptado para 2 níveis + expandir/comprimir (nenhum dos dois Gantt existentes tem isso hoje — ambos são flat):**
1. Domínio temporal: computar `t0`/`t1` sobre **todas** as tarefas com data (pais e filhas), não só as visíveis no momento — senão expandir/comprimir mudaria a escala do eixo, uma UX ruim (as barras "pulariam" de posição).
2. Linha da tarefa-pai: se tiver filhas, a barra usa `spanStart`/`spanDue` do rollup (Pattern 3) em vez de suas próprias `start_date`/`due_date`; o preenchimento interno da barra reflete `percentComplete` (uma segunda `<div>` sobreposta com `width: {percentComplete}%`, mesmo truque de `components/proposal/GanttChart.tsx` linha 171-174 — que já faz exatamente "barra base + barra de progresso sobreposta").
3. Linhas de subtarefa: renderizadas condicionalmente (`expanded.has(parentId)`), indentadas, imediatamente abaixo da linha-pai — mesmo padrão de indentação que a Lista (TASK-07).
4. Chevron de expandir/comprimir: reusa o mesmo `Set<string>` de estado que a Lista usa (ver §6) — o requisito diz "por tarefa, não global", então idealmente o estado de expansão é **compartilhado** entre Lista e Gantt se ambos estiverem na mesma sessão do usuário (mas isso é opcional; `useState` local por componente também satisfaz o requisito, só não persiste ao trocar de view).

**Tarefas sem `start_date`/`due_date` (pergunta explícita do CONTEXT.md):** não devem contribuir para o cálculo do domínio `[t0, t1]` (senão uma tarefa sem data alguma distorceria a escala) nem devem ser silenciosamente omitidas da view (diferente do Gantt de oportunidades, que hoje FILTRA fora qualquer oportunidade sem fase datada — inadequado aqui porque TASK-10 exige ver todas as tarefas). **Recomendação:** renderizar a linha normalmente (rótulo + responsável + status), mas no lugar da barra mostrar um texto pequeno "Sem data definida" (mesmo padrão visual do `—` usado em `priorityLabel`/`responsavel` nulos no resto do projeto) — sem barra, sem contribuir pro `t0`/`t1`.

**Granularidade do eixo:** dia é a unidade nativa (as datas são `date`, sem hora) — mesma abordagem do Gantt de oportunidades (6 ticks `dd/mm/aa` sobre o span dinâmico). Não recomendo grid de semana/mês fixo (isso é a abordagem de `proposal/GanttChart.tsx`, feita para uma janela de anos conhecida) — planos de tarefa de oportunidade tendem a ser curtos (dias a poucos meses) e um domínio dinâmico com N ticks já se adapta bem a qualquer escala sem código condicional extra.

**Confirmado: nenhuma dependência nova precisa ser introduzida** — a técnica é 100% CSS/Tailwind + `Date.parse`/aritmética de milissegundos, exatamente como os dois componentes existentes.

### Pattern 5: Kanban + interceptação de bloqueio (D-03/TASK-09) — research priority #5

`components/opportunities/kanban/Board.tsx` hoje faz optimistic update **imediato**: `setOpps(next)` acontece ANTES de chamar a Server Action, e só desfaz (`setOpps(prev)`) se a Server Action retornar erro. Para Bloqueio isso não serve — o motivo precisa ser coletado **antes** de qualquer persistência, e cancelar o prompt precisa devolver o card à coluna original sem nunca ter mudado visualmente.

**Padrão recomendado — não faça optimistic update até o motivo ser confirmado:**

```typescript
// TaskKanbanBoard.tsx (client) — adaptado de kanban/Board.tsx
const [tasks, setTasks] = useState(initialTasks);
const [pendingBlock, setPendingBlock] = useState<{ taskId: string; fromStatus: TaskStatus } | null>(null);
const [error, setError] = useState<string | null>(null);
const [, startTransition] = useTransition();

function onDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;
  const taskId = String(active.id);
  const targetStatus = over.data.current?.status as TaskStatus | undefined;
  if (!targetStatus) return;

  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status === targetStatus) return;

  if (targetStatus === 'bloqueio') {
    // NÃO muda `tasks` ainda — o card "volta sozinho" pro dnd-kit resetar o
    // transform do drag; visualmente nada mudou até o dialog confirmar.
    setPendingBlock({ taskId, fromStatus: task.status });
    return;
  }

  // Fluxo normal (idêntico ao Board.tsx de oportunidades): optimistic + rollback.
  const prev = tasks;
  setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: targetStatus, blocked_reason: null } : t)));
  setError(null);
  startTransition(async () => {
    const result = await updateTaskStatus(taskId, targetStatus, null);
    if (!result.ok) { setTasks(prev); setError(result.error); }
  });
}

function onConfirmBlock(reason: string) {
  if (!pendingBlock) return;
  const { taskId } = pendingBlock;
  const prev = tasks;
  setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: 'bloqueio', blocked_reason: reason } : t)));
  setPendingBlock(null);
  startTransition(async () => {
    const result = await updateTaskStatus(taskId, 'bloqueio', reason);
    if (!result.ok) { setTasks(prev); setError(result.error); }
  });
}

function onCancelBlock() {
  // Nada a desfazer — `tasks` nunca mudou. O card já está, visualmente, na
  // coluna original (dnd-kit reseta o transform do drag ao soltar).
  setPendingBlock(null);
}
```

`BlockedReasonDialog` (novo componente) espelha `RiskFormDialog.tsx`/`DeleteRiskButton.tsx` na estrutura (overlay `z-[60]`, ESC fecha = cancela, `onMouseDown` no overlay fecha = cancela, botão "Confirmar" desabilitado enquanto o textarea estiver vazio). A regra "motivo obrigatório" fica em dois lugares por design (defesa em profundidade, mesmo padrão do resto do projeto): o botão de confirmar do dialog fica desabilitado sem texto, **e** `taskInputSchema`/a Server Action rejeitam `blocked_reason` vazio quando `status='bloqueio'` (Zod + o `CHECK` do banco do Pattern 1).

**Server Action `updateTaskStatus`:** ao mover para qualquer status ≠ `bloqueio`, **limpar** `blocked_reason` (`set null`) — evita que um motivo antigo "vaze" visualmente se a tarefa for bloqueada de novo depois (mensagem específica do CONTEXT.md: "limpo/ignorado nos demais status").

### Pattern 6: Onde as 3 views vivem — decisão de discretion

**Recomendação: sub-rota fullscreen dedicada `/opportunities/[id]/tarefas`, NÃO uma aba do modal.**

Motivo concreto medido no código: `ModalShell.tsx` limita o painel a `max-w-3xl` (768px). Um Kanban de 4 colunas fixas com `w-[220px]` cada (padrão de `kanban/Column.tsx`) mais gaps já soma ~900px de largura mínima útil — e o Gantt de oportunidades já declara `min-w-[760px]`/`min-w-[900px]` explicitamente por esse motivo. Colocar as 3 views dentro do modal forçaria scroll horizontal permanente dentro de um scroll vertical já existente (o modal já rola verticalmente) — uma experiência ruim que o próprio padrão de riscos NÃO precisa evitar, porque riscos são exibidos como tabela estreita (9 colunas de texto curto cabem em 768px).

As sub-rotas de riscos (`/opportunities/[id]/riscos/new`, `/[riskId]/edit`) **não são o precedente certo aqui** — são rotas de FORM de um único registro (deep-link para um dialog estreito), não de VIEW de dados largos. O precedente estrutural mais próximo é a própria página fullscreen de detalhe (`app/(app)/opportunities/[id]/page.tsx`, `max-w-screen-2xl`) e a listagem principal (`/opportunities`, mesma largura).

**Consequência de UX:** o usuário sai do contexto do modal/aba ao clicar em "Tarefas" — não é uma troca de aba in-place. Recomendo um link/botão de destaque (não um item do `TabsNav`, cujo `onChange` troca de aba **sem navegar**; conflar navegação de rota dentro dessa API quebraria a abstração) em algum lugar visível do detalhe da oportunidade — por exemplo logo abaixo do `AssigneesPanel`, ou como uma linha nova no header do modal ("📌 Tarefas (n) →"), levando a `router.push`/`<Link href="/opportunities/${id}/tarefas">`. Voltar usa o mesmo padrão de `RiskFormPage.tsx` (`← Voltar` para `/opportunities/${id}`).

**Como as 3 views se alternam dentro da sub-rota:** query param `?view=lista|kanban|gantt`, seguindo **literalmente** o padrão já existente em `components/opportunities/toolbar.tsx` (`parseView(raw)` com fallback seguro para o valor default, mais um array `VIEWS` de `{id, icon, label}` renderizado como segmented control). Reusar essa forma, não inventar uma nova.

### Anti-Patterns to Avoid

- **CHECK com subquery para o limite de 2 níveis** — o Postgres rejeita na criação do schema; não perca tempo tentando.
- **Optimistic update imediato no drop para Bloqueio** — se o card já mudou de coluna visualmente antes do prompt, cancelar o prompt exige um rollback explícito e cria uma janela onde o estado local diverge do servidor por mais tempo que o necessário. Adie a mutação de estado até a confirmação (Pattern 5).
- **View SQL de rollup "porque o score já é assim"** — o score existe como view porque é usado em `ORDER BY`/filtro sobre centenas de linhas; o rollup de tarefas não tem esse caso de uso nesta fase. Ver comparação completa no Pattern 3.
- **Modal de 768px para Kanban/Gantt** — motivo medido acima (Pattern 6). Não force a view larga dentro do container estreito do detalhe.
- **`select('*')` em qualquer query nova de `opportunity_tasks`** — o projeto tem uma regra explícita (HARDEN-E-06) contra isso; seguir a whitelist `TASK_COLUMNS` no mesmo estilo de `RISK_COLUMNS`/`OPPORTUNITY_COLUMNS` em `queries.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop do Kanban | Handlers de mouse/touch customizados | `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`) | Já instalado, já testado em produção no Kanban de oportunidades — reusar a API idêntica |
| Barras de Gantt | Uma lib de Gantt (`frappe-gantt`, `dhtmlx-gantt`, etc.) | O padrão zero-dep já existente (`leftPct`/`widthPct` sobre CSS) | D-07 já fechou essa pergunta — dois exemplos vivos no repo fazem exatamente isso |
| Seletor de pessoas do tenant | Nova query `profiles` filtrada por tenant | `fetchAssignableProfiles(tenantId)` de `lib/opportunities/assignees.ts` | D-08 — já existe, já é usada pelo `AssigneesPanel` |
| Coerência de tenant do assignee | Checagem só na Server Action (sem trigger) | Trigger `check_task_tenant_coherence()` (Pattern 2, copiado de 0032) | A regra "garantido no banco" já é o padrão vigente do projeto para todo campo derivado/sensível — a Server Action é defesa em profundidade, não a garantia real |
| Validação condicional de `blocked_reason` | `if` manual espalhado pela UI | `.superRefine()` no Zod + `CHECK` no banco (Pattern 1 + §7) | Mesmo padrão de `formulario_extras` (`.strict().superRefine()`) já vivo em `lib/opportunities/schema.ts:136` |

**Key insight:** nada nesta fase é um problema novo — é uma composição de três padrões que o próprio repositório já resolveu em contextos ligeiramente diferentes (assignees para coerência de tenant, riscos para o vertical slice CRUD completo, oportunidades para Kanban/Gantt). O trabalho de pesquisa real estava em identificar QUAL precedente se aplica a cada parte, não em descobrir uma técnica nova.

## Runtime State Inventory

Não aplicável — esta é uma fase greenfield (tabela nova, nenhuma renomeação/refatoração de estado existente). Nenhuma migração de dados, nenhum serviço externo com estado próprio, nenhum artefato de build a atualizar. `lib/database.types.ts` recebe uma ADIÇÃO (nova tabela + enum), não uma alteração de algo que já existe.

## Common Pitfalls

### Pitfall 1: Esquecer o CHECK 2 (linhas com filhas não podem virar filhas)
**What goes wrong:** um trigger que só verifica "o pai é raiz" permite, via UPDATE, pegar uma tarefa que já tem subtarefas e dar a ela um `parent_task_id` — criando 3 níveis efetivos (a tarefa "rebaixada" continua sendo pai das suas próprias subtarefas).
**Why it happens:** a checagem óbvia (verificar o pai) é só metade da regra; a direção "essa linha tem filhas?" é fácil de esquecer porque o cenário só aparece em UPDATE de re-parentamento, não em INSERT simples.
**How to avoid:** o `check_task_depth()` do Pattern 1 já cobre os dois sentidos — não remover a segunda verificação ao adaptar.
**Warning signs:** um teste que só cobre "criar subtarefa de subtarefa direto" passa, mas um teste de "promover uma subtarefa a pai e depois tentar torná-la filha de outra tarefa" falharia silenciosamente sem o CHECK 2.

### Pitfall 2: Ordem alfabética de triggers e SECURITY DEFINER
**What goes wrong:** ambos os triggers (`_depth_guard`, `_tenant_guard`) usam `security definer` para poder ler `opportunities`/`profiles`/`opportunity_tasks` sem depender da RLS do usuário chamador (mesmo motivo de 0032). Esquecer `security definer` faz o trigger falhar silenciosamente em retornar `not found` mesmo quando a linha existe, porque a RLS do usuário comum bloqueia a leitura dentro da própria função.
**Why it happens:** copiar o padrão de 0011 (`set_risk_priority()`, sem FK cruzada) em vez do padrão de 0032 (`check_assignee_tenant()`, que lê outras tabelas) é fácil de fazer por engano.
**How to avoid:** sempre `security definer` + `set search_path = public` quando o trigger faz `SELECT` em outra tabela protegida por RLS.

### Pitfall 3: Domínio do Gantt recalculado a cada expand/collapse
**What goes wrong:** se `t0`/`t1` forem calculados só sobre as linhas atualmente VISÍVEIS (pai colapsada esconde as subtarefas do cálculo), expandir uma tarefa muda a escala do eixo inteiro — todas as barras "pulam" de posição, mesmo as que não mudaram.
**Why it happens:** é tentador calcular o domínio só sobre o que está sendo renderizado no momento (mais simples de implementar).
**How to avoid:** calcular `t0`/`t1` sobre TODAS as tarefas com data (pais + subtarefas), independente do estado de expand/collapse — ver Pattern 4, passo 1.
**Warning signs:** teste manual: expandir uma tarefa no Gantt e observar se as barras de outras linhas mudam de posição horizontal.

### Pitfall 4: `blocked_reason` sobrevivendo a uma troca de status
**What goes wrong:** mover uma tarefa de Bloqueio para Finalizado sem limpar `blocked_reason` faz o motivo antigo continuar aparecendo se a tarefa for bloqueada de novo depois (ou se algum lugar da UI exibir `blocked_reason` sem checar `status === 'bloqueio'` primeiro).
**Why it happens:** a Server Action `updateTaskStatus` só precisa de `status` como parâmetro óbvio; é fácil esquecer de também mandar `blocked_reason: null` quando o novo status não é `bloqueio`.
**How to avoid:** a Server Action sempre define `blocked_reason` explicitamente (nunca omite a coluna do payload de update) — `null` quando `status !== 'bloqueio'`, o valor validado quando `status === 'bloqueio'`.

### Pitfall 5: RLS de escrita mais restritiva que o precedente real
**What goes wrong:** implementar a escrita de tarefas como "só admin" (copiando `opportunity_assignees`, 0032) em vez de "qualquer não-viewer" (copiando `opportunity_risks`, 0011+0015) bloquearia `member`s comuns de criar/editar suas próprias tarefas — provavelmente não é a intenção, já que TASK-05 fala genericamente em "o usuário cria uma tarefa" sem qualificar o papel.
**Why it happens:** existem DOIS precedentes de RLS no repo para tabelas-filha de oportunidade, com gates de escrita diferentes, e o CONTEXT.md aponta para o de risco (D-10) mas não deixa a diferença de RLS explícita.
**How to avoid:** seguir o Pattern 2 (RLS de `opportunity_risks`) — ver também Open Questions.

### Pitfall 6: Esquecer `.returns<T[]>()` no final da chain do Supabase
**What goes wrong:** aplicar `.returns<OpportunityTask[]>()` antes de `.order()`/`.eq()` quebra a inferência de tipos do query builder (mesma lição já documentada no projeto para `OPPORTUNITY_COLUMNS`/`PHASE_COLUMNS`).
**Why it happens:** parece mais natural colocar o cast logo depois do `.select()`.
**How to avoid:** `.returns<T>()` sempre por último na chain, depois de todos os `.eq()/.order()/.in()` — mesmo padrão de `queries.ts` inteiro.

## Code Examples

### Zod schema com `blocked_reason` condicional (research priority #7)

Zod v4.4.3 confirmado instalado [VERIFIED: node_modules/zod/package.json] — `.superRefine((val, ctx) => { ctx.addIssue({...}) })` é a API real usada hoje em produção neste repo (`lib/opportunities/schema.ts:136`, o limite de 8KB de `formulario_extras`). `ctx.addIssue` aceita `{ code: 'custom', message, path?: (string|number)[] }` — `path` anexa o erro a um campo específico do form em vez de um erro genérico no nível do objeto [VERIFIED: node_modules/zod/v4/core/api.d.ts].

```typescript
// lib/opportunities/task-schema.ts
import { z } from 'zod';

export const taskStatusEnum = z.enum(['backlog', 'em_andamento', 'bloqueio', 'finalizado']);

export const taskInputSchema = z
  .object({
    title: z.string().min(1, 'Título obrigatório').max(200, 'Máximo 200 caracteres'),
    description: z.string().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
    status: taskStatusEnum.default('backlog'),
    start_date: z.string().optional().or(z.literal('')), // 'YYYY-MM-DD' ou vazio
    due_date: z.string().optional().or(z.literal('')),
    assignee_id: z.string().uuid().optional().or(z.literal('')),
    blocked_reason: z.string().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
    parent_task_id: z.string().uuid().optional(), // ausente/undefined = tarefa raiz
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === 'bloqueio' && (!val.blocked_reason || val.blocked_reason.trim() === '')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o motivo do bloqueio.',
        path: ['blocked_reason'],
      });
    }
  });

export type TaskInput = z.infer<typeof taskInputSchema>;
```

Campos server-derived rejeitados pelo `.strict()`: `id`, `tenant_id`, `opportunity_id`, `created_by`, `created_at`, `updated_at` — mesmo padrão de `riskInputSchema`.

### Whitelist de colunas (research priority #8)

```typescript
// lib/opportunities/queries.ts — adição, mesmo padrão de RISK_COLUMNS
const TASK_COLUMNS =
  'id, opportunity_id, tenant_id, parent_task_id, title, description, ' +
  'status, start_date, due_date, assignee_id, blocked_reason, ' +
  'created_by, created_at, updated_at';

export async function fetchTasksForOpportunity(
  opportunityId: string
): Promise<OpportunityTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_tasks')
    .select(TASK_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .returns<OpportunityTask[]>();

  if (error) throw new Error(`Erro ao buscar tarefas: ${error.message}`);
  return data ?? [];
}
```

### `lib/database.types.ts` — forma a seguir (research priority #8)

O arquivo é hand-maintained (type-gen bloqueado — ver memória `supabase-type-gen-blocked`). A forma exata de uma entrada de tabela existente (`opportunity_risks`, referenciada via `Database['public']['Tables']['opportunity_risks']['Row']` em `types.ts:41-42`) precisa ser espelhada: um objeto `Tables.opportunity_tasks = { Row: {...}, Insert: {...}, Update: {...} }` dentro do `Database['public']['Tables']`, mais o enum `task_status` em `Database['public']['Enums']`. Adicionar seguindo exatamente o formato de `opportunity_risks` já presente no arquivo (mesmo bloco `Tables`), e então derivar em `lib/opportunities/types.ts`:

```typescript
export type OpportunityTask = Database['public']['Tables']['opportunity_tasks']['Row'];
export type TaskStatus = Database['public']['Enums']['task_status'];
```

### Teste de isolamento cross-tenant obrigatório (TASK-04) — research priority #8

O padrão exato a espelhar é `tests/security/opportunity-risks-isolation.test.ts`: `describe.skipIf(!HAS_DB)`, seed de 2 tenants via `seedTestTenants()`, 5 specs (SELECT cross-tenant → `[]`; UPDATE cross-tenant → 0 linhas + original intacto; DELETE cross-tenant → 0 linhas + registro persiste; INSERT com `tenant_id` forjado → erro RLS; sanity SELECT do próprio registro). Para `opportunity_tasks`, adicionar duas specs extras específicas desta fase (não presentes no espelho de risco, porque risco não tem essas duas regras):
- **Depth guard cross-check:** tentar criar uma subtarefa cujo `parent_task_id` aponta para uma subtarefa existente → trigger rejeita (não é um teste de RLS, é um teste de regra de negócio no banco — pode viver no mesmo arquivo ou em `tests/schema/task-depth-guard.test.ts`, mais perto de `tests/schema/risk-priority-matrix.test.ts`, que testa outra regra de trigger/matriz).
- **Assignee cross-tenant:** tentar inserir uma tarefa com `assignee_id` de um profile do OUTRO tenant (mesmo tenant da tarefa, mas profile de fora) → trigger `check_task_tenant_coherence()` rejeita, mesmo com service-role (esse teste passa por cima da RLS de propósito, testando o TRIGGER, não a policy — usar `serviceRoleClient()` diretamente, como o setup de `mkRisk` no espelho).

`HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)` — mesmo guard de credencial condicional usado em toda a suite (`skipIf` quando `.env.test` não aponta pra um projeto Supabase Cloud de teste).

## State of the Art

Não há mudança de "estado da arte" a documentar aqui — todas as técnicas usadas (trigger para regra de negócio, RLS por role, Gantt CSS por porcentagem, dnd-kit) já são as escolhas atuais do próprio projeto, aplicadas de forma consistente desde a Phase 1 (v0.1). Nenhuma parte desta pesquisa recomenda substituir um padrão existente por um mais novo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RLS de escrita de `opportunity_tasks` deve seguir o padrão de `opportunity_risks` (`current_user_role() <> 'viewer'`), não o de `opportunity_assignees` (só admin) | Pattern 2 / Open Questions | Se o PO quiser restringir a criação de tarefas a admins, a migration e o gate de `task-actions.ts` precisam trocar para o padrão de `assignee-actions.ts` — mudança pequena mas trava o comportamento errado se assumido sem confirmar |
| A2 | "% de conclusão" conta só `status === 'finalizado'` como completo (sem peso parcial para `em_andamento`) | Pattern 3 | Se o PO quiser um peso parcial (ex. `em_andamento` conta 50%), a fórmula de `computeTaskRollup` muda, mas a assinatura da função pode continuar igual |
| A3 | Tarefa sem filhas não exibe rollup algum (mostra suas próprias datas/status normalmente) — TASK-11 só se aplica a quem TEM subtarefas | Pattern 3 | Se o PO esperar algum indicador mesmo em tarefas-folha (ex. "0/0" ou "100%"), é um ajuste de UI trivial, não de dado |
| A4 | Tarefas sem `start_date`/`due_date` aparecem na Lista/Kanban normalmente e no Gantt como linha sem barra ("Sem data definida"), sem contribuir para o domínio temporal | Pattern 4 | Se o PO preferir omitir essas tarefas do Gantt (como o Gantt de oportunidades faz hoje), é uma troca de um `if` no filtro de linhas, não uma mudança estrutural |
| A5 | As 3 views vivem em sub-rota fullscreen dedicada (`/opportunities/[id]/tarefas`), não em aba do modal | Pattern 6 | Se o PO preferir manter tudo dentro do modal mesmo com scroll horizontal, a mudança é só de onde os componentes são montados — o restante da camada de dados/actions é idêntico |
| A6 | `assignee_id` usa `ON DELETE SET NULL` (perder o profile não apaga a tarefa) | Pattern 1 (DDL) | Se o PO preferir cascade (perder o profile também remove tarefas atribuídas a ele), é uma troca de uma palavra no DDL — mas cascade aqui parece claramente pior (perderia trabalho registrado por causa da saída de uma pessoa) |

**Se esta tabela estiver vazia:** não está — 6 itens dependem de confirmação ou de bom senso do planner; nenhum bloqueia o início do planejamento, mas A1 e A5 têm o maior impacto estrutural se a suposição estiver errada.

## Open Questions

1. **Quem pode criar/editar/remover tarefas — qualquer membro do tenant ou só admin?**
   - What we know: o PO não especificou (CONTEXT.md é silencioso sobre isso). D-10 aponta riscos como o analog "end-to-end" a seguir, e riscos hoje (RLS real, pós-0015) permitem qualquer role exceto `viewer`. `opportunity_assignees` (a outra tabela-filha com trigger de coerência de tenant, mais próxima em mecanismo) restringe a admin.
   - What's unclear: se o PO pensa em tarefas como "trabalho de execução que qualquer pessoa da equipe registra" (mais perto de riscos) ou "planejamento que só o gestor mexe" (mais perto de atribuições).
   - Recommendation: seguir o padrão de riscos (`current_user_role() <> 'viewer'`) por ser o precedente explicitamente indicado (D-10) e por TASK-05 falar genericamente em "o usuário" sem qualificar papel. Se errado, é uma troca localizada na migration (RLS) + `requireEditorRole()` → `isTenantAdmin(profile) || isPlatformAdmin(profile)` em `task-actions.ts` — baixo custo de correção, mas melhor confirmar com o PO antes de implementar (`checkpoint:human-verify` recomendado na Phase se o planner quiser reduzir risco).

2. **`platform_admin` deve ter SELECT cross-tenant em `opportunity_tasks`, como já tem em `opportunity_risks`/`opportunity_phases`/`opportunities`?**
   - What we know: 0021 adicionou esse SELECT aditivo às tabelas-filha existentes; CONTEXT.md diz "nenhuma rota/query cross-tenant ou de admin de plataforma" para ESTA fase, mas isso parece se referir a construir NOVAS telas de admin, não a manter paridade de uma policy de leitura que já existe estruturalmente para tabelas irmãs.
   - What's unclear: se incluir essa policy nesta migration conta como "admin de plataforma" (fora de escopo) ou como "consistência com o padrão já estabelecido" (dentro do espírito do projeto).
   - Recommendation: incluir (Pattern 2 já assume isso) — é apenas uma policy de SELECT que replica o padrão já aplicado a `opportunities`/`opportunity_phases`/`opportunity_risks`; não introduz nenhuma rota ou UI nova de admin. Se o planner discordar, é uma linha a remover do DDL.

3. **Estado de expand/collapse compartilhado entre Lista e Gantt, ou independente por view?**
   - What we know: CONTEXT.md deixa "por tarefa, não global" como único requisito; não exige persistência entre views.
   - What's unclear: se trocar de `?view=lista` para `?view=gantt` deveria preservar quais tarefas estavam expandidas.
   - Recommendation: independente por view (dois `useState<Set<string>>` separados) para o MVP desta fase — mais simples, satisfaz o requisito literal. Compartilhar exigiria elevar o estado para a página (Server Component não pode segurar estado client) ou um `?expanded=` na URL — over-engineering para esta fase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js dev (`next dev`) | toda a fase | ✓ | 16.2.6 [VERIFIED: package.json] | — |
| Supabase Cloud (write-only mode) | migration 0037 + todas as queries/actions | ✓ (mesmo projeto usado desde Phase 1; apply manual pelo PO no SQL Editor) | — | — |
| `@dnd-kit/core`/`sortable`/`utilities` | Kanban de tarefas | ✓ | `^6.3.1`/`^10.0.0`/`^3.2.2` [VERIFIED: package.json] | — |
| shadcn/ui | (não usado, D-09) | ✗ (ausente por decisão) | — | overlays hand-rolled Tailwind (padrão do repo) |
| `npm run gen:types` (Supabase CLI com token) | regenerar `lib/database.types.ts` automaticamente | ✗ (bloqueado — MCP aponta pra projeto errado, sem privilégio) [VERIFIED: MEMORY.md `supabase-type-gen-blocked`] | — | edição manual do arquivo hand-maintained (já é o padrão desde Phase 9) |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** `gen:types` — `lib/database.types.ts` continua hand-maintained; a fase precisa incluir a task de editá-lo à mão (já listado em Integration Points do CONTEXT.md).

## Validation Architecture

> `.planning/config.json` não existe no repo — trato `nyquist_validation` como habilitado (default, ausência = true). A suíte do projeto é **Vitest** (pool='forks', singleFork=true) — ver STATE.md / `vitest.config.ts`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x (pool='forks', singleFork=true) |
| Config file | `vitest.config.ts` (alias `server-only`→stub, `singleFork` serializa specs contra a mesma instância Supabase) |
| Quick run command | `npm run test` (unit puros + specs de integração em modo `skipIf` sem `.env.test`) |
| Full suite command | `npm run test:security` (specs de `tests/security/`) + `npm run test` (suite completa) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-02 | Trigger `check_task_depth()` rejeita 3º nível (insert direto e via re-parentamento UPDATE) | unit puro (lógica) + skipIf SQL contra o trigger real | `vitest run tests/schema/task-depth-guard.test.ts` | ❌ Wave 0 |
| TASK-03/D-04 | Trigger `check_task_tenant_coherence()` rejeita `assignee_id` de outro tenant | integration skipIf (service-role, bypassa RLS de propósito) | `vitest run tests/schema/task-tenant-coherence.test.ts` | ❌ Wave 0 |
| TASK-04 | Isolamento RLS cross-tenant (A não vê/edita/remove tarefa de B) | integration skipIf | `vitest run tests/security/opportunity-tasks-isolation.test.ts` | ❌ Wave 0 — espelha `opportunity-risks-isolation.test.ts` |
| TASK-05/TASK-06 | `taskInputSchema.strict()` rejeita campos server-derived; `blocked_reason` condicional | unit | `vitest run tests/schema/task-schema.test.ts` | ❌ Wave 0 |
| TASK-11 | `computeTaskRollup()` — span + % conclusão, casos: zero filhos, filhos sem data, todos concluídos | unit puro | `vitest run tests/schema/task-rollup.test.ts` | ❌ Wave 0 — espelha `score-rule.test.ts` (spec pura sem DB) |
| TASK-09 | Motivo de bloqueio obrigatório — Zod rejeita `status='bloqueio'` sem `blocked_reason` | unit | (incluído em `task-schema.test.ts`) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `tsc --noEmit` + `vitest run` dos arquivos tocados.
- **Per wave merge:** `npm run test` (suite completa, integração em modo skipIf até `.env.test` apontar pro projeto de teste).
- **Phase gate:** suite verde + `/gsd-verify-work` (checkpoint visual do Kanban/Gantt/Lista, incluindo o fluxo de bloqueio com cancelamento do prompt).

### Wave 0 Gaps

- [ ] `tests/schema/task-depth-guard.test.ts` — cobre TASK-02 (trigger de profundidade, os dois sentidos do Pitfall 1).
- [ ] `tests/schema/task-tenant-coherence.test.ts` — cobre TASK-03 (trigger de coerência de tenant do assignee).
- [ ] `tests/schema/task-rollup.test.ts` — cobre TASK-11 (função pura, sem necessidade de DB).
- [ ] `tests/schema/task-schema.test.ts` — cobre TASK-01/05/09 (Zod strict + blocked_reason condicional).
- [ ] `tests/security/opportunity-tasks-isolation.test.ts` — cobre TASK-04 (espelha `opportunity-risks-isolation.test.ts`, 5 specs + `skipIf`).
- [ ] Framework install: nenhum — Vitest já configurado no projeto.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | RLS por `tenant_id` (4 policies, Pattern 2) + `.eq('tenant_id', profile.tenant_id)` como defesa em profundidade nas Server Actions + `requireEditorRole()` bloqueando `viewer` |
| V5 Input Validation | yes | `taskInputSchema.strict()` (Zod) em toda mutação; `CHECK` de `blocked_reason` no banco como segunda camada |
| V1 Mass Assignment | yes | `tenant_id`/`opportunity_id`/`created_by`/`id`/`created_at`/`updated_at` sempre server-derived; `.strict()` rejeita qualquer campo extra no payload |
| V6 Cryptography | no | — |

### Known Threat Patterns for Next.js + Supabase RLS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forjar `tenant_id`/`opportunity_id` no payload para criar tarefa em outro tenant | Tampering / Elevation | server-derived a partir do profile/opportunity + `.strict()` + RLS `WITH CHECK` |
| Forjar `assignee_id` de um profile de outro tenant | Tampering / Elevation | Trigger `check_task_tenant_coherence()` (Pattern 2) — bloqueio no banco, não só na query de opções do select |
| Ler/editar tarefa de outro tenant via id direto (IDOR) | Information Disclosure / Tampering | RLS `USING`/`WITH CHECK` por `tenant_id = current_tenant_id()`; rota fullscreen usa `fetchTaskById` RLS-scoped (retorna null → `notFound()`, mesmo padrão de `fetchRiskById`) |
| Criar 3º nível de hierarquia via UPDATE de re-parentamento (bypass da checagem de INSERT) | Tampering | Trigger `check_task_depth()` roda em `BEFORE INSERT OR UPDATE`, cobrindo os dois sentidos (Pitfall 1) |
| Persistir `blocked_reason` vazio movendo direto para Bloqueio via chamada de API fora da UI | Tampering | `CHECK` no banco (`opportunity_tasks_blocked_reason_chk`) — não depende só do Zod/UI |

## Project Constraints (from docs/PROJETO.md)

- Toda tabela de domínio carrega `tenant_id` + RLS + as 4 policies padrão — `opportunity_tasks` cumpre via Pattern 2.
- Derivado é calculado, nunca persistido: span/% de conclusão da tarefa-pai seguem a mesma regra do score (`opportunity_score()`) e de `rpa_score`/`opportunity_risks.priority` — nenhuma coluna `progress`/`computed_start` em `opportunity_tasks` (D-02 já trava isso).
- UI pt-BR, código/identificadores em inglês (`opportunity_tasks`, `task_status`, `assignee_id`, não `tarefa_id`/`responsavel_id`).
- Sem painel admin/rotas cross-tenant no MVP — a única concessão cross-tenant é o SELECT aditivo de `platform_admin`, que já é padrão pré-existente em tabelas irmãs (ver Open Question 2), não uma rota/tela nova.
- **Atenção (CONTEXT.md corrige o docs/PROJETO.md):** a última migration real é `0036`, não `0027` — esta fase usa `0037`. E `components/ui/` (shadcn) não existe — compor em Tailwind hand-rolled, como `components/opportunities/modal/risk/*`.
- Server Components por padrão; `'use client'` só em Kanban/Gantt/formulários/diálogos.
- Migrations em write-only mode: arquivo commitado + apply manual no SQL Editor do Supabase Cloud pelo PO.

## Sources

### Primary (HIGH confidence)

- Repo (código vivo, lido integralmente nesta pesquisa): `supabase/migrations/0032_opportunity_assignees.sql` (trigger de coerência de tenant), `supabase/migrations/0011_*.sql` §"opportunity_risks" (padrão de tabela filha + RLS + trigger GENERATED-like), `supabase/migrations/0015_rbac_viewer_policies.sql` e `0021_platform_admin_rls.sql` (RLS real de `opportunity_risks` hoje), `lib/opportunities/{score,risk-schema,risk-actions,risk-labels,queries,assignees,assignee-actions,status}.ts`, `lib/security/role.ts`, `lib/opportunities/schema.ts` (`.strict().superRefine()` real), `components/opportunities/{kanban/*,gantt/GanttChart.tsx}`, `components/proposal/GanttChart.tsx`, `components/opportunities/modal/{ModalShell,TabsNav,types,OpportunityDetail}.tsx`, `components/opportunities/modal/risk/*`, `components/opportunities/AssigneesPanel.tsx`, `components/opportunities/toolbar.tsx` (`parseView`), `app/(app)/opportunities/[id]/{page.tsx,riscos/**}`, `tests/security/opportunity-risks-isolation.test.ts`, `tests/schema/score-rule.test.ts`, `lib/database.types.ts`.
- `node_modules/zod/v4/classic/schemas.d.ts` + `node_modules/zod/v4/core/api.d.ts` — assinatura real de `.superRefine()`/`ctx.addIssue()` na versão instalada (`zod@4.4.3`), confirmando que `path` é aceito para anexar o erro a um campo específico.
- Postgres — limitação documentada e amplamente conhecida de que `CHECK` constraints não podem conter subqueries contra outras linhas da mesma tabela (`cannot use subquery in check constraint`); verificada indiretamente pelo padrão já adotado no próprio repo (`opportunity_risks.priority` usa trigger em vez de `GENERATED`/`CHECK` justamente por essa classe de limitação, documentado no comentário da migration 0011).

### Secondary (MEDIUM confidence)

- Nenhuma — todas as claims técnicas desta pesquisa foram verificadas contra o código vivo do próprio repositório ou contra os arquivos de definição de tipos da dependência instalada.

### Tertiary (LOW confidence)

- Nenhuma claim crítica depende de fonte não verificada nesta sessão.

## Metadata

**Confidence breakdown:**

- Migration/triggers (2 níveis + coerência de tenant): HIGH — DDL adaptado linha-a-linha de dois triggers reais já em produção no mesmo banco (0011, 0032), mais a limitação de `CHECK` confirmada pelo padrão que o próprio projeto já adotou para contornar exatamente essa limitação.
- RLS de escrita (quem pode criar tarefas): MEDIUM — o padrão recomendado é verificado contra o código vivo (`opportunity_risks` hoje), mas a ESCOLHA entre esse padrão e o de `opportunity_assignees` é uma recomendação, não uma decisão travada pelo PO (ver Open Question 1).
- Rollup em runtime (função pura vs. view SQL): HIGH — comparação de custo/benefício justificada por dados concretos do próprio repo (tamanho do dataset, consumidores existentes).
- Gantt de 2 níveis: HIGH para a técnica base (verificada em dois componentes reais); MEDIUM para os detalhes de adaptação a 2 níveis (não existe hoje nenhum Gantt hierárquico no repo para copiar 1:1 — a extensão é original desta pesquisa, embora built sobre técnica comprovada).
- Kanban + interceptação de bloqueio: HIGH para o padrão de estado (adiar a mutação até confirmação é uma técnica padrão de React, e o resto do fluxo é cópia direta de `kanban/Board.tsx`).
- Onde as views vivem (sub-rota vs. modal): HIGH — decisão embasada em medidas concretas de largura (`max-w-3xl` do modal vs. `min-w-[760/900px]` dos Gantt existentes e `w-[220px]`×4 do Kanban).

**Research date:** 2026-08-04
**Valid until:** ~2026-09-04 (padrões internos do próprio repo mudam apenas por decisão de produto explícita; revalidar se uma nova migration alterar `current_user_role()`/`is_platform_admin()` ou se o Next/Zod sofrerem upgrade major).
