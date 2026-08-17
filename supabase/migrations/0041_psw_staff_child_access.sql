-- =============================================================================
-- 0041_psw_staff_child_access.sql — tabelas filhas, `profiles`, Storage,
-- responsável de tarefa e allowlist de convites
-- =============================================================================
-- CONTEXTO: a 0040 (JÁ APLICADA e COMMITADA em produção) provou o mecanismo
-- ponta-a-ponta numa fatia fina (SELECT em `opportunities`/`tenants`). Esta
-- migration expande MECANICAMENTE o mesmo padrão para o restante da
-- superfície de dados da oportunidade: as 7 tabelas filhas
-- (`opportunity_phases`, `opportunity_risks`, `opportunity_tasks`,
-- `opportunity_notes`, `opportunity_documents`, `opportunity_history`,
-- `opportunity_assignees`), `profiles`, o bucket privado `opportunity-documents`
-- do Storage, a coerência de responsável de tarefa (`check_task_tenant_coherence`,
-- 0037) e a allowlist de convites (`invited_emails`). `audit_log` NÃO entra
-- aqui — é a `0042`, condicional, numa execução separada.
--
-- PRÉ-REQUISITO DURO: a `0040_psw_staff_access_core.sql` precisa estar
-- APLICADA e COMMITADA no banco antes de rodar esta migration — ela consome
-- `current_assigned_opportunity_ids()` (helper criado na 0040) em toda
-- policy nova abaixo. Este arquivo NÃO recria o helper.
--
-- ADITIVIDADE (D-09): TODO objeto criado aqui é aditivo — múltiplas policies
-- PERMISSIVE do mesmo comando são combinadas com OR pelo Postgres, então
-- nenhuma policy existente por tenant é dropada, substituída ou relaxada.
-- A ÚNICA EXCEÇÃO, deliberada e documentada no Bloco 6, é
-- `invited_emails_insert_tenant_admin`, recriada MAIS RESTRITIVA (nunca mais
-- ampla) — é o único `drop policy if exists` deste arquivo que não nomeia uma
-- policy com sufixo `_psw_staff`.
--
-- IDEMPOTENTE: `drop policy if exists` antes de cada `create policy`,
-- `create or replace function` na função reescrita, e `drop trigger if
-- exists` + `create trigger` no trigger recriado — rodar este arquivo duas
-- vezes não falha nem duplica nada.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (ver
-- 17-04-MIGRATION-HANDOFF.md). O agente que escreveu este arquivo NÃO o
-- aplicou — o apply é ação humana, atrás de um checkpoint:decision +
-- checkpoint:human-action dedicados (a reescrita de
-- `check_task_tenant_coherence()` é classificada `one-way`: substitui a
-- ÚNICA regra de banco sobre quem pode ser responsável por uma tarefa, viva
-- em produção com dados desde a Phase 16).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- BLOCO 1 — SELECT aditivo nas 7 tabelas filhas (ACCESS-05)
-- -----------------------------------------------------------------------------
-- Mesmo predicado da 0040, sempre por `opportunity_id`, NUNCA por `tenant_id`
-- — o predicado por tenant é exatamente o erro que o teste negativo
-- (ACCESS-04) existe para pegar, e a mesma disciplina vale aqui: "esta
-- oportunidade específica está atribuída", não "tenant onde há alguma
-- atribuição". `current_user_role() = 'psw_staff'` funciona como
-- short-circuit — para os demais papéis a subquery nem chega a rodar.

drop policy if exists opportunity_phases_select_psw_staff on opportunity_phases;
create policy opportunity_phases_select_psw_staff on opportunity_phases
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_risks_select_psw_staff on opportunity_risks;
create policy opportunity_risks_select_psw_staff on opportunity_risks
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_tasks_select_psw_staff on opportunity_tasks;
create policy opportunity_tasks_select_psw_staff on opportunity_tasks
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_notes_select_psw_staff on opportunity_notes;
create policy opportunity_notes_select_psw_staff on opportunity_notes
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_documents_select_psw_staff on opportunity_documents;
create policy opportunity_documents_select_psw_staff on opportunity_documents
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- opportunity_history: a tabela está CONGELADA desde a 0038 — nada escreve
-- mais nela, só guarda o legado pré-0038 (Pitfall 4 do RESEARCH). Dar SELECT
-- aqui é correto por ACCESS-05 (propagação a TODAS as tabelas filhas), mas
-- não é isso que popula a aba "Histórico" de auditoria recente — essa parte
-- é a policy condicional de `audit_log` na 0042. Não confundir "esta policy
-- existe" com "a aba fica completa": ela não fica, e isso é limitação
-- pré-existente (nem `member` comum tem auditoria recente sem a 0038),
-- documentada no rodapé da 0042.
drop policy if exists opportunity_history_select_psw_staff on opportunity_history;
create policy opportunity_history_select_psw_staff on opportunity_history
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_assignees_select_psw_staff on opportunity_assignees;
create policy opportunity_assignees_select_psw_staff on opportunity_assignees
  for select using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- -----------------------------------------------------------------------------
-- BLOCO 2 — escrita aditiva, espelhando os verbos vigentes de cada tabela
-- (ACCESS-06 / D-04 — "escreve como member")
-- -----------------------------------------------------------------------------
-- Em toda policy de escrita abaixo, o gate de `viewer` das policies por
-- tenant (`current_user_role() <> 'viewer'`) NÃO se aplica — estas são
-- policies do papel NOVO, com predicado próprio
-- (`current_user_role() = 'psw_staff'`). `psw_staff` passa automaticamente no
-- teste `<> 'viewer'` das policies antigas por ser um valor de enum
-- diferente (D-13), mas isso é AFIRMADO em teste dedicado no Plan 17-05, não
-- presumido aqui.

-- opportunities: SOMENTE UPDATE. O papel novo edita oportunidades atribuídas,
-- não cria nem apaga (escopo declarado do CONTEXT.md) — por isso não existe
-- `opportunities_insert_psw_staff` nem `opportunities_delete_psw_staff` neste
-- arquivo, por decisão explícita, não por esquecimento.
drop policy if exists opportunities_update_psw_staff on opportunities;
create policy opportunities_update_psw_staff on opportunities
  for update
  using (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  );

-- opportunity_tasks: espelha os 3 verbos de escrita que a 0037 já concede ao
-- member do tenant (INSERT/UPDATE/DELETE, sem gate de viewer adicional).
drop policy if exists opportunity_tasks_insert_psw_staff on opportunity_tasks;
create policy opportunity_tasks_insert_psw_staff on opportunity_tasks
  for insert
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_tasks_update_psw_staff on opportunity_tasks;
create policy opportunity_tasks_update_psw_staff on opportunity_tasks
  for update
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_tasks_delete_psw_staff on opportunity_tasks;
create policy opportunity_tasks_delete_psw_staff on opportunity_tasks
  for delete
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- opportunity_risks: espelha os 3 verbos de escrita que a 0011/0015 já
-- concedem ao member do tenant (INSERT/UPDATE/DELETE).
drop policy if exists opportunity_risks_insert_psw_staff on opportunity_risks;
create policy opportunity_risks_insert_psw_staff on opportunity_risks
  for insert
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_risks_update_psw_staff on opportunity_risks;
create policy opportunity_risks_update_psw_staff on opportunity_risks
  for update
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_risks_delete_psw_staff on opportunity_risks;
create policy opportunity_risks_delete_psw_staff on opportunity_risks
  for delete
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- opportunity_notes: confirmado em 0018 — a tabela concede ao member do
-- tenant SOMENTE INSERT e DELETE (uma anotação é apagada e recriada, nunca
-- editada). Espelhando exatamente esses 2 verbos, sem inventar UPDATE.
drop policy if exists opportunity_notes_insert_psw_staff on opportunity_notes;
create policy opportunity_notes_insert_psw_staff on opportunity_notes
  for insert
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_notes_delete_psw_staff on opportunity_notes;
create policy opportunity_notes_delete_psw_staff on opportunity_notes
  for delete
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- opportunity_documents: confirmado em 0018 — a tabela concede ao member do
-- tenant SOMENTE INSERT e DELETE (um documento é substituído, não editado).
-- Espelhando exatamente esses 2 verbos, sem inventar UPDATE.
drop policy if exists opportunity_documents_insert_psw_staff on opportunity_documents;
create policy opportunity_documents_insert_psw_staff on opportunity_documents
  for insert
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_documents_delete_psw_staff on opportunity_documents;
create policy opportunity_documents_delete_psw_staff on opportunity_documents
  for delete
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- opportunity_phases: NENHUMA policy de escrita para psw_staff — EXCEÇÃO
-- VERIFICADA, NÃO OMISSÃO. A tabela é escrita EXCLUSIVAMENTE pela trigger
-- `sync_opportunity_phase()` (0004_phase_sync_trigger.sql:21-26), que é
-- SECURITY DEFINER e portanto ignora RLS — as policies de escrita por
-- tenant de `0001_init.sql:350-359` nunca são exercidas por código de
-- aplicação, e o mesmo raciocínio já está documentado no cabeçalho de
-- `0025_platform_admin_write_rls.sql:15-16` para o platform_admin (que
-- também não ganhou policy de escrita própria em opportunity_phases). Dar
-- ao psw_staff uma policy de escrita aqui seria uma ampliação de superfície
-- sem função — nada no app tenta escrever nesta tabela diretamente. O
-- SELECT aditivo do Bloco 1 continua obrigatório: é ele que faz o histórico
-- de fases da oportunidade atribuída aparecer na UI.

-- opportunity_history: NENHUMA policy de escrita — tabela congelada desde a
-- 0038, append-only mesmo para member (nem UPDATE nem DELETE existem para
-- ninguém, ver 0018/0025).

-- opportunity_assignees: NENHUMA policy de escrita para psw_staff — atribuir
-- é prerrogativa exclusiva do platform_admin (D-05). Dar escrita aqui
-- permitiria o staff PSW se auto-atribuir a qualquer oportunidade, o que
-- contraria D-05 explicitamente.

-- -----------------------------------------------------------------------------
-- BLOCO 3 — `profiles` aditivo (SELECT)
-- -----------------------------------------------------------------------------
-- Sem esta policy, o nome do responsável some das abas de tarefas/riscos/
-- atribuições e o select de responsável de tarefa (ACCESS-11) fica vazio —
-- sintoma exatamente igual a "aba vazia sem erro" que o resto desta migration
-- resolve para as tabelas de domínio. O recorte é DELIBERADAMENTE limitado:
-- expõe o diretório de pessoas APENAS das empresas onde o staff PSW tem
-- trabalho de fato atribuído — nunca a base de usuários inteira do sistema.
drop policy if exists profiles_select_psw_staff on profiles;
create policy profiles_select_psw_staff on profiles
  for select using (
    current_user_role() = 'psw_staff'
    and tenant_id in (
      select o.tenant_id
      from opportunities o
      where o.id in (select current_assigned_opportunity_ids())
    )
  );

-- -----------------------------------------------------------------------------
-- BLOCO 4 — Storage (D-12) — bucket privado `opportunity-documents`
-- -----------------------------------------------------------------------------
-- Convenção de path: "{tenant_id}/{opportunity_id}/{arquivo}" (0018) — o 1º
-- segmento é o tenant, o 2º é o opportunity_id. Sem esta policy, o sintoma é
-- sutil: a lista de documentos aparece (a RLS de opportunity_documents já
-- libera o registro) mas o download dá 403 (a policy de storage.objects
-- ainda só conhece o 1º segmento = tenant do ATOR, nunca o tenant da
-- oportunidade atribuída).
--
-- Confirmado em 0018: o bucket concede exatamente 3 verbos — select, insert,
-- delete (SEM update). Espelhando exatamente esses 3.
--
-- Comparação do 2º segmento como TEXTO, nunca com cast para uuid: um objeto
-- cujo path fuja da convenção (2º segmento não é um uuid válido) derrubaria a
-- policy INTEIRA com erro de cast em runtime, para QUALQUER usuário que
-- tentasse ler aquele objeto — não só para o psw_staff. A forma segura é
-- confrontar o segmento (texto) contra o conjunto de oportunidades atribuídas
-- também convertido para texto.
drop policy if exists opportunity_documents_storage_select_psw_staff on storage.objects;
create policy opportunity_documents_storage_select_psw_staff on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'
    and (storage.foldername(name))[2] in (
      select o::text from current_assigned_opportunity_ids() o
    )
  );

drop policy if exists opportunity_documents_storage_insert_psw_staff on storage.objects;
create policy opportunity_documents_storage_insert_psw_staff on storage.objects
  for insert
  with check (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'
    and (storage.foldername(name))[2] in (
      select o::text from current_assigned_opportunity_ids() o
    )
  );

drop policy if exists opportunity_documents_storage_delete_psw_staff on storage.objects;
create policy opportunity_documents_storage_delete_psw_staff on storage.objects
  for delete using (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'
    and (storage.foldername(name))[2] in (
      select o::text from current_assigned_opportunity_ids() o
    )
  );

-- -----------------------------------------------------------------------------
-- BLOCO 5 — `check_task_tenant_coherence()` reescrito (ACCESS-11 / D-14)
-- -----------------------------------------------------------------------------
-- Mesma assinatura de 0037 (returns trigger, plpgsql, security definer,
-- search_path fixo). PRESERVA integralmente as validações atuais (tenant da
-- tarefa == tenant da oportunidade; tarefa-pai da mesma opportunity_id) e
-- altera SOMENTE a validação de assignee_id: quando o profile do responsável
-- é de tenant DIFERENTE do da oportunidade, passa a aceitar quando (a) o
-- profile tem o papel novo E (b) existe uma linha em `opportunity_assignees`
-- ligando esse profile a esta MESMA opportunity_id. A condição (b) é
-- obrigatória: sem ela, qualquer pessoa da PSW poderia ser responsável por
-- tarefa de QUALQUER empresa — mais amplo que o próprio acesso de leitura
-- dela (que é escopado por atribuição via RLS). Fora desse caso, mantém a
-- MESMA mensagem de exceção de 0037 — nenhuma outra regra de negócio muda.
create or replace function check_task_tenant_coherence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
  v_profile_role   tenant_role;
  v_parent_opp     uuid;
  v_is_assigned    boolean;
begin
  select tenant_id into v_opp_tenant from opportunities where id = new.opportunity_id;
  if not found then
    raise exception 'Oportunidade inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id <> v_opp_tenant then
    raise exception 'tenant_id da tarefa não confere com o da oportunidade.'
      using errcode = 'check_violation';
  end if;

  if new.assignee_id is not null then
    select tenant_id, role into v_profile_tenant, v_profile_role
      from profiles where id = new.assignee_id;
    if not found then
      raise exception 'Responsável inexistente.' using errcode = 'foreign_key_violation';
    end if;

    if v_profile_tenant <> v_opp_tenant then
      -- ACCESS-11/D-14: única branch nova. Responsável de OUTRA empresa só é
      -- aceito quando (a) tem o papel psw_staff E (b) está de fato atribuído
      -- a ESTA oportunidade específica (opportunity_assignees) — sem (b),
      -- qualquer staff PSW poderia ser responsável por tarefa de qualquer
      -- cliente, o que seria mais amplo que o próprio acesso de leitura dele.
      if v_profile_role::text <> 'psw_staff' then
        raise exception 'Responsável de outra empresa não pode ser atribuído a esta tarefa.'
          using errcode = 'check_violation';
      end if;

      select exists (
        select 1 from opportunity_assignees
        where profile_id = new.assignee_id
          and opportunity_id = new.opportunity_id
      ) into v_is_assigned;

      if not v_is_assigned then
        raise exception 'Responsável de outra empresa não pode ser atribuído a esta tarefa.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.parent_task_id is not null then
    select opportunity_id into v_parent_opp from opportunity_tasks where id = new.parent_task_id;
    if v_parent_opp is distinct from new.opportunity_id then
      raise exception 'Subtarefa precisa pertencer à mesma oportunidade da tarefa-pai.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Mesmo nome de trigger de 0037 — a FUNÇÃO é substituída (create or replace
-- acima), o trigger só precisa ser recriado para apontar para a nova versão.
-- O OUTRO trigger de `opportunity_tasks` (guarda de profundidade de 2 níveis,
-- 0037) NÃO é tocado aqui — valida uma regra completamente independente.
drop trigger if exists opportunity_tasks_tenant_guard on opportunity_tasks;
create trigger opportunity_tasks_tenant_guard
  before insert or update on opportunity_tasks
  for each row execute function check_task_tenant_coherence();

-- -----------------------------------------------------------------------------
-- BLOCO 6 — `invited_emails` (ACCESS-09 / D-17 / Pitfall 2 do RESEARCH)
-- -----------------------------------------------------------------------------
-- Dois ajustes, na MESMA migration para não deixar o sistema num estado
-- inconsistente entre um apply e outro (CHECK aberto sem o barramento do
-- tenant_admin seria uma janela real de escalação de privilégio).

-- 6a. Amplia o CHECK: sem isso, nem o platform_admin consegue convidar um
-- psw_staff pelo fluxo existente de app/(app)/admin/invites/.
alter table invited_emails drop constraint if exists invited_emails_role_check;
alter table invited_emails add constraint invited_emails_role_check
  check (role in ('member', 'tenant_admin', 'viewer', 'psw_staff'));

-- 6b. ÚNICA SUBSTITUIÇÃO DE POLICY PRÉ-EXISTENTE DESTA FASE — e ela
-- RESTRINGE, nunca amplia. `invited_emails_insert_tenant_admin` (0029) hoje
-- só barra explicitamente `role <> 'platform_admin'`; se o CHECK acima for
-- ampliado SEM apertar esta policy também, um tenant_admin de cliente
-- (malicioso ou por bug futuro que remova a allowlist de app,
-- `lib/security/cargo.ts` → `AccessRole`) conseguiria inserir um convite com
-- `role = 'psw_staff'` direto pela API, contornando a UI. A allowlist de app
-- cobre a tela; a policy de banco é o bloqueio REAL (D-05: "tenant_admin de
-- cliente não enxerga nem atribui pessoas de fora do próprio tenant").
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and role not in ('platform_admin', 'psw_staff')
  );

-- =============================================================================
-- FIM 0041 — inventário do que foi criado:
--   • SELECT aditivo (8 policies): as 7 tabelas filhas + profiles.
--   • Escrita aditiva: opportunities (UPDATE), opportunity_tasks e
--     opportunity_risks (INSERT/UPDATE/DELETE), opportunity_notes e
--     opportunity_documents (INSERT/DELETE) — opportunity_phases,
--     opportunity_history e opportunity_assignees NÃO recebem escrita
--     (exceções verificadas, ver Bloco 2).
--   • Storage: 3 policies aditivas no bucket opportunity-documents,
--     casando o 2º segmento do path (opportunity_id) como texto.
--   • check_task_tenant_coherence() reescrito: responsável de tarefa de
--     outro tenant só aceito para psw_staff atribuído àquela oportunidade.
--   • invited_emails: CHECK ampliado + policy do tenant_admin recriada mais
--     restrita (única substituição de policy pré-existente da fase).
--
-- PRÓXIMO PASSO: migration 0042 (Plan 17-04), numa execução SEPARADA — bloco
-- condicional de audit_log/opportunity_audit_trail(), atrás do
-- checkpoint:decision sobre a substituição one-way da RPC de trilha.
-- =============================================================================
