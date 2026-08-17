-- =============================================================================
-- 0021_platform_admin_rls.sql — RLS cross-tenant para super-admin de plataforma
-- =============================================================================
-- Ported de origin/feat/v0.3-produtizacao (commit df6a97e, renumerado).
-- Escopo IDÊNTICO ao da branch original: tenants/profiles/opportunities/
-- opportunity_phases/opportunity_risks. As tabelas novas de documentos/notas/
-- histórico (0018, só em main) NÃO entram aqui de propósito — ficam para uma
-- decisão explícita separada (fora do escopo do que a branch entregava).
--
-- CONTEXTO: a 0020 criou o role 'platform_admin'. Esta migration dá a ele
-- visão de LEITURA sobre TODOS os tenants, sem afetar o isolamento dos demais
-- usuários.
--
-- DESIGN (por que é seguro):
--   1. `is_platform_admin()` é SECURITY DEFINER (lê profiles sem RLS recursivo),
--      espelhando `current_tenant_id()`/`current_user_role()`. Compara
--      `role::text` para não depender da ordem de commit do valor de enum.
--   2. As policies abaixo são ADITIVAS. No Postgres, múltiplas policies
--      PERMISSIVE de um mesmo comando (SELECT) são combinadas com OR. Logo NÃO
--      tocamos nas policies existentes (`*_select` por tenant) — apenas
--      adicionamos um override. Membros comuns continuam restritos ao seu
--      tenant; o super-admin vê tudo.
--   3. Escopo deliberadamente LIMITADO A SELECT. Escrita cross-tenant fica para
--      depois (gestão de usuários/convites vem em migration própria, 0022),
--      reduzindo a superfície de risco da regra nº1 (isolamento multi-tenant).
--
-- Idempotente (drop-if-exists + create). Pré-requisitos: 0001..0020 aplicadas.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- Helper — is_platform_admin()
-- -----------------------------------------------------------------------------
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role::text = 'platform_admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Policies aditivas de SELECT cross-tenant (OR com as policies por tenant)
-- -----------------------------------------------------------------------------

-- tenants: super-admin enxerga TODAS as empresas (para picker/visão consolidada)
drop policy if exists tenants_select_platform_admin on tenants;
create policy tenants_select_platform_admin on tenants
  for select using (is_platform_admin());

-- profiles: super-admin enxerga TODOS os usuários (base p/ gestão futura)
drop policy if exists profiles_select_platform_admin on profiles;
create policy profiles_select_platform_admin on profiles
  for select using (is_platform_admin());

-- opportunities: o headline — super-admin vê as oportunidades de todos os tenants
drop policy if exists opportunities_select_platform_admin on opportunities;
create policy opportunities_select_platform_admin on opportunities
  for select using (is_platform_admin());

-- opportunity_phases: coerência do kanban/pipeline cross-tenant
drop policy if exists opportunity_phases_select_platform_admin on opportunity_phases;
create policy opportunity_phases_select_platform_admin on opportunity_phases
  for select using (is_platform_admin());

-- opportunity_risks: registro de riscos cross-tenant
drop policy if exists opportunity_risks_select_platform_admin on opportunity_risks;
create policy opportunity_risks_select_platform_admin on opportunity_risks
  for select using (is_platform_admin());

-- =============================================================================
-- FIM 0021 — super-admin tem SELECT cross-tenant em tenants/profiles/
-- opportunities/opportunity_phases/opportunity_risks. Escrita permanece
-- escopada por tenant. A view opportunities_with_score (security_invoker)
-- herda a nova visibilidade automaticamente.
-- =============================================================================
