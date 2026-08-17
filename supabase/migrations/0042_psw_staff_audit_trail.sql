-- =============================================================================
-- 0042_psw_staff_audit_trail.sql — acesso condicional à trilha de auditoria
-- =============================================================================
-- CONTEXTO: no momento em que este arquivo foi ESCRITO, `0038_audit_log.sql`
-- estava registrada no CONTEXT.md/RESEARCH.md desta fase como "existe no
-- working tree, ainda não commitada, fora do escopo desta fase" (D-07/D-15).
-- Por isso este arquivo é INTEIRAMENTE CONDICIONAL: se `audit_log` (tabela) e
-- `opportunity_audit_trail(uuid)` (função) ainda não existirem no ambiente em
-- que ele for aplicado, os dois blocos abaixo são NO-OP — o arquivo roda sem
-- erro e não faz nada. Este arquivo NÃO edita `0038_audit_log.sql` nem nada
-- em `lib/audit/` — apenas acrescenta, de forma condicional, o acesso do
-- papel novo aos objetos que a 0038 cria.
--
-- AVISO DE FRAGILIDADE (débito conhecido, D-15): o Bloco 2 abaixo precisa
-- reproduzir VERBATIM o corpo de `opportunity_audit_trail(uuid)` da 0038,
-- porque essa função é SECURITY DEFINER com um gate de tenant explícito
-- dentro do corpo — uma policy de RLS sozinha não alcança esse gate. Se a
-- 0038 for alterada em qualquer momento (antes ou depois de commitada), esta
-- cópia diverge silenciosamente e precisa ser re-sincronizada manualmente.
-- Condição de saída deste débito: quando a 0038 estabilizar, reconciliar os
-- dois arquivos (idealmente eliminando a duplicação, ex.: extraindo o corpo
-- comum para uma função auxiliar interna).
--
-- IDEMPOTENTE: `create or replace` na função, `drop policy if exists` antes
-- do `create policy` (executados dinamicamente, protegidos por
-- `to_regclass`/`to_regprocedure`) — rodar este arquivo duas vezes não falha
-- nem duplica nada, em ambiente com ou sem a 0038 aplicada.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (ver
-- 17-04-MIGRATION-HANDOFF.md), numa execução SEPARADA, depois da 0041. O
-- agente que escreveu este arquivo NÃO o aplicou.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- BLOCO 1 — policy aditiva de `audit_log`, CONDICIONAL a `to_regclass`
-- -----------------------------------------------------------------------------
-- `audit_log` não tem coluna `opportunity_id` — o vínculo com a oportunidade
-- é (a) `table_name = 'opportunities' and record_id = <id>` OU (b) o
-- `opportunity_id` extraído de `coalesce(new_data, old_data)` nas demais
-- tabelas auditadas (mesma lógica que `opportunity_audit_trail()` da 0038 já
-- usa — ver Bloco 2). `record_id` já é `uuid`, comparado direto contra o
-- helper; o campo extraído do jsonb é comparado como TEXTO contra
-- `current_assigned_opportunity_ids()::text`, para não fazer cast de um
-- jsonb possivelmente ausente/nulo para uuid.
--
-- DDL (CREATE/DROP POLICY) dentro de um bloco PL/pgSQL exige EXECUTE — por
-- isso o corpo condicional usa `execute` com SQL dinâmico em vez de
-- statements diretos.
do $guard_policy$
begin
  if to_regclass('public.audit_log') is not null then
    execute 'drop policy if exists audit_log_select_psw_staff on audit_log';

    execute $sql$
      create policy audit_log_select_psw_staff on audit_log
        for select using (
          current_user_role() = 'psw_staff'
          and (
            (
              table_name = 'opportunities'
              and record_id in (select current_assigned_opportunity_ids())
            )
            or (
              (coalesce(new_data, old_data) ->> 'opportunity_id') in (
                select o::text from current_assigned_opportunity_ids() o
              )
            )
          )
        )
    $sql$;
  end if;
end;
$guard_policy$;

-- -----------------------------------------------------------------------------
-- BLOCO 2 — gate ampliado de `opportunity_audit_trail(uuid)`, CONDICIONAL a
-- `to_regprocedure`
-- -----------------------------------------------------------------------------
-- Este é o ponto que a policy do Bloco 1 SOZINHA não resolve: a função é
-- SECURITY DEFINER e carrega um gate de tenant EXPLÍCITO no corpo (dentro de
-- uma função definer a RLS das outras tabelas é bypassada, então o gate
-- precisa estar no código, não na policy) — sem este bloco, um psw_staff
-- receberia trilha VAZIA mesmo com a policy do Bloco 1 já aplicada.
--
-- O corpo abaixo reproduz VERBATIM `opportunity_audit_trail(uuid)` de
-- `0038_audit_log.sql` — mesma assinatura, retorno, `stable`,
-- `security definer`, `search_path` fixo e lista de `table_name` — com UMA
-- ÚNICA diferença: o gate passa a aceitar também o caso em que a oportunidade
-- consultada está no conjunto de oportunidades atribuídas ao chamador
-- (`current_assigned_opportunity_ids()`, helper da 0040). `create or replace`
-- reseta os privilégios padrão de uma função — por isso o revoke/grant da
-- 0038 é reemitido logo depois, dentro do mesmo bloco condicional, para não
-- reabrir a função para `anon`.
do $guard_rpc$
begin
  if to_regprocedure('public.opportunity_audit_trail(uuid)') is not null then
    execute $sql$
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

        -- Gate de tenant EXPLÍCITO (o RLS não protege dentro de uma função
        -- definer). platform_admin atravessa; tenant_admin/member/viewer do
        -- próprio tenant atravessam; a ÚNICA adição desta migration é o
        -- terceiro caso: psw_staff atravessa quando esta oportunidade
        -- específica está no seu conjunto de atribuídas — nenhum dos dois
        -- caminhos anteriores é alterado ou restringido.
        if not is_platform_admin()
           and v_tenant is distinct from current_tenant_id()
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
    $sql$;

    -- Reemissão obrigatória — um `create or replace function` reseta os
    -- privilégios padrão da função. Sem isto, `anon` (o formulário público)
    -- poderia voltar a executar a RPC.
    execute 'revoke execute on function opportunity_audit_trail(uuid) from public, anon';
    execute 'grant execute on function opportunity_audit_trail(uuid) to authenticated';
  end if;
end;
$guard_rpc$;

-- =============================================================================
-- LIMITAÇÃO A DOCUMENTAR, NÃO A RESOLVER: mesmo com os dois blocos acima
-- aplicados, a aba "Histórico" de um psw_staff só mostra o que a 0038 de fato
-- registra a partir da sua entrada em produção. É uma limitação
-- PRÉ-EXISTENTE — nem um `member` comum do tenant vê auditoria retroativa a
-- eventos anteriores à 0038, e `opportunity_history` (0018, congelada, ver
-- 0041 Bloco 1) só guarda o legado de antes dela. NÃO é uma regressão
-- introduzida por esta fase — registrar isto explicitamente para não ser
-- confundido com bug durante o UAT.
--
-- DÉBITO CONHECIDO (repetido do cabeçalho, para quem ler só o rodapé): o
-- corpo de `opportunity_audit_trail()` acima é uma CÓPIA do corpo definido em
-- `0038_audit_log.sql`. Se a 0038 mudar, esta cópia diverge silenciosamente.
-- Reconciliar quando a 0038 estabilizar.
--
-- FIM 0042 — audit_log_select_psw_staff (condicional) e o gate ampliado de
-- opportunity_audit_trail(uuid) (condicional) escritos. 0038_audit_log.sql e
-- lib/audit/ permanecem intocados por este arquivo.
-- =============================================================================
