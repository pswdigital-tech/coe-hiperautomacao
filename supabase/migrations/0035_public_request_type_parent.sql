-- =============================================================================
-- 0035_public_request_type_parent.sql — tipo de solicitação + projeto associado
-- =============================================================================
-- CONTEXTO: o formulário público (`/r/<slug>`) sempre gravou
-- `request_type = 'nova_oportunidade'` (o step de Classificação existia só no
-- mode='edit' do modal). Decisão de produto (2026-07-31): o público passa a
-- ESCOLHER o tipo logo na entrada — Nova Oportunidade / Melhoria / Incidente /
-- Treinamento (o 5º valor do enum, `duvidas_terceiros`, continua existindo mas
-- fica fora do formulário público).
--
-- Para Melhoria e Incidente a pessoa precisa dizer QUAL automação já existente
-- está falando. Modelamos isso como AUTO-REFERÊNCIA em `opportunities`
-- (`parent_opportunity_id`) em vez de uma tabela `projects` nova: o "projeto" é
-- a oportunidade que já virou automação. Ganha-se de graça o "quais incidentes
-- esta automação já teve" e não se cria CRUD nenhum.
--
-- O QUE ESTA MIGRATION FAZ
--   1. Coluna `parent_opportunity_id` (self-FK, ON DELETE SET NULL) + índice.
--   2. Recria `opportunities_with_score` — `select o.*` é expandido no CREATE,
--      então view existente NÃO enxerga coluna nova (mesma nota de 0030).
--   3. Nova RPC pública `fetch_public_opportunities(slug)` — a lista de
--      automações que o formulário anônimo oferece no seletor.
--   4. `create_public_opportunity` ganha `p_parent_opportunity_id`.
--
-- ⚠️ SUPERSEDED EM PARTE POR 0036: o filtro de `status` do item 3 (descrito
-- abaixo) zerava a lista na base real — o pipeline não usa esses status. 0036
-- faz `create or replace` da mesma função deixando só `visivel`. Leia 0036 para
-- o comportamento vigente do seletor público.
--
-- ⚠️ EXPOSIÇÃO DE DADOS (ler antes de aplicar): o item 3 abre, para QUALQUER UM
-- que tenha o link público, a lista de processos automatizados da empresa. É
-- dado novo saindo — os outros RPCs públicos só devolviam nome/slug/branding.
-- Mitigações embutidas: só tenant ativo, só `visivel`, `processo` truncado em
-- 160 chars, e SÓ status de automação que de fato existe (desenvolvimento,
-- homologacao, producao, concluido) — ideias em triagem ('novo', 'em_analise',
-- 'planejamento', 'backlog') NÃO vazam. Sem e-mail, sem solicitante, sem score.
-- Se ainda assim for demais para algum tenant, o caminho é uma flag por tenant
-- (ex. `tenants.public_projects_enabled`) — não implementada aqui.
--
-- `parent_opportunity_id` é validado contra o MESMO tenant dentro da RPC: id de
-- outra empresa (ou inexistente) é descartado silenciosamente → null. Assim o
-- campo nunca vira vetor de vínculo cross-tenant.
--
-- IDEMPOTENTE. Pré-requisitos: 0001..0034 aplicadas.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor, colando o
-- conteúdo INTEIRO de uma vez, ANTES de deployar o app (a app passa a chamar o
-- overload de 29 params).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Coluna de auto-referência
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists parent_opportunity_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_parent_fk'
  ) then
    alter table opportunities
      add constraint opportunities_parent_fk
      foreign key (parent_opportunity_id) references opportunities(id)
      on delete set null;
  end if;
end$$;

comment on column opportunities.parent_opportunity_id is
  'Automação (outra opportunity) a que esta solicitação se refere. Preenchida quando request_type é melhoria_automacao ou incidente. Mesmo tenant — validado na RPC pública e no app.';

create index if not exists opportunities_parent_idx
  on opportunities (parent_opportunity_id)
  where parent_opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Recria a view para que `o.*` inclua parent_opportunity_id
--    (definição idêntica à de 0030 — muda só o conjunto herdado por `o.*`)
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

-- ---------------------------------------------------------------------------
-- 3. RPC pública — automações que o seletor do formulário oferece
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER pelo mesmo motivo de `fetch_public_tenant` (0005/0034): o
-- role `anon` não passa pelo RLS de `opportunities` (current_tenant_id() é null
-- sem sessão). Esta função é a ÚNICA porta, e devolve um recorte mínimo.
drop function if exists public.fetch_public_opportunities(text);

create function public.fetch_public_opportunities(p_slug text)
returns table (
  id uuid,
  seq_id int,
  processo text,
  area text
)
language sql
security definer
stable
set search_path = public
as $$
  select o.id,
         o.seq_id,
         left(o.processo, 160) as processo,
         o.area
    from opportunities o
    join tenants t on t.id = o.tenant_id
   where t.slug = p_slug
     and t.status = 'active'
     and o.visivel
     and o.status in ('desenvolvimento', 'homologacao', 'producao', 'concluido')
   order by o.seq_id desc
   limit 300;
$$;

grant execute on function public.fetch_public_opportunities(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_public_opportunity + p_parent_opportunity_id (29º param)
-- ---------------------------------------------------------------------------
-- Mesma abordagem de 0026: DROP do overload de 28 + CREATE do de 29 (o novo
-- param com DEFAULT null → forward-compatível). Corpo idêntico ao de 0026,
-- somando a validação do parent e a coluna no INSERT.
drop function if exists public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text,
  jsonb, jsonb, numeric, text, text, text, int
);

create or replace function public.create_public_opportunity(
  p_tenant_slug text,
  p_solicitante text,
  p_email text,
  p_area text,
  p_subarea text,
  p_processo text,
  p_frequencia text,
  p_volume_medio text,
  p_tempo_execucao text,
  p_num_pessoas text,
  p_ferramenta text,
  p_escopo_automacao text[],
  p_beneficios_esperados text[],
  p_esforco text,
  p_complexidade text,
  p_tempo text,
  p_objetivo smallint,
  p_formulario_extras jsonb,
  p_request_type text default 'nova_oportunidade'::text,
  p_observacao text default null::text,
  p_risco text default null::text,
  p_criterios jsonb default null::jsonb,
  p_beneficios jsonb default null::jsonb,
  p_fte_horas numeric default null::numeric,
  p_fte text default null::text,
  p_responsavel text default null::text,
  p_criticidade text default null::text,
  p_execucoes_mes int default null::int,
  -- ── novo (0035): automação a que a solicitação se refere ──
  p_parent_opportunity_id uuid default null::uuid
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_tenant_id    uuid;
  v_opp_id       uuid;
  v_item         text;
  v_request_type opportunity_request_type;
  v_parent_id    uuid;
begin
  -- =====================================================================
  -- Length / array / jsonb limits
  -- =====================================================================
  if length(coalesce(p_solicitante, '')) > 200 then
    raise exception 'solicitante excede 200 caracteres';
  end if;
  if length(coalesce(p_email, '')) > 200 then
    raise exception 'email excede 200 caracteres';
  end if;
  if length(coalesce(p_area, '')) > 200 then
    raise exception 'área excede 200 caracteres';
  end if;
  if length(coalesce(p_subarea, '')) > 200 then
    raise exception 'subárea excede 200 caracteres';
  end if;
  if length(coalesce(p_processo, '')) > 2000 then
    raise exception 'processo excede 2000 caracteres';
  end if;
  if length(coalesce(p_frequencia, '')) > 60 then
    raise exception 'frequência excede 60 caracteres';
  end if;
  if length(coalesce(p_volume_medio, '')) > 60 then
    raise exception 'volume médio excede 60 caracteres';
  end if;
  if length(coalesce(p_tempo_execucao, '')) > 60 then
    raise exception 'tempo de execução excede 60 caracteres';
  end if;
  if length(coalesce(p_num_pessoas, '')) > 60 then
    raise exception 'número de pessoas excede 60 caracteres';
  end if;
  if length(coalesce(p_observacao, '')) > 2000 then
    raise exception 'observacao excede 2000 caracteres';
  end if;
  if length(coalesce(p_risco, '')) > 2000 then
    raise exception 'risco excede 2000 caracteres';
  end if;
  if length(coalesce(p_responsavel, '')) > 200 then
    raise exception 'responsavel excede 200 caracteres';
  end if;

  if coalesce(array_length(p_escopo_automacao, 1), 0) > 20 then
    raise exception 'escopo_automacao excede 20 itens';
  end if;
  if p_escopo_automacao is not null then
    foreach v_item in array p_escopo_automacao loop
      if length(coalesce(v_item, '')) > 200 then
        raise exception 'item de escopo excede 200 caracteres';
      end if;
    end loop;
  end if;

  if coalesce(array_length(p_beneficios_esperados, 1), 0) > 20 then
    raise exception 'beneficios_esperados excede 20 itens';
  end if;
  if p_beneficios_esperados is not null then
    foreach v_item in array p_beneficios_esperados loop
      if length(coalesce(v_item, '')) > 200 then
        raise exception 'item de benefícios excede 200 caracteres';
      end if;
    end loop;
  end if;

  if p_formulario_extras is not null
     and length(p_formulario_extras::text) > 8192 then
    raise exception 'formulario_extras excede 8KB';
  end if;
  if p_criterios is not null and length(p_criterios::text) > 4096 then
    raise exception 'criterios excede 4KB';
  end if;
  if p_beneficios is not null and length(p_beneficios::text) > 4096 then
    raise exception 'beneficios excede 4KB';
  end if;
  if p_execucoes_mes is not null and p_execucoes_mes < 0 then
    raise exception 'execucoes_mes não pode ser negativo';
  end if;

  -- =====================================================================
  -- Validações originais
  -- =====================================================================
  if p_solicitante is null or length(trim(p_solicitante)) < 2 then
    raise exception 'Nome do solicitante é obrigatório';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  if p_area is null or length(trim(p_area)) < 2 then
    raise exception 'Área é obrigatória';
  end if;
  if p_processo is null or length(trim(p_processo)) < 3 then
    raise exception 'Descrição do processo é obrigatória';
  end if;
  if p_objetivo is null or p_objetivo < 1 or p_objetivo > 5 then
    raise exception 'Alinhamento estratégico deve estar entre 1 e 5';
  end if;

  -- request_type → enum, com fallback seguro
  if p_request_type in (
    'nova_oportunidade','melhoria_automacao','duvidas_terceiros',
    'incidente','treinamento'
  ) then
    v_request_type := p_request_type::opportunity_request_type;
  else
    v_request_type := 'nova_oportunidade';
  end if;

  -- =====================================================================
  -- Resolve tenant + INSERT
  -- =====================================================================
  select id into v_tenant_id
    from tenants
   where slug = p_tenant_slug and status = 'active'
   limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant não encontrado ou inativo';
  end if;

  -- parent: só sobrevive se existir E for do MESMO tenant. Id alheio/inválido
  -- vira null (silencioso de propósito — não damos ao anônimo um oráculo que
  -- confirme "este uuid existe na empresa X").
  if p_parent_opportunity_id is not null then
    select id into v_parent_id
      from opportunities
     where id = p_parent_opportunity_id
       and tenant_id = v_tenant_id
     limit 1;
  end if;

  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao, risco,
    criterios, beneficios, fte_horas, fte, responsavel, criticidade, execucoes_mes,
    parent_opportunity_id
  ) values (
    v_tenant_id, 'formulario', v_request_type,
    trim(p_solicitante), trim(p_email),
    trim(p_area), nullif(trim(coalesce(p_subarea,'')),''),
    trim(p_processo), nullif(trim(coalesce(p_frequencia,'')),''),
    nullif(trim(coalesce(p_volume_medio,'')),''),
    nullif(trim(coalesce(p_tempo_execucao,'')),''),
    nullif(trim(coalesce(p_num_pessoas,'')),''),
    case
      when p_ferramenta in ('rpa', 'n8n', 'ambos') then p_ferramenta::automation_tool
      else null
    end,
    coalesce(p_escopo_automacao, '{}'),
    coalesce(p_beneficios_esperados, '{}'),
    case when p_esforco in ('baixo', 'medio', 'alto') then p_esforco::effort_level else null end,
    case when p_complexidade in ('baixo', 'medio', 'alto') then p_complexidade::complexity_level else null end,
    case when p_tempo in ('diario', 'semanal', 'quinzenal', 'mensal', 'anual') then p_tempo::frequency_bucket else null end,
    p_objetivo,
    'novo',
    p_formulario_extras,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_risco, '')), ''),
    p_criterios,
    p_beneficios,
    p_fte_horas,
    case when p_fte in ('muito_baixo','baixo','medio','alto','muito_alto') then p_fte::fte_bucket else null end,
    nullif(trim(coalesce(p_responsavel, '')), ''),
    case when p_criticidade in ('baixa','media','alta','critica') then p_criticidade::criticidade_level else null end,
    p_execucoes_mes,
    v_parent_id
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$function$;

grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text,
  jsonb, jsonb, numeric, text, text, text, int, uuid
) to anon, authenticated;

-- =============================================================================
-- Smoke (rodar após o apply; limpar as rows depois):
--   -- 3.1 seletor público (troque o slug):
--   select * from public.fetch_public_opportunities('<slug-de-tenant-ativo>');
--
--   -- 4.1 submit de incidente vinculado (use um id do retorno acima):
--   select public.create_public_opportunity(
--     '<slug>', 'smoke', 'smoke@x.z', 'TI', '', 'proc smoke',
--     '', '', '', '', 'n8n', '{}'::text[], '{}'::text[],
--     'medio', 'medio', 'mensal', 3::smallint, '{}'::jsonb,
--     'incidente', null, null, null, null, null, null, null, null, null,
--     '<uuid-da-automacao>'::uuid);
--   select request_type, parent_opportunity_id from opportunities where solicitante='smoke';
--
--   -- 4.2 parent de OUTRO tenant deve virar null (mesma chamada trocando o uuid)
--   delete from opportunities where solicitante='smoke';
-- =============================================================================
