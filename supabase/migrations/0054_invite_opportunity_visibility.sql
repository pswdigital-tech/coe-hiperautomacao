-- =============================================================================
-- 0054_invite_opportunity_visibility.sql — recorte de visibilidade JÁ NO CONVITE
-- =============================================================================
-- POR QUE ESTE ARQUIVO EXISTE: a 0053 só permite recortar quem JÁ tem conta.
-- Pedido do PO (2026-08-12): definir o que a pessoa vai enxergar ANTES de ela
-- criar a conta, para que no primeiro login ela já entre vendo só o que deve —
-- sem a janela em que ela loga, vê tudo, e alguém corre para restringir.
--
-- FORMA: o recorte fica pendurado no CONVITE e é copiado para as tabelas da
-- 0053 por `handle_new_user()`, no mesmo instante em que o profile nasce.
-- Depois disso a fonte da verdade é a 0053, sempre — este arquivo não cria um
-- segundo mecanismo de autorização, só um estado de espera. Nenhuma policy de
-- `opportunities` (ou filhas) é tocada aqui: a RLS que recorta continua sendo
-- exclusivamente a da 0053.
--
-- POR QUE NÃO UMA COLUNA EM `invited_emails`: aquela tabela NÃO tem policy de
-- UPDATE, de propósito (0029/0047 — o único UPDATE existente é `used_at`, feito
-- pela própria `handle_new_user()`, que é definer). Criar uma para gravar o
-- recorte abriria UPDATE da linha inteira, e a mesma policy deixaria um
-- tenant_admin trocar o `role` de um convite pendente para `psw_staff` —
-- exatamente a escalada que a barreira de INSERT da 0041/0047 existe para
-- fechar. Tabela separada não encosta nisso.
--
-- POR QUE UMA TABELA SÓ (e um `uuid[]`), se a 0053 usou duas:
-- na 0053 a lista é lida pela RLS a cada query de cada usuário — precisa ser
-- linhas indexadas. Aqui a lista é escrita por um admin e lida UMA vez, dentro
-- de `handle_new_user()`, no signup. Não há caminho quente. Um array numa
-- linha só evita uma tabela, um índice e um trigger de coerência a mais, sem
-- custo nenhum. O interruptor continua explícito (`scope`) pelo mesmo motivo
-- da 0053: "restrito a zero" não pode ser indistinguível de "vê tudo".
--
-- IDEMPOTENTE: `if not exists` / `drop policy if exists` / `create or replace`.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0053 aplicada (este arquivo escreve nas tabelas dela).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. invite_visibility — o recorte que espera a pessoa criar a conta
-- -----------------------------------------------------------------------------
-- `on delete cascade` no convite: revogar um convite pendente leva junto o
-- recorte dele. Um recorte órfão apontando para um convite que não existe mais
-- só poderia confundir.
create table if not exists invite_visibility (
  invited_email_id uuid primary key references invited_emails(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  scope            text not null default 'all' check (scope in ('all', 'restricted')),
  opportunity_ids  uuid[] not null default '{}',
  updated_at       timestamptz not null default now(),
  updated_by       uuid references profiles(id) on delete set null
);

create index if not exists invite_visibility_tenant_idx on invite_visibility(tenant_id);

-- -----------------------------------------------------------------------------
-- 2. Coerência — o recorte é do tenant do convite, e só de oportunidades dele
-- -----------------------------------------------------------------------------
-- Mesma preocupação da 0053: `tenant_id` é DERIVADO do convite, nunca aceito do
-- insert. E cada id do array é verificado contra esse tenant — sem isto, um
-- array adulterado viraria acesso cross-tenant no momento em que
-- `handle_new_user()` o copiasse para `profile_opportunity_access`.
create or replace function check_invite_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_role   text;
  v_alheias int;
begin
  select tenant_id, role into v_tenant, v_role
  from invited_emails
  where id = new.invited_email_id;

  if v_tenant is null then
    raise exception 'convite inexistente' using errcode = '23514';
  end if;

  -- Mesmo alcance da 0053: `psw_staff` já é recortado por atribuição (0044) e
  -- `platform_admin` é global de propósito. Gravar um recorte para eles seria
  -- gravar algo que `handle_new_user()` teria de ignorar mais tarde.
  if new.scope = 'restricted' and v_role not in ('member', 'viewer', 'tenant_admin') then
    raise exception 'recorte por oportunidade nao se aplica a este papel'
      using errcode = '23514';
  end if;

  new.tenant_id := v_tenant;

  select count(*) into v_alheias
  from unnest(new.opportunity_ids) as sel(id)
  left join opportunities o on o.id = sel.id
  where o.id is null or o.tenant_id is distinct from v_tenant;

  if v_alheias > 0 then
    raise exception 'oportunidade inexistente ou de outra empresa no recorte'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists invite_visibility_guard on invite_visibility;
create trigger invite_visibility_guard
  before insert or update on invite_visibility
  for each row execute function check_invite_visibility();

-- -----------------------------------------------------------------------------
-- 3. RLS — mesmo predicado das tabelas da 0053
-- -----------------------------------------------------------------------------
-- Sem cláusula de auto-leitura (`profile_id = auth.uid()`) como na 0053: aqui
-- não existe "própria pessoa" — o convidado ainda não tem conta.
alter table invite_visibility enable row level security;

drop policy if exists invite_visibility_select on invite_visibility;
create policy invite_visibility_select on invite_visibility
  for select using (is_platform_admin() or is_tenant_admin_of(tenant_id));

drop policy if exists invite_visibility_write on invite_visibility;
create policy invite_visibility_write on invite_visibility
  for all
  using (is_platform_admin() or is_tenant_admin_of(tenant_id))
  with check (is_platform_admin() or is_tenant_admin_of(tenant_id));

grant select, insert, update, delete on invite_visibility to authenticated;

-- -----------------------------------------------------------------------------
-- 4. handle_new_user — copia o recorte do convite no nascimento do profile
-- -----------------------------------------------------------------------------
-- Corpo idêntico ao da 0031 (que já era o da 0022 + `cargo`), com UM bloco
-- novo no fim: se o convite trazia recorte, ele vira as linhas da 0053.
--
-- TRÊS CUIDADOS, porque esta função roda dentro do INSERT em `auth.users` e
-- qualquer exceção aqui IMPEDE A CRIAÇÃO DA CONTA:
--
--   1. O bloco novo só roda quando existe recorte 'restricted'. Ninguém sem
--      recorte (isto é, todo mundo hoje) passa por uma linha sequer a mais.
--   2. Oportunidades que sumiram entre o convite e o signup são FILTRADAS pelo
--      join com `opportunities`, não inseridas às cegas — uma FK violada aqui
--      travaria o cadastro da pessoa por causa de uma demanda excluída meses
--      antes. Some da lista, silenciosamente, que é o comportamento certo.
--   3. O papel é reconferido (`v_role in (...)`): um convite gravado como
--      `viewer` e depois... não muda, mas a checagem custa nada e mantém esta
--      função verdadeira por si só, sem depender do trigger do item 2.
--
-- O recorte NÃO é apagado do convite depois de copiado: `invited_emails` guarda
-- convites usados como trilha de auditoria de como aquele profile nasceu
-- (0029), e o recorte é parte dessa história. A partir daqui ele é inerte — só
-- a 0053 governa.
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
  v_vis       invite_visibility%rowtype;
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

  -- 3. NOVO (0054) — recorte de visibilidade herdado do convite.
  if v_invite.id is not null and v_role in ('member', 'viewer', 'tenant_admin') then
    select * into v_vis from invite_visibility where invited_email_id = v_invite.id;

    if found and v_vis.scope = 'restricted' then
      insert into profile_visibility (profile_id, tenant_id, scope, updated_by)
      values (new.id, v_tenant_id, 'restricted', v_vis.updated_by);

      -- Só ids que ainda existem E ainda são do tenant (ver cuidado 2).
      insert into profile_opportunity_access (profile_id, opportunity_id, tenant_id, created_by)
      select new.id, o.id, o.tenant_id, v_vis.updated_by
      from unnest(v_vis.opportunity_ids) as sel(id)
      join opportunities o on o.id = sel.id and o.tenant_id = v_tenant_id;
    end if;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- Verificação pós-apply
-- =============================================================================
-- 1. A tabela e as duas policies existem
select policyname, permissive, cmd from pg_policies where tablename = 'invite_visibility';

-- 2. NÃO-REGRESSÃO — um convite SEM recorte tem que continuar criando a conta
--    exatamente como antes. Convide um e-mail de teste pela UI e crie a conta:
--    o profile nasce e `profile_visibility` continua VAZIA para ele.
-- select * from profile_visibility where profile_id = '<UID_NOVO>';  -- 0 linhas

-- 3. O TESTE QUE IMPORTA — convite COM recorte.
-- insert into invite_visibility (invited_email_id, tenant_id, scope, opportunity_ids)
--   values ('<INVITE_ID>', '<TENANT>', 'restricted', array['<OPP_ID>']::uuid[]);
--    …criar a conta com aquele e-mail e conferir que a herança aconteceu:
-- select scope from profile_visibility where profile_id = '<UID_NOVO>';        -- 'restricted'
-- select count(*) from profile_opportunity_access where profile_id = '<UID_NOVO>'; -- 1

-- 4. A coerência barra o cross-tenant (esperado: erro 23514)
-- insert into invite_visibility (invited_email_id, tenant_id, scope, opportunity_ids)
--   values ('<INVITE_ID>', '<TENANT>', 'restricted', array['<OPP_DE_OUTRA_EMPRESA>']::uuid[]);

-- =============================================================================
-- ROLLBACK:
--   drop table if exists invite_visibility;      -- leva o trigger junto
--   drop function if exists check_invite_visibility();
--   -- e REAPLICAR o bloco de `handle_new_user()` da 0031, que é a versão sem
--   -- o passo 3. NÃO dropar a função: sem ela, nenhum cadastro novo cria
--   -- profile, e o app quebra para todo mundo que entrar depois.
-- Os recortes já herdados por quem criou conta continuam valendo — eles vivem
-- nas tabelas da 0053, que este rollback não toca.
-- =============================================================================
