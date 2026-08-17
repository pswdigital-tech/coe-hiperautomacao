-- =============================================================================
-- 09-DRYRUN-VALIDATION.sql — DRY RUN da migration 0011 (NÃO PERSISTE)
-- =============================================================================
-- Roda a migration 0011 INTEIRA + queries de verificação dentro de UMA transação
-- e dá ROLLBACK no fim. Nada é gravado. Objetivo: pegar qualquer erro de apply
-- (e conferir os números do backfill/score/trigger) sem tocar no schema real.
--
-- COMO USAR:
--   1. Cole TUDO no Supabase SQL Editor → Run.
--   2. Se der ERRO: copie a mensagem e me mande.
--   3. Se rodar até o fim: olhe as linhas de "=== VERIFICAÇÃO ===" no resultado
--      e me mande os números (ou um print). Como termina em ROLLBACK, o banco
--      continua intacto.
--   4. Quando estiver tudo certo, para APLICAR DE VERDADE: troque o `rollback;`
--      final por `commit;` e rode de novo (ou rode o arquivo 0011 canônico).
--
-- Obs: as 3 linhas `set session characteristics...` do 0011 foram OMITIDAS aqui
-- porque não podem rodar dentro de um BEGIN explícito. Não são necessárias.
-- =============================================================================

begin;

-- ===== 1. enums novos =====
do $$ begin if not exists (select 1 from pg_type where typname='frequency_bucket') then
  create type frequency_bucket as enum ('diario','semanal','quinzenal','mensal','anual'); end if; end$$;
do $$ begin if not exists (select 1 from pg_type where typname='fte_bucket') then
  create type fte_bucket as enum ('muito_baixo','baixo','medio','alto','muito_alto'); end if; end$$;

-- ===== 2. colunas novas em opportunities =====
alter table opportunities
  add column if not exists fte_horas             numeric,
  add column if not exists fonte                 text,
  add column if not exists tipo_processo         text[] not null default '{}',
  add column if not exists beneficio_qualitativo text,
  add column if not exists criterios             jsonb,
  add column if not exists beneficios            jsonb,
  add column if not exists fte                   fte_bucket;

-- ===== 3. tempo: time_bucket -> frequency_bucket (derivado de frequencia) =====
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
        when 'eventual'        then 'anual'
        when '5 vezes por dia' then 'diario'
        else null end::frequency_bucket);
  end if;
end$$;

-- ===== 4. backfill =====
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

update opportunities set fonte = 'FGCoop'
where fonte is null and tenant_id = '11111111-1111-1111-1111-111111111111';

-- ===== 5. rpa_score GENERATED =====
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

-- ===== 6. CHECKs (sem subquery) =====
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

-- ===== 7. opportunity_score() 5 fatores =====
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

-- ===== 8. enums de risco =====
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

-- ===== 9. tabela opportunity_risks (priority = plain risk_priority, setada por trigger) =====
create table if not exists opportunity_risks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  descricao         text not null,
  tipo              risk_type not null,
  responsavel       text,
  impacto           risk_impact not null,
  probabilidade     risk_probability not null,
  status            risk_status not null default 'novo',
  resposta          text,
  descricao_impacto text,
  priority          risk_priority,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists opportunity_risks_tenant_idx      on opportunity_risks(tenant_id);
create index if not exists opportunity_risks_opportunity_idx on opportunity_risks(opportunity_id);

-- ===== 10. RLS =====
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

-- ===== 11. trigger updated_at =====
drop trigger if exists trg_opportunity_risks_updated_at on opportunity_risks;
create trigger trg_opportunity_risks_updated_at
  before update on opportunity_risks for each row execute function set_updated_at();

-- ===== 11b. trigger priority (matriz) =====
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

-- ===== 12. view =====
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
-- === VERIFICAÇÃO (dentro da mesma transação, antes do rollback) ===
-- =============================================================================

-- Smoke do TRIGGER de priority: insere 2 riscos (priority é setada pelo trigger).
-- Rollback desfaz. alto×provavel -> critica ; moderado×remota -> baixa.
insert into opportunity_risks (opportunity_id, tenant_id, descricao, tipo, impacto, probabilidade)
select id, tenant_id, 'DRYRUN1', 'risco', 'alto', 'provavel' from opportunities limit 1;
insert into opportunity_risks (opportunity_id, tenant_id, descricao, tipo, impacto, probabilidade)
select id, tenant_id, 'DRYRUN2', 'risco', 'moderado', 'remota' from opportunities limit 1;

-- RESULTADO ÚNICO (o SQL Editor mostra só o último select) — manda esta tabela.
select * from (
    select 1 ord, 'criterios_null (esp 0)' verificacao,
           count(*)::text valor from opportunities where source='formulario' and criterios is null
  union all select 2, 'padronizacaoDocs_fora_dominio (esp 0)',
           count(*)::text from opportunities where source='formulario' and criterios is not null and criterios->>'padronizacaoDocs' not in ('sim','nao','parcial')
  union all select 3, 'formulario_tempo_null (esp 0)',
           count(*)::text from opportunities where source='formulario' and tempo is null
  union all select 4, 'fonte_FGCoop (esp 29)',
           count(*)::text from opportunities where fonte='FGCoop'
  union all select 5, 'risk_policies (esp 4)',
           count(*)::text from pg_policies where tablename='opportunity_risks'
  union all select 6, 'tempo_type (esp frequency_bucket)',
           (select atttypid::regtype::text from pg_attribute where attrelid='opportunities'::regclass and attname='tempo')
  union all select 7, 'score (esp 100)',
           opportunity_score('alto'::effort_level,'baixo'::complexity_level,'diario'::frequency_bucket,5::smallint,'muito_alto'::fte_bucket)::text
  union all select 8, 'score (esp 36)',
           opportunity_score('alto'::effort_level,'alto'::complexity_level,'anual'::frequency_bucket,1::smallint,'muito_baixo'::fte_bucket)::text
  union all select 9, 'rpa_score max amostra (esp 0-6)',
           (select max(rpa_score)::text from opportunities)
  union all select 10, 'trigger alto x provavel (esp critica)',
           (select priority::text from opportunity_risks where descricao='DRYRUN1')
  union all select 11, 'trigger moderado x remota (esp baixa)',
           (select priority::text from opportunity_risks where descricao='DRYRUN2')
) t order by ord;

-- =============================================================================
-- ROLLBACK — nada acima é gravado. Para APLICAR DE VERDADE, troque por: commit;
-- =============================================================================
rollback;
