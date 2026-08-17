-- =============================================================================
-- 0002_seed_tenant_and_admin.sql — Tenant FGCoop + admin user
-- =============================================================================
-- Cria:
--   • Tenant `fgcoop` (UUID fixo 11111111-...)
--   • Auth user admin.fgcoop@pswdigital.com.br / 0123456789 (UUID fixo aaaaaaaa-...)
--   • Identidade email no auth.identities (necessário para login funcionar)
--   • Profile vinculado é criado AUTOMATICAMENTE pelo trigger handle_new_user
--     (definido em 0001_init.sql) — ele lê tenant_id do raw_app_meta_data
--
-- Rodar DEPOIS de 0001_init.sql e ANTES de 0003_seed_fgcoop_opportunities.sql.
-- Idempotente: usa on conflict / checks para poder rodar várias vezes.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Tenant FGCoop
-- -----------------------------------------------------------------------------
insert into tenants (id, name, slug)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'FGCoop', 'fgcoop')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Auth user + identity (admin do tenant)
-- -----------------------------------------------------------------------------
do $$
declare
  v_user_id   uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_tenant_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_email     text := 'admin.fgcoop@pswdigital.com.br';
  v_password  text := '0123456789';
  v_full_name text := 'Admin FGCoop';
begin
  -- 2a. auth.users -----------------------------------------------------------
  -- handle_new_user trigger vai disparar e criar o profile.
  -- O tenant_id PRECISA estar em raw_app_meta_data OU raw_user_meta_data.
  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),                                     -- email já confirmado (não precisa link)
      jsonb_build_object(
        'provider',  'email',
        'providers', jsonb_build_array('email'),
        'tenant_id', v_tenant_id::text           -- lido pelo trigger handle_new_user
      ),
      jsonb_build_object(
        'full_name', v_full_name,
        'tenant_id', v_tenant_id::text           -- redundância de segurança
      ),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  end if;

  -- 2b. auth.identities ------------------------------------------------------
  -- Sem essa linha, login com email/senha falha em versões recentes do Supabase.
  if not exists (
    select 1 from auth.identities
    where provider = 'email' and user_id = v_user_id
  ) then
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object(
        'sub',            v_user_id::text,
        'email',          v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  -- 2c. profile (fallback caso o trigger não tenha rodado por algum motivo)
  if not exists (select 1 from profiles where id = v_user_id) then
    insert into profiles (id, tenant_id, email, full_name, role)
    values (v_user_id, v_tenant_id, v_email, v_full_name, 'tenant_admin')
    on conflict (id) do nothing;
  else
    -- garante role = tenant_admin se o trigger criou como member
    update profiles set role = 'tenant_admin'
    where id = v_user_id and role <> 'tenant_admin';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Verificação rápida (descomente pra conferir após rodar)
-- -----------------------------------------------------------------------------
-- select u.id, u.email, u.email_confirmed_at, p.tenant_id, p.role
-- from auth.users u
-- left join profiles p on p.id = u.id
-- where u.email = 'admin.fgcoop@pswdigital.com.br';

-- =============================================================================
-- FIM 0002 — Tenant + admin pronto para login
-- =============================================================================
