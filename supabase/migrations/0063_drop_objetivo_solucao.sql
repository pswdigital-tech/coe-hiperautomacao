-- =============================================================================
-- 0063_drop_objetivo_solucao.sql — desfaz `objetivo_solucao` da 0062
-- =============================================================================
-- DECISÃO DE PRODUTO (PO, 2026-08-19): "objetivo da solução" e "objetivo do
-- projeto" são A MESMA COISA. A 0062 criou `objetivo_solucao` partindo da
-- premissa de que eram dois textos distintos — por que o projeto existe × o
-- que a automação faz. Não são: quem escreve preenche uma vez só, e dois
-- campos separados garantiriam divergência entre a Visão Geral e a Solução.
--
-- A coluna é removida em vez de virar espelho: duas colunas com o mesmo
-- conteúdo precisariam de trigger de sincronia e ainda assim divergiriam em
-- qualquer escrita que escapasse dela. Fonte única = `objetivo_projeto`
-- (0061), exibido e editável nas DUAS seções.
--
-- Sem perda de dado: a 0062 foi aplicada nesta sessão e nenhuma escrita
-- chegou a preencher a coluna (a UI que a alimentava nasce e morre com este
-- par de migrations). Ainda assim, o bloco de verificação abaixo confirma
-- isso ANTES do drop — não confie na cronologia, confira.
--
-- `fora_escopo` e `criterios_aceite` (0062) FICAM. Só `objetivo_solucao` sai.
--
-- A view é derrubada e recriada porque `select o.*` a torna dependente da
-- coluna: sem o drop da view, o `alter table ... drop column` falha com
-- "cannot drop column ... because other objects depend on it".
--
-- Pré-requisitos: 0061, 0062 (aplicadas).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 0. CONFERIR ANTES DE APLICAR — rode esta linha sozinha primeiro.
--    Esperado: 0. Se vier > 0, PARE: existe conteúdo que seria perdido, e o
--    caminho passa a ser migrar o texto para `objetivo_projeto` antes do drop.
-- -----------------------------------------------------------------------------
-- select count(*) from opportunities
--  where objetivo_solucao is not null and btrim(objetivo_solucao) <> '';

-- -----------------------------------------------------------------------------
-- 1. View sai (depende da coluna)
-- -----------------------------------------------------------------------------
drop view if exists opportunities_with_score;

-- -----------------------------------------------------------------------------
-- 2. Coluna e constraint saem
-- -----------------------------------------------------------------------------
alter table opportunities
  drop constraint if exists opportunities_objetivo_solucao_len_chk;

alter table opportunities
  drop column if exists objetivo_solucao;

-- -----------------------------------------------------------------------------
-- 3. View volta — mesma definição de 0062 menos a coluna removida
-- -----------------------------------------------------------------------------
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
-- VERIFICAÇÃO PÓS-APPLY
-- =============================================================================
-- -- 1. A coluna sumiu da tabela E da view (0 linhas):
-- select table_name, column_name from information_schema.columns
--  where column_name = 'objetivo_solucao';
--
-- -- 2. O que devia ficar continua lá (3 linhas: objetivo_projeto, fora_escopo,
-- --    criterios_aceite):
-- select column_name from information_schema.columns
--  where table_name = 'opportunities_with_score'
--    and column_name in ('objetivo_projeto','fora_escopo','criterios_aceite');
--
-- -- 3. A view continua devolvendo linhas com score:
-- select id, seq_id, objetivo_projeto, score from opportunities_with_score limit 5;

-- =============================================================================
-- ROLLBACK — recria a coluna vazia (o conteúdo, se houvesse, não volta)
-- =============================================================================
-- drop view if exists opportunities_with_score;
-- alter table opportunities add column if not exists objetivo_solucao text;
-- alter table opportunities add constraint opportunities_objetivo_solucao_len_chk
--   check (objetivo_solucao is null or length(objetivo_solucao) <= 2000);
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
-- FIM 0063
-- =============================================================================
