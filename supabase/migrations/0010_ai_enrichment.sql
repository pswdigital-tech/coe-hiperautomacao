-- =============================================================================
-- 0010_ai_enrichment.sql — Colunas de status de enriquecimento por IA
-- =============================================================================
-- Phase 7.6 — Enriquecimento por IA das Oportunidades.
--
-- Adiciona 3 colunas a `opportunities` para rastrear o pipeline assíncrono
-- de enriquecimento via OpenAI (Plan 02 lib/ai/enrichment.ts):
--   - ai_enrichment_status enum('pending','enriched','failed') default 'pending'
--   - ai_enrichment_error text null (max 1000 chars via CHECK)
--   - ai_enriched_at timestamptz null
--
-- A view `opportunities_with_score` precisa DROP + CREATE porque `o.*` na
-- view re-ordena as colunas quando colunas novas são adicionadas (mesmo
-- pitfall das migrations 0008/0009 — Postgres bloqueia com ERROR 42P16
-- ao tentar fazer só CREATE OR REPLACE).
--
-- Idempotente — pode ser re-aplicada sem efeito colateral.
-- Pré-requisitos: 0001..0009 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Enum ai_enrichment_status
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_enrichment_status') then
    create type ai_enrichment_status as enum ('pending', 'enriched', 'failed');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Colunas em opportunities
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists ai_enrichment_status ai_enrichment_status
    not null default 'pending',
  add column if not exists ai_enrichment_error  text,
  add column if not exists ai_enriched_at       timestamptz;

-- ---------------------------------------------------------------------------
-- 3. CHECK — ai_enrichment_error max 1000 chars (defesa anti storage exhaustion)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_ai_error_len_chk'
  ) then
    alter table opportunities
      add constraint opportunities_ai_error_len_chk
        check (ai_enrichment_error is null or length(ai_enrichment_error) <= 1000);
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Índice parcial — monitoring "pending rows velhas"
-- ---------------------------------------------------------------------------
create index if not exists opportunities_ai_pending_idx
  on opportunities(created_at)
  where ai_enrichment_status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Recria view opportunities_with_score
-- ---------------------------------------------------------------------------
-- `o.*` re-ordena colunas; CREATE OR REPLACE não basta — DROP + CREATE.
-- Padrão usado em 0008 e 0009. As 3 colunas novas (ai_enrichment_status,
-- ai_enrichment_error, ai_enriched_at) entram automaticamente via `o.*`.
drop view if exists opportunities_with_score;

create view opportunities_with_score
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

grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- FIM 0010 — ai_enrichment_status + error + enriched_at adicionados;
-- view opportunities_with_score recriada com 3 colunas novas (via o.*).
-- =============================================================================
