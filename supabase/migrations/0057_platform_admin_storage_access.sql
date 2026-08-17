-- =============================================================================
-- 0057_platform_admin_storage_access.sql — platform_admin sem acesso ao
-- Storage de documentos/imagens (bug pré-existente, achado 2026-08-14)
-- =============================================================================
-- Sintoma: logado como platform_admin, anexar um documento (ou colar/arrastar
-- uma imagem na Descrição de tarefa/Anotação) numa oportunidade de QUALQUER
-- tenant falhava com "new row violates row-level security policy" — mesmo
-- para uma oportunidade de tenant que o platform_admin evidentemente enxerga
-- e edita (RLS de tabela já libera via is_platform_admin(), 0021/0025).
--
-- Causa raiz: as policies de storage.objects do bucket 'opportunity-documents'
-- (0018, reforçadas por 0040-0047) cobrem 3 casos — tenant "dono" (1º segmento
-- do path = current_tenant_id()), psw_staff (2º segmento = oportunidade
-- atribuída) e "psw_admin" (1º segmento IN effective_admin_tenant_ids()).
-- `effective_admin_tenant_ids()` só tinha os ramos tenant_admin (próprio
-- tenant) e psw_staff (concessão em psw_tenant_admins, 0045) — NENHUM ramo
-- cobria platform_admin. Resultado: para um platform_admin escrevendo numa
-- oportunidade de tenant que não é o dele (o caso normal — ele administra
-- todos), NENHUMA das 3 policies de INSERT/SELECT/DELETE casava.
--
-- Fix: adiciona o ramo platform_admin em effective_admin_tenant_ids() —
-- devolve TODOS os tenants quando o papel é platform_admin. Como essa função
-- já é a fonte única das policies `_psw_admin` de storage.objects
-- (opportunity_documents E tenant_branding, ver 0033), um único ponto de
-- alteração corrige as duas famílias de policies de uma vez — mesmo espírito
-- de is_platform_admin()/isPlatformAdmin() (mantidos em sincronia,
-- lib/security/role.ts): "platform_admin enxerga/edita tudo".
--
-- Nenhuma policy nova, nenhuma tabela nova — só a função. IDEMPOTENTE
-- (create or replace).
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0001..0056 aplicadas (usa current_user_role() de 0001,
-- current_tenant_id() de 0001, psw_tenant_admins de 0045).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

create or replace function public.effective_admin_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  -- ramo platform_admin: super-admin da PSW administra TODOS os tenants —
  -- sem este ramo, escrita no Storage (documentos/imagens) falhava com RLS
  -- para platform_admin mesmo em oportunidades que ele legitimamente edita.
  select id
  from tenants
  where current_user_role() = 'platform_admin'
  union all
  -- ramo tenant_admin: BYTE-EQUIVALENTE ao predicado antigo (D-J / não-regressão)
  select current_tenant_id()
  where current_user_role() = 'tenant_admin'
  union all
  -- ramo psw_staff: a concessão desta fase (0045)
  select tenant_id
  from psw_tenant_admins
  where profile_id = (select auth.uid())
    and current_user_role() = 'psw_staff'
$$;

-- =============================================================================
-- Verificação pós-apply (rodar depois de colar o bloco acima, autenticado
-- como um platform_admin de verdade — a função é SECURITY DEFINER mas lê
-- auth.uid()/current_user_role() da sessão corrente):
--
--   -- deve devolver TODOS os tenants (não só o da PSW):
--   select count(*) from effective_admin_tenant_ids();
--   select count(*) from tenants;  -- os dois counts devem bater
-- =============================================================================
