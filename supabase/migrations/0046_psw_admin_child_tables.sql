-- =============================================================================
-- 0046_psw_admin_child_tables.sql — propaga a concessão da 0045 às SETE
-- tabelas filhas de `opportunities` e a `profiles`
-- =============================================================================
-- CONTEXTO: a `0045` (TRACER, aplicada e verificada em produção) provou o
-- mecanismo de concessão pessoa × empresa numa fatia fina: SELECT em
-- `opportunities`/`tenants`, mais o UPDATE mínimo em `opportunities` (desvio
-- autorizado da Task 2 daquele plano). O estado depois da `0045` é
-- ESTRITAMENTE MENOS PERMISSIVO do que o pedido — o staff-admin de A enxerga
-- a oportunidade-raiz de A, mas AINDA NÃO enxerga o que pende dela: fases,
-- riscos, anotações, documentos, histórico, tarefas e atribuições. Este
-- arquivo fecha exatamente essa lacuna, e mais a aba de Equipe (`profiles`)
-- do tenant concedido.
--
-- POR QUE PRECISA DAS DUAS METADES DE NOVO: a mesma explicação central da
-- `0045` vale aqui, tabela por tabela. Uma policy RESTRICTIVE só SUBTRAI —
-- as 7 restritivas vivas da `0044` (`<tabela>_psw_staff_only_assigned`)
-- barram o `psw_staff` para tudo que não é atribuição nominal, e acrescentar
-- SÓ um terceiro disjunto a elas é INERTE se nenhuma policy PERMISSIVA
-- concede, tenant-wide, a uma linha da filha. Nenhuma concede hoje: as
-- permissivas por tenant (`<tabela>_select/insert/update/delete`, 0001/0011/
-- 0018/0037) exigem `tenant_id = current_tenant_id()` (o tenant da PSW, nunca
-- o do tenant concedido), e as permissivas por atribuição (0040/0041) exigem
-- `opportunity_id in (select current_assigned_opportunity_ids())`, nunca por
-- tenant. Por isso este arquivo entrega, para as mesmas 7 tabelas, as DUAS
-- metades no mesmo pacote: PERMISSIVAS novas (Bloco A, que concedem) e a
-- reemissão das 7 RESTRICTIVE da `0044` com um terceiro disjunto (Bloco B,
-- que impede que a concessão nova seja cortada de volta a zero). Cada metade
-- é inútil sem a outra — exatamente como na `0045`.
--
-- POR QUE A LISTA DE VERBOS NÃO É UNIFORME: D-A (CONTEXT.md) pede
-- EQUIVALÊNCIA aos poderes de um `tenant_admin` daquele tenant, nunca um
-- superconjunto. Usar `for all` cegamente nas 7 tabelas daria ao staff-admin
-- `UPDATE`/`DELETE` em `opportunity_history` (append-only para TODO mundo
-- desde a `0018` — nem o `tenant_admin` tem esses verbos) e `UPDATE` em
-- `opportunity_notes`/`opportunity_documents` (que ninguém tem, pelo mesmo
-- motivo: uma anotação/documento é apagado e recriado, nunca editado). O
-- laço do Bloco A carrega, junto do nome de cada tabela, a lista EXATA de
-- verbos que um `tenant_admin` daquele tenant já tem hoje — nem mais, nem
-- menos.
--
-- PRÉ-REQUISITO DURO: a `0045_psw_tenant_admins_grant.sql` precisa estar
-- APLICADA em produção antes de rodar este arquivo — ele consome
-- `is_tenant_admin_of(uuid)` e `current_admin_tenant_ids()`, ambas criadas
-- ali. Se a `0045` não estiver aplicada, este arquivo falha ruidosamente
-- (função inexistente) — esse é o comportamento DESEJADO, não um bug a
-- proteger com `if not exists`: rodar esta migration sem a fundação da `0045`
-- não deveria "quase funcionar" em silêncio.
--
-- OBJETOS NOVOS DESTA MIGRATION:
--   Bloco A (permissivas aditivas, por tabela × verbo, sufixo `_psw_admin`):
--     opportunity_phases_{select,insert,update,delete}_psw_admin
--     opportunity_risks_{select,insert,update,delete}_psw_admin
--     opportunity_tasks_{select,insert,update,delete}_psw_admin
--     opportunity_assignees_{select,insert,update,delete}_psw_admin
--     opportunity_notes_{select,insert,delete}_psw_admin        (sem update)
--     opportunity_documents_{select,insert,delete}_psw_admin    (sem update)
--     opportunity_history_{select,insert}_psw_admin              (append-only)
--   Bloco B (reemitidas, mesmos 7 nomes da 0044, agora com 3 disjuntos):
--     opportunity_phases_psw_staff_only_assigned
--     opportunity_risks_psw_staff_only_assigned
--     opportunity_notes_psw_staff_only_assigned
--     opportunity_documents_psw_staff_only_assigned
--     opportunity_history_psw_staff_only_assigned
--     opportunity_tasks_psw_staff_only_assigned
--     opportunity_assignees_psw_staff_only_assigned
--   Bloco C: profiles_select_psw_admin
--
-- O QUE ESTE ARQUIVO NÃO TOCA, DE PROPÓSITO: `opportunities` e `tenants` (já
-- resolvidos pela `0045` — reemiti-los aqui duplicaria trabalho e arriscaria
-- divergência); `invited_emails`, `audit_log`, `storage.objects` e a troca
-- das policies vivas de `tenant_admin` (escopo do plano seguinte da fase);
-- os triggers de coerência de tenant das filhas (Phase 17/0043) — invariantes
-- de banco que este arquivo consome, nunca edita.
--
-- WRITE-ONLY MODE — este arquivo NÃO é aplicado por este agente. O apply é
-- SEMPRE manual, no Supabase Cloud SQL Editor, por um humano (ver o handoff
-- desta fase, `18-03-MIGRATION-HANDOFF.md`). Nenhum comando de auto-apply de
-- CLI pertence a este arquivo.
--
-- IDEMPOTENTE: todo `create policy` é precedido do `drop policy if exists`
-- correspondente; a checagem de coluna e o `to_regclass` tornam o laço seguro
-- para rodar mais de uma vez. Rodar este arquivo duas vezes não produz erro.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- BLOCO A — permissivas novas por tabela e verbo, nas 7 tabelas filhas
-- -----------------------------------------------------------------------------
-- Aditivas no sentido da 0040/0041/0045: NENHUMA policy existente é dropada,
-- substituída ou relaxada. Para qualquer papel que não seja `psw_staff` com
-- concessão ativa, `is_tenant_admin_of()` reduz ao predicado antigo (o ramo
-- `tenant_admin` byte-equivalente, D-J) — então estas policies NUNCA
-- concedem nada de novo a ninguém além do staff-admin recém-concedido
-- (D-J / GRANT-10).
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- tabela,                    verbos que um tenant_admin daquele tenant tem hoje
      ('opportunity_phases',        array['select','insert','update','delete']),
      ('opportunity_risks',         array['select','insert','update','delete']),
      ('opportunity_tasks',         array['select','insert','update','delete']),
      ('opportunity_assignees',     array['select','insert','update','delete']),
      ('opportunity_notes',         array['select','insert','delete']),          -- 0018: sem update p/ ninguém
      ('opportunity_documents',     array['select','insert','delete']),          -- 0018: sem update p/ ninguém
      ('opportunity_history',       array['select','insert'])                    -- 0018: append-only, sem update/delete p/ ninguém
    ) as t(tbl, verbs)
  loop
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'pulando % — tabela nao existe', spec.tbl;
      continue;
    end if;

    -- Diverge DE PROPÓSITO da 0044 (que usa `continue` + raise notice quando
    -- a coluna falta): lá a ausência significava "esta tabela não participa
    -- do laço". Aqui significaria "esta tabela ficou sem a concessão e
    -- ninguém percebeu" — exatamente o modo de falha silencioso que este
    -- laço existe para evitar. Abortar alto é a escolha correta.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = spec.tbl and column_name = 'tenant_id'
    ) then
      raise exception 'ABORTANDO: % nao tem tenant_id — o predicado desta fase nao se aplica', spec.tbl;
    end if;

    -- SELECT / DELETE usam USING; INSERT usa WITH CHECK; UPDATE usa os dois.
    if 'select' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_select_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for select using (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_select_psw_admin', spec.tbl);
    end if;
    if 'insert' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_insert_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for insert with check (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_insert_psw_admin', spec.tbl);
    end if;
    if 'update' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_update_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for update using (is_tenant_admin_of(tenant_id)) with check (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_update_psw_admin', spec.tbl);
    end if;
    if 'delete' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_delete_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for delete using (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_delete_psw_admin', spec.tbl);
    end if;

    raise notice 'permissivas psw_admin criadas em % (%)', spec.tbl, spec.verbs;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- BLOCO B — reemitir as 7 restritivas da 0044 com um TERCEIRO disjunto
-- -----------------------------------------------------------------------------
-- Como a 0044 é idempotente por `drop policy if exists` + `create policy`, a
-- forma correta é REEMITIR o laço inteiro com o predicado novo — "editar" uma
-- policy não é possível de forma idempotente. Os dois primeiros disjuntos
-- abaixo são LITERALMENTE os da 0044 (curto-circuito por papel +
-- `current_assigned_opportunity_ids()` pela chave `opportunity_id`) — não
-- reescritos, não reformulados. `tests/schema/psw-staff-restrictive-rule.ts`
-- (18-01) é o detector estático desse invariante para a 0044 imutável; o
-- spec `c4-baseline` (Task 3 deste plano) é quem reconfere esta reemissão em
-- runtime.
--
-- O terceiro disjunto consome `current_admin_tenant_ids()` (a concessão PURA,
-- `setof uuid`, NÃO-correlacionada) e não `is_tenant_admin_of(tenant_id)`:
-- dentro de um predicado já protegido pelo curto-circuito de papel
-- (`current_user_role() is distinct from 'psw_staff'`), o ramo `tenant_admin`
-- do helper booleano é irrelevante e só pagaria custo à toa — mesma decisão
-- do Bloco 7 da 0045.
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

    execute format('drop policy if exists %I on %I', t || '_psw_staff_only_assigned', t);
    execute format($f$
      create policy %I on %I
        as restrictive
        for all
        using (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
          or tenant_id in (select current_admin_tenant_ids())
        )
        with check (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
          or tenant_id in (select current_admin_tenant_ids())
        )
    $f$, t || '_psw_staff_only_assigned', t);

    raise notice 'restritiva reemitida (3 disjuntos) em %', t;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- BLOCO C — `profiles`
-- -----------------------------------------------------------------------------
-- Sem esta policy, a tela de Equipe do tenant concedido vem VAZIA SEM ERRO
-- NENHUM — o mesmo sintoma que a 0041 já documentou para o staff por
-- atribuição (0041:265-270). `profiles` NÃO tem policy restritiva da 0044
-- (a 0044:41-44 explica por quê: fechá-la quebraria `getCurrentProfile()` e
-- derrubaria o app inteiro para o staff) — logo esta permissiva é ADITIVA
-- PURA e não precisa de contraparte restritiva.
drop policy if exists profiles_select_psw_admin on profiles;
create policy profiles_select_psw_admin on profiles
  for select using (is_tenant_admin_of(tenant_id));

-- =============================================================================
-- BLOCO D — Verificação pós-apply (rodar manualmente — ver a versão numerada
-- completa, com queries prontas para copiar/colar, em
-- `18-03-MIGRATION-HANDOFF.md`)
-- =============================================================================

-- D1. Inventário: quantas permissivas com o sufixo desta fase cada uma das 7
--     filhas recebeu — ESPERADO: opportunity_phases=4, opportunity_risks=4,
--     opportunity_tasks=4, opportunity_assignees=4, opportunity_notes=3,
--     opportunity_documents=3, opportunity_history=2 (4/4/4/4/3/3/2). Uma
--     tabela com MAIS verbos do que o previsto significa que o staff-admin
--     ganhou poder que um tenant_admin daquele tenant não tem.
select tablename, count(*) as permissivas_psw_admin
from pg_policies
where policyname like '%\_psw\_admin' escape '\'
  and tablename in (
    'opportunity_phases','opportunity_risks','opportunity_tasks',
    'opportunity_assignees','opportunity_notes','opportunity_documents',
    'opportunity_history'
  )
group by tablename
order by tablename;

-- D2. As 7 restritivas contêm o texto do terceiro disjunto — ESPERADO: 7 linhas.
select tablename, policyname
from pg_policies
where policyname like '%_psw_staff_only_assigned'
  and tablename <> 'opportunities'
  and qual like '%current_admin_tenant_ids%'
order by tablename;

-- D3. As policies PRÉ-EXISTENTES de cada filha continuam todas presentes —
--     comparar esta contagem com o número anotado ANTES do apply (mesmo
--     valor, nenhuma dropada).
select tablename, count(*) as total_policies
from pg_policies
where tablename in (
  'opportunity_phases','opportunity_risks','opportunity_tasks',
  'opportunity_assignees','opportunity_notes','opportunity_documents',
  'opportunity_history'
)
group by tablename
order by tablename;

-- D4. `profiles_select_psw_admin` presente; `profiles` SEM nenhuma restritiva.
select policyname, permissive, cmd from pg_policies where tablename = 'profiles' order by policyname;

-- D5. PROPAGAÇÃO (positivo) — com o staff de teste e concessão ativa no
--     tenant A, contar linhas visíveis em cada uma das 7 filhas ligadas a uma
--     oportunidade de A NÃO atribuída — todas maiores que zero quando houver
--     dado. Ver o handoff para a query pronta, uma por tabela.
-- D6. NEGATIVO — as mesmas 7 contagens para o tenant de controle: todas zero.
-- D7. NÃO-REGRESSÃO — contagens de um member e de um tenant_admin de A nas 7
--     filhas, antes e depois do apply: os pares têm que bater exatamente.
-- (D5/D6/D7 dependem de `set_config('request.jwt.claims', …)` fingindo a
-- sessão de um usuário real — ver o handoff desta fase para as queries
-- prontas, sem placeholder a substituir.)

-- =============================================================================
-- BLOCO E — ROLLBACK (nesta ordem — a ordem importa)
-- =============================================================================
-- 1. Dropar as policies com o sufixo desta fase nas 7 tabelas (o mesmo laço
--    do Bloco A, com `drop policy if exists` em vez de `create policy`):
--      do $$
--      declare t text;
--      begin
--        foreach t in array array[
--          'opportunity_phases','opportunity_risks','opportunity_tasks',
--          'opportunity_assignees','opportunity_notes','opportunity_documents',
--          'opportunity_history'
--        ]
--        loop
--          execute format('drop policy if exists %I on %I', t || '_select_psw_admin', t);
--          execute format('drop policy if exists %I on %I', t || '_insert_psw_admin', t);
--          execute format('drop policy if exists %I on %I', t || '_update_psw_admin', t);
--          execute format('drop policy if exists %I on %I', t || '_delete_psw_admin', t);
--        end loop;
--      end $$;
--
-- 2. Dropar a permissiva de profiles:
--      drop policy if exists profiles_select_psw_admin on profiles;
--
-- 3. REAPLICAR O ARQUIVO `0044_psw_staff_only_assigned.sql` NA ÍNTEGRA para
--    restaurar as 7 restritivas com os DOIS disjuntos originais. NUNCA
--    dropar `<tabela>_psw_staff_only_assigned` sem reaplicar a 0044 no
--    lugar: dropá-las sem substituição devolveria ao psw_staff o acesso por
--    TENANT DA PSW que a 0044 removeu de propósito nas 7 filhas — isso é o
--    detalhe que separa um rollback correto de um incidente de segurança.
--    A restritiva de `opportunities` NÃO é tocada por este rollback (ela é
--    escopo da 0045, e o rollback dela está descrito lá).
-- =============================================================================
