-- =============================================================================
-- 0017_schema_evolution_v03.sql — Campos operacionais + criticidade + datas COE
-- =============================================================================
-- v0.3 — evolução inspirada no inventário "COE — COPA ENERGIA" (referência
-- externa comparada pelo PO): campos operacionais que só existiam lá.
--
--   - criticidade_level (enum) + coluna `criticidade` — separada do Score,
--     input manual (Baixa/Média/Alta/Crítica).
--   - azure_boards_codigo, linguagem, execucao, usuarios_servico,
--     execucoes_mes, data_conclusao — metadados operacionais de automações já
--     implementadas (preenchidos pelo time do CoE, não pelo solicitante).
--   - data_abertura_coe / data_fechamento_coe — proto-SLA: abertura setada
--     automaticamente na criação (se ainda nula); fechamento setado/limpo
--     automaticamente pelo trigger sync_coe_dates() ao entrar/sair de um
--     status terminal (concluido/descontinuado) — espelha syncFechamentoCOE
--     da referência. `responsavel` (dono técnico, distinto de `solicitante`)
--     JÁ EXISTE desde 0001 — não recriado aqui, só passa a ser exposto na UI.
--
-- Também corrige sync_opportunity_phase() (0004): o cast direto
-- `new.status::text::phase_key` quebraria (42704 invalid input value) assim
-- que um registro entrasse em 'gestao'/'manutencao'/'descontinuado' (0016) —
-- esses 3 status não têm phase_key correspondente. Corrigido para tratá-los
-- como 'novo' (sem phase row), preservando o comportamento dos 7 status do
-- fluxo linear + fechando a fase anterior quando aplicável.
--
-- IDEMPOTENTE — add column if not exists / create or replace / guardas por
-- catálogo em cada policy e constraint.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0016 aplicada e COMMITADA (usa os 3 novos valores de
-- opportunity_status só dentro do trigger PL/pgSQL — corpo não executa na
-- criação da function, então é seguro mesmo que 0016 tenha acabado de rodar;
-- ainda assim, aplicar em execuções SEPARADAS por disciplina).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Enum de criticidade (idempotente)
-- ---------------------------------------------------------------------------
do $$ begin if not exists (select 1 from pg_type where typname='criticidade_level') then
  create type criticidade_level as enum ('baixa','media','alta','critica'); end if; end$$;

-- ---------------------------------------------------------------------------
-- 2. Novas colunas em opportunities (aditivas)
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists criticidade         criticidade_level,
  add column if not exists azure_boards_codigo text,
  add column if not exists linguagem           text,
  add column if not exists execucao            text,
  add column if not exists usuarios_servico    text,
  add column if not exists execucoes_mes       int,
  add column if not exists data_conclusao      date,
  add column if not exists data_abertura_coe   timestamptz,
  add column if not exists data_fechamento_coe timestamptz;

do $$ begin if not exists (select 1 from pg_constraint where conname='opportunities_execucoes_mes_chk') then
  alter table opportunities add constraint opportunities_execucoes_mes_chk
    check (execucoes_mes is null or execucoes_mes >= 0); end if; end$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger sync_coe_dates() — abertura automática na criação + fechamento
--    automático ao entrar/sair de status terminal (concluido/descontinuado)
-- ---------------------------------------------------------------------------
create or replace function sync_coe_dates()
returns trigger
language plpgsql
as $$
declare
  v_terminal_old boolean;
  v_terminal_new boolean;
begin
  if tg_op = 'INSERT' then
    if new.data_abertura_coe is null then
      new.data_abertura_coe := now();
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE' (trigger só dispara "of status", ver passo 4)
  v_terminal_old := old.status::text in ('concluido','descontinuado');
  v_terminal_new := new.status::text in ('concluido','descontinuado');

  if v_terminal_new and not v_terminal_old and new.data_fechamento_coe is null then
    new.data_fechamento_coe := now();
  elsif v_terminal_old and not v_terminal_new then
    -- reaberto (voltou de status terminal para não-terminal) — limpa fechamento
    new.data_fechamento_coe := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_opportunities_coe_dates_insert on opportunities;
create trigger trg_opportunities_coe_dates_insert
  before insert on opportunities
  for each row execute function sync_coe_dates();

drop trigger if exists trg_opportunities_coe_dates_status on opportunities;
create trigger trg_opportunities_coe_dates_status
  before update of status on opportunities
  for each row execute function sync_coe_dates();

-- ---------------------------------------------------------------------------
-- 4. Fix sync_opportunity_phase() (0004) — 'gestao'/'manutencao'/'descontinuado'
--    (0016) não têm phase_key correspondente; tratar como 'novo' (sem phase row)
--    em vez de tentar o cast direto (que estouraria 22P02/invalid input value).
-- ---------------------------------------------------------------------------
create or replace function sync_opportunity_phase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_phase phase_key;
  v_new_phase phase_key;
  v_pipeline_statuses text[] := array[
    'em_analise','planejamento','backlog','desenvolvimento',
    'homologacao','producao','concluido'
  ];
begin
  -- Só os 7 status do fluxo linear mapeiam a phase_key. 'novo' e os 3 status
  -- fora do fluxo (gestao/manutencao/descontinuado, 0016) não abrem phase row.
  v_old_phase := case
    when tg_op = 'UPDATE' and old.status::text = any(v_pipeline_statuses)
      then old.status::text::phase_key
    else null
  end;
  v_new_phase := case
    when new.status::text = any(v_pipeline_statuses)
      then new.status::text::phase_key
    else null
  end;

  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  if v_old_phase is not null then
    update opportunity_phases
      set finished_at = now()
      where opportunity_id = new.id
        and phase_key = v_old_phase
        and finished_at is null;
  end if;

  if v_new_phase is not null then
    insert into opportunity_phases
      (tenant_id, opportunity_id, phase_key, started_at, finished_at)
    values
      (new.tenant_id, new.id, v_new_phase, now(), null)
    on conflict (opportunity_id, phase_key) do update
      set started_at  = coalesce(opportunity_phases.started_at, excluded.started_at),
          finished_at = null;
  end if;

  return new;
end;
$$;
-- (trigger trg_opportunities_phase_sync de 0004 já aponta pra esta function —
-- create or replace basta, sem precisar recriar o trigger.)

-- =============================================================================
-- FIM 0017 — opportunities ganhou 9 colunas operacionais (criticidade +
-- 6 campos de automação implementada + 2 datas COE), abertura/fechamento COE
-- automáticos, e o trigger de sincronia de fases não quebra mais com os 3
-- status novos de 0016.
-- =============================================================================
