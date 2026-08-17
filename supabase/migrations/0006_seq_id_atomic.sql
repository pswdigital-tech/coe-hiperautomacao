-- =============================================================================
-- 0006_seq_id_atomic.sql — Atomicidade no seq_id por tenant
-- =============================================================================
-- Substitui o trigger `set_opportunity_seq_id()` original de 0001_init.sql
-- (lines 254-272), que usa `select coalesce(max(seq_id), 0) + 1` — race-prone
-- sob inserts concorrentes no mesmo tenant — por uma versão atômica baseada
-- em tabela auxiliar `tenant_sequences` + `INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING` (row-lock transacional).
--
-- Defesa em profundidade:
--   - Trigger SEMPRE sobrescreve `new.seq_id` — payload do cliente é ignorado
--     (bloqueia cliente que tente forjar `seq_id` arbitrário).
--   - `tenant_sequences` tem RLS habilitado e ZERO policies — só
--     service_role e funções SECURITY DEFINER (next_seq_id) acessam.
--
-- Por que NÃO usar `CREATE SEQUENCE`: `nextval()` NÃO faz rollback quando a
-- transação aborta — geraria gaps em `seq_id` exibido ao usuário. Tabela
-- auxiliar com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` é transacional
-- (rollback restaura `last_seq`).
--
-- Pré-requisito: 0001_init.sql aplicado; opportunities pode estar populada
-- (Plan 03 seed) ou vazia.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Tabela auxiliar — counter por tenant
-- -----------------------------------------------------------------------------
-- 1 linha por tenant. `last_seq` = último seq_id atribuído (próximo será +1).
-- Cascata em delete do tenant para limpar sequência órfã.

create table if not exists tenant_sequences (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  last_seq   int  not null default 0
);

alter table tenant_sequences enable row level security;
-- ZERO policies → role authenticated/anon NÃO lê nem escreve.
-- service_role bypassa RLS por default. SECURITY DEFINER de next_seq_id
-- também bypassa via owner do schema.

-- -----------------------------------------------------------------------------
-- 2. Backfill — alinhar com o estado atual de opportunities
-- -----------------------------------------------------------------------------
-- Caminho A: tenants COM oportunidades → last_seq = max(seq_id) corrente.
-- Caminho B: tenants SEM oportunidades → last_seq = 0 (próximo será 1).

-- 2a. Tenants COM oportunidades
insert into tenant_sequences (tenant_id, last_seq)
select tenant_id, coalesce(max(seq_id), 0)
from opportunities
group by tenant_id
on conflict (tenant_id) do update set last_seq = excluded.last_seq;

-- 2b. Tenants SEM oportunidades (garante 1 linha por tenant existente)
insert into tenant_sequences (tenant_id, last_seq)
select id, 0 from tenants
on conflict (tenant_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Função atômica — next_seq_id(p_tenant_id)
-- -----------------------------------------------------------------------------
-- `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` adquire row-level lock no
-- upsert. Transações concorrentes para o mesmo tenant aguardam em `pg_locks`;
-- não disputam o `max(seq_id)`. Quando a primeira finaliza, a segunda lê o
-- `last_seq` atualizado e incrementa novamente — sequência sem gaps.

create or replace function next_seq_id(p_tenant_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into tenant_sequences (tenant_id, last_seq)
    values (p_tenant_id, 1)
  on conflict (tenant_id) do update
    set last_seq = tenant_sequences.last_seq + 1
  returning last_seq into v_next;
  return v_next;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Substitui o trigger antigo (race-prone)
-- -----------------------------------------------------------------------------
-- Drop ANTES de recriar — `create or replace function` substitui função,
-- mas `create trigger` SEM drop cria duplicado → comportamento indeterminado.
-- A nova função SEMPRE sobrescreve `new.seq_id` (sem `if null then`),
-- bloqueando cliente que envie `seq_id` no payload.

drop trigger if exists trg_opportunities_seq_id on opportunities;
drop function if exists set_opportunity_seq_id();

create or replace function set_opportunity_seq_id()
returns trigger
language plpgsql
as $$
begin
  -- SEMPRE sobrescreve — defesa contra forge de seq_id pelo cliente.
  new.seq_id := next_seq_id(new.tenant_id);
  return new;
end;
$$;

create trigger trg_opportunities_seq_id
  before insert on opportunities
  for each row execute function set_opportunity_seq_id();

-- =============================================================================
-- FIM 0006 — seq_id agora é atômico e cliente não pode forjar
-- =============================================================================
