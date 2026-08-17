-- =============================================================================
-- 0007_public_form_hardening.sql — Hardening do formulário público anônimo
-- =============================================================================
-- Defesa em profundidade para a RPC SECURITY DEFINER `create_public_opportunity`:
--   1. Tabela `public_form_submissions` registra cada tentativa (status,
--      ip_hash, user_agent, error). RLS enabled, sem policies (só service role
--      e SECURITY DEFINER acessam).
--   2. Funções `log_public_form_attempt` / `update_public_form_attempt` para o
--      Server Action logar antes/depois da RPC, grant para anon/authenticated.
--   3. `create_public_opportunity` recriada com length, array length e jsonb
--      size limits internos. Como a função é SECURITY DEFINER, bypassa RLS:
--      validação interna é a linha final de defesa contra storage exhaustion.
--
-- Pré-requisitos: 0001..0006 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Tabela de log de submissões
-- ---------------------------------------------------------------------------

create table if not exists public_form_submissions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references tenants(id) on delete set null,
  slug           text not null,
  ip_hash        text not null,
  user_agent     text,
  status         text not null
    check (status in ('pending','success','rate_limited','invalid','captcha_failed')),
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists public_form_submissions_created_at_idx
  on public_form_submissions(created_at desc);
create index if not exists public_form_submissions_slug_idx
  on public_form_submissions(slug, created_at desc);
create index if not exists public_form_submissions_status_idx
  on public_form_submissions(status, created_at desc);

alter table public_form_submissions enable row level security;
-- ZERO policies → anon e authenticated não leem. Service role bypassa.
revoke all on public_form_submissions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers SECURITY DEFINER para o Server Action
-- ---------------------------------------------------------------------------

create or replace function log_public_form_attempt(
  p_slug       text,
  p_ip_hash    text,
  p_user_agent text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_log_id   uuid;
begin
  select id into v_tenant_id
    from tenants
   where slug = p_slug and status = 'active'
   limit 1;

  insert into public_form_submissions (tenant_id, slug, ip_hash, user_agent, status)
  values (v_tenant_id, p_slug, p_ip_hash, p_user_agent, 'pending')
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function log_public_form_attempt(text, text, text)
  to anon, authenticated;

create or replace function update_public_form_attempt(
  p_log_id uuid,
  p_status text,
  p_error  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('success','rate_limited','invalid','captcha_failed') then
    raise exception 'status inválido: %', p_status;
  end if;
  update public_form_submissions
     set status = p_status,
         error_message = p_error
   where id = p_log_id;
end;
$$;

grant execute on function update_public_form_attempt(uuid, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_public_opportunity — hardened (mantém assinatura de 0005)
-- ---------------------------------------------------------------------------

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
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_opp_id    uuid;
  v_item      text;
begin
  -- =====================================================================
  -- Defesa em profundidade: length / array / jsonb limits
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
  -- Validações originais (de 0005, mantidas)
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

  -- =====================================================================
  -- Resolve tenant e INSERT (mantém lógica de 0005)
  -- =====================================================================

  select id into v_tenant_id
    from tenants
   where slug = p_tenant_slug and status = 'active'
   limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant não encontrado ou inativo';
  end if;

  insert into opportunities (
    tenant_id, source, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo,
    status, formulario_extras
  ) values (
    v_tenant_id, 'formulario', trim(p_solicitante), trim(p_email),
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
  text[], text[], text, text, text, smallint, jsonb
) to anon, authenticated;

-- =============================================================================
-- FIM 0007 — RPC pública hardened + tabela de log + helpers de auditoria
-- =============================================================================
