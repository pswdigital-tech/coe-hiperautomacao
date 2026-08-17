-- =============================================================================
-- 0047_tenant_admin_predicate_swap.sql — as 11 policies vivas de `tenant_admin`
-- trocadas pela fonte única `is_tenant_admin_of()`, mais 3 policies novas no
-- bucket privado de documentos
-- =============================================================================
-- CONTEXTO: as `0045`/`0046` (aplicadas e verificadas em produção) deram ao
-- `psw_staff` com concessão o SELECT/UPDATE em `opportunities`/`tenants` e a
-- paridade de verbos nas 7 tabelas filhas + `profiles`. O que falta para
-- GRANT-04 ("o staff-admin de A exerce os poderes de `tenant_admin` — convites,
-- branding, logs") não é acesso NOVO — é a troca do PREDICADO de 11 policies
-- que já existem, escrevendo à mão o par `tenant_id = current_tenant_id() and
-- current_user_role() = 'tenant_admin'`, pela fonte única `is_tenant_admin_of()`
-- criada na `0045`. Essas 11 policies são PERMISSIVAS e nenhuma tem restritiva
-- por cima — então, diferente da `0045`/`0046`, aqui a TROCA **é** a concessão:
-- não há "duas metades" a escrever, só uma reemissão.
--
-- ==========================================================================
-- O AVISO CENTRAL — LEIA ANTES DE EDITAR ESTE ARQUIVO NO FUTURO
-- ==========================================================================
-- As 11 policies abaixo foram localizadas por NOME, e verificadas uma a uma
-- contra a sua definição VIVA — grep em todo `supabase/migrations/`, última
-- ocorrência de cada nome. Isso importa porque UMA delas tem uma armadilha:
--
--   `invited_emails_insert_tenant_admin` NÃO está viva na `0029` (onde ela
--   nasceu). A `0041` (BLOCO 6b) a DROPOU e RECRIOU mais restrita, acrescentando
--   a cláusula `and role not in ('platform_admin', 'psw_staff')` — a barreira
--   REAL que impede um `tenant_admin` de cliente convidar alguém já como
--   `psw_staff` pela API (a allowlist de app, `lib/security/cargo.ts`, cobre
--   só a UI). Reescrever esta policy a partir do texto da `0029` aplicaria
--   limpo, não erraria em lugar nenhum, e REABRIRIA essa escalada de
--   privilégio em silêncio — o único detector seria o spec já existente em
--   `tests/security/psw-staff-isolation.test.ts:1045`.
--
--   Por isso este arquivo trabalha por NOME de policy, nunca por número de
--   linha de nenhum documento; e o bloco de ROLLBACK (Bloco H) reaplica a
--   `0029` ANTES do bloco de convites da `0041` — nunca depois.
-- ==========================================================================
--
-- O QUE NÃO MUDA, E POR QUÊ: o CHECK de papel convidável (a constraint viva
-- `invited_emails_role_check`, recriada pela `0041`, que aceita
-- `member`/`tenant_admin`/`viewer`/`psw_staff`) fica INTACTO. Um CHECK de
-- coluna responde "este valor é aceitável na tabela?", nunca "esta pessoa
-- pode gravá-lo?" — quem responde a segunda pergunta é a policy de RLS, que
-- é exatamente o que este arquivo reescreve. Estreitar o CHECK quebraria o
-- fluxo do `platform_admin` convidando um `psw_staff`; alargá-lo é
-- desnecessário porque nenhum papel novo é convidável nesta fase.
--
-- WRITE-ONLY MODE — este arquivo NÃO é aplicado por este agente. O apply é
-- SEMPRE manual, no Supabase Cloud SQL Editor, por um humano, atrás de um
-- `checkpoint:decision` dedicado (Task 2 do plano `18-05`) — diferente da
-- `0045`/`0046`, que só ACRESCENTAVAM acesso a um papel novo, esta REESCREVE
-- o predicado de um papel de CLIENTE que já está em produção, em todos os
-- tenants, hoje. Nenhum comando de auto-apply de CLI pertence a este arquivo.
--
-- IDEMPOTENTE: toda `create policy` é precedida do `drop policy if exists`
-- correspondente. Rodar este arquivo duas vezes não produz erro.
--
-- PRÉ-REQUISITOS (já aplicados no `main` de produção antes desta migration):
--   - 0045_psw_tenant_admins_grant.sql (is_tenant_admin_of/effective_admin_
--     tenant_ids/current_admin_tenant_ids — as 3 fontes que este arquivo
--     consome; nenhuma é recriada aqui)
--   - 0046_psw_admin_child_tables.sql (a restritiva de `opportunity_assignees`
--     já reemitida com o 3º disjunto — o Bloco A abaixo depende dela)
--
-- AS 11 POLICIES TROCADAS NESTE ARQUIVO (por nome; a migration onde nasceu a
-- definição VIVA usada como base, não necessariamente onde a policy nasceu):
--   opportunity_assignees_insert            (viva em 0032)
--   opportunity_assignees_update            (viva em 0032)
--   opportunity_assignees_delete            (viva em 0032)
--   invited_emails_select_tenant_admin      (viva em 0029)
--   invited_emails_delete_tenant_admin      (viva em 0029)
--   invited_emails_insert_tenant_admin      (viva em 0041 — NÃO em 0029)
--   tenants_update_own_admin                (viva em 0033)
--   tenant_branding_storage_insert          (viva em 0033)
--   tenant_branding_storage_update          (viva em 0033)
--   tenant_branding_storage_delete          (viva em 0033)
--   audit_log_select                        (viva em 0038)
--
-- POLICIES NOVAS (não são troca — 0018 não tem gate de papel, concede por
-- tenant a qualquer papel do tenant, e o staff-admin não está nesse tenant):
--   opportunity_documents_storage_select_psw_admin
--   opportunity_documents_storage_insert_psw_admin
--   opportunity_documents_storage_delete_psw_admin
--   → bucket 'opportunity-documents', TRÊS verbos (0018 confirma que o bucket
--     concede exatamente select/insert/delete, sem update).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- BLOCO A — `opportunity_assignees` (3 policies)
-- -----------------------------------------------------------------------------
-- Única das 11 trocas que cai sobre uma tabela do laço restritivo da 0044/0046
-- — e por isso ela TAMBÉM depende do terceiro disjunto já entregue lá
-- (`opportunity_assignees_psw_staff_only_assigned`, com
-- `tenant_id in (select current_admin_tenant_ids())`): sem aquela metade, a
-- permissiva reemitida aqui concederia e a restritiva cortaria de volta a
-- zero — as duas metades, de novo, só que a restritiva já existe desde a
-- `0046`. O disjunto `is_platform_admin()` de cada policy é preservado
-- LITERALMENTE — só o par tenant+papel escrito à mão vira `is_tenant_admin_of`.
drop policy if exists opportunity_assignees_insert on opportunity_assignees;
create policy opportunity_assignees_insert on opportunity_assignees
  for insert with check (
    is_tenant_admin_of(tenant_id)
    or is_platform_admin()
  );

drop policy if exists opportunity_assignees_update on opportunity_assignees;
create policy opportunity_assignees_update on opportunity_assignees
  for update using (
    is_tenant_admin_of(tenant_id)
    or is_platform_admin()
  ) with check (
    is_tenant_admin_of(tenant_id)
    or is_platform_admin()
  );

drop policy if exists opportunity_assignees_delete on opportunity_assignees;
create policy opportunity_assignees_delete on opportunity_assignees
  for delete using (
    is_tenant_admin_of(tenant_id)
    or is_platform_admin()
  );

-- -----------------------------------------------------------------------------
-- BLOCO B — `invited_emails` (3 policies)
-- -----------------------------------------------------------------------------
-- A troca do par (tenant, papel) por `is_tenant_admin_of()` é, aqui, a PRÓPRIA
-- concessão de GRANT-04: estas policies são PERMISSIVAS e `invited_emails` não
-- tem restritiva da 0044 — nenhuma policy adicional é necessária nesta tabela.

-- 1) SELECT — o staff-admin passa a ver a allowlist de A; o `tenant_admin` de
--    A continua vendo exatamente o que via (is_tenant_admin_of reduz ao
--    predicado antigo no ramo dele — D-J, não-regressão).
drop policy if exists invited_emails_select_tenant_admin on invited_emails;
create policy invited_emails_select_tenant_admin on invited_emails
  for select using (is_tenant_admin_of(tenant_id));

-- 2) INSERT — A BARREIRA DE ESCALADA DA 0041 É PRESERVADA LITERALMENTE abaixo
--    (`role not in ('platform_admin', 'psw_staff')`). Apagar esta cláusula
--    reabre a escalada de privilégio que a 0041 fechou de propósito: um
--    tenant_admin de cliente (ou, agora, um staff-admin) voltaria a poder
--    cunhar um psw_staff pela API. É esta linha que garante GRANT-06 na
--    camada de convite.
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    is_tenant_admin_of(tenant_id)
    and role not in ('platform_admin', 'psw_staff')
  );

-- 3) DELETE — revoga convite PENDENTE de A. `used_at is null` PRESERVADO: a
--    0029 explica que um convite usado é registro de auditoria de como aquele
--    profile nasceu — apagá-lo não remove o acesso da pessoa (o profile já
--    existe), só destruiria a trilha.
drop policy if exists invited_emails_delete_tenant_admin on invited_emails;
create policy invited_emails_delete_tenant_admin on invited_emails
  for delete using (
    is_tenant_admin_of(tenant_id)
    and used_at is null
  );

-- Sem policy de UPDATE: o único UPDATE existente é `used_at = now()`, feito
-- por `handle_new_user()`, que é SECURITY DEFINER e bypassa RLS (0029). Nada
-- muda aqui.

-- CONSEQUÊNCIA DE D-A A DECLARAR, NÃO UM BUG: com a troca acima, um
-- staff-admin de A PODE convidar alguém como `tenant_admin` de A — e
-- `handle_new_user()` (0022) copia `invited_emails.role` para `profiles.role`,
-- então ele CRIA um admin de cliente em A. Isso é equivalência PLENA a
-- `tenant_admin`, que foi o que o PO escolheu em D-A, e não é escalada
-- lateral no sentido de D-B: não cria nem estende CONCESSÃO
-- (`psw_tenant_admins` continua sendo escrita só por `is_platform_admin()`,
-- 0045 Bloco 5). Esta consequência foi ratificada explicitamente pelo PO no
-- `checkpoint:decision` da Task 2 do plano `18-05`.

-- -----------------------------------------------------------------------------
-- BLOCO C — `tenants` e `audit_log` (2 policies)
-- -----------------------------------------------------------------------------
drop policy if exists tenants_update_own_admin on tenants;
create policy tenants_update_own_admin on tenants
  for update using (
    is_tenant_admin_of(id)
  ) with check (
    is_tenant_admin_of(id)
  );

-- audit_log_select: o disjunto is_platform_admin() é preservado literalmente;
-- só o par tenant+papel escrito à mão vira is_tenant_admin_of(tenant_id). A
-- `0042` criou uma policy IRMÃ de leitura do log para o staff POR ATRIBUIÇÃO
-- (`audit_log_select_psw_staff`, condicional) — ela NÃO é tocada aqui, é um
-- caminho de acesso independente (atribuição nominal, não concessão de
-- tenant) e continua valendo do jeito que está.
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
  for select
  using (
    is_platform_admin()
    or is_tenant_admin_of(tenant_id)
  );

-- -----------------------------------------------------------------------------
-- BLOCO D — Storage, bucket de branding `tenant-branding` (3 policies)
-- -----------------------------------------------------------------------------
-- Comparação do PRIMEIRO segmento do caminho do lado TEXTO contra o conjunto
-- devolvido por `effective_admin_tenant_ids()` — NUNCA convertendo o segmento
-- para identificador. A 0041 já ensinou essa regra, palavra por palavra:
-- "um objeto cujo path fuja da convenção (segmento não é um uuid válido)
-- derrubaria a policy INTEIRA com erro de cast em runtime, para QUALQUER
-- usuário" — não só para o staff-admin. O disjunto `is_platform_admin()` de
-- cada uma das três é preservado literalmente.
drop policy if exists tenant_branding_storage_insert on storage.objects;
create policy tenant_branding_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'tenant-branding'
    and (
      (storage.foldername(name))[1] in (
        select t::text from effective_admin_tenant_ids() t
      )
      or is_platform_admin()
    )
  );

drop policy if exists tenant_branding_storage_update on storage.objects;
create policy tenant_branding_storage_update on storage.objects
  for update using (
    bucket_id = 'tenant-branding'
    and (
      (storage.foldername(name))[1] in (
        select t::text from effective_admin_tenant_ids() t
      )
      or is_platform_admin()
    )
  );

drop policy if exists tenant_branding_storage_delete on storage.objects;
create policy tenant_branding_storage_delete on storage.objects
  for delete using (
    bucket_id = 'tenant-branding'
    and (
      (storage.foldername(name))[1] in (
        select t::text from effective_admin_tenant_ids() t
      )
      or is_platform_admin()
    )
  );

-- -----------------------------------------------------------------------------
-- BLOCO E — Storage, bucket privado `opportunity-documents` (3 policies NOVAS)
-- -----------------------------------------------------------------------------
-- Estas são policies NOVAS, não troca: as permissivas da 0018 concedem por
-- `current_tenant_id()` a QUALQUER papel do tenant, sem gate de papel — e o
-- staff-admin não está no tenant concedido (o tenant dele é a PSW). Mesmo
-- raciocínio do Bloco D: comparação do PRIMEIRO segmento (o tenant) do lado
-- TEXTO, sem cast.
--
-- TRÊS VERBOS, NÃO QUATRO — a 0018:135-137 confirma que este bucket concede
-- exatamente select/insert/delete, SEM update (um documento é substituído,
-- nunca editado). Espelhar um quarto verbo aqui daria ao staff-admin um poder
-- que ninguém tem, nem o próprio tenant_admin do tenant.
drop policy if exists opportunity_documents_storage_select_psw_admin on storage.objects;
create policy opportunity_documents_storage_select_psw_admin on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and (storage.foldername(name))[1] in (
      select t::text from effective_admin_tenant_ids() t
    )
  );

drop policy if exists opportunity_documents_storage_insert_psw_admin on storage.objects;
create policy opportunity_documents_storage_insert_psw_admin on storage.objects
  for insert with check (
    bucket_id = 'opportunity-documents'
    and (storage.foldername(name))[1] in (
      select t::text from effective_admin_tenant_ids() t
    )
  );

drop policy if exists opportunity_documents_storage_delete_psw_admin on storage.objects;
create policy opportunity_documents_storage_delete_psw_admin on storage.objects
  for delete using (
    bucket_id = 'opportunity-documents'
    and (storage.foldername(name))[1] in (
      select t::text from effective_admin_tenant_ids() t
    )
  );

-- -----------------------------------------------------------------------------
-- BLOCO F — DECLARAÇÃO DE NÃO-MUDANÇA (para que uma revisão futura não
-- "conserte" o que está certo)
-- -----------------------------------------------------------------------------
-- O QUE NÃO É TOCADO NESTA MIGRATION, E POR QUÊ:
--
--   invited_emails_role_check (a constraint viva, recriada pela 0041, que
--   aceita 'member'/'tenant_admin'/'viewer'/'psw_staff') — um CHECK de coluna
--   responde "este valor é aceitável?", nunca "esta pessoa pode gravá-lo?".
--   Quem responde a segunda pergunta são as policies do Bloco B acima.
--   Estreitar o CHECK quebraria o platform_admin convidando um psw_staff;
--   alargá-lo é desnecessário — nenhum papel novo é convidável nesta fase.
--
--   tenant_branding_storage_select (0033) — não tem gate de papel nenhum
--   (qualquer papel do tenant lê a logo, e a logo é pública por natureza);
--   não entra nesta troca porque nunca teve o predicado tenant+papel a trocar.
--
--   As 4 policies base por tenant de opportunity_assignees (0032) e o
--   trigger check_assignee_tenant() (0040) que garante
--   filha.tenant_id = pai.tenant_id — invariantes da Phase 17, intocados.
--
--   current_tenant_id() e current_user_role() — as duas helpers globais
--   consumidas por dezenas de policies do sistema inteiro; esta fase é uma
--   fase de CONCESSÃO, não uma fase de refactor de RLS global.
--
--   audit_log_select_psw_staff (0042) — o caminho de leitura do log por
--   ATRIBUIÇÃO nominal (não por concessão de tenant); é independente do que
--   este arquivo reescreve e continua valendo do jeito que está.

-- =============================================================================
-- BLOCO G — Verificação pós-apply (rodar manualmente — ver a versão numerada
-- completa, com queries prontas para copiar/colar, em
-- `18-05-MIGRATION-HANDOFF.md`)
-- =============================================================================

-- G1. As 11 policies existem pelo NOME e todas contêm a chamada à fonte
--     única — ESPERADO: 11 linhas. A query filtra por LISTA DE NOMES, não
--     por padrão de sufixo, para que uma policy renomeada por engano apareça
--     como AUSENTE em vez de silenciosamente não contada.
-- select tablename, policyname
-- from pg_policies
-- where policyname in (
--   'opportunity_assignees_insert','opportunity_assignees_update','opportunity_assignees_delete',
--   'invited_emails_select_tenant_admin','invited_emails_delete_tenant_admin','invited_emails_insert_tenant_admin',
--   'tenants_update_own_admin','tenant_branding_storage_insert','tenant_branding_storage_update',
--   'tenant_branding_storage_delete','audit_log_select'
-- )
-- and (qual like '%is_tenant_admin_of%' or with_check like '%is_tenant_admin_of%')
-- order by tablename, policyname;

-- G2. A VERIFICAÇÃO QUE MAIS IMPORTA — a policy de inserção de convites
--     contém TAMBÉM a cláusula de barreira — ESPERADO: 1 linha. Se sair 0, a
--     escalada de privilégio foi reaberta: PARAR e REVERTER imediatamente.
-- select policyname from pg_policies
-- where policyname = 'invited_emails_insert_tenant_admin'
--   and with_check like '%role not in%';

-- G3. A policy de remoção de convites contém a condição de convite não usado.
-- select policyname from pg_policies
-- where policyname = 'invited_emails_delete_tenant_admin'
--   and qual like '%used_at is null%';

-- G4. As 3 policies novas do bucket privado existem; NENHUMA com verbo de
--     atualização.
-- select policyname, cmd from pg_policies
-- where policyname like 'opportunity_documents_storage_%_psw_admin'
-- order by policyname;

-- G5. Nenhuma policy de Storage desta fase converte segmento de caminho para
--     identificador (cast para uuid).
-- select policyname from pg_policies
-- where schemaname = 'storage'
--   and (qual like '%::uuid%' or with_check like '%::uuid%');
-- ESPERADO: 0 linhas.

-- G6. BYTE-EQUIVALÊNCIA — para um tenant_admin de cliente, medir ANTES e
--     DEPOIS do apply o que ele enxerga em convites, no próprio tenant e no
--     log, e conferir que os pares batem exatamente (ver handoff, seção
--     "ANTES DE APLICAR").

-- G7. PODERES EM A / NEGATIVO EM B — assumindo a identidade do staff-admin
--     com concessão em A: inserir convite legítimo em A (aceita); inserir
--     convite com papel não convidável em A (rejeita); atualizar o branding
--     de A (aceita); ler o log de A (traz linhas); e repetir as mesmas
--     tentativas num tenant B sem concessão (todas negadas). Ver handoff para
--     as queries prontas, sem placeholder a substituir.

-- =============================================================================
-- BLOCO H — ROLLBACK (nesta ordem — a ordem importa; ver 18-05-MIGRATION-
-- HANDOFF.md para o detalhe operacional)
-- =============================================================================
-- ORDEM OBRIGATÓRIA: reaplicar, NESTA ORDEM, os arquivos 0029, 0033, 0038 e —
-- POR ÚLTIMO — o BLOCO 6b (o bloco de convites) da 0041. Reaplicar a 0029
-- DEPOIS da 0041 deixaria valendo a versão PERMISSIVA DEMAIS de
-- `invited_emails_insert_tenant_admin` (sem a cláusula `role not in (...)`) —
-- é o detalhe que separa um rollback correto de um incidente de segurança.
--
-- 1. Dropar as 3 policies novas do bucket privado (a concessão nova para de
--    conceder; nada mais muda):
--      drop policy if exists opportunity_documents_storage_select_psw_admin on storage.objects;
--      drop policy if exists opportunity_documents_storage_insert_psw_admin on storage.objects;
--      drop policy if exists opportunity_documents_storage_delete_psw_admin on storage.objects;
--
-- 2. Reaplicar supabase/migrations/0029_tenant_admin_invites.sql NA ÍNTEGRA
--    (restaura invited_emails_select/_delete_tenant_admin com o predicado
--    antigo E invited_emails_insert_tenant_admin com a versão SEM a barreira
--    — estado transitório e esperado, corrigido pelo passo 4).
--
-- 3. Reaplicar supabase/migrations/0033_tenant_branding.sql NA ÍNTEGRA
--    (restaura tenants_update_own_admin e as 3 policies de Storage do bucket
--    de branding com o predicado antigo).
--
-- 4. Reaplicar supabase/migrations/0038_audit_log.sql NA ÍNTEGRA (restaura
--    audit_log_select com o predicado antigo).
--
-- 5. POR ÚLTIMO — reaplicar SOMENTE o BLOCO 6b de
--    supabase/migrations/0041_psw_staff_child_access.sql (a recriação de
--    invited_emails_insert_tenant_admin com `role not in
--    ('platform_admin', 'psw_staff')`), fechando de volta a janela aberta
--    pelo passo 2. NUNCA pular este passo, e NUNCA executá-lo antes do
--    passo 2 — a ordem inversa deixaria a versão fraca valendo até alguém
--    perceber.
-- =============================================================================
