-- =============================================================================
-- 0062_opportunity_solucao_fields.sql — campos da seção "Solução"
-- =============================================================================
-- CONTEXTO: a seção Solução responde "o que será construído". Três coisas que
-- ela precisa dizer não tinham campo nenhum:
--   • objetivo_solucao  — o que a automação FAZ, em linguagem de negócio.
--     Distinto de `objetivo_projeto` (0061), que diz por que o projeto existe,
--     e de `objetivo` (smallint 1..5), que é fator de score. São três coisas
--     diferentes com nomes parecidos — não fundir.
--   • fora_escopo       — o que explicitamente NÃO será feito. É o campo que
--     mais evita conflito com o cliente, e o contraponto de `escopo_automacao`.
--   • criterios_aceite  — o que precisa ser verdade para a entrega ser aceita.
--
-- Os dois arrays espelham a forma de `escopo_automacao` (0001): `text[] not
-- null default '{}'`, para que a UI nunca precise tratar null e array vazio
-- como coisas diferentes.
--
-- A VIEW É RECRIADA — mesma razão da 0061, e a lição que ela custou:
-- `opportunities_with_score` foi criada como `select o.*`, o Postgres expande
-- o `*` na criação e CONGELA a lista. Sem o bloco 2 o `alter table` acusa
-- sucesso e o app inteiro quebra com "column ... does not exist", porque tudo
-- lê da view. `create or replace view` não serve: as colunas novas entram
-- antes de `score`/`priority_level` e o replace só admite acrescentar no fim.
--
-- RLS: nenhuma policy nova — são colunas de `opportunities`, cobertas pelas
-- policies existentes. Auditoria: a trigger `audit_trigger()` (0038) é
-- genérica por coluna; as mudanças aparecem no Histórico sem alteração lá.
--
-- Pré-requisitos: 0001, 0011, 0027, 0056, 0061 (a view recriada abaixo é a de
-- 0061 mais as três colunas novas).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------
alter table opportunities
  add column if not exists objetivo_solucao text,
  add column if not exists fora_escopo      text[] not null default '{}',
  add column if not exists criterios_aceite text[] not null default '{}';

alter table opportunities
  drop constraint if exists opportunities_objetivo_solucao_len_chk;

alter table opportunities
  add constraint opportunities_objetivo_solucao_len_chk
  check (objetivo_solucao is null or length(objetivo_solucao) <= 2000);

comment on column opportunities.objetivo_solucao is
  'O que a automação faz, em linguagem de negócio (seção Solução). NÃO confundir com `objetivo_projeto` (por que o projeto existe) nem com `objetivo` (smallint 1..5, fator do score).';
comment on column opportunities.fora_escopo is
  'O que explicitamente NÃO será feito. Contraponto de `escopo_automacao`.';
comment on column opportunities.criterios_aceite is
  'Condições verificáveis para a entrega ser aceita.';

-- -----------------------------------------------------------------------------
-- 2. View — recriada para enxergar as colunas novas (ver nota no cabeçalho)
-- -----------------------------------------------------------------------------
drop view if exists opportunities_with_score;

create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;

-- O grant cai junto com o drop da view — reemitir é obrigatório.
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APPLY — rodar as 3 e conferir cada resultado
-- =============================================================================
-- -- 1. As três colunas existem na TABELA (3 linhas):
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_name = 'opportunities'
--    and column_name in ('objetivo_solucao','fora_escopo','criterios_aceite');
--
-- -- 2. E na VIEW — o teste que a 0061 ensinou a não esquecer (3 linhas):
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'opportunities_with_score'
--    and column_name in ('objetivo_solucao','fora_escopo','criterios_aceite');
--
-- -- 3. A view continua calculando e devolvendo linhas:
-- select id, seq_id, objetivo_solucao, fora_escopo, criterios_aceite, score
--   from opportunities_with_score limit 5;

-- =============================================================================
-- ROLLBACK — derrubar a view ANTES de dropar as colunas, e recriá-la depois
-- =============================================================================
-- drop view if exists opportunities_with_score;
-- alter table opportunities drop constraint if exists opportunities_objetivo_solucao_len_chk;
-- alter table opportunities
--   drop column if exists objetivo_solucao,
--   drop column if exists fora_escopo,
--   drop column if exists criterios_aceite;
-- create view opportunities_with_score with (security_invoker = true) as
-- select o.*,
--   opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
--   case
--     when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
--     when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
--     else 'baixa'
--   end as priority_level
-- from opportunities o;
-- grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- FIM 0062
-- =============================================================================
