-- =============================================================================
-- 0028_invite_viewer_role.sql — permite convidar alguém como 'viewer'
-- =============================================================================
-- O role 'viewer' existe desde 0014/0015 e é somente-leitura de verdade (RLS),
-- mas `invited_emails.role` nasceu em 0022 com um CHECK que só aceitava
-- ('member', 'tenant_admin'). Resultado: não havia como criar um leitor pelo
-- fluxo de convite — só editando `profiles.role` no SQL Editor depois do
-- signup. Esta migration abre 'viewer' no CHECK.
--
-- 'platform_admin' continua PROIBIDO via convite (super-admin de plataforma só
-- se cria manualmente — ver 0020).
--
-- IDEMPOTENTE — drop+add do constraint é seguro de re-rodar.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0014, 0015 e 0022 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter table invited_emails
  drop constraint if exists invited_emails_role_check;

alter table invited_emails
  add constraint invited_emails_role_check
  check (role in ('member', 'tenant_admin', 'viewer'));

-- =============================================================================
-- FIM 0028 — handle_new_user() (0022) copia `invited_emails.role` para
-- `profiles.role` sem alteração, então um convite 'viewer' já cria o profile
-- somente-leitura no primeiro login. Nada mais a mudar no banco.
-- =============================================================================
