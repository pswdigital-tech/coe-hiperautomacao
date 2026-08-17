-- =============================================================================
-- 0027_score_blend_benef_criterios.sql — score de prioridade passa a incluir
-- benefícios e critérios (blend 50/30/20)
-- =============================================================================
-- Decisão de produto (2026-07-22): o score de prioridade deixa de ser só os 5
-- fatores e passa a ser a MÉDIA PONDERADA de 3 blocos, cada um normalizado 0–100:
--   score = round( (5·Fat + 3·Ben + 2·Crit) / (5 + 3·[ben?] + 2·[crit?]) )
--   - Fat  = fórmula dos 5 fatores (esforço, complexidade, frequência, objetivo, FTE)
--   - Ben  = média das notas 1–5 dos benefícios pontuados → (média−1)/4×100
--   - Crit = favorabilidade dos 8 critérios (sim=1/parcial=0.5/não=0; decisaoHumana invertido) /8×100
-- Blocos ausentes (sem benefícios pontuados / criterios null) SAEM do denominador
-- → row legada sem esses dados cai no score de Fatores (compat).
--
-- PARIDADE: espelha LITERALMENTE lib/opportunities/score.ts (calcPriorityScore).
-- Sub-scores são arredondados a inteiro ANTES do blend (round numeric = round-half-
-- away-from-zero = Math.round p/ positivos) → client ≡ SQL à unidade.
--
-- limites de prioridade INALTERADOS: alta>=70 / media 40–69 / baixa<40.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (NÃO db push).
-- Pré-requisitos: 0001..0026 aplicadas. Colar o conteúdo INTEIRO de uma vez.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- 1. DROP da view (único dependente da função de score).
drop view if exists opportunities_with_score;

-- 2. Helper de favorabilidade de critério (sim=1 / parcial=0.5 / não=0 na direção
--    favorável). p_favoravel = 'sim' (padrão) ou 'nao' (invertido: decisaoHumana).
create or replace function criterio_fav(p_val text, p_favoravel text)
  returns numeric language sql immutable as $$
  select case
    when p_val is null then 0
    when p_favoravel = 'nao' then
      (case p_val when 'nao' then 1 when 'parcial' then 0.5 else 0 end)
    else
      (case p_val when 'sim' then 1 when 'parcial' then 0.5 else 0 end)
  end::numeric;
$$;

-- 3. Nova opportunity_score (7 args) — blend 50/30/20 dos 3 blocos.
create or replace function opportunity_score(
  p_esforco effort_level, p_complexidade complexity_level,
  p_tempo frequency_bucket, p_objetivo smallint, p_fte fte_bucket,
  p_criterios jsonb, p_beneficios jsonb
) returns int language sql immutable as $$
  with fat as (
    select (
        case p_esforco when 'baixo' then 8 when 'medio' then 14 when 'alto' then 20 else 14 end
      + case p_complexidade when 'baixo' then 20 when 'medio' then 13 when 'alto' then 6 else 13 end
      + case p_tempo when 'diario' then 20 when 'semanal' then 16 when 'quinzenal' then 12
                     when 'mensal' then 8 when 'anual' then 2 else 16 end
      + case coalesce(p_objetivo,3) when 1 then 4 when 2 then 8 when 3 then 12 when 4 then 16 when 5 then 20 else 12 end
      + case p_fte when 'muito_baixo' then 4 when 'baixo' then 8 when 'medio' then 12
                   when 'alto' then 16 when 'muito_alto' then 20 else 12 end
    )::numeric as s
  ),
  ben_raw as (
    -- soma/contagem dos benefícios pontuados 1–5 (chaves camelCase).
    select
      count(*) filter (where val between 1 and 5) as n,
      coalesce(sum(val) filter (where val between 1 and 5), 0) as sm
    from (
      select case when jsonb_typeof(p_beneficios -> k) = 'number'
                  then (p_beneficios ->> k)::int else null end as val
      from unnest(array[
        'reducaoTempo','eliminacaoErros','produtividade','qualidadeDados',
        'reducaoCustos','reducaoRetrabalho','compliance','objetivosEstrategicos'
      ]) as k
      where p_beneficios is not null
    ) q
  ),
  ben as (
    -- sub-score 0–100 arredondado (ou null se nada pontuado).
    select case when n > 0 then round((25.0 * (sm - n)) / n) else null end as s
    from ben_raw
  ),
  crit as (
    select case when p_criterios is null then null
      else round(12.5 * (
          criterio_fav(p_criterios ->> 'causaReclamacoes', 'sim')
        + criterio_fav(p_criterios ->> 'totalmenteManual', 'sim')
        + criterio_fav(p_criterios ->> 'regrasClaras', 'sim')
        + criterio_fav(p_criterios ->> 'decisaoHumana', 'nao')
        + criterio_fav(p_criterios ->> 'padronizacaoDocs', 'sim')
        + criterio_fav(p_criterios ->> 'validacaoDados', 'sim')
        + criterio_fav(p_criterios ->> 'schedulable', 'sim')
        + criterio_fav(p_criterios ->> 'temDocumentacao', 'sim')
      )) end as s
  )
  select round(
    ( 5 * fat.s
      + coalesce(3 * ben.s, 0)
      + coalesce(2 * crit.s, 0)
    ) / (
      5
      + case when ben.s is not null then 3 else 0 end
      + case when crit.s is not null then 2 else 0 end
    )::numeric
  )::int
  from fat, ben, crit;
$$;

-- 4. DROP do overload antigo de 5 args (órfão — a view nova usa o de 7).
drop function if exists opportunity_score(
  effort_level, complexity_level, frequency_bucket, smallint, fte_bucket
);

-- 5. Recria a view usando a função de 7 args (mesmas colunas de 0019 + score/level).
create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- Smoke (após aplicar):
--   -- Fatores máx (100) sem ben/crit → 100 (só bloco Fatores no denominador):
--   select opportunity_score('alto','baixo','diario',5::smallint,'muito_alto',null,null); -- 100
--   -- Com critérios todos favoráveis (Crit=100) e benefícios todos 5 (Ben=100):
--   select opportunity_score('alto','baixo','diario',5::smallint,'muito_alto',
--     '{"causaReclamacoes":"sim","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"nao","padronizacaoDocs":"sim","validacaoDados":"sim","schedulable":"sim","temDocumentacao":"sim"}'::jsonb,
--     '{"reducaoTempo":5,"eliminacaoErros":5,"produtividade":5,"qualidadeDados":5,"reducaoCustos":5,"reducaoRetrabalho":5,"compliance":5,"objetivosEstrategicos":5}'::jsonb); -- 100
--   -- confere a view:
--   select id, score, priority_level from opportunities_with_score limit 5;
-- =============================================================================
