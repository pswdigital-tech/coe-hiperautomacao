-- =============================================================================
-- 0022_invited_emails.sql — Allowlist de cadastro + signup seguro por convite
-- =============================================================================
-- Ported de origin/feat/v0.3-produtizacao (commit df6a97e, renumerado).
-- Conteúdo idêntico ao original, exceto o `handle_new_user()` que precisou ser
-- reconciliado com a versão de 0001_init.sql (única diferença: nenhuma —
-- o corpo é o mesmo, já que profiles não ganhou colunas novas desde então).
--
-- CONTEXTO: produtização. O super-admin de plataforma (PSW, criado na
-- 0020/0021) precisa "liberar e-mails" para que empresas-cliente criem suas
-- próprias contas. Até aqui não havia self-signup: usuários eram semeados via
-- SQL/Studio (0002, 0013).
--
-- PROBLEMA DE SEGURANÇA QUE ESTA MIGRATION RESOLVE:
--   O trigger handle_new_user (0001) lia tenant_id de
--   `coalesce(raw_user_meta_data, raw_app_meta_data)`. Mas raw_user_meta_data é
--   CONTROLADO PELO USUÁRIO no `supabase.auth.signUp({ options: { data } })`.
--   Abrir signup self-service mantendo esse fallback deixaria qualquer pessoa
--   se auto-atribuir a QUALQUER tenant → quebra do isolamento (regra nº1).
--
-- DESIGN:
--   1. `invited_emails` é a allowlist. Só o platform_admin gerencia (RLS).
--   2. handle_new_user reescrito: o convite pendente é a FONTE DA VERDADE de
--      tenant_id + role. Sem convite, só resta o fallback em raw_app_meta_data
--      (setável apenas por service_role — preserva seeds/provisionamento Studio,
--      ex: 0002/0013). Sem convite e sem app_metadata → cadastro REJEITADO.
--   3. Convite nunca concede 'platform_admin' (CHECK) — super-admin só via SQL.
--   4. platform_admin ganha INSERT/UPDATE em `tenants` para onboardar empresas.
--
-- Idempotente. Pré-requisitos: 0001..0021 aplicadas.
-- NOTA OPERACIONAL: o signup self-service exige "Enable signups" ligado no
-- painel Supabase Auth. A allowlist é a trava real — signups habilitados sem
-- convite continuam sendo rejeitados pelo trigger.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Tabela de convites (allowlist)
-- -----------------------------------------------------------------------------
create table if not exists invited_emails (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role        tenant_role not null default 'member'
                check (role in ('member', 'tenant_admin')),  -- nunca platform_admin via convite
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz                                     -- null = pendente
);

create index if not exists invited_emails_tenant_idx on invited_emails(tenant_id);

-- No máximo UM convite pendente por e-mail (case-insensitive). Já usados não
-- contam, permitindo re-convidar alguém depois.
create unique index if not exists invited_emails_pending_email_uniq
  on invited_emails (lower(email))
  where used_at is null;

-- -----------------------------------------------------------------------------
-- 2. RLS — só o platform_admin gerencia a allowlist
-- -----------------------------------------------------------------------------
alter table invited_emails enable row level security;

drop policy if exists invited_emails_select_admin on invited_emails;
create policy invited_emails_select_admin on invited_emails
  for select using (is_platform_admin());

drop policy if exists invited_emails_insert_admin on invited_emails;
create policy invited_emails_insert_admin on invited_emails
  for insert with check (is_platform_admin());

drop policy if exists invited_emails_update_admin on invited_emails;
create policy invited_emails_update_admin on invited_emails
  for update using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists invited_emails_delete_admin on invited_emails;
create policy invited_emails_delete_admin on invited_emails
  for delete using (is_platform_admin());

grant select, insert, update, delete on invited_emails to authenticated;

-- -----------------------------------------------------------------------------
-- 3. platform_admin pode criar/renomear empresas (tenants)
-- -----------------------------------------------------------------------------
drop policy if exists tenants_insert_platform_admin on tenants;
create policy tenants_insert_platform_admin on tenants
  for insert with check (is_platform_admin());

drop policy if exists tenants_update_platform_admin on tenants;
create policy tenants_update_platform_admin on tenants
  for update using (is_platform_admin()) with check (is_platform_admin());

grant insert, update on tenants to authenticated;

-- -----------------------------------------------------------------------------
-- 4. handle_new_user reescrito — convite-first, sem confiar em user_metadata
-- -----------------------------------------------------------------------------
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
begin
  -- 1. Convite pendente (allowlist) = fonte da verdade de tenant + role.
  select * into v_invite
  from invited_emails
  where lower(email) = lower(new.email)
    and used_at is null
  order by created_at desc
  limit 1;

  if found then
    v_tenant_id := v_invite.tenant_id;
    v_role      := v_invite.role;
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

  insert into profiles (id, tenant_id, email, full_name, role)
  values (
    new.id,
    v_tenant_id,
    new.email,
    new.raw_user_meta_data->>'full_name',   -- full_name não é sensível: ok vir do usuário
    v_role
  );
  return new;
end;
$$;

-- =============================================================================
-- FIM 0022 — allowlist + signup seguro. O trigger agora REJEITA cadastros sem
-- convite (a menos que app_metadata.tenant_id venha de service_role). Seeds
-- 0002/0013 não são afetados (guards `if not exists` + app_metadata).
-- =============================================================================
