-- =============================================================================
-- 0061_opportunity_objetivo_projeto.sql — objetivo do projeto (texto)
-- =============================================================================
-- CONTEXTO: a seção "Visão Geral" do detalhe abre com uma frase que responde
-- "para que este projeto existe", em linguagem de negócio. Não existia campo
-- para isso.
--
-- CUIDADO COM O NOME: a coluna `objetivo` JÁ EXISTE e é OUTRA COISA — um
-- smallint 1..5 de alinhamento estratégico, um dos 5 fatores do score
-- (opportunity_score(), 0027/0056). Por isso a coluna nova se chama
-- `objetivo_projeto`. Não renomear nem fundir: são dados de naturezas
-- diferentes (texto editorial × fator numérico de priorização).
--
-- POR QUE A VIEW É RECRIADA (a parte que erra em silêncio se esquecida):
-- `opportunities_with_score` foi criada como `select o.*, ...`. O Postgres
-- EXPANDE o `*` no momento da criação e congela a lista de colunas — adicionar
-- coluna na tabela NÃO a faz aparecer na view. Sem o bloco 2 abaixo, a coluna
-- existe em `opportunities`, o `alter table` acusa sucesso, e todo o app (que
-- lê da VIEW) quebra com "column opportunities_with_score.objetivo_projeto
-- does not exist". É por isso que 0049, 0050, 0055 e 0056 também derrubam e
-- recriam a view — este arquivo segue o mesmo padrão.
--
-- `create or replace view` NÃO serve aqui: a coluna nova entra no meio da
-- lista (antes de `score`/`priority_level`, que são as duas últimas), e o
-- replace só admite acrescentar colunas no FIM. Daí o drop + create.
--
-- Sem default e nullable: as oportunidades já cadastradas nascem sem objetivo e
-- a UI mostra o estado vazio convidando a preencher. Preencher em massa por
-- migration inventaria conteúdo.
--
-- RLS: nenhuma policy nova. É coluna de `opportunities`, coberta pelas policies
-- existentes da tabela (0015/0021/0040/0044/0046/0047). A view continua
-- `security_invoker = true`, então herda a RLS da tabela como sempre.
--
-- Auditoria: a trigger `audit_trigger()` (0038) é genérica por coluna — a
-- mudança deste campo passa a aparecer no Histórico sem alteração lá.
--
-- Pré-requisitos: 0001, 0011, 0027, 0056 (a definição da view recriada abaixo
-- é literalmente a de 0056 — se alguma migration entre 0056 e esta mexer na
-- view, REVER este bloco antes de aplicar).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Coluna
-- -----------------------------------------------------------------------------
alter table opportunities
  add column if not exists objetivo_projeto text;

-- Teto de tamanho espelhando os demais campos de texto longo do schema
-- (`notas`, `beneficio_qualitativo`: 2000 no Zod). Null passa.
alter table opportunities
  drop constraint if exists opportunities_objetivo_projeto_len_chk;

alter table opportunities
  add constraint opportunities_objetivo_projeto_len_chk
  check (objetivo_projeto is null or length(objetivo_projeto) <= 2000);

comment on column opportunities.objetivo_projeto is
  'Objetivo do projeto em linguagem de negócio (texto livre, exibido na Visão Geral). NÃO confundir com `objetivo` (smallint 1..5, alinhamento estratégico, fator do score).';

-- -----------------------------------------------------------------------------
-- 2. View — recriada para enxergar a coluna nova (ver nota no cabeçalho)
-- -----------------------------------------------------------------------------
-- Definição IDÊNTICA à de 0056: só a expansão de `o.*` muda, porque a tabela
-- ganhou uma coluna. Nem a função de score nem os cortes de faixa mudam aqui.
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

-- O grant vai junto com o drop da view — reemitir é obrigatório, não opcional.
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APPLY — rodar as 4 e conferir cada resultado
-- =============================================================================
-- -- 1. A coluna existe na TABELA (1 linha: text / YES):
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'opportunities' and column_name = 'objetivo_projeto';
--
-- -- 2. A coluna existe na VIEW — este é o teste que a versão anterior desta
-- --    migration não fazia, e por isso o app quebrou (1 linha esperada):
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'opportunities_with_score' and column_name = 'objetivo_projeto';
--
-- -- 3. A coluna antiga continua intocada (smallint):
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'opportunities' and column_name = 'objetivo';
--
-- -- 4. A view continua calculando score e devolvendo linhas:
-- select id, seq_id, objetivo, objetivo_projeto, score, priority_level
--   from opportunities_with_score limit 5;

-- =============================================================================
-- ROLLBACK — derrubar a view ANTES de dropar a coluna, e recriá-la depois
-- =============================================================================
-- drop view if exists opportunities_with_score;
-- alter table opportunities drop constraint if exists opportunities_objetivo_projeto_len_chk;
-- alter table opportunities drop column if exists objetivo_projeto;
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
-- FIM 0061
-- =============================================================================
