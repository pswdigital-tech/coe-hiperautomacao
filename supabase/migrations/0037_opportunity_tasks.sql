-- =============================================================================
-- 0037_opportunity_tasks.sql — tarefas e subtarefas de uma oportunidade
-- =============================================================================
-- CONTEXTO: dentro de uma oportunidade, o usuário mapeia as atividades de
-- execução como tarefas com subtarefas (exatamente 2 níveis — D-01), atribui
-- cada uma a UMA pessoa do próprio tenant (D-04) e acompanha o conjunto em
-- Lista / Kanban / Gantt (fora do escopo desta migration). O status é um enum
-- fixo de 4 valores que mapeia 1:1 nas 4 colunas do Kanban (D-03): Backlog →
-- Em Andamento → Bloqueio → Finalizado.
--
-- QUEM ESCREVE: todos os papéis exceto `viewer` (`member` e `tenant_admin`
-- criam, editam, movem e excluem; `viewer` só lê) — D-11. É o MESMO gate real
-- de `opportunity_risks` pós-0011/0015/0021 — explicitamente NÃO o gate
-- admin-only de `opportunity_assignees` (0032, `current_user_role() =
-- 'tenant_admin'`). Sem isso o Kanban esvazia, porque quem executa a tarefa
-- não conseguiria mover o próprio card.
--
-- ISOLAMENTO: `tenant_id` denormalizado (padrão do projeto) + trigger
-- `check_task_tenant_coherence()` que exige que a oportunidade, a tarefa-pai
-- (quando houver) e o responsável (quando houver) pertençam ao MESMO tenant.
--
-- HIERARQUIA DE 2 NÍVEIS (D-01): garantida no banco pelo trigger
-- `check_task_depth()`, NÃO por um CHECK — o Postgres rejeita CHECK com
-- subquery contra a própria tabela (`cannot use subquery in check
-- constraint`). O trigger cobre os dois sentidos: (a) o pai referenciado já
-- ser uma subtarefa, e (b) a própria linha já ter filhas e estar ganhando um
-- `parent_task_id` (re-parentamento via UPDATE).
--
-- SEM ROLLUP PERSISTIDO (D-02): esta tabela NÃO tem nenhuma coluna de span
-- agregado (`computed_start`/`computed_due`) nem de percentual de conclusão.
-- O rollup da tarefa-pai (menor início / maior fim das filhas + % concluído)
-- é calculado em runtime por `lib/opportunities/task-rollup.ts` (Plan 16-04),
-- mesma regra do score (docs/PROJETO.md §3, "score é calculado, nunca persistido").
--
-- IDEMPOTENTE. Pré-requisitos: 0001 (`current_tenant_id`, `set_updated_at`),
-- 0015 (`current_user_role`), 0021 (`is_platform_admin`), 0032 (padrão de
-- trigger de coerência de tenant, `check_assignee_tenant()`).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Enum de status — 4 valores fixos, na ordem das 4 colunas do Kanban (D-03)
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('backlog', 'em_andamento', 'bloqueio', 'finalizado');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Tabela opportunity_tasks — exatamente 14 colunas, nenhuma derivada (D-02)
-- -----------------------------------------------------------------------------
create table if not exists opportunity_tasks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  -- self-FK — apagar a tarefa-pai apaga as subtarefas (TASK-06, satisfeito
  -- no banco; a confirmação explícita ao usuário é responsabilidade da UI).
  parent_task_id  uuid references opportunity_tasks(id) on delete cascade,
  title           text not null,
  description     text,
  status          task_status not null default 'backlog',
  start_date      date,
  due_date        date,
  -- D-04/D-05: UM responsável, do mesmo tenant (validado pelo trigger de
  -- coerência abaixo, além da RLS). Sair da empresa não apaga o trabalho
  -- registrado — por isso `on delete set null`, não cascade.
  assignee_id     uuid references profiles(id) on delete set null,
  blocked_reason  text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Defesa em profundidade do D-03 no banco (além de Zod e UI): motivo do
  -- bloqueio é exigido sempre que o status for 'bloqueio'.
  constraint opportunity_tasks_blocked_reason_chk check (
    status <> 'bloqueio' or (blocked_reason is not null and length(trim(blocked_reason)) > 0)
  )
);
-- Nota D-02: nenhuma coluna de span agregado (`computed_start`/`computed_due`)
-- ou de percentual de conclusão existe aqui de propósito — o rollup da
-- tarefa-pai é sempre calculado em runtime, nunca persistido.

-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------
create index if not exists opportunity_tasks_tenant_idx      on opportunity_tasks(tenant_id);
create index if not exists opportunity_tasks_opportunity_idx on opportunity_tasks(opportunity_id);
create index if not exists opportunity_tasks_parent_idx      on opportunity_tasks(parent_task_id);
create index if not exists opportunity_tasks_assignee_idx    on opportunity_tasks(assignee_id);

-- -----------------------------------------------------------------------------
-- 4. Guarda de 2 níveis (D-01/TASK-02) — check_task_depth()
-- -----------------------------------------------------------------------------
-- NÃO é um CHECK: o Postgres rejeita CHECK com subquery contra a própria
-- tabela na criação do schema ("cannot use subquery in check constraint").
-- `security definer` + `search_path` fixo: sem isso o SELECT interno bate na
-- RLS do chamador e pode devolver "not found" para uma linha que existe.
create or replace function check_task_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_parent_id uuid;
  v_has_children      boolean;
begin
  if new.id = new.parent_task_id then
    raise exception 'Uma tarefa não pode ser subtarefa de si mesma.'
      using errcode = 'check_violation';
  end if;

  if new.parent_task_id is not null then
    -- Caso (a): o pai referenciado precisa ser ele mesmo uma tarefa RAIZ.
    select parent_task_id into v_parent_parent_id
    from opportunity_tasks where id = new.parent_task_id;

    if not found then
      raise exception 'Tarefa-pai inexistente.' using errcode = 'foreign_key_violation';
    end if;

    if v_parent_parent_id is not null then
      raise exception 'Uma subtarefa não pode ser filha de outra subtarefa (limite de 2 níveis).'
        using errcode = 'check_violation';
    end if;

    -- Caso (b): cobre re-parentamento via UPDATE — esta linha não pode JÁ ter
    -- filhas, senão ela "rebaixaria" a subtarefa enquanto ainda é mãe de outras.
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

-- -----------------------------------------------------------------------------
-- 5. Coerência de tenant (D-04/TASK-03) — check_task_tenant_coherence()
-- -----------------------------------------------------------------------------
-- Adaptação de check_assignee_tenant() (0032), com 3 diferenças: (a)
-- assignee_id é opcional aqui — só validado quando não-nulo; (b) valida que
-- tenant_id da tarefa bate com o da oportunidade; (c) valida que, quando
-- parent_task_id é não-nulo, a tarefa-pai pertence à MESMA opportunity_id
-- (o guard de profundidade acima não cobre isso).
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

-- Nota de ordem: os dois triggers acima rodam no mesmo timing (BEFORE INSERT
-- OR UPDATE); o Postgres executa múltiplos triggers do mesmo timing/evento em
-- ordem alfabética do nome — `opportunity_tasks_depth_guard` roda antes de
-- `opportunity_tasks_tenant_guard` ('d' < 't'). As checagens são
-- independentes, então a ordem não importa hoje; documentado para não
-- surpreender quem acrescentar um 3º trigger no futuro.

-- -----------------------------------------------------------------------------
-- 6. updated_at — reusa set_updated_at() de 0001 (mesmo padrão de 0011 em
--    opportunity_risks)
-- -----------------------------------------------------------------------------
drop trigger if exists opportunity_tasks_set_updated_at on opportunity_tasks;
create trigger opportunity_tasks_set_updated_at
  before update on opportunity_tasks
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. RLS (TASK-04/D-11/D-12)
-- -----------------------------------------------------------------------------
alter table opportunity_tasks enable row level security;

-- SELECT: tenant + platform_admin aditivo (D-12) — paridade com as demais
-- tabelas-filha de oportunidade (opportunity_risks/opportunity_assignees).
-- É uma policy de LEITURA, não uma rota/tela de admin nova.
drop policy if exists opportunity_tasks_select on opportunity_tasks;
create policy opportunity_tasks_select on opportunity_tasks
  for select using (tenant_id = current_tenant_id() or is_platform_admin());

-- INSERT/UPDATE/DELETE: qualquer papel exceto `viewer` (D-11) — clonado do
-- gate REAL de opportunity_risks pós-0015, NÃO do gate admin-only de
-- opportunity_assignees (`current_user_role() = 'tenant_admin'`). Sem isso o
-- Kanban esvazia, porque quem executa a tarefa não conseguiria mover o
-- próprio card.
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

-- =============================================================================
-- FIM 0037 — span e percentual de conclusão agregados da tarefa-pai vivem em
-- lib/opportunities/task-rollup.ts (runtime), NUNCA em coluna desta tabela.
-- =============================================================================
