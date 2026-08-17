-- =============================================================================
-- 0038_audit_log.sql — Rastreabilidade universal (v0.5)
-- -----------------------------------------------------------------------------
-- UMA tabela (`audit_log`) + UMA função de trigger genérica (`audit_trigger()`)
-- plugada em todas as tabelas de domínio. Toda linha criada, editada ou
-- apagada no sistema vira um registro aqui — inclusive mutações que NÃO passam
-- pelas server actions (RPC do formulário público, cascatas de ON DELETE,
-- correção manual no SQL Editor). É por isso que a captura fica no banco e não
-- na app: uma action nova nasce auditada sem ninguém lembrar de instrumentar.
--
-- Para UPDATE, `changes` guarda o de→para campo a campo:
--   {"status": {"de": "backlog", "para": "desenvolvimento"}, ...}
-- `old_data`/`new_data` guardam a linha inteira (forense/restauração).
--
-- Visibilidade: platform_admin vê tudo; tenant_admin vê só o próprio tenant.
-- Usuário comum NÃO lê a tabela — a aba "Histórico" da oportunidade passa pela
-- função SECURITY DEFINER `opportunity_audit_trail()` no fim deste arquivo.
--
-- Append-only de verdade: sem policy e sem grant de INSERT/UPDATE/DELETE. A
-- única coisa que escreve aqui é a trigger (SECURITY DEFINER). Nem a app com
-- service_role consegue forjar ou apagar uma linha via PostgREST.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum + tabela
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type audit_action as enum ('insert', 'update', 'delete');
  end if;
end$$;

create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  -- Nullable: uma linha órfã (tenant não resolvido) é melhor que uma mutação
  -- não auditada. Na prática só acontece se surgir tabela global sem tenant_id.
  --
  -- ON DELETE CASCADE é deliberado: apagar uma empresa apaga a trilha dela
  -- junto (direito ao esquecimento / offboarding). O efeito colateral aceito é
  -- que a exclusão do próprio tenant não deixa rastro — quem precisar auditar
  -- isso deve exportar antes. Trocar para SET NULL preservaria o histórico ao
  -- custo de manter dados do cliente após o offboarding.
  tenant_id    uuid references tenants(id) on delete cascade,
  table_name   text        not null,
  record_id    uuid,
  action       audit_action not null,
  -- Ator: FK para rastrear + snapshot de e-mail/role porque o profile pode ser
  -- apagado depois e o log precisa continuar legível anos à frente.
  actor_id     uuid references profiles(id) on delete set null,
  actor_email  text,
  actor_role   text,
  -- {campo: {de, para}} — só em UPDATE. Chave vazia = update no-op (não grava).
  changes      jsonb,
  old_data     jsonb,
  new_data     jsonb,
  -- Contexto opcional injetado pela app antes da mutação:
  --   select set_config('app.audit_context', 'Kanban: arrastou card', true);
  contexto     text,
  created_at   timestamptz not null default now()
);

-- Índices desenhados para os filtros da tela de log (período, empresa, usuário,
-- tabela) e para o lookup por registro da aba Histórico.
create index if not exists audit_log_tenant_created_idx
  on audit_log(tenant_id, created_at desc);
create index if not exists audit_log_record_idx
  on audit_log(table_name, record_id, created_at desc);
create index if not exists audit_log_actor_idx
  on audit_log(actor_id, created_at desc);
create index if not exists audit_log_created_idx
  on audit_log(created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Função de trigger genérica
-- -----------------------------------------------------------------------------
-- Colunas ignoradas no de→para: mudam em todo update sem informar nada.
-- (`updated_at` é setado por trigger; os *_at de sistema idem.)
create or replace function audit_ignored_columns()
returns text[]
language sql
immutable
as $$ select array['updated_at']::text[] $$;

create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_tenant   uuid;
  v_record   uuid;
  v_actor    uuid := auth.uid();
  v_email    text;
  v_role     text;
  v_ctx      text;
  v_action   audit_action;
  k          text;
begin
  if TG_OP = 'INSERT' then
    v_action := 'insert';
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    v_action := 'delete';
    v_old := to_jsonb(OLD);
  end if;

  v_row := coalesce(v_new, v_old);

  -- Tenant: a maioria das tabelas carrega `tenant_id`; `tenants` é ela própria.
  if TG_TABLE_NAME = 'tenants' then
    v_tenant := (v_row ->> 'id')::uuid;
  else
    v_tenant := nullif(v_row ->> 'tenant_id', '')::uuid;
  end if;

  v_record := nullif(v_row ->> 'id', '')::uuid;

  -- de→para campo a campo. Comparação em texto do jsonb: pega mudança em
  -- escalar, array e objeto sem precisar conhecer o tipo de cada coluna.
  if TG_OP = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k = any (audit_ignored_columns()) then
        continue;
      end if;
      if (v_old -> k) is distinct from (v_new -> k) then
        v_changes := v_changes || jsonb_build_object(
          k, jsonb_build_object('de', v_old -> k, 'para', v_new -> k)
        );
      end if;
    end loop;

    -- Update que não mexeu em nada relevante: não polui o log.
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- Snapshot do ator. Sem sessão (RPC pública do formulário, job de sistema)
  -- fica null e o `contexto` conta a história.
  if v_actor is not null then
    select p.email, p.role::text into v_email, v_role
    from profiles p where p.id = v_actor;
  end if;

  v_ctx := nullif(current_setting('app.audit_context', true), '');

  insert into audit_log (
    tenant_id, table_name, record_id, action,
    actor_id, actor_email, actor_role,
    changes, old_data, new_data, contexto
  ) values (
    v_tenant, TG_TABLE_NAME, v_record, v_action,
    v_actor, v_email, v_role,
    case when TG_OP = 'UPDATE' then v_changes else null end,
    v_old, v_new, v_ctx
  );

  return null; -- AFTER trigger: o valor de retorno é ignorado.
end$$;

-- -----------------------------------------------------------------------------
-- 3. Plugar em todas as tabelas de domínio
-- -----------------------------------------------------------------------------
-- Fora da lista de propósito:
--   opportunity_phases     — DERIVADA, não auditável. Nenhuma action escreve
--                            nela: quem a mantém é a trigger sync_opportunity_phase
--                            (0004), a partir de opportunities.status. Auditá-la
--                            transformaria UMA troca de status em TRÊS linhas de
--                            log (o update da oportunidade + fechar a fase antiga
--                            + abrir a nova), e as duas extras só repetem, em
--                            phase_key, o que a primeira já diz em status. Mesmo
--                            princípio do score (docs/PROJETO.md §3): audita-se a
--                            entrada, não a derivação.
--   opportunity_history    — log legado congelado (0018), auditar log é ruído
--   public_form_submissions— já é um log de tentativas (0007)
--   tenant_sequences       — contador interno do seq_id, incrementa sem parar
--   audit_log              — óbvio
do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunities',
    'opportunity_tasks',
    'opportunity_risks',
    'opportunity_notes',
    'opportunity_documents',
    'opportunity_assignees',
    'profiles',
    'invited_emails',
    'tenants'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists audit_%1$s on %1$I', t);
      execute format(
        'create trigger audit_%1$s after insert or update or delete on %1$I
           for each row execute function audit_trigger()', t
      );
    end if;
  end loop;
end$$;

-- Rede de segurança: se uma versão anterior desta migration chegou a rodar com
-- opportunity_phases na lista, o trigger dela continuaria ativo (o loop acima
-- só mexe no que está na lista). Removê-lo aqui torna a 0038 idempotente sob
-- reaplicação.
drop trigger if exists audit_opportunity_phases on opportunity_phases;

-- -----------------------------------------------------------------------------
-- 4. RLS — leitura só para admin; escrita para ninguém
-- -----------------------------------------------------------------------------
alter table audit_log enable row level security;

drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
  for select
  using (
    is_platform_admin()
    or (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
  );

-- Sem policy de insert/update/delete e sem grant: append-only garantido pelo
-- banco, não por disciplina da app. Quem escreve é a trigger (definer).
revoke all on audit_log from authenticated, anon;
grant select on audit_log to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Trilha por oportunidade — aba "Histórico" para usuário comum
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER para furar o RLS admin-only do audit_log. ATENÇÃO: dentro de
-- uma função definer o RLS das outras tabelas TAMBÉM é bypassado (a função roda
-- como owner), então o gate de tenant precisa ser EXPLÍCITO — não dá para
-- confiar na policy de `opportunities` aqui. Cobre a oportunidade e os filhos
-- que a app de fato escreve (tarefas, riscos, notas, documentos, responsáveis);
-- `opportunity_phases` não entra porque não é auditada — ver §3.
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
as $$
declare
  v_tenant uuid;
begin
  select o.tenant_id into v_tenant
  from opportunities o
  where o.id = p_opportunity_id;

  if v_tenant is null then
    return; -- oportunidade inexistente
  end if;

  -- Gate de tenant EXPLÍCITO (o RLS não protege dentro de uma função definer).
  -- platform_admin atravessa; qualquer outro só lê a trilha do próprio tenant.
  if not is_platform_admin() and v_tenant is distinct from current_tenant_id() then
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
end$$;

-- EXECUTE é concedido a PUBLIC por padrão — revoga antes, senão `anon` (o
-- formulário público) poderia chamar a função. O gate de tenant já devolveria
-- vazio para ele, mas defesa em profundidade custa uma linha.
revoke execute on function opportunity_audit_trail(uuid) from public, anon;
grant execute on function opportunity_audit_trail(uuid) to authenticated;

-- =============================================================================
-- FIM 0038 — audit_log + audit_trigger() em 10 tabelas + opportunity_audit_trail
-- =============================================================================
