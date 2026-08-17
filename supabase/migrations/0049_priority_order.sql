-- =============================================================================
-- 0049_priority_order.sql — ordem manual de prioridade (oportunidades e
-- tarefas) + tag de prioridade de tarefa/subtarefa
-- =============================================================================
-- CONTEXTO: até aqui a única "prioridade" do produto era DERIVADA — o
-- `priority_level` (alta/media/baixa) sai do score calculado, e o usuário não
-- tem como dizer "esta aqui vem antes daquela". Esta migration acrescenta a
-- ordem que a PESSOA monta, sem tocar em nada do que é calculado:
--
--   1. `opportunities.priority_order`      — ordem manual, ÚNICA POR TENANT.
--   2. `opportunity_tasks.priority`        — tag alta/media/baixa (input manual).
--   3. `opportunity_tasks.priority_order`  — ordem manual dentro da oportunidade.
--
-- NÃO CONFLITA COM docs/PROJETO.md §3 ("score é calculado, nunca persistido"): estas
-- colunas não são valor derivado nenhum — são input humano puro, que nenhuma
-- fórmula produz. `score`, `priority_level` e `rpa_score` continuam calculados
-- e não-persistidos exatamente como antes.
--
-- POR QUE UMA FUNÇÃO DE REORDENAÇÃO E NÃO UM UPDATE POR LINHA: arrastar um
-- card gera um novo ARRANJO, não uma nova posição isolada. Mandar N updates do
-- cliente (a) não é atômico — um erro no meio deixa a ordem corrompida, (b)
-- renumera com base num estado que o cliente talvez não enxergue inteiro (a
-- lista está filtrada). As duas funções abaixo recebem o array ORDENADO de
-- ids visíveis e resolvem isso no servidor com a mesma regra:
--
--   • monta a ordenação GLOBAL corrente do escopo (tenant / oportunidade);
--   • pega as POSIÇÕES (slots) hoje ocupadas pelos ids recebidos;
--   • redistribui essas mesmas posições entre eles, na nova ordem;
--   • renumera o escopo inteiro 1..N (mata os NULLs e os empates de uma vez).
--
-- Consequência desejada: arrastar dentro de uma lista FILTRADA reordena só
-- entre os visíveis — os itens escondidos não pulam para o topo nem afundam.
--
-- SEGURANÇA: as duas funções são `security invoker` (o DEFAULT — declarado
-- explicitamente aqui para não depender do default). Isso é deliberado e é o
-- oposto de `check_task_depth()`/`current_tenant_id()`: aquelas precisam
-- ENXERGAR além da RLS do chamador; estas precisam ser CONTIDAS por ela. Todo
-- SELECT e todo UPDATE aqui passa pelas policies de `opportunities` /
-- `opportunity_tasks` — um `viewer` não consegue escrever (as policies de
-- UPDATE exigem `current_user_role() <> 'viewer'`) e ninguém reordena linha de
-- outro tenant (um id de fora simplesmente não é encontrado). O gate de papel
-- em pt-BR na camada de action é conveniência de mensagem, não a defesa.
--
-- POR QUE RECRIAR A VIEW: `opportunities_with_score` é `select o.*`, e o `*` é
-- expandido no CREATE — uma view já existente NÃO enxerga colunas adicionadas
-- depois (mesma nota de 0030). Sem o DROP+CREATE abaixo, `priority_order`
-- existe na tabela mas não na view que o backend lê, e a ordenação manual
-- ficaria invisível. Definição idêntica à de 0030/0027 (função
-- `opportunity_score` de 7 args); só muda o conjunto herdado por `o.*`.
--
-- IDEMPOTENTE — seguro de re-rodar.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. opportunities.priority_order — ordem manual, única por tenant
-- -----------------------------------------------------------------------------
-- Nullable de propósito: uma oportunidade recém-criada ainda não foi colocada
-- em lugar nenhum pela pessoa. NULL ordena por último (`nulls last`) e some no
-- primeiro reorder do tenant, quando a função renumera o escopo inteiro.
alter table opportunities add column if not exists priority_order integer;

create index if not exists opportunities_priority_order_idx
  on opportunities(tenant_id, priority_order);

-- -----------------------------------------------------------------------------
-- 2. Enum task_priority + colunas de opportunity_tasks
-- -----------------------------------------------------------------------------
-- 3 valores, MESMO vocabulário de `priority_level` das oportunidades
-- (alta/media/baixa) — não o de 4 de `opportunity_risks.priority`
-- (critica/alta/media/baixa). Duas escalas de prioridade no mesmo produto já
-- é o limite; três seria vocabulário demais para o mesmo conceito.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type task_priority as enum ('alta', 'media', 'baixa');
  end if;
end $$;

-- `not null default 'media'`: toda tarefa nasce com prioridade, incluindo as
-- que já existem (o default preenche o backfill). Ao contrário de
-- `opportunity_risks.priority`, esta coluna é INPUT MANUAL — não é GENERATED,
-- não deriva de matriz nenhuma.
alter table opportunity_tasks
  add column if not exists priority task_priority not null default 'media';

alter table opportunity_tasks add column if not exists priority_order integer;

create index if not exists opportunity_tasks_priority_order_idx
  on opportunity_tasks(opportunity_id, priority_order);

-- -----------------------------------------------------------------------------
-- 3. set_opportunity_priority_order(uuid[]) — reordena oportunidades
-- -----------------------------------------------------------------------------
-- Recebe os ids VISÍVEIS já na ordem desejada. Devolve o número de linhas
-- renumeradas (o escopo inteiro do tenant, não só os recebidos).
create or replace function set_opportunity_priority_order(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_updated integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  -- Tenant do escopo, lido através da RLS: um id que o chamador não enxerga
  -- não devolve linha nenhuma e a função sai sem escrever nada.
  select tenant_id into v_tenant from opportunities where id = p_ids[1];
  if v_tenant is null then
    return 0;
  end if;

  with
  -- (a) ordenação global corrente do tenant — a mesma que a listagem usa no
  --     modo manual: priority_order asc (nulls last), depois seq_id.
  ranked as (
    select o.id,
           row_number() over (order by o.priority_order nulls last, o.seq_id) as rn
    from opportunities o
    where o.tenant_id = v_tenant
  ),
  -- (b) os ids recebidos, na ordem em que a pessoa os deixou.
  -- `row_number()` em vez do `ord` cru do unnest: se algum id enviado não for
  -- visível para o chamador (id inventado, cross-tenant), o filtro abaixo o
  -- descarta e a ordinalidade original ficaria com BURACOS — o join com
  -- `slots` (sempre 1..M contíguo) deixaria ids sem posição, e a renumeração
  -- devolveria empates. Renumerar aqui fecha isso.
  wanted as (
    select t.id, row_number() over (order by t.ord) as ord
    from unnest(p_ids) with ordinality as t(id, ord)
    where exists (select 1 from ranked r where r.id = t.id)
  ),
  -- (c) as posições que esses ids ocupam hoje, em ordem crescente.
  slots as (
    select r.rn, row_number() over (order by r.rn) as slot_ord
    from ranked r
    join wanted w on w.id = r.id
  ),
  -- (d) k-ésimo id recebido → k-ésima posição livre. Quem não foi arrastado
  --     mantém a sua.
  final as (
    select r.id,
           coalesce(
             (select s.rn
                from wanted w2
                join slots s on s.slot_ord = w2.ord
               where w2.id = r.id),
             r.rn
           ) as new_rn
    from ranked r
  )
  update opportunities o
     set priority_order = f.new_rn
    from final f
   where o.id = f.id
     and o.priority_order is distinct from f.new_rn;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function set_opportunity_priority_order(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. set_task_priority_order(uuid, uuid[]) — reordena tarefas de UMA oportunidade
-- -----------------------------------------------------------------------------
-- Mesma mecânica de slots, escopo = a oportunidade. A hierarquia de 2 níveis
-- (D-01) sobrevive sem tratamento especial: a UI só arrasta dentro de um mesmo
-- grupo de irmãos (raízes entre raízes, filhas entre filhas da mesma pai), e a
-- regra de slots preserva as posições de todo mundo que não foi arrastado.
create or replace function set_task_priority_order(
  p_opportunity_id uuid,
  p_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  with
  ranked as (
    select t.id,
           row_number() over (order by t.priority_order nulls last, t.created_at) as rn
    from opportunity_tasks t
    where t.opportunity_id = p_opportunity_id
  ),
  -- `row_number()` em vez do `ord` cru do unnest: se algum id enviado não for
  -- visível para o chamador (id inventado, cross-tenant), o filtro abaixo o
  -- descarta e a ordinalidade original ficaria com BURACOS — o join com
  -- `slots` (sempre 1..M contíguo) deixaria ids sem posição, e a renumeração
  -- devolveria empates. Renumerar aqui fecha isso.
  wanted as (
    select t.id, row_number() over (order by t.ord) as ord
    from unnest(p_ids) with ordinality as t(id, ord)
    where exists (select 1 from ranked r where r.id = t.id)
  ),
  slots as (
    select r.rn, row_number() over (order by r.rn) as slot_ord
    from ranked r
    join wanted w on w.id = r.id
  ),
  final as (
    select r.id,
           coalesce(
             (select s.rn
                from wanted w2
                join slots s on s.slot_ord = w2.ord
               where w2.id = r.id),
             r.rn
           ) as new_rn
    from ranked r
  )
  update opportunity_tasks t
     set priority_order = f.new_rn
    from final f
   where t.id = f.id
     and t.priority_order is distinct from f.new_rn;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function set_task_priority_order(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Recria a view para que `o.*` passe a incluir `priority_order`
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
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- Smoke (após aplicar):
--   select column_name from information_schema.columns
--    where table_name = 'opportunities_with_score' and column_name = 'priority_order'; -- 1 linha
--   select column_name, data_type from information_schema.columns
--    where table_name = 'opportunity_tasks' and column_name in ('priority','priority_order');
--   -- reordenar (logado como usuário do tenant, no app ou via PostgREST):
--   select set_opportunity_priority_order(array[
--     '<id-que-vem-primeiro>'::uuid, '<id-que-vem-depois>'::uuid
--   ]);
--   select seq_id, priority_order from opportunities order by priority_order nulls last, seq_id;
--   -- isolamento: id de outro tenant devolve 0 e não escreve nada.
-- =============================================================================
