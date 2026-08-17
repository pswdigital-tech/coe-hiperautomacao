-- =============================================================================
-- 0056_score_effort_inverted.sql — inverte o peso do fator Esforço no score
-- =============================================================================
-- Bug de produto encontrado 2026-08-14: o fator Esforço de Implementação estava
-- na direção ERRADA — esforço 'alto' valia 20 pts (o máximo) e 'baixo' valia 8
-- (o mínimo), quando deveria ser o oposto: quanto MENOR o esforço de
-- implementar, MAIOR a prioridade (mesma lógica já aplicada à Complexidade,
-- que já era invertida desde a 0011/0027). O próprio HelpGuide do wizard já
-- documentava a regra certa ("Esforço: menor esforço = prioridade maior"),
-- confirmando que era um bug, não uma decisão de produto.
--
-- Única mudança: o CASE de p_esforco em opportunity_score() (7 args, 0027)
-- troca de {baixo:8, medio:14, alto:20} para {baixo:20, medio:14, alto:8}.
-- Nada mais na fórmula muda — blend 50/30/20, sub-scores de benefícios/
-- critérios, limites de priority_level (alta>=70/media 40–69/baixa<40): tudo
-- INALTERADO. Espelha lib/opportunities/score.ts (calcScore) — PARIDADE.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (NÃO db
-- push). Pré-requisitos: 0001..0055 aplicadas. Colar o conteúdo INTEIRO de
-- uma vez.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- 1. DROP da view (único dependente da função de score).
drop view if exists opportunities_with_score;

-- 2. Recria opportunity_score (7 args) — só o CASE de p_esforco muda.
create or replace function opportunity_score(
  p_esforco effort_level, p_complexidade complexity_level,
  p_tempo frequency_bucket, p_objetivo smallint, p_fte fte_bucket,
  p_criterios jsonb, p_beneficios jsonb
) returns int language sql immutable as $$
  with fat as (
    select (
        case p_esforco when 'baixo' then 20 when 'medio' then 14 when 'alto' then 8 else 14 end
      + case p_complexidade when 'baixo' then 20 when 'medio' then 13 when 'alto' then 6 else 13 end
      + case p_tempo when 'diario' then 20 when 'semanal' then 16 when 'quinzenal' then 12
                     when 'mensal' then 8 when 'anual' then 2 else 16 end
      + case coalesce(p_objetivo,3) when 1 then 4 when 2 then 8 when 3 then 12 when 4 then 16 when 5 then 20 else 12 end
      + case p_fte when 'muito_baixo' then 4 when 'baixo' then 8 when 'medio' then 12
                   when 'alto' then 16 when 'muito_alto' then 20 else 12 end
    )::numeric as s
  ),
  ben_raw as (
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

-- 3. Recria a view (mesma definição de 0027 — só a função por trás mudou).
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
-- Verificação pós-apply (rodar depois de colar o bloco acima):
--
--   -- 1. Esforço BAIXO agora vale 20 (era 8) — score máximo com o resto no teto:
--   select opportunity_score('baixo','baixo','diario',5::smallint,'muito_alto',null,null); -- esperado: 100
--
--   -- 2. Esforço ALTO agora vale 8 (era 20) — mesmo caso com esforço alto cai p/ 88:
--   select opportunity_score('alto','baixo','diario',5::smallint,'muito_alto',null,null); -- esperado: 88
--
--   -- 3. Esforço MEDIO não muda (14 antes e depois):
--   select opportunity_score('medio','medio','mensal',3::smallint,'medio',null,null); -- esperado: 59
--
--   -- 4. View recalcula sozinha (nenhuma coluna persistida) — conferir algumas linhas:
--   select id, esforco, score, priority_level from opportunities_with_score limit 5;
-- =============================================================================
