-- =============================================================================
-- 0001_init.sql — CoE Hiperautomação · schema inicial
-- =============================================================================
-- Modelo descrito em .planning/DATA-MODEL.md.
-- Multi-tenant: 1 projeto Supabase compartilhado, isolamento via RLS.
-- Toda alteração futura entra como nova migration numerada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Force write-mode session (bypassa default_transaction_read_only=on)
-- -----------------------------------------------------------------------------
set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto (para gen_random_uuid) já vem habilitado em todo projeto Supabase.
-- Se rodar em Postgres puro fora do Supabase, descomente a linha abaixo:
-- create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 2. Enums
-- -----------------------------------------------------------------------------
create type opportunity_source as enum ('persona', 'formulario');

create type opportunity_status as enum (
  'novo',
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido'
);

create type automation_tool as enum ('rpa', 'n8n', 'ambos');

create type effort_level     as enum ('baixo', 'medio', 'alto');
create type complexity_level as enum ('baixo', 'medio', 'alto');
create type time_bucket      as enum ('pequeno', 'medio', 'grande');

create type phase_key as enum (
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido'
);

create type tenant_role as enum ('member', 'tenant_admin');

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------

-- tenants ---------------------------------------------------------------------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- profiles --------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete restrict,
  email       text not null,
  full_name   text,
  role        tenant_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_tenant_id_idx on profiles(tenant_id);

-- opportunities ---------------------------------------------------------------
create table opportunities (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  seq_id                int  not null,                          -- preenchido por trigger
  source                opportunity_source not null,

  -- identificação
  solicitante           text not null,
  email                 text,
  area                  text not null,
  subarea               text,
  processo              text not null,

  -- métricas do processo (texto livre porque o mockup usa formatos variados)
  frequencia            text,
  volume_medio          text,
  tempo_execucao        text,
  num_pessoas           text,

  -- automação
  ferramenta            automation_tool,
  escopo_automacao      text[] not null default '{}',
  beneficios_esperados  text[] not null default '{}',

  -- priorização (compõem o score)
  esforco               effort_level,
  complexidade          complexity_level,
  tempo                 time_bucket,
  objetivo              smallint check (objetivo between 1 and 5),

  -- status do pipeline
  status                opportunity_status not null default 'novo',

  -- operacional (comum aos dois tipos)
  responsavel           text,                                   -- pessoa do CoE responsável (texto livre no MVP; vira FK profiles depois)
  notas                 text,                                   -- notas internas livres

  -- type-specific (apenas um dos dois preenchido conforme source)
  -- persona_extras schema:
  --   {cargo, tempo_funcao, local, papel, sistemas, objetivos, metricas,
  --    desafios, dados, automacao_atual, expectativas, priorizacao_desc,
  --    observacoes, processos_detalhados[]}
  -- formulario_extras schema:
  --   {tipo_processo, sistemas,
  --    criterios: {regras_claras, totalmente_manual, processo_uniforme,
  --                digitacao_manual, causa_reclamacoes, padronizacao_docs,
  --                validacao_dados, schedulable, tem_documentacao,
  --                decisao_humana},
  --    beneficios: {reducao_tempo, eliminacao_erros, produtividade,
  --                 qualidade_dados, reducao_custos, reducao_retrabalho,
  --                 compliance, objetivos_estrategicos}}
  persona_extras        jsonb,
  formulario_extras     jsonb,

  -- audit
  created_by            uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- numeração única por tenant
  unique (tenant_id, seq_id),

  -- consistência do discriminator
  constraint opportunities_extras_match_source check (
    (source = 'persona'    and formulario_extras is null) or
    (source = 'formulario' and persona_extras   is null) or
    (persona_extras is null and formulario_extras is null)
  )
);

create index opportunities_tenant_status_idx     on opportunities(tenant_id, status);
create index opportunities_tenant_source_idx     on opportunities(tenant_id, source);
create index opportunities_tenant_area_idx       on opportunities(tenant_id, area);
create index opportunities_tenant_created_at_idx on opportunities(tenant_id, created_at desc);

-- opportunity_phases ----------------------------------------------------------
create table opportunity_phases (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  phase_key       phase_key not null,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (opportunity_id, phase_key)
);

create index opportunity_phases_tenant_idx        on opportunity_phases(tenant_id);
create index opportunity_phases_opportunity_idx   on opportunity_phases(opportunity_id);

-- -----------------------------------------------------------------------------
-- 4. Helper function — current_tenant_id()
-- -----------------------------------------------------------------------------
-- Usado em todas as policies de RLS. SECURITY DEFINER permite ler `profiles`
-- sem RLS recursivo. STABLE permite cache no escopo da query.
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- 5. Score function + view
-- -----------------------------------------------------------------------------
create or replace function opportunity_score(
  p_esforco      effort_level,
  p_complexidade complexity_level,
  p_tempo        time_bucket,
  p_objetivo     smallint
) returns int
language sql
immutable
as $$
  select round(
      case p_esforco      when 'baixo' then 25 when 'medio' then 15 when 'alto'   then 5 else 0 end
    + case p_complexidade when 'baixo' then 25 when 'medio' then 15 when 'alto'   then 5 else 0 end
    + case p_tempo        when 'pequeno' then 25 when 'medio' then 15 when 'grande' then 5 else 0 end
    + (least(5, coalesce(p_objetivo, 1))::numeric / 5 * 25)
  )::int;
$$;

create or replace view opportunities_with_score
with (security_invoker = true) as
select
  o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;

-- -----------------------------------------------------------------------------
-- 6. Triggers
-- -----------------------------------------------------------------------------

-- generic updated_at ----------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function set_updated_at();

create trigger trg_opportunity_phases_updated_at
  before update on opportunity_phases
  for each row execute function set_updated_at();

-- seq_id por tenant -----------------------------------------------------------
create or replace function set_opportunity_seq_id()
returns trigger
language plpgsql
as $$
begin
  if new.seq_id is null then
    select coalesce(max(seq_id), 0) + 1
    into new.seq_id
    from opportunities
    where tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;

create trigger trg_opportunities_seq_id
  before insert on opportunities
  for each row execute function set_opportunity_seq_id();

-- auto-criação de profile no signup ------------------------------------------
-- O tenant_id deve vir no metadata do signup (user_metadata.tenant_id) ou
-- ser injetado pelo admin via app_metadata.tenant_id no Supabase Studio.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := coalesce(
    (new.raw_user_meta_data->>'tenant_id')::uuid,
    (new.raw_app_meta_data->>'tenant_id')::uuid
  );

  if v_tenant_id is null then
    raise exception 'tenant_id ausente em raw_user_meta_data/raw_app_meta_data ao criar profile para %', new.id;
  end if;

  insert into profiles (id, tenant_id, email, full_name)
  values (
    new.id,
    v_tenant_id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table tenants            enable row level security;
alter table profiles           enable row level security;
alter table opportunities      enable row level security;
alter table opportunity_phases enable row level security;

-- tenants: leitura só do próprio tenant; sem write (operação via service_role)
create policy tenants_select_own on tenants
  for select using (id = current_tenant_id());

-- profiles: leitura dentro do tenant; update só na própria linha
create policy profiles_select_same_tenant on profiles
  for select using (tenant_id = current_tenant_id());

create policy profiles_update_self on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id = current_tenant_id());

-- opportunities: CRUD completo restrito ao próprio tenant
create policy opportunities_select on opportunities
  for select using (tenant_id = current_tenant_id());

create policy opportunities_insert on opportunities
  for insert with check (tenant_id = current_tenant_id());

create policy opportunities_update on opportunities
  for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy opportunities_delete on opportunities
  for delete using (tenant_id = current_tenant_id());

-- opportunity_phases: mesmo padrão
create policy opportunity_phases_select on opportunity_phases
  for select using (tenant_id = current_tenant_id());

create policy opportunity_phases_insert on opportunity_phases
  for insert with check (tenant_id = current_tenant_id());

create policy opportunity_phases_update on opportunity_phases
  for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy opportunity_phases_delete on opportunity_phases
  for delete using (tenant_id = current_tenant_id());

-- -----------------------------------------------------------------------------
-- 8. Grants (Supabase já cria roles authenticated/anon/service_role)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;

grant select                          on tenants            to authenticated;
grant select, update                  on profiles           to authenticated;
grant select, insert, update, delete  on opportunities      to authenticated;
grant select, insert, update, delete  on opportunity_phases to authenticated;
grant select                          on opportunities_with_score to authenticated;

-- service_role pode tudo (default) — usado por jobs/admin via API REST com chave de serviço

-- =============================================================================
-- FIM 0001_init.sql
-- =============================================================================
