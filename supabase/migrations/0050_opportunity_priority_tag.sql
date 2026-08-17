-- =============================================================================
-- 0050_opportunity_priority_tag.sql — tag de prioridade MANUAL da oportunidade
-- =============================================================================
-- CONTEXTO: a oportunidade já tem uma prioridade — `priority_level`
-- (alta/media/baixa), DERIVADA do score pela view `opportunities_with_score`.
-- Ela responde "o quanto este processo pontua na régua do CoE". O que faltava
-- é a outra pergunta, que nenhuma fórmula responde: "o quanto ESTA empresa
-- quer isto agora". A 0049 trouxe essa resposta para tarefas (coluna
-- `opportunity_tasks.priority`); esta migration traz para a oportunidade.
--
-- AS DUAS CONVIVEM, POR DECISÃO DE PRODUTO (2026-08-07): `priority_tag` NÃO
-- sobrepõe nem substitui `priority_level`. Na tela são duas coisas com nomes
-- distintos — "Score/Prioridade calculada" e "Prioridade" (a manual) — e dois
-- filtros independentes. Quem quiser a régua objetiva continua tendo; quem
-- quiser dizer "esta é alta porque o diretor pediu" agora também tem.
--
-- NÃO CONFLITA COM docs/PROJETO.md §3: `priority_tag` não é valor derivado nenhum —
-- é input humano, como `status` ou `criticidade`. `score`, `priority_level` e
-- `rpa_score` continuam calculados e não-persistidos.
--
-- NULLABLE, SEM DEFAULT — e é aqui que esta coluna difere de
-- `opportunity_tasks.priority` (`not null default 'media'`). Uma tarefa nasce
-- de alguém que está planejando a execução e já tem uma opinião; uma
-- oportunidade nasce do FORMULÁRIO PÚBLICO, preenchido por quem nem sabe que
-- existe uma fila. Carimbar 'media' em todas seria inventar uma classificação
-- que ninguém fez e destruir a distinção entre "é média" e "ninguém olhou
-- ainda". NULL = não classificada; a UI mostra "—".
--
-- POR QUE UM ENUM NOVO E NÃO `task_priority`: os valores são os mesmos
-- (alta/media/baixa), mas um tipo chamado `task_priority` numa coluna de
-- `opportunities` mente sobre o próprio domínio, e amarraria as duas escalas —
-- acrescentar 'urgente' só para tarefas passaria a exigir mexer nas duas. O
-- custo de dois enums idênticos é uma linha de catálogo; o de um tipo com nome
-- errado se paga todo mês.
--
-- A ORDEM DE DECLARAÇÃO É SEMÂNTICA: `alta < media < baixa` no enum, então
-- `order by priority_tag asc` já devolve as altas primeiro, sem CASE nenhum no
-- backend. `nulls last` põe as não-classificadas no fim.
--
-- POR QUE RECRIAR A VIEW: `opportunities_with_score` é `select o.*` e o `*` é
-- expandido no CREATE — uma view já existente NÃO enxerga colunas novas (mesma
-- nota de 0030/0049). Definição idêntica à da 0049; só muda o conjunto
-- herdado por `o.*`.
--
-- IDEMPOTENTE — seguro de re-rodar. Pré-requisito: 0049.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Enum manual_priority
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'manual_priority') then
    create type manual_priority as enum ('alta', 'media', 'baixa');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Coluna priority_tag — nullable, sem default (ver header)
-- -----------------------------------------------------------------------------
alter table opportunities
  add column if not exists priority_tag manual_priority;

-- Índice por tenant: o filtro e a ordenação por tag são sempre dentro de um
-- tenant (a RLS garante isso), mesma forma do índice de `priority_order`.
create index if not exists opportunities_priority_tag_idx
  on opportunities(tenant_id, priority_tag);

-- -----------------------------------------------------------------------------
-- 3. Recria a view para que `o.*` passe a incluir `priority_tag`
-- -----------------------------------------------------------------------------
-- RLS: nada a fazer. A coluna vive na tabela já protegida, e escrever nela
-- passa pela policy de UPDATE de `opportunities` — a mesma que já barra
-- `viewer` e cross-tenant hoje. Não há função nova aqui: a tag é um UPDATE de
-- campo único (ao contrário da ORDEM, que precisa de renumeração atômica e por
-- isso ganhou RPC na 0049).
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
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- Smoke (após aplicar):
--   select column_name, data_type, udt_name, is_nullable
--     from information_schema.columns
--    where table_name = 'opportunities' and column_name = 'priority_tag';
--   -- a view enxerga a coluna nova:
--   select column_name from information_schema.columns
--    where table_name = 'opportunities_with_score' and column_name = 'priority_tag'; -- 1 linha
--   -- a ordem do enum já ordena "alta primeiro", sem CASE:
--   select seq_id, priority_tag from opportunities
--    order by priority_tag asc nulls last, seq_id;
--   -- as duas prioridades convivem e são independentes:
--   select seq_id, score, priority_level, priority_tag from opportunities_with_score limit 5;
-- =============================================================================
