-- =============================================================================
-- 0012_public_rpc_frequency.sql — corrige regressão latente da RPC pública
-- =============================================================================
-- Phase 10 — Plan 10-01.
--
-- CAUSA: 0011 mudou `opportunities.tempo` de duração (time_bucket) para frequência
-- (frequency_bucket). A RPC pública `create_public_opportunity` ainda mapeava
-- `p_tempo` no domínio antigo e inseria em `opportunities.tempo` → gravava NULL
-- silencioso para valores de frequência. Regressão latente do formulário público
-- anônimo (Phase 7.5).
--
-- DESCOBERTA NO APPLY: existiam DOIS overloads de create_public_opportunity:
--   (a) 18 params (..., p_objetivo smallint, p_formulario_extras jsonb) — legado;
--   (b) 21 params (..., p_request_type, p_observacao, p_risco com DEFAULT) — de 0009,
--       o overload que a app realmente chama (lib/opportunities/actions.ts).
-- Como (b) tem defaults nos 3 últimos params, uma chamada de 18 args casava com
-- AMBOS → "function is not unique" (42725). E (b) ainda carregava o mapeamento antigo.
--
-- CORREÇÃO:
--   1. DROP do overload legado de 18 params (morto; nada o chama; fonte da ambiguidade).
--   2. create or replace do overload de 21 params (corpo IDÊNTICO ao vivo, com os
--      DEFAULTs preservados), mudando APENAS o mapeamento de `p_tempo` para frequência.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (NÃO db push).
-- Colar o conteúdo INTEIRO de uma vez. Pré-requisitos: 0001..0011 aplicadas.
-- =============================================================================

set check_function_bodies = off;

-- 1. Remove o overload legado de 18 params (ambíguo + mapeamento antigo).
drop function if exists public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb
);

-- 2. Recria o overload canônico de 21 params com p_tempo → frequency_bucket.
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
  p_risco text default null::text
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
    -- 0012: p_tempo agora no domínio de FREQUÊNCIA (antes era duração).
    case when p_tempo in ('diario', 'semanal', 'quinzenal', 'mensal', 'anual') then p_tempo::frequency_bucket else null end,
    p_objetivo,
    'novo',
    p_formulario_extras,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_risco, '')), '')
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$function$;

-- 3. Reafirma os grants no overload de 21 params (idempotente).
grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text
) to anon, authenticated;

-- =============================================================================
-- Smoke (rodar após o apply; limpar a row depois). Com o overload de 18 params
-- removido, a chamada de 18 args resolve sem ambiguidade (os 3 defaults preenchem):
--   select public.create_public_opportunity(
--     '<slug-de-tenant-ativo>', 'smoke', 'smoke@x.z', 'TI', '', 'proc smoke',
--     '', '', '', '', '', '{}'::text[], '{}'::text[],
--     'medio', 'medio', 'mensal', 3::smallint, '{}'::jsonb);
--   -- deve retornar uuid; conferir: select tempo from opportunities where solicitante='smoke';  -> 'mensal'
--   delete from opportunities where solicitante='smoke';
-- =============================================================================
