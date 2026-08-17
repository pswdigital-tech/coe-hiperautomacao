-- =============================================================================
-- 0044_psw_staff_only_assigned.sql — `psw_staff` vê e escreve APENAS o que lhe
-- foi atribuído, inclusive dentro do próprio tenant da PSW
-- =============================================================================
-- POR QUE ESTE ARQUIVO EXISTE: o goal da Phase 17 diz "ao logar ela enxerga
-- SOMENTE as oportunidades atribuídas". A 0040/0041 entregaram o acesso POR
-- ATRIBUIÇÃO de forma aditiva, mas não removeram o acesso POR TENANT que o
-- papel herda de ser um perfil dentro de um tenant. Resultado observado na
-- verificação: o usuário de QA (tenant PSW, 2 atribuições) enxergava 6
-- oportunidades — as 2 atribuídas MAIS as 4 do tenant da PSW.
--
-- Isso contradiz o objetivo declarado da fase. Decisão do PO (2026-08-07):
-- o papel `psw_staff` vê única e exclusivamente o que lhe foi atribuído.
-- `member`, `viewer`, `tenant_admin` e `platform_admin` NÃO mudam em nada.
--
-- POR QUE POLICY RESTRITIVA, e não reescrever as policies existentes:
-- as policies por tenant foram refinadas ao longo de várias migrations (a
-- 0015 acrescentou o gate de `viewer`, a 0025 as variantes de platform_admin).
-- Reproduzi-las à mão para acrescentar `and current_user_role() <> 'psw_staff'`
-- arriscaria reverter silenciosamente algum desses refinamentos. Uma policy
-- RESTRICTIVE é combinada com AND sobre o resultado de TODAS as permissivas
-- (que entre si combinam com OR), então ela expressa a regra sem tocar em
-- nenhuma definição existente:
--
--   permissivas (OR entre si)  AND  restritiva
--
--   • papel <> psw_staff  → o 1º disjunto da restritiva é verdadeiro, ela
--     nunca barra nada, e o comportamento fica BYTE-IDÊNTICO ao de hoje.
--     Vale inclusive para platform_admin.
--   • papel  = psw_staff  → a restritiva exige que a linha pertença a uma
--     oportunidade atribuída. As permissivas continuam concedendo por tenant,
--     mas o AND corta — sobra exatamente o conjunto atribuído.
--
-- `for all` cobre select/insert/update/delete de uma vez, com `using` e
-- `with check`, porque um papel que só ENXERGA o atribuído também só deve
-- ESCREVER no atribuído — deixar a escrita aberta por tenant enquanto a
-- leitura fecha produziria exatamente o tipo de incoerência silenciosa que
-- a 0043 existe para impedir.
--
-- O QUE ESTE ARQUIVO NÃO TOCA, DE PROPÓSITO:
--   • `profiles` — `profiles_select_same_tenant` (0001) é o ÚNICO caminho
--     pelo qual um psw_staff lê o PRÓPRIO perfil. Fechá-lo faria
--     `getCurrentProfile()` devolver null e QUEBRARIA O APP INTEIRO para ele.
--     Ver os colegas da própria PSW não é "ver demanda de cliente".
--   • `tenants` — ver o registro da própria empresa é inofensivo e alimenta
--     branding/cabeçalho (0033).
--   • `audit_log`, `invited_emails`, `storage.objects` — não são tabelas de
--     demanda; seus recortes já foram tratados em 0041/0042.
--
-- CONSEQUÊNCIA A CONHECER: as oportunidades cadastradas no PRÓPRIO tenant da
-- PSW passam a ser invisíveis para o staff PSW. Elas seguem visíveis para o
-- `platform_admin` e para qualquer `tenant_admin` da PSW. Se a PSW usa esse
-- tenant para demandas internas, a forma de dar acesso a alguém passa a ser
-- atribuir — como para qualquer outra empresa. Isso é o pedido, não um efeito
-- colateral.
--
-- IDEMPOTENTE: `drop policy if exists` antes de cada `create policy`.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. `opportunities` — a chave é `id`, não `opportunity_id`
-- -----------------------------------------------------------------------------
drop policy if exists opportunities_psw_staff_only_assigned on opportunities;
create policy opportunities_psw_staff_only_assigned on opportunities
  as restrictive
  for all
  using (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
  );

-- -----------------------------------------------------------------------------
-- 2. Tabelas filhas — a chave é `opportunity_id`
-- -----------------------------------------------------------------------------
-- Laço em vez de 7 blocos repetidos: o predicado é literalmente o mesmo, e
-- repetir à mão é como uma tabela acaba esquecida. `to_regclass` protege
-- contra tabela ausente; a checagem de coluna evita criar a policy onde o
-- predicado não faria sentido.
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

    execute format('drop policy if exists %I on %I', t || '_psw_staff_only_assigned', t);
    execute format($f$
      create policy %I on %I
        as restrictive
        for all
        using (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
        )
        with check (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
        )
    $f$, t || '_psw_staff_only_assigned', t);

    raise notice 'restritiva criada em %', t;
  end loop;
end $$;

-- =============================================================================
-- Verificação pós-apply
-- =============================================================================
-- 1. As 8 restritivas existem (esperado: 8 linhas, todas permissive = false)
select tablename, policyname, permissive, cmd
from pg_policies
where policyname like '%_psw_staff_only_assigned'
order by tablename;

-- 2. O TESTE QUE IMPORTA — o usuário de QA deve passar a ver 2, não 6.
--    (2 atribuídas; as 4 do tenant PSW somem)
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','fa5f0000-0000-4000-8000-000000000002',
--                     'role','authenticated')::text, true);
-- select count(*) as esperado_2 from opportunities;
-- select o.tenant_id, count(*) from opportunities o group by o.tenant_id;
-- rollback;

-- 3. NÃO-REGRESSÃO — um usuário comum não pode ter perdido nada.
--    Troque <UID_DE_UM_MEMBER> por um profile `member`/`tenant_admin` real e
--    compare com a contagem do tenant dele. Tem que bater exatamente.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DE_UM_MEMBER>','role','authenticated')::text, true);
-- select count(*) as visiveis from opportunities;
-- rollback;
-- -- comparar com: select count(*) from opportunities where tenant_id = '<TENANT_DELE>';

-- =============================================================================
-- ROLLBACK (se algo der errado, isto devolve o comportamento anterior):
--   drop policy if exists opportunities_psw_staff_only_assigned on opportunities;
--   drop policy if exists opportunity_phases_psw_staff_only_assigned on opportunity_phases;
--   drop policy if exists opportunity_risks_psw_staff_only_assigned on opportunity_risks;
--   drop policy if exists opportunity_notes_psw_staff_only_assigned on opportunity_notes;
--   drop policy if exists opportunity_documents_psw_staff_only_assigned on opportunity_documents;
--   drop policy if exists opportunity_history_psw_staff_only_assigned on opportunity_history;
--   drop policy if exists opportunity_tasks_psw_staff_only_assigned on opportunity_tasks;
--   drop policy if exists opportunity_assignees_psw_staff_only_assigned on opportunity_assignees;
-- Nenhuma policy pré-existente foi alterada, então o rollback é completo.
-- =============================================================================
