-- =============================================================================
-- 0008_request_type.sql — Classificação do tipo de solicitação
-- =============================================================================
-- Adiciona a coluna `request_type` em `opportunities` com 5 classificações:
--   1. nova_oportunidade   → Nova Oportunidade
--   2. melhoria_automacao  → Melhoria da Automação já Existente
--   3. duvidas_terceiros   → Dúvidas — Avaliar soluções de terceiros
--   4. incidente           → Incidente
--   5. treinamento         → Pedido de Treinamento
--
-- Estratégia:
--   - Novo enum `opportunity_request_type`.
--   - Coluna NULLABLE, com default `'nova_oportunidade'`. Backfill explícito
--     para todas as linhas existentes (mantém histórico classificado como
--     "nova_oportunidade").
--   - RPC pública `create_public_opportunity` recriada com novo parâmetro
--     `p_request_type` (default `'nova_oportunidade'` quando não informado).
--
-- Pré-requisitos: 0001..0007 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'opportunity_request_type') then
    create type opportunity_request_type as enum (
      'nova_oportunidade',
      'melhoria_automacao',
      'duvidas_terceiros',
      'incidente',
      'treinamento'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Coluna em opportunities (com backfill)
-- ---------------------------------------------------------------------------
alter table opportunities
  add column if not exists request_type opportunity_request_type
    not null
    default 'nova_oportunidade';

-- Backfill defensivo — `default` já cobre os existing rows, mas garantimos.
update opportunities
   set request_type = 'nova_oportunidade'
 where request_type is null;

create index if not exists opportunities_tenant_request_type_idx
  on opportunities(tenant_id, request_type);

-- ---------------------------------------------------------------------------
-- 3. View `opportunities_with_score` — DROP + CREATE para reordenar colunas
-- ---------------------------------------------------------------------------
-- IMPORTANTE: `CREATE OR REPLACE VIEW` do Postgres **não** permite reordenar
-- colunas existentes — só permite APPEND de novas colunas no fim. Como
-- `request_type` foi adicionada no fim de `opportunities`, o `o.*` da view
-- agora insere `request_type` exatamente na posição onde antes vinha `score`,
-- o que Postgres bloqueia com:
--   ERROR 42P16: cannot change name of view column "score" to "request_type"
--
-- Solução: DROP + CREATE. A view não tem dependentes DB-side (apenas o app
-- consulta via Supabase client — runtime, não schema). GRANT é restaurado
-- explicitamente abaixo já que `drop view` perde permissões.
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

-- Restaura GRANT (perdido no DROP) — mesma policy de 0001_init.sql:370
grant select on opportunities_with_score to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC pública — recriada com novo parâmetro `p_request_type`
-- ---------------------------------------------------------------------------
-- Mantém a mesma estratégia hardened da 0007 (length/array/jsonb limits).
-- `p_request_type` aceita string e converte para enum; valor inválido →
-- default `'nova_oportunidade'`.
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
  p_request_type         text default 'nova_oportunidade'
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
  -- Length / array / jsonb limits (idem 0007)
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
    status, formulario_extras
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
    p_formulario_extras
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$$;

grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text
) to anon, authenticated;

-- =============================================================================
-- FIM 0008 — request_type adicionado
-- =============================================================================
