-- =============================================================================
-- 0031_profile_cargo.sql — cargo (função na equipe) separado do papel de acesso
-- =============================================================================
-- CONTEXTO: o time pediu mais opções em "Papel" (Tech Lead, CoE Manager, Dev,
-- Arquiteto, DevOps, Engenheiro de Dados, PM, Scrum Master). Isso são CARGOS,
-- não níveis de permissão.
--
-- DECISÃO: `profiles.role` (enum tenant_role) continua sendo a ÚNICA coisa que
-- as policies de RLS enxergam — member / viewer / tenant_admin / platform_admin.
-- O cargo entra como coluna nova, puramente descritiva, em `profiles` e
-- `invited_emails`. Nenhuma policy lê `cargo`; nenhum caminho de escrita muda.
-- Assim ninguém vira "Dev" e ganha permissão por acidente.
--
-- CHECK explícito em vez de enum novo: a lista de cargos é rótulo de produto e
-- deve poder mudar sem `alter type` (que não roda em transação junto de DML).
--
-- IDEMPOTENTE. Pré-requisitos: 0022 (invited_emails) e 0028 aplicadas.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------
alter table profiles       add column if not exists cargo text;
alter table invited_emails add column if not exists cargo text;

alter table profiles drop constraint if exists profiles_cargo_check;
alter table profiles add constraint profiles_cargo_check
  check (cargo is null or cargo in (
    'tech_lead', 'coe_manager', 'dev', 'arquiteto', 'devops',
    'engenheiro_dados', 'pm', 'scrum_master', 'outro'
  ));

alter table invited_emails drop constraint if exists invited_emails_cargo_check;
alter table invited_emails add constraint invited_emails_cargo_check
  check (cargo is null or cargo in (
    'tech_lead', 'coe_manager', 'dev', 'arquiteto', 'devops',
    'engenheiro_dados', 'pm', 'scrum_master', 'outro'
  ));

-- -----------------------------------------------------------------------------
-- 2. handle_new_user — copia o cargo do convite para o profile no 1º login
-- -----------------------------------------------------------------------------
-- Corpo idêntico ao de 0022, com uma única mudança: `cargo` no INSERT.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite    invited_emails%rowtype;
  v_tenant_id uuid;
  v_role      tenant_role := 'member';
  v_cargo     text;
begin
  -- 1. Convite pendente (allowlist) = fonte da verdade de tenant + role + cargo.
  select * into v_invite
  from invited_emails
  where lower(email) = lower(new.email)
    and used_at is null
  order by created_at desc
  limit 1;

  if found then
    v_tenant_id := v_invite.tenant_id;
    v_role      := v_invite.role;
    v_cargo     := v_invite.cargo;
    update invited_emails set used_at = now() where id = v_invite.id;
  else
    -- 2. Fallback APENAS em raw_app_meta_data (setável só por service_role:
    --    seeds + provisionamento via Studio). NUNCA raw_user_meta_data, que o
    --    usuário controla no signUp() e permitiria auto-atribuir tenant_id.
    v_tenant_id := (new.raw_app_meta_data->>'tenant_id')::uuid;
    if v_tenant_id is null then
      raise exception 'Cadastro não autorizado para % — nenhum convite pendente.', new.email
        using errcode = 'check_violation';
    end if;
  end if;

  insert into profiles (id, tenant_id, email, full_name, role, cargo)
  values (
    new.id,
    v_tenant_id,
    new.email,
    new.raw_user_meta_data->>'full_name',   -- full_name não é sensível: ok vir do usuário
    v_role,
    v_cargo
  );
  return new;
end;
$$;

-- =============================================================================
-- FIM 0031 — RLS intocada de propósito. `cargo` é rótulo; permissão continua
-- vindo só de `profiles.role` (ver lib/security/role.ts).
-- =============================================================================
