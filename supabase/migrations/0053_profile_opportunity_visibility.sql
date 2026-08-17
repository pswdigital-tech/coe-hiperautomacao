-- =============================================================================
-- 0053_profile_opportunity_visibility.sql — recorte de visibilidade POR PESSOA
-- =============================================================================
-- POR QUE ESTE ARQUIVO EXISTE: hoje quem entra num tenant como `viewer` (ou
-- `member`, ou `tenant_admin`) enxerga TODAS as oportunidades daquele tenant.
-- O pedido do PO (2026-08-12): poder liberar uma pessoa para ver só um
-- subconjunto — ou tudo, como hoje.
--
-- FORMA: é o mesmo mecanismo já provado na 0044 para `psw_staff` (policy
-- RESTRICTIVE + helper SECURITY DEFINER), aplicado a um novo eixo. Nenhuma
-- policy existente é tocada, dropada ou relaxada — restritivas combinam com
-- AND sobre o OR das permissivas, então isto SÓ pode estreitar, nunca alargar:
--
--   permissivas (OR entre si)  AND  restritiva-0044  AND  restritiva-0053
--
-- POR QUE UMA TABELA `profile_visibility` EM VEZ DE UMA COLUNA EM `profiles`:
-- `profiles` só tem `profiles_update_self` (0001) como policy de UPDATE. Para
-- um admin gravar a coluna lá seria preciso abrir UPDATE de `profiles` para
-- terceiros — e a mesma policy que deixasse gravar `visibility_scope` deixaria
-- gravar `role`, que é escalação de privilégio direta. Tabela separada isola o
-- dado novo com RLS própria e deixa `profiles` intocado.
--
-- MODELO (duas tabelas, de propósito):
--   • `profile_visibility` — o INTERRUPTOR: 'all' (padrão) ou 'restricted'.
--     Ausência de linha ≡ 'all'. Por isso ninguém muda de comportamento no
--     apply: no instante seguinte à migration, a tabela está vazia e todo
--     mundo continua vendo exatamente o que via.
--   • `profile_opportunity_access` — a LISTA, só consultada quando o
--     interruptor está em 'restricted'.
--
-- Duas tabelas e não uma ("restrito ≡ tem alguma linha na lista") porque esse
-- atalho torna "restrito a zero oportunidades" indistinguível de "vê tudo" —
-- o admin que tira o último item da lista devolveria acesso total sem querer,
-- silenciosamente. O interruptor explícito não tem esse modo de falha.
--
-- ALCANCE (decisão do PO): vale para qualquer papel de CLIENTE — `member`,
-- `viewer` e `tenant_admin`. NÃO vale para `platform_admin` (visão global é a
-- razão de ele existir) nem para `psw_staff` (já recortado pela 0044, por
-- atribuição; dois recortes concorrentes no mesmo papel seria só confusão).
--
-- QUEM GERENCIA: `platform_admin` (global), `tenant_admin` da empresa e
-- `psw_staff` com concessão de admin naquela empresa — exatamente o conjunto
-- que `is_tenant_admin_of(t)` (0045) já expressa, mais `is_platform_admin()`.
--
-- IDEMPOTENTE: `if not exists` / `drop policy if exists` / `create or replace`.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. profile_visibility — o interruptor por pessoa
-- -----------------------------------------------------------------------------
create table if not exists profile_visibility (
  profile_id uuid primary key references profiles(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  scope      text not null default 'all' check (scope in ('all', 'restricted')),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

create index if not exists profile_visibility_tenant_idx on profile_visibility(tenant_id);

-- -----------------------------------------------------------------------------
-- 2. profile_opportunity_access — a lista de oportunidades liberadas
-- -----------------------------------------------------------------------------
-- `tenant_id` redundante com o da oportunidade? Sim, e é intencional: é o que
-- permite às policies filtrarem por tenant sem join, mesmo padrão de todas as
-- tabelas filhas do projeto. A coerência é garantida pelo trigger do item 3.
create table if not exists profile_opportunity_access (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  created_by     uuid references profiles(id) on delete set null,
  unique (profile_id, opportunity_id)
);

-- O índice que a RLS realmente usa: o helper busca por profile_id e devolve
-- opportunity_id — index-only scan.
create index if not exists profile_opportunity_access_profile_idx
  on profile_opportunity_access(profile_id, opportunity_id);
create index if not exists profile_opportunity_access_opportunity_idx
  on profile_opportunity_access(opportunity_id);

-- -----------------------------------------------------------------------------
-- 3. Coerência de tenant — pessoa e oportunidade têm que ser da MESMA empresa
-- -----------------------------------------------------------------------------
-- Mesma preocupação da 0043/0032: sem isto, um insert com `tenant_id` de uma
-- empresa e `opportunity_id` de outra criaria uma linha que a RLS lê como
-- legítima. O trigger deriva o tenant do próprio par em vez de confiar no que
-- veio no insert.
create or replace function check_profile_access_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_tenant uuid;
  v_opp_tenant     uuid;
begin
  select tenant_id into v_profile_tenant from profiles where id = new.profile_id;
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;

  if v_profile_tenant is null or v_opp_tenant is null then
    raise exception 'perfil ou oportunidade inexistente'
      using errcode = '23514';
  end if;

  if v_profile_tenant is distinct from v_opp_tenant then
    raise exception 'perfil e oportunidade sao de empresas diferentes'
      using errcode = '23514';
  end if;

  -- Não confia no tenant_id enviado: deriva.
  new.tenant_id := v_opp_tenant;
  return new;
end $$;

drop trigger if exists profile_opportunity_access_tenant_guard on profile_opportunity_access;
create trigger profile_opportunity_access_tenant_guard
  before insert or update on profile_opportunity_access
  for each row execute function check_profile_access_tenant();

-- Mesma derivação para o interruptor.
create or replace function check_profile_visibility_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_tenant uuid;
  v_role           text;
begin
  select tenant_id, role into v_profile_tenant, v_role
  from profiles where id = new.profile_id;

  if v_profile_tenant is null then
    raise exception 'perfil inexistente' using errcode = '23514';
  end if;

  -- Restringir platform_admin ou psw_staff não faz sentido (ver cabeçalho) e
  -- a restritiva do item 5 os ignora de qualquer forma — barrar aqui evita
  -- gravar um interruptor que nunca surtiria efeito e confundiria o admin.
  if new.scope = 'restricted' and v_role in ('platform_admin', 'psw_staff') then
    raise exception 'recorte por oportunidade nao se aplica a este papel'
      using errcode = '23514';
  end if;

  new.tenant_id  := v_profile_tenant;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profile_visibility_tenant_guard on profile_visibility;
create trigger profile_visibility_tenant_guard
  before insert or update on profile_visibility
  for each row execute function check_profile_visibility_tenant();

-- -----------------------------------------------------------------------------
-- 4. Helpers de leitura — SECURITY DEFINER, no padrão de performance da 0040
-- -----------------------------------------------------------------------------
-- `(select auth.uid())` em vez de `auth.uid()` cru: o Postgres transforma a
-- chamada envolvida em select num InitPlan, avaliado 1x por statement em vez
-- de 1x por linha varrida (RESEARCH Pattern 2 da Phase 17).
--
-- SECURITY DEFINER porque estas funções são chamadas DE DENTRO das policies:
-- se lessem as tabelas sob RLS, a policy de `profile_visibility` chamaria o
-- helper que leria `profile_visibility`, e isso é recursão infinita.
create or replace function current_visibility_scope()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select scope from profile_visibility where profile_id = (select auth.uid())),
    'all'
  )
$$;

create or replace function current_allowed_opportunity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select opportunity_id
  from profile_opportunity_access
  where profile_id = (select auth.uid())
$$;

grant execute on function current_visibility_scope() to authenticated;
grant execute on function current_allowed_opportunity_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. As policies RESTRICTIVE — o recorte propriamente dito
-- -----------------------------------------------------------------------------
-- Predicado, lido em voz alta: "passa se o papel não é de cliente, OU o
-- interruptor não está em 'restricted', OU a oportunidade está na lista".
--
-- Os dois primeiros disjuntos são o que garante ZERO regressão: para todo
-- usuário de hoje (nenhuma linha em `profile_visibility`) o segundo disjunto
-- é verdadeiro e a restritiva nunca barra nada.
--
-- `for all` (select/insert/update/delete): quem só ENXERGA um subconjunto
-- também só deve ESCREVER nele. Deixar a escrita aberta enquanto a leitura
-- fecha é exatamente a incoerência silenciosa que a 0043 existe para impedir.
drop policy if exists opportunities_profile_visibility on opportunities;
create policy opportunities_profile_visibility on opportunities
  as restrictive
  for all
  using (
    current_user_role() not in ('member', 'viewer', 'tenant_admin')
    or current_visibility_scope() <> 'restricted'
    or id in (select current_allowed_opportunity_ids())
  )
  with check (
    current_user_role() not in ('member', 'viewer', 'tenant_admin')
    or current_visibility_scope() <> 'restricted'
    or id in (select current_allowed_opportunity_ids())
  );

-- Tabelas filhas — mesmo predicado, chave `opportunity_id`. Laço em vez de 7
-- blocos repetidos: é assim que uma tabela acaba esquecida (0044 fez igual).
do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunity_phases',
    'opportunity_risks',
    'opportunity_notes',
    'opportunity_documents',
    'opportunity_history',
    'opportunity_tasks',
    'opportunity_assignees'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'pulando % — tabela nao existe', t;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'opportunity_id'
    ) then
      raise notice 'pulando % — nao tem opportunity_id', t;
      continue;
    end if;

    execute format('drop policy if exists %I on %I', t || '_profile_visibility', t);
    execute format($f$
      create policy %I on %I
        as restrictive
        for all
        using (
          current_user_role() not in ('member', 'viewer', 'tenant_admin')
          or current_visibility_scope() <> 'restricted'
          or opportunity_id in (select current_allowed_opportunity_ids())
        )
        with check (
          current_user_role() not in ('member', 'viewer', 'tenant_admin')
          or current_visibility_scope() <> 'restricted'
          or opportunity_id in (select current_allowed_opportunity_ids())
        )
    $f$, t || '_profile_visibility', t);

    raise notice 'restritiva criada em %', t;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. RLS das tabelas novas
-- -----------------------------------------------------------------------------
-- Leitura: a própria pessoa lê o próprio recorte (o app precisa saber se está
-- restrito para exibir o aviso na tela) e quem administra a empresa lê o de
-- todo mundo dela. Escrita: SÓ quem administra.
--
-- `is_tenant_admin_of(t)` (0045) já cobre `tenant_admin` da empresa E
-- `psw_staff` com concessão naquela empresa — os dois casos pedidos pelo PO —,
-- e `is_platform_admin()` (0021) cobre o super-admin da PSW. Nenhum predicado
-- novo é inventado aqui de propósito: um predicado de autorização duplicado é
-- um predicado que vai divergir.
alter table profile_visibility          enable row level security;
alter table profile_opportunity_access  enable row level security;

drop policy if exists profile_visibility_select on profile_visibility;
create policy profile_visibility_select on profile_visibility
  for select using (
    profile_id = (select auth.uid())
    or is_platform_admin()
    or is_tenant_admin_of(tenant_id)
  );

drop policy if exists profile_visibility_write on profile_visibility;
create policy profile_visibility_write on profile_visibility
  for all
  using (is_platform_admin() or is_tenant_admin_of(tenant_id))
  with check (is_platform_admin() or is_tenant_admin_of(tenant_id));

drop policy if exists profile_opportunity_access_select on profile_opportunity_access;
create policy profile_opportunity_access_select on profile_opportunity_access
  for select using (
    profile_id = (select auth.uid())
    or is_platform_admin()
    or is_tenant_admin_of(tenant_id)
  );

drop policy if exists profile_opportunity_access_write on profile_opportunity_access;
create policy profile_opportunity_access_write on profile_opportunity_access
  for all
  using (is_platform_admin() or is_tenant_admin_of(tenant_id))
  with check (is_platform_admin() or is_tenant_admin_of(tenant_id));

grant select, insert, update, delete on profile_visibility         to authenticated;
grant select, insert, update, delete on profile_opportunity_access to authenticated;

-- ATENÇÃO — as restritivas do item 5 NÃO são aplicadas a estas duas tabelas.
-- Se fossem, um admin que se restringisse a si mesmo perderia a capacidade de
-- ler a própria lista para desfazer o recorte. As tabelas de CONTROLE ficam
-- fora do recorte que elas controlam, por construção.

-- -----------------------------------------------------------------------------
-- 7. Fechar o caminho lateral — `opportunity_audit_trail()` (0038/0042)
-- -----------------------------------------------------------------------------
-- Essa RPC é SECURITY DEFINER: RLS NÃO se aplica dentro dela, e por isso ela
-- carrega um gate de tenant escrito à mão. Sem o disjunto novo abaixo, uma
-- pessoa restrita continuaria lendo o histórico completo (incl. `new_data` de
-- cada campo) de QUALQUER oportunidade do tenant dela, bastando chamar a RPC
-- com um id — a tela não oferece o caminho, mas a chave anon + o JWT dela
-- oferecem. Recorte que vale só na UI não é recorte.
--
-- Os dois caminhos anteriores ficam INTACTOS: `is_platform_admin()` atravessa;
-- `psw_staff` com atribuição atravessa; `member`/`viewer`/`tenant_admin` do
-- próprio tenant atravessam — a menos que estejam restritos E a oportunidade
-- não esteja na lista deles. Quem não tem recorte não sente diferença.
--
-- `create or replace` reemite o corpo inteiro (o da 0042, mais o disjunto):
-- o Postgres não tem "alterar só esta linha da função".
create or replace function opportunity_audit_trail(p_opportunity_id uuid)
returns table (
  id          bigint,
  table_name  text,
  record_id   uuid,
  action      audit_action,
  actor_email text,
  changes     jsonb,
  old_data    jsonb,
  new_data    jsonb,
  contexto    text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  v_tenant uuid;
begin
  select o.tenant_id into v_tenant
  from opportunities o
  where o.id = p_opportunity_id;

  if v_tenant is null then
    return; -- oportunidade inexistente
  end if;

  if not is_platform_admin()
     and (
       v_tenant is distinct from current_tenant_id()
       -- NOVO (0053): mesmo dentro do próprio tenant, quem está restrito só
       -- atravessa pelas oportunidades da própria lista.
       or (
         current_user_role() in ('member', 'viewer', 'tenant_admin')
         and current_visibility_scope() = 'restricted'
         and p_opportunity_id not in (select current_allowed_opportunity_ids())
       )
     )
     and p_opportunity_id not in (select current_assigned_opportunity_ids())
  then
    return;
  end if;

  return query
  select a.id, a.table_name, a.record_id, a.action, a.actor_email,
         a.changes, a.old_data, a.new_data, a.contexto, a.created_at
  from audit_log a
  where a.tenant_id = v_tenant
    and (
      (a.table_name = 'opportunities' and a.record_id = p_opportunity_id)
      or (
        a.table_name in ('opportunity_tasks', 'opportunity_risks',
                         'opportunity_notes', 'opportunity_documents',
                         'opportunity_assignees')
        and coalesce(a.new_data, a.old_data) ->> 'opportunity_id'
            = p_opportunity_id::text
      )
    )
  order by a.created_at desc;
end;
$body$;

-- `create or replace function` RESETA os grants da função (mesma observação da
-- 0042) — reemitir é obrigatório, não cosmético.
revoke all on function opportunity_audit_trail(uuid) from public;
grant execute on function opportunity_audit_trail(uuid) to authenticated;

-- NÃO fechado aqui, de propósito: `fetch_public_opportunities(text)` (0035/0036)
-- continua devolvendo id/seq_id/processo/area de toda oportunidade com
-- `visivel = true` do tenant. Ela é a vitrine PÚBLICA (`/r/[slug]`), aberta a
-- `anon` — qualquer pessoa com o link já vê aquilo sem login, então recortá-la
-- por pessoa não esconderia nada de ninguém. Se o requisito virar "a pessoa
-- restrita não pode nem saber que a demanda existe", o caminho é `visivel =
-- false` (0030) na oportunidade, não uma mudança aqui.

-- =============================================================================
-- Verificação pós-apply
-- =============================================================================
-- 1. As 8 restritivas existem (esperado: 8 linhas, permissive = false)
select tablename, policyname, permissive, cmd
from pg_policies
where policyname like '%_profile_visibility'
order by tablename;

-- 2. NÃO-REGRESSÃO — com as tabelas vazias, ninguém pode ter perdido nada.
--    Troque <UID> por um `member`/`viewer`/`tenant_admin` real; a contagem tem
--    que bater exatamente com a do tenant dele.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID>','role','authenticated')::text, true);
-- select count(*) as visiveis from opportunities;
-- rollback;

-- 3. O TESTE QUE IMPORTA — restringir alguém a 1 oportunidade.
-- insert into profile_visibility (profile_id, tenant_id, scope)
--   values ('<UID>', '<TENANT>', 'restricted')
--   on conflict (profile_id) do update set scope = 'restricted';
-- insert into profile_opportunity_access (profile_id, opportunity_id, tenant_id)
--   values ('<UID>', '<OPP_ID>', '<TENANT>');
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID>','role','authenticated')::text, true);
-- select count(*) as esperado_1 from opportunities;
-- rollback;
-- -- desfazer: update profile_visibility set scope = 'all' where profile_id = '<UID>';

-- =============================================================================
-- ROLLBACK COMPLETO (devolve o comportamento anterior byte-a-byte):
--   drop policy if exists opportunities_profile_visibility on opportunities;
--   drop policy if exists opportunity_phases_profile_visibility on opportunity_phases;
--   drop policy if exists opportunity_risks_profile_visibility on opportunity_risks;
--   drop policy if exists opportunity_notes_profile_visibility on opportunity_notes;
--   drop policy if exists opportunity_documents_profile_visibility on opportunity_documents;
--   drop policy if exists opportunity_history_profile_visibility on opportunity_history;
--   drop policy if exists opportunity_tasks_profile_visibility on opportunity_tasks;
--   drop policy if exists opportunity_assignees_profile_visibility on opportunity_assignees;
--   drop table if exists profile_opportunity_access;
--   drop table if exists profile_visibility;
--   drop function if exists current_visibility_scope();
--   drop function if exists current_allowed_opportunity_ids();
--   drop function if exists check_profile_access_tenant();
--   drop function if exists check_profile_visibility_tenant();
--
-- ATENÇÃO no rollback: `opportunity_audit_trail(uuid)` (item 7) é a ÚNICA coisa
-- neste arquivo que SUBSTITUI algo pré-existente. Dropá-la deixaria o app sem
-- a aba de histórico — para desfazer, reaplique o bloco da 0042 (que reemite a
-- versão sem o disjunto novo), não um `drop function`. Fora ela, nada foi
-- alterado, e o rollback é total.
-- =============================================================================
