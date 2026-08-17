-- =============================================================================
-- 0032_opportunity_assignees.sql — atribuir pessoas a uma oportunidade
-- =============================================================================
-- CONTEXTO: até aqui "quem toca isso" era `opportunities.responsavel`, texto
-- livre. Passa a ser um vínculo real com `profiles`, N:N (uma oportunidade pode
-- ter Dev + Tech Lead + PM). A coluna `responsavel` NÃO é dropada — os dados
-- históricos continuam lá; ela só sai da UI (decisão de produto 2026-07-30).
--
-- QUEM ATRIBUI:
--   - `tenant_admin` → pessoas do PRÓPRIO tenant, em oportunidades do próprio
--     tenant. É o gate de escrita nas policies.
--   - `platform_admin` (PSW) → qualquer tenant, via `is_platform_admin()` (0021).
--   - `member`/`viewer` → não atribuem (nem a si mesmos). Leem normalmente.
--
-- ISOLAMENTO: `tenant_id` denormalizado (padrão do projeto) + trigger que exige
-- que a oportunidade E o profile pertençam a esse mesmo tenant. Ou seja, nem o
-- platform_admin cria vínculo cruzado (alguém do tenant A numa oportunidade do
-- tenant B) — ele opera em qualquer tenant, não ENTRE tenants.
--
-- IDEMPOTENTE. Pré-requisitos: 0001 (current_tenant_id), 0015
-- (current_user_role), 0021 (is_platform_admin).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Tabela
-- -----------------------------------------------------------------------------
create table if not exists opportunity_assignees (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  profile_id     uuid not null references profiles(id)      on delete cascade,
  tenant_id      uuid not null references tenants(id)       on delete cascade,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (opportunity_id, profile_id)
);

create index if not exists opportunity_assignees_opportunity_idx
  on opportunity_assignees(opportunity_id);
-- Índice do filtro "Membro" da listagem (busca as oportunidades de um profile).
create index if not exists opportunity_assignees_profile_idx
  on opportunity_assignees(tenant_id, profile_id);

-- -----------------------------------------------------------------------------
-- 2. Coerência de tenant — a linha, a oportunidade e a pessoa no mesmo tenant
-- -----------------------------------------------------------------------------
create or replace function check_assignee_tenant()
returns trigger
language plpgsql
security definer            -- precisa enxergar opportunities/profiles sem RLS
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
begin
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;
  select tenant_id into v_profile_tenant from profiles      where id = new.profile_id;

  if v_opp_tenant is null or v_profile_tenant is null then
    raise exception 'Oportunidade ou pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id <> v_opp_tenant or v_profile_tenant <> v_opp_tenant then
    raise exception 'Atribuição cruzada entre empresas não é permitida.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_assignees_tenant_guard on opportunity_assignees;
create trigger opportunity_assignees_tenant_guard
  before insert or update on opportunity_assignees
  for each row execute function check_assignee_tenant();

-- -----------------------------------------------------------------------------
-- 3. RLS — leitura para o tenant inteiro; escrita só admin
-- -----------------------------------------------------------------------------
alter table opportunity_assignees enable row level security;

drop policy if exists opportunity_assignees_select on opportunity_assignees;
create policy opportunity_assignees_select on opportunity_assignees
  for select using (tenant_id = current_tenant_id() or is_platform_admin());

drop policy if exists opportunity_assignees_insert on opportunity_assignees;
create policy opportunity_assignees_insert on opportunity_assignees
  for insert with check (
    (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
    or is_platform_admin()
  );

drop policy if exists opportunity_assignees_update on opportunity_assignees;
create policy opportunity_assignees_update on opportunity_assignees
  for update using (
    (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
    or is_platform_admin()
  ) with check (
    (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
    or is_platform_admin()
  );

drop policy if exists opportunity_assignees_delete on opportunity_assignees;
create policy opportunity_assignees_delete on opportunity_assignees
  for delete using (
    (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
    or is_platform_admin()
  );

-- =============================================================================
-- FIM 0032 — `opportunities.responsavel` continua existindo (dados legados);
-- a UI passa a mostrar os assignees. Ver lib/opportunities/assignees.ts.
-- =============================================================================
