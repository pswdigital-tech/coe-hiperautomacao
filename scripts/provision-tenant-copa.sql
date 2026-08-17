-- =============================================================================
-- provision-tenant-copa.sql — cria o tenant COPA + usuário tenant_admin logável
-- =============================================================================
-- Rodar no SQL Editor do Supabase Cloud (projeto de produção), como service_role.
-- Idempotente: pode ser executado mais de uma vez (recria o usuário do zero).
--
-- ORDEM OBRIGATÓRIA (não reordenar):
--   1. tenants
--   2. invited_emails  ← ANTES do auth.users; é o convite que dá o role correto
--   3. auth.users      ← colunas de token DEVEM ser '' e nunca NULL
--   4. auth.identities
--
-- Depois de rodar: trocar a senha no primeiro login.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

do $$
declare
  v_tenant_id uuid;
  v_user_id   uuid := gen_random_uuid();
  v_email     text := 'copa.admin@pswdigital.com.br';
  v_password  text := 'Copa@2026#PSW';   -- TROCAR no primeiro login
begin
  ---------------------------------------------------------------------------
  -- 0. Limpeza (idempotência): remove usuário/convite anteriores deste e-mail
  ---------------------------------------------------------------------------
  delete from auth.users      where lower(email) = lower(v_email);  -- cascata em profiles/identities
  delete from invited_emails  where lower(email) = lower(v_email);

  ---------------------------------------------------------------------------
  -- 1. Tenant
  ---------------------------------------------------------------------------
  insert into tenants (name, slug, status)
  values ('COPA', 'copa', 'active')
  on conflict (slug) do update set name = excluded.name
  returning id into v_tenant_id;

  ---------------------------------------------------------------------------
  -- 2. Convite pendente (fonte da verdade de tenant_id + role p/ handle_new_user)
  ---------------------------------------------------------------------------
  insert into invited_emails (email, tenant_id, role)
  values (v_email, v_tenant_id, 'tenant_admin');

  ---------------------------------------------------------------------------
  -- 3. auth.users — tokens = '' (NULL quebra o login com "Invalid credentials")
  ---------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Admin COPA'),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  ---------------------------------------------------------------------------
  -- 4. auth.identities
  ---------------------------------------------------------------------------
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    'email',
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  raise notice 'Tenant COPA=% / user=% criado', v_tenant_id, v_user_id;
end $$;

-- =============================================================================
-- Verificação — esperado: confirmado=true, hash=$2a$ (ou $2b$), token_ok=true,
--               role=tenant_admin, tenant=COPA
-- =============================================================================
select
  u.email,
  u.email_confirmed_at is not null       as confirmado,
  left(u.encrypted_password, 4)          as hash_prefix,
  u.confirmation_token = ''              as token_ok,
  p.role,
  t.name                                 as tenant
from auth.users u
join profiles p on p.id = u.id
join tenants  t on t.id = p.tenant_id
where lower(u.email) = 'copa.admin@pswdigital.com.br';
