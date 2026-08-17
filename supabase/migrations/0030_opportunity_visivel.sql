-- =============================================================================
-- 0030_opportunity_visivel.sql — flag de visibilidade da oportunidade
-- =============================================================================
-- Adiciona `opportunities.visivel boolean not null default true`: quando false,
-- a oportunidade some das listagens do sistema sem ser deletada (soft-hide).
--
-- SEM UI POR ENQUANTO — decisão de produto (2026-07-29): a flag só é alterada
-- direto no banco, pelo dev. Por isso NÃO entra no payload do wizard nem no
-- update de `saveOpportunity` (actions.ts). Se um dia virar campo de tela, o
-- lugar é uma action própria com checagem de role, não o form genérico.
--
-- POR QUE RECRIAR A VIEW: `opportunities_with_score` é `select o.*`, e o `*` é
-- expandido no CREATE — uma view já existente NÃO enxerga colunas adicionadas
-- depois. Sem o DROP+CREATE abaixo a coluna existe na tabela mas não na view,
-- e o filtro do backend precisaria de uma segunda query na tabela base.
-- A definição é idêntica à de 0027 (função opportunity_score de 7 args); só
-- muda o conjunto de colunas herdado por `o.*`.
--
-- RLS: nada a fazer — a coluna vive na tabela já protegida; `visivel` NÃO é
-- controle de acesso (não substitui isolamento por tenant_id), é curadoria de
-- listagem. Um usuário com o id em mãos ainda enxerga a linha via RLS; o
-- backend é que filtra (ver lib/opportunities/queries.ts).
--
-- IDEMPOTENTE — seguro de re-rodar.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- ---------------------------------------------------------------------------
-- 1. Coluna (converge mesmo se já tiver sido criada à mão como nullable)
-- ---------------------------------------------------------------------------
alter table opportunities add column if not exists visivel boolean;
update opportunities set visivel = true where visivel is null;
alter table opportunities alter column visivel set default true;
alter table opportunities alter column visivel set not null;

comment on column opportunities.visivel is
  'Soft-hide: false remove a oportunidade das listagens. Alterada apenas via SQL (sem UI).';

-- Listagem sempre filtra por visivel = true; índice parcial cobre o caso comum
-- sem custo em tabela quase toda visível.
create index if not exists opportunities_visivel_idx
  on opportunities (tenant_id) where visivel;

-- ---------------------------------------------------------------------------
-- 2. Recria a view para que `o.*` passe a incluir `visivel`
-- ---------------------------------------------------------------------------
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
--   select column_name from information_schema.columns
--    where table_name = 'opportunities_with_score' and column_name = 'visivel'; -- 1 linha
--   -- esconder uma oportunidade:
--   update opportunities set visivel = false where seq_id = <n>;
--   -- deve sumir da listagem do app e voltar com:
--   update opportunities set visivel = true where seq_id = <n>;
-- =============================================================================
