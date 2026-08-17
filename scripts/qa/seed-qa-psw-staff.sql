-- =============================================================================
-- seed-qa-psw-staff.sql — usuário de QA para verificar o acesso multi-tenant
-- do staff PSW (Phase 17) na tela, contra o banco real.
-- =============================================================================
-- Cria (idempotente):
--   • Tenant da PSW            reusa o de slug 'psw' se existir; senão cria em
--                              fa5f0000-0000-4000-8000-000000000001
--   • Usuário logável          qa.pswstaff@pswdigital.com.br / QaPswStaff!2026
--                              fa5f0000-0000-4000-8000-000000000002, role psw_staff
--   • 2 atribuições cross-tenant, em DUAS empresas diferentes
--
-- PRÉ-REQUISITO: migrations 0039 e 0040 aplicadas (senão o papel 'psw_staff'
-- não existe no enum e as policies de leitura não existem).
--
-- ⚠️ UUIDs deliberadamente na faixa `fa5f…` — fora de qualquer faixa já usada
-- por seed ou fixture do projeto (0002 usa 1111…/aaaa…, os testes usam
-- 1111…/2222…/3333…). Isto é resposta direta ao problema registrado em
-- .planning/todos/pending/fixtures-colidem-com-producao.md: nenhum id deste
-- arquivo pode colidir com dado real.
--
-- Para desfazer: scripts/qa/cleanup-qa-psw-staff.sql
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

do $$
declare
  v_tenant_psw uuid;
  v_user_id    uuid := 'fa5f0000-0000-4000-8000-000000000002'::uuid;
  v_email      text := 'qa.pswstaff@pswdigital.com.br';
  v_password   text := 'QaPswStaff!2026';
  v_full_name  text := 'QA Staff PSW';
  v_tenant_a   uuid;
  v_tenant_b   uuid;
  v_opp_a      uuid;
  v_opp_b      uuid;
begin
  -- 1. Tenant da PSW ---------------------------------------------------------
  -- REUSA o tenant de slug 'psw' se ele já existir — foi o que aconteceu na
  -- primeira execução (23505 em tenants_slug_key). Só cria um novo, na faixa
  -- fa5f…, se realmente não houver nenhum. Resolver por slug em vez de fixar
  -- o id evita tanto duplicar a PSW quanto adotar um id que não é o dela.
  select id into v_tenant_psw from tenants where slug = 'psw';

  if v_tenant_psw is null then
    v_tenant_psw := 'fa5f0000-0000-4000-8000-000000000001'::uuid;
    insert into tenants (id, name, slug)
    values (v_tenant_psw, 'PSW Digital', 'psw');
    raise notice 'Tenant PSW criado: %', v_tenant_psw;
  else
    raise notice 'Tenant PSW já existia, reusando: %', v_tenant_psw;
  end if;

  -- 2. auth.users ------------------------------------------------------------
  -- As colunas de token PRECISAM ser '' e não NULL: com NULL o login devolve
  -- "Invalid login credentials" sem dizer o motivo. Mesmo padrão da 0002.
  -- O trigger handle_new_user (0022) cria o profile pelo fallback de
  -- raw_app_meta_data.tenant_id (não há convite pendente para este e-mail).
  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email'),
                         'tenant_id', v_tenant_psw::text),
      jsonb_build_object('full_name', v_full_name),
      now(), now(), '', '', '', ''
    );
  end if;

  -- 3. auth.identities — sem isto, login email/senha falha -------------------
  if not exists (select 1 from auth.identities
                 where provider = 'email' and user_id = v_user_id) then
    insert into auth.identities (id, user_id, provider_id, identity_data,
                                 provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user_id, v_user_id::text,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email,
                               'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  end if;

  -- 4. Profile com o papel novo ---------------------------------------------
  -- O trigger cria como 'member'; a promoção a psw_staff é explícita aqui.
  insert into profiles (id, tenant_id, email, full_name, role)
  values (v_user_id, v_tenant_psw, v_email, v_full_name, 'psw_staff')
  on conflict (id) do update
    set role = 'psw_staff', tenant_id = v_tenant_psw;

  -- 5. Escolhe DUAS empresas diferentes, nenhuma delas a PSW ----------------
  -- A primeira é a de maior volume (a lista fica mais convincente: ele vê 1
  -- de dezenas, não 1 de 1). A segunda é qualquer outra com oportunidade.
  select o.tenant_id into v_tenant_a
  from opportunities o
  where o.tenant_id <> v_tenant_psw
  group by o.tenant_id
  order by count(*) desc
  limit 1;

  select o.tenant_id into v_tenant_b
  from opportunities o
  where o.tenant_id <> v_tenant_psw
    and o.tenant_id <> v_tenant_a
  group by o.tenant_id
  order by count(*) desc
  limit 1;

  if v_tenant_a is null or v_tenant_b is null then
    raise exception 'Preciso de pelo menos 2 empresas com oportunidades — encontrei % e %.',
      v_tenant_a, v_tenant_b;
  end if;

  select id into v_opp_a from opportunities
   where tenant_id = v_tenant_a order by created_at limit 1;
  select id into v_opp_b from opportunities
   where tenant_id = v_tenant_b order by created_at limit 1;

  -- 6. Atribuições — limpa antes para o resultado ser sempre exatamente 2 ----
  delete from opportunity_assignees where profile_id = v_user_id;

  insert into opportunity_assignees (opportunity_id, profile_id, tenant_id)
  values (v_opp_a, v_user_id, v_tenant_a),
         (v_opp_b, v_user_id, v_tenant_b);

  raise notice 'OK. Empresa A=% (opp %), Empresa B=% (opp %)',
    v_tenant_a, v_opp_a, v_tenant_b, v_opp_b;
end $$;

-- =============================================================================
-- Conferência — o que o QA deve enxergar ao logar
-- =============================================================================
select
  t.name                                as empresa,
  o.seq_id,
  left(coalesce(o.processo, '—'), 60)   as processo
from opportunity_assignees a
join opportunities o on o.id = a.opportunity_id
join tenants t        on t.id = o.tenant_id
where a.profile_id = 'fa5f0000-0000-4000-8000-000000000002'::uuid
order by t.name;
-- Esperado: exatamente 2 linhas, de 2 empresas DIFERENTES.
-- Ao logar como qa.pswstaff@pswdigital.com.br, /opportunities deve listar
-- essas 2 e mais nada — nem as demais oportunidades dessas mesmas empresas.
