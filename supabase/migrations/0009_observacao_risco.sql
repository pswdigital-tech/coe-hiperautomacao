-- =============================================================================
-- 0009_observacao_risco.sql — Campos Observação e Risco em opportunities
-- =============================================================================
-- Adiciona duas colunas TEXT nullable ao topo do registro de oportunidade:
--   - observacao  → texto livre do solicitante (multi-linha)
--   - risco       → texto livre descrevendo riscos identificados (multi-linha)
--
-- São campos do SOLICITANTE (diferentes de `notas`, que é nota interna do CoE).
-- Aplicam-se a ambos os tipos (persona e formulario), por isso ficam como
-- colunas top-level — não em JSONB extras.
--
-- Limites:
--   - observacao: max 2000 caracteres (CHECK)
--   - risco:      max 2000 caracteres (CHECK)
--
-- RPC pública `create_public_opportunity` recriada com novos parâmetros
-- `p_observacao` e `p_risco` (defaults '' / null — opcionais).
--
-- Pré-requisitos: 0001..0008 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Novas colunas + CHECKs
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists observacao text,
  add column if not exists risco      text;

-- Length limits — defesa em profundidade (Zod no app, CHECK aqui)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_observacao_len_chk'
  ) then
    alter table opportunities
      add constraint opportunities_observacao_len_chk
        check (observacao is null or length(observacao) <= 2000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_risco_len_chk'
  ) then
    alter table opportunities
      add constraint opportunities_risco_len_chk
        check (risco is null or length(risco) <= 2000);
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. View `opportunities_with_score` — DROP + CREATE para incluir novas colunas
-- ---------------------------------------------------------------------------
-- Mesmo motivo da 0008: `o.*` adiciona colunas no fim e Postgres bloqueia
-- reordenar via `CREATE OR REPLACE VIEW`. Solução: DROP + CREATE + restore GRANT.
drop view if exists opportunities_with_score;

create view opportunities_with_score
with (security_invoker = true) as
select
  o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;

grant select on opportunities_with_score to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC pública — recriada com `p_observacao` e `p_risco`
-- ---------------------------------------------------------------------------
-- Defaults ''/null mantêm a chamada compatível com clients antigos.
-- Length limits enforced internamente (idem 0007/0008).
create or replace function public.create_public_opportunity(
  p_tenant_slug          text,
  p_solicitante          text,
  p_email                text,
  p_area                 text,
  p_subarea              text,
  p_processo             text,
  p_frequencia           text,
  p_volume_medio         text,
  p_tempo_execucao       text,
  p_num_pessoas          text,
  p_ferramenta           text,
  p_escopo_automacao     text[],
  p_beneficios_esperados text[],
  p_esforco              text,
  p_complexidade         text,
  p_tempo                text,
  p_objetivo             smallint,
  p_formulario_extras    jsonb,
  p_request_type         text default 'nova_oportunidade',
  p_observacao           text default null,
  p_risco                text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id    uuid;
  v_opp_id       uuid;
  v_item         text;
  v_request_type opportunity_request_type;
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

  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao, risco
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
    case when p_tempo in ('pequeno', 'medio', 'grande') then p_tempo::time_bucket else null end,
    p_objetivo,
    'novo',
    p_formulario_extras,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_risco, '')), '')
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$$;

grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Limpa overload antigo da 0008 (assinatura sem observacao/risco)
-- ---------------------------------------------------------------------------
-- `create or replace function` com nova lista de parâmetros cria um overload
-- separado em vez de substituir. Removemos a versão da 0008 para evitar
-- ambiguidade quando o PostgREST resolver a RPC.
drop function if exists public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text
);

-- =============================================================================
-- FIM 0009 — observacao + risco adicionados
-- =============================================================================
