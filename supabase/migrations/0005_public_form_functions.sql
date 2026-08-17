-- =============================================================================
-- 0005_public_form_functions.sql — RPC pra formulário público
-- =============================================================================
-- Cria 2 funções SECURITY DEFINER que permitem usuários anônimos:
--   1. Verificar se um tenant slug existe (via fetch_public_tenant)
--   2. Submeter uma oportunidade nova sem login (via create_public_opportunity)
--
-- O `SECURITY DEFINER` faz a função rodar com privilégio do dono (postgres),
-- bypassando RLS. Toda lógica de validação acontece dentro da função.
-- Os GRANTs no fim liberam pro role `anon`.
--
-- Pré-requisito: 0001_init.sql aplicado.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- fetch_public_tenant — retorna tenant por slug (somente se status=active)
-- -----------------------------------------------------------------------------
create or replace function public.fetch_public_tenant(p_slug text)
returns table (id uuid, name text, slug text)
language sql
security definer
stable
set search_path = public
as $$
  select id, name, slug
  from tenants
  where slug = p_slug
    and status = 'active'
  limit 1;
$$;

grant execute on function public.fetch_public_tenant(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_public_opportunity — submit do formulário público
-- -----------------------------------------------------------------------------
-- Recebe os campos como argumentos individuais (mais fácil de validar tipo).
-- formulario_extras vai como JSONB (criterios + beneficios estruturados).
-- -----------------------------------------------------------------------------
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
  p_formulario_extras    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_opp_id uuid;
begin
  -- Validações básicas
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

  -- Resolve tenant
  select id into v_tenant_id
  from tenants
  where slug = p_tenant_slug
    and status = 'active'
  limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant não encontrado ou inativo: %', p_tenant_slug;
  end if;

  -- Insert (status default = 'novo' — gestor do tenant aprova depois)
  insert into opportunities (
    tenant_id,
    source,
    solicitante,
    email,
    area,
    subarea,
    processo,
    frequencia,
    volume_medio,
    tempo_execucao,
    num_pessoas,
    ferramenta,
    escopo_automacao,
    beneficios_esperados,
    esforco,
    complexidade,
    tempo,
    objetivo,
    status,
    formulario_extras
  ) values (
    v_tenant_id,
    'formulario',
    trim(p_solicitante),
    trim(p_email),
    trim(p_area),
    nullif(trim(coalesce(p_subarea, '')), ''),
    trim(p_processo),
    nullif(trim(coalesce(p_frequencia, '')), ''),
    nullif(trim(coalesce(p_volume_medio, '')), ''),
    nullif(trim(coalesce(p_tempo_execucao, '')), ''),
    nullif(trim(coalesce(p_num_pessoas, '')), ''),
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
    p_formulario_extras
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$$;

grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb
) to anon, authenticated;

-- =============================================================================
-- FIM 0005 — RPCs públicas criadas e liberadas pra role anon
-- =============================================================================
