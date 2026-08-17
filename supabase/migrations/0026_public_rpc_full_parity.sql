-- =============================================================================
-- 0026_public_rpc_full_parity.sql — RPC pública passa a capturar os 5 steps
-- =============================================================================
-- CONTEXTO: o formulário público (`/r/<slug>`) coletava apenas 2 steps
-- (Identificação + Processo — herança da Phase 7.6, quando Critérios/Benefícios/
-- Priorização viravam OUTPUT da IA). O fluxo autenticado da home ("Nova
-- Oportunidade", WizardShell mode='create', Phase 11/D-04) coleta 5 steps.
-- Decisão de produto (2026-07-22): PARIDADE LITERAL — o link público deve capturar
-- os mesmos campos da home. Isto exige que a RPC `create_public_opportunity`
-- aceite e persista: criterios, beneficios, fte_horas, fte (bucket), responsavel,
-- criticidade, execucoes_mes (esforco/complexidade/tempo/objetivo já existiam).
--
-- ABORDAGEM (mesma de 0012): DROP do overload de 21 params + CREATE do overload
-- de 28 params (os 7 novos com DEFAULT null → forward-compatível). Corpo idêntico
-- ao vivo, adicionando SÓ as novas colunas ao INSERT. `rpa_score` continua
-- GENERATED (deriva de criterios); `score`/`priority` calculados na view — nada
-- disso é persistido aqui (docs/PROJETO.md §3).
--
-- NOTA enrichment: a row continua entrando com ai_enrichment_status='pending'
-- (default 0010), então o enrichment assíncrono ainda roda e sobrescreve
-- esforco/complexidade/objetivo — MESMO comportamento do fluxo da home
-- (createOpportunity). criterios/beneficios/fte_horas NÃO são tocados pela IA
-- (lib/ai/enrichment.ts) → os valores manuais do solicitante sobrevivem.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (NÃO db push).
-- Colar o conteúdo INTEIRO de uma vez. Pré-requisitos: 0001..0025 aplicadas.
-- IMPORTANTE: aplicar ANTES de fazer deploy do app (a app passa a chamar o
-- overload de 28 params; sem a migration a chamada falha).
-- =============================================================================

set check_function_bodies = off;

-- 1. Remove o overload de 21 params (será substituído pelo de 28).
drop function if exists public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text
);

-- 2. Recria com 7 params novos (todos com DEFAULT null p/ forward-compat).
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
  -- ── novos (paridade 5 steps) ──
  p_criterios jsonb default null::jsonb,
  p_beneficios jsonb default null::jsonb,
  p_fte_horas numeric default null::numeric,
  p_fte text default null::text,
  p_responsavel text default null::text,
  p_criticidade text default null::text,
  p_execucoes_mes int default null::int
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

  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao, risco,
    -- novos (paridade 5 steps):
    criterios, beneficios, fte_horas, fte, responsavel, criticidade, execucoes_mes
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
    -- 0012: p_tempo no domínio de FREQUÊNCIA.
    case when p_tempo in ('diario', 'semanal', 'quinzenal', 'mensal', 'anual') then p_tempo::frequency_bucket else null end,
    p_objetivo,
    'novo',
    p_formulario_extras,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_risco, '')), ''),
    -- novos: criterios/beneficios entram como jsonb (CHECKs opportunities_*_chk
    -- validam formato); rpa_score é GENERATED a partir de criterios.
    p_criterios,
    p_beneficios,
    p_fte_horas,
    case when p_fte in ('muito_baixo','baixo','medio','alto','muito_alto') then p_fte::fte_bucket else null end,
    nullif(trim(coalesce(p_responsavel, '')), ''),
    case when p_criticidade in ('baixa','media','alta','critica') then p_criticidade::criticidade_level else null end,
    p_execucoes_mes
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$function$;

-- 3. Grants no overload de 28 params (idempotente).
grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text,
  jsonb, jsonb, numeric, text, text, text, int
) to anon, authenticated;

-- =============================================================================
-- Smoke (rodar após o apply; limpar a row depois):
--   select public.create_public_opportunity(
--     '<slug-de-tenant-ativo>', 'smoke', 'smoke@x.z', 'TI', '', 'proc smoke',
--     '', '', '', '', 'n8n', '{}'::text[], '{}'::text[],
--     'medio', 'medio', 'mensal', 3::smallint, '{}'::jsonb,
--     'nova_oportunidade', null, null,
--     '{"causaReclamacoes":"nao","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"nao","padronizacaoDocs":"sim","validacaoDados":"sim","schedulable":"sim","temDocumentacao":"sim"}'::jsonb,
--     '{"reducaoTempo":5,"produtividade":4}'::jsonb,
--     40::numeric, 'alto', 'Fulano CoE', 'media', 12::int);
--   -- deve retornar uuid; conferir criterios/beneficios/fte/rpa_score:
--   -- select criterios, beneficios, fte, fte_horas, rpa_score, criticidade
--   --   from opportunities where solicitante='smoke';
--   delete from opportunities where solicitante='smoke';
-- =============================================================================
