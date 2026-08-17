-- =============================================================================
-- 0029_tenant_admin_invites.sql — tenant_admin convida gente da PRÓPRIA empresa
-- =============================================================================
-- Até aqui `tenant_admin` era só um rótulo (ver 0014): quem administrava
-- usuários era exclusivamente o platform_admin (PSW), via /admin/invites. Esta
-- migration transforma o papel em algo com poder real, mas ESTRITAMENTE
-- escopado ao próprio tenant.
--
-- POLICIES ADITIVAS, NÃO SUBSTITUTAS: as 4 policies `*_admin` de 0022
-- (is_platform_admin()) continuam intactas. RLS é permissiva — basta UMA
-- policy passar. Aqui só acrescentamos o caminho do tenant_admin.
--
-- ISOLAMENTO (regra nº1) — o predicado é sempre
--   tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin'
-- Isso torna impossível um admin da empresa A criar convite para a empresa B,
-- mesmo forjando o payload: o WITH CHECK é avaliado sobre a linha final.
--
-- ESCALAÇÃO DE PRIVILÉGIO: 'platform_admin' segue inconvidável — pelo CHECK da
-- coluna (0022/0028) e reforçado no WITH CHECK abaixo. O tenant_admin PODE
-- convidar outro tenant_admin, mas apenas dentro da própria empresa; isso não
-- concede nada além do que ele já tem.
--
-- REVOGAÇÃO limitada a convites PENDENTES (`used_at is null`): um convite já
-- usado é registro de auditoria de como aquele profile nasceu — apagar não
-- remove o acesso da pessoa (o profile já existe), só destruiria a trilha.
--
-- IDEMPOTENTE — drop+create de cada policy é seguro de re-rodar.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0015 (current_user_role), 0022 (invited_emails) e 0028
-- (CHECK aceitando 'viewer') aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- ---------------------------------------------------------------------------
-- 1. SELECT — enxerga só os convites da própria empresa
-- ---------------------------------------------------------------------------
drop policy if exists invited_emails_select_tenant_admin on invited_emails;
create policy invited_emails_select_tenant_admin on invited_emails
  for select using (
    tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin'
  );

-- ---------------------------------------------------------------------------
-- 2. INSERT — cria convite, sempre no próprio tenant, nunca platform_admin
-- ---------------------------------------------------------------------------
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and role <> 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- 3. DELETE — revoga convite pendente da própria empresa
-- ---------------------------------------------------------------------------
drop policy if exists invited_emails_delete_tenant_admin on invited_emails;
create policy invited_emails_delete_tenant_admin on invited_emails
  for delete using (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and used_at is null
  );

-- Nenhuma policy de UPDATE para tenant_admin: o único UPDATE que existe é o
-- `used_at = now()` feito por handle_new_user(), que é SECURITY DEFINER e
-- portanto bypassa RLS.

-- ---------------------------------------------------------------------------
-- 4. profiles — tenant_admin lista quem já é da empresa (tela de Equipe)
-- ---------------------------------------------------------------------------
-- As policies de SELECT em profiles (0001) já escopam por tenant, então nada a
-- fazer aqui — este bloco existe só para documentar que a listagem de membros
-- da tela /team não precisou de policy nova.

-- =============================================================================
-- FIM 0029 — tenant_admin agora gerencia a allowlist da própria empresa.
-- platform_admin continua com alcance global (policies de 0022 intactas).
-- =============================================================================
