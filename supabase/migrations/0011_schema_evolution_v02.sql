-- =============================================================================
-- 0011_schema_evolution_v02.sql — Evolução do schema para o contrato v0.2 (_giba)
-- =============================================================================
-- Phase 9 — Schema Evolution + Score/Risk/Contract Foundation.
--
-- Evolui o schema GLOBAL do produto (todos os tenants) do contrato
-- fgcoop-coe-v2.html (v0.1) para _giba_wsi-dashboard.html (v0.2):
--   - opportunities ganha: fte_horas, fonte, tipo_processo[], beneficio_qualitativo,
--     criterios jsonb (8 chaves sim/nao/parcial), beneficios jsonb (8 chaves 1-5),
--     fte (fte_bucket), rpa_score (GENERATED de criterios, 0-6)
--   - tempo muda de duração (time_bucket) para frequência (frequency_bucket),
--     derivada da coluna `frequencia` já existente (valores antigos descartados)
--   - opportunity_score() reescrita para 5 fatores x 20 = 100 (_giba:483-490)
--   - view opportunities_with_score recriada (score + priority_level)
--   - backfill das 29 oportunidades FGCoop existentes (sem perda de dados)
--   - nova tabela opportunity_risks (tenant_id + RLS + 4 policies + priority GENERATED)
--
-- IDEMPOTENTE — pode ser re-aplicada sem efeito colateral (do/if-not-exists,
-- add column if not exists, ALTER de tempo guardado por checagem do tipo atual,
-- CHECKs/policies guardados por catálogo).
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (NÃO db push).
-- Colar o conteúdo INTEIRO de uma vez (o SQL Editor envolve num único transaction).
-- Pré-requisitos: 0001..0010 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Novos enums (idempotentes)
-- ---------------------------------------------------------------------------
do $$ begin if not exists (select 1 from pg_type where typname='frequency_bucket') then
  create type frequency_bucket as enum ('diario','semanal','quinzenal','mensal','anual'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='fte_bucket') then
  create type fte_bucket as enum ('muito_baixo','baixo','medio','alto','muito_alto'); end if; end$$;

-- ---------------------------------------------------------------------------
-- 2. Novas colunas plain em opportunities (aditivas)
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists fte_horas             numeric,                       -- MODEL-01
  add column if not exists fonte                 text,                          -- MODEL-03
  add column if not exists tipo_processo         text[] not null default '{}',  -- MODEL-04
  add column if not exists beneficio_qualitativo text,                          -- MODEL-05
  add column if not exists criterios             jsonb,                         -- MODEL-06 (D-06)
  add column if not exists beneficios            jsonb,                         -- MODEL-07 (D-07)
  add column if not exists fte                   fte_bucket;                    -- MODEL-07 (D-02: legado NULL)
-- (rpa_score entra no passo 5, DEPOIS do backfill de criterios.)

-- ---------------------------------------------------------------------------
-- 3. Migração de `tempo` (time_bucket -> frequency_bucket) — MODEL-08 / D-05
-- ---------------------------------------------------------------------------
-- A view referencia `tempo`; derrubar antes do ALTER. ALTER guardado contra
-- re-aplicação (não-idempotente por natureza). `USING` deriva de `frequencia`
-- (D-01) porque os valores de duração antigos são descartados.
drop view if exists opportunities_with_score;

do $$
begin
  if (select atttypid::regtype::text from pg_attribute
      where attrelid='opportunities'::regclass and attname='tempo') = 'time_bucket' then
    alter table opportunities alter column tempo drop default;
    alter table opportunities alter column tempo type frequency_bucket using (
      case lower(translate(coalesce(frequencia,''),'áéíóúÁÉÍÓÚ','aeiouAEIOU'))
        when 'diario'          then 'diario'
        when 'semanal'         then 'semanal'
        when 'quinzenal'       then 'quinzenal'
        when 'mensal'          then 'mensal'
        when 'anual'           then 'anual'
        when 'eventual'        then 'anual'    -- raro/ocasional -> bucket mais baixo (dado real FGCoop seq_id 25)
        when '5 vezes por dia' then 'diario'   -- várias vezes ao dia -> diário (dado real)
        else null end::frequency_bucket);
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Backfill das 29 oportunidades FGCoop legadas — MODEL-09 / D-01..D-04
-- ---------------------------------------------------------------------------
-- 4a. criterios (snake_case->camelCase, SIM/NAO->sim/nao) — só formulario com criterios.
-- RESILIENTE: todo valor ausente/fora-de-domínio coalesce p/ 'nao' (default conservador),
-- garantindo que o CHECK opportunities_criterios_chk (passo 6) nunca aborte a migração.
-- Confirmado: seq_id 18 ("Proposição Normativa") NÃO tem a chave padronizacao_docs no
-- legado -> sem este coalesce geraria {"padronizacaoDocs": null} e o ADD CONSTRAINT abortaria
-- tudo. 'nao' é o valor não-favorável p/ os critérios contados (não infla rpa_score); para
-- decisaoHumana 'nao' é favorável, mas essa linha genuinamente carecia da chave — palpite documentado.
update opportunities o
set criterios = jsonb_build_object(
  'causaReclamacoes', case when lower(c->>'causa_reclamacoes') in ('sim','nao','parcial') then lower(c->>'causa_reclamacoes') else 'nao' end,
  'totalmenteManual', case when lower(c->>'totalmente_manual') in ('sim','nao','parcial') then lower(c->>'totalmente_manual') else 'nao' end,
  'regrasClaras',     case when lower(c->>'regras_claras')     in ('sim','nao','parcial') then lower(c->>'regras_claras')     else 'nao' end,
  'decisaoHumana',    case when lower(c->>'decisao_humana')    in ('sim','nao','parcial') then lower(c->>'decisao_humana')    else 'nao' end,
  'padronizacaoDocs', case when lower(c->>'padronizacao_docs') in ('sim','nao','parcial') then lower(c->>'padronizacao_docs') else 'nao' end,
  'validacaoDados',   case when lower(c->>'validacao_dados')   in ('sim','nao','parcial') then lower(c->>'validacao_dados')   else 'nao' end,
  'schedulable',      case when lower(c->>'schedulable')       in ('sim','nao','parcial') then lower(c->>'schedulable')       else 'nao' end,
  'temDocumentacao',  case when lower(c->>'tem_documentacao')  in ('sim','nao','parcial') then lower(c->>'tem_documentacao')  else 'nao' end)
from (select id, formulario_extras->'criterios' as c from opportunities) src
where o.id = src.id and src.c is not null;

-- 4b. beneficios (6 chaves legadas -> camelCase; compliance/objetivosEstrategicos ausentes no legado).
update opportunities o
set beneficios = jsonb_strip_nulls(jsonb_build_object(
  'reducaoTempo',      (b->>'reducao_tempo')::int,
  'eliminacaoErros',   (b->>'eliminacao_erros')::int,
  'produtividade',     (b->>'produtividade')::int,
  'qualidadeDados',    (b->>'qualidade_dados')::int,
  'reducaoCustos',     (b->>'reducao_custos')::int,
  'reducaoRetrabalho', (b->>'reducao_retrabalho')::int))
from (select id, formulario_extras->'beneficios' as b from opportunities) src
where o.id = src.id and src.b is not null;

-- 4c. fonte = 'FGCoop' nas 29 legadas do tenant FGCoop (D-03). fte_horas/fte ficam NULL (D-02).
-- ESCOPADO ao tenant FGCoop (11111111-...): NÃO carimbar 'FGCoop' em dados de outros
-- tenants (ex.: tenant 99999999 tem 4 rows próprios). Outros tenants ficam fonte NULL.
update opportunities set fonte = 'FGCoop'
where fonte is null and tenant_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 5. rpa_score GENERATED (0-6) derivado de criterios — MODEL-02 / SCORE-03 / D-09..D-11
-- ---------------------------------------------------------------------------
-- Regra inferida por engenharia reversa do _giba (reproduz 64/64 linhas): soma de 6
-- indicadores; causaReclamacoes e temDocumentacao NÃO contam. totalmenteManual conta
-- em 'sim' OU 'parcial'; decisaoHumana conta em 'nao'. Expressão imutável -> válida em
-- GENERATED STORED. criterios null (personas) -> rpa_score null.
alter table opportunities
  add column if not exists rpa_score smallint generated always as (
    case when criterios is null then null else (
        (criterios->>'totalmenteManual' in ('sim','parcial'))::int
      + (criterios->>'regrasClaras'     = 'sim')::int
      + (criterios->>'decisaoHumana'    = 'nao')::int
      + (criterios->>'padronizacaoDocs' = 'sim')::int
      + (criterios->>'validacaoDados'   = 'sim')::int
      + (criterios->>'schedulable'      = 'sim')::int
    )::smallint end
  ) stored;

-- ---------------------------------------------------------------------------
-- 6. CHECK constraints dos jsonb — D-06 / D-07 / D-08
-- ---------------------------------------------------------------------------
-- NB: CHECK constraints NÃO podem conter subquery (Postgres 0A000). Por isso a
-- validação é por-chave explícita (sem jsonb_each). `?&` garante presença das 8
-- chaves de criterios; os `in (...)` por chave validam os valores. Para beneficios,
-- valida-se o range 1–5 das 8 chaves conhecidas (null-tolerante p/ ausentes); chaves
-- desconhecidas não são rejeitadas aqui (defesa de shape fica no Zod da Phase 10).
do $$ begin if not exists (select 1 from pg_constraint where conname='opportunities_criterios_chk') then
  alter table opportunities add constraint opportunities_criterios_chk check (
    criterios is null or (
      criterios ?& array['causaReclamacoes','totalmenteManual','regrasClaras','decisaoHumana',
                         'padronizacaoDocs','validacaoDados','schedulable','temDocumentacao']
      and criterios->>'causaReclamacoes' in ('sim','nao','parcial')
      and criterios->>'totalmenteManual' in ('sim','nao','parcial')
      and criterios->>'regrasClaras'     in ('sim','nao','parcial')
      and criterios->>'decisaoHumana'    in ('sim','nao','parcial')
      and criterios->>'padronizacaoDocs' in ('sim','nao','parcial')
      and criterios->>'validacaoDados'   in ('sim','nao','parcial')
      and criterios->>'schedulable'      in ('sim','nao','parcial')
      and criterios->>'temDocumentacao'  in ('sim','nao','parcial')
    )); end if; end$$;

do $$ begin if not exists (select 1 from pg_constraint where conname='opportunities_beneficios_chk') then
  alter table opportunities add constraint opportunities_beneficios_chk check (
    beneficios is null or (
          (beneficios->>'reducaoTempo'          is null or (beneficios->>'reducaoTempo')::int          between 1 and 5)
      and (beneficios->>'eliminacaoErros'       is null or (beneficios->>'eliminacaoErros')::int       between 1 and 5)
      and (beneficios->>'produtividade'         is null or (beneficios->>'produtividade')::int         between 1 and 5)
      and (beneficios->>'qualidadeDados'        is null or (beneficios->>'qualidadeDados')::int        between 1 and 5)
      and (beneficios->>'reducaoCustos'         is null or (beneficios->>'reducaoCustos')::int         between 1 and 5)
      and (beneficios->>'reducaoRetrabalho'     is null or (beneficios->>'reducaoRetrabalho')::int     between 1 and 5)
      and (beneficios->>'compliance'            is null or (beneficios->>'compliance')::int            between 1 and 5)
      and (beneficios->>'objetivosEstrategicos' is null or (beneficios->>'objetivosEstrategicos')::int between 1 and 5)
    )); end if; end$$;

-- ---------------------------------------------------------------------------
-- 7. opportunity_score() reescrita — 5 fatores x 20 = 100 — SCORE-01 / SCORE-02 / D-16
-- ---------------------------------------------------------------------------
-- Pesos literais de _giba:483-490 (complexidade INVERTIDA: baixo pontua mais).
-- Fallbacks idênticos ao JS: 14/13/16/12/12.
-- Dropar a assinatura ANTIGA de 4 args (0001) para não deixar overload órfão — a view
-- (único dependente) já foi derrubada no passo 3, então o drop é seguro. Idempotente.
drop function if exists opportunity_score(effort_level, complexity_level, time_bucket, smallint);
create or replace function opportunity_score(
  p_esforco effort_level, p_complexidade complexity_level,
  p_tempo frequency_bucket, p_objetivo smallint, p_fte fte_bucket
) returns int language sql immutable as $$
  select (
      case p_esforco when 'baixo' then 8 when 'medio' then 14 when 'alto' then 20 else 14 end
    + case p_complexidade when 'baixo' then 20 when 'medio' then 13 when 'alto' then 6 else 13 end
    + case p_tempo when 'diario' then 20 when 'semanal' then 16 when 'quinzenal' then 12
                   when 'mensal' then 8 when 'anual' then 2 else 16 end
    + case coalesce(p_objetivo,3) when 1 then 4 when 2 then 8 when 3 then 12 when 4 then 16 when 5 then 20 else 12 end
    + case p_fte when 'muito_baixo' then 4 when 'baixo' then 8 when 'medio' then 12
                 when 'alto' then 16 when 'muito_alto' then 20 else 12 end
  )::int;
$$;
-- (A view recriada está no passo 12, depois de opportunity_risks e de todas as colunas novas.)

-- =============================================================================
-- opportunity_risks — RISK-04 / D-12..D-15
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 8. Enums de risco (idempotentes, ASCII-lowercase)
-- ---------------------------------------------------------------------------
do $$ begin if not exists (select 1 from pg_type where typname='risk_type') then
  create type risk_type as enum ('impedimento','risco','oportunidade'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='risk_impact') then
  create type risk_impact as enum ('alto','significativo','moderado','baixo'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='risk_probability') then
  create type risk_probability as enum ('provavel','possivel','improvavel','remota'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='risk_status') then
  create type risk_status as enum ('novo','gerenciado','mitigado','ocorrido'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='risk_priority') then
  create type risk_priority as enum ('critica','alta','media','baixa'); end if; end$$;

-- ---------------------------------------------------------------------------
-- 9. Tabela opportunity_risks com priority GENERATED (matriz 4x4 — _giba:1180-1185)
-- ---------------------------------------------------------------------------
create table if not exists opportunity_risks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  descricao         text not null,
  tipo              risk_type not null,
  responsavel       text,                                  -- D-13 text livre tenant-agnóstico
  impacto           risk_impact not null,
  probabilidade     risk_probability not null,
  status            risk_status not null default 'novo',
  resposta          text,
  descricao_impacto text,
  -- D-14: priority é DERIVADA da matriz (nunca input manual), mas via TRIGGER (passo 11b),
  -- não GENERATED. Motivo: uma coluna GENERATED exige expressão IMMUTABLE, e qualquer
  -- operação com enum (text->enum `enum_in` E enum->text `enum_out`) é tratada como não-
  -- imutável pelo Postgres (42P17). O trigger BEFORE INSERT/UPDATE não tem essa restrição
  -- e SEMPRE sobrescreve new.priority — mesma garantia "derivada, nunca manual" (padrão do
  -- seq_id em 0006). Coluna plain risk_priority, populada pelo trigger.
  priority          risk_priority,                         -- D-14 (set by trigger)
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists opportunity_risks_tenant_idx      on opportunity_risks(tenant_id);
create index if not exists opportunity_risks_opportunity_idx on opportunity_risks(opportunity_id);

-- ---------------------------------------------------------------------------
-- 10. RLS — espelha opportunities (0001) — D-15
-- ---------------------------------------------------------------------------
alter table opportunity_risks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='opportunity_risks' and policyname='opportunity_risks_select') then
    create policy opportunity_risks_select on opportunity_risks for select using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_risks' and policyname='opportunity_risks_insert') then
    create policy opportunity_risks_insert on opportunity_risks for insert with check (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_risks' and policyname='opportunity_risks_update') then
    create policy opportunity_risks_update on opportunity_risks for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_risks' and policyname='opportunity_risks_delete') then
    create policy opportunity_risks_delete on opportunity_risks for delete using (tenant_id = current_tenant_id()); end if;
end$$;
grant select, insert, update, delete on opportunity_risks to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Trigger updated_at (reusa set_updated_at() de 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_opportunity_risks_updated_at on opportunity_risks;
create trigger trg_opportunity_risks_updated_at
  before update on opportunity_risks for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 11b. Trigger priority — matriz impacto×probabilidade (_giba:1180-1185) — D-14
-- ---------------------------------------------------------------------------
-- SEMPRE sobrescreve new.priority (ignora valor enviado pelo cliente → "nunca input
-- manual", igual ao seq_id em 0006). Em PL/pgSQL casts de enum são livres (sem a
-- restrição de imutabilidade da coluna GENERATED). plpgsql_check off via check_function_bodies.
create or replace function set_risk_priority() returns trigger language plpgsql as $$
begin
  new.priority := (case
    when new.impacto='alto'          and new.probabilidade in ('provavel','possivel')   then 'critica'
    when new.impacto='alto'                                                             then 'alta'
    when new.impacto='significativo' and new.probabilidade='provavel'                   then 'critica'
    when new.impacto='significativo' and new.probabilidade='possivel'                   then 'alta'
    when new.impacto='significativo'                                                    then 'media'
    when new.impacto='moderado'      and new.probabilidade='provavel'                   then 'alta'
    when new.impacto='moderado'      and new.probabilidade in ('possivel','improvavel') then 'media'
    when new.impacto='moderado'                                                         then 'baixa'
    when new.impacto='baixo'         and new.probabilidade='provavel'                   then 'alta'
    when new.impacto='baixo'         and new.probabilidade='possivel'                   then 'media'
    when new.impacto='baixo'                                                            then 'baixa'
  end)::risk_priority;
  return new;
end$$;

drop trigger if exists trg_opportunity_risks_priority on opportunity_risks;
create trigger trg_opportunity_risks_priority
  before insert or update on opportunity_risks
  for each row execute function set_risk_priority();

-- ---------------------------------------------------------------------------
-- 12. Recriar view opportunities_with_score (DROP+CREATE) — fechamento — SCORE-02
-- ---------------------------------------------------------------------------
drop view if exists opportunities_with_score;
create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte) as score,
  case when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 70 then 'alta'
       when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 40 then 'media'
       else 'baixa' end as priority_level
from opportunities o;
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- FIM 0011 — opportunities evoluída (7 colunas novas + rpa_score GENERATED + tempo
-- como frequência), opportunity_score() de 5 fatores, view recriada, backfill FGCoop
-- aplicado, e opportunity_risks criada (tenant_id + RLS + priority GENERATED da matriz).
-- =============================================================================
