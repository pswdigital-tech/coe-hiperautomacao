-- =============================================================================
-- 0015_rbac_viewer_policies.sql — Gate de escrita para role='viewer'
-- =============================================================================
-- RBAC simples (v0.3): usuários com profiles.role='viewer' continuam enxergando
-- tudo do próprio tenant (policies de SELECT intocadas), mas NÃO podem
-- inserir/atualizar/remover nada — nem em opportunities, nem em suas tabelas
-- filhas (opportunity_phases, opportunity_risks). Defesa em profundidade: a
-- UI também esconde as ações de edição para viewer, mas o bloqueio real é aqui
-- (RLS), igual ao padrão de tenant_id — nunca confiar só no client.
--
-- current_user_role() espelha current_tenant_id() (0001): SQL, STABLE,
-- SECURITY DEFINER (lê profiles sem RLS recursivo).
--
-- IDEMPOTENTE — drop+create de cada policy é seguro de re-rodar.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0014 aplicada e COMMITADA (o enum 'viewer' precisa existir
-- antes desta migration — ver aviso em 0014).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Helper — current_user_role()
-- ---------------------------------------------------------------------------
create or replace function current_user_role()
returns tenant_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 2. opportunities — insert/update/delete ganham o gate de role
-- ---------------------------------------------------------------------------
drop policy if exists opportunities_insert on opportunities;
create policy opportunities_insert on opportunities
  for insert with check (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

drop policy if exists opportunities_update on opportunities;
create policy opportunities_update on opportunities
  for update
  using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer')
  with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer');

drop policy if exists opportunities_delete on opportunities;
create policy opportunities_delete on opportunities
  for delete using (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

-- ---------------------------------------------------------------------------
-- 3. opportunity_phases — mesmo padrão (só escrito hoje via trigger
--    SECURITY DEFINER, que roda como owner e bypassa RLS — gate aqui é defesa
--    em profundidade caso um write direto do client apareça no futuro).
-- ---------------------------------------------------------------------------
drop policy if exists opportunity_phases_insert on opportunity_phases;
create policy opportunity_phases_insert on opportunity_phases
  for insert with check (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

drop policy if exists opportunity_phases_update on opportunity_phases;
create policy opportunity_phases_update on opportunity_phases
  for update
  using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer')
  with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer');

drop policy if exists opportunity_phases_delete on opportunity_phases;
create policy opportunity_phases_delete on opportunity_phases
  for delete using (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

-- ---------------------------------------------------------------------------
-- 4. opportunity_risks — mesmo padrão
-- ---------------------------------------------------------------------------
drop policy if exists opportunity_risks_insert on opportunity_risks;
create policy opportunity_risks_insert on opportunity_risks
  for insert with check (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

drop policy if exists opportunity_risks_update on opportunity_risks;
create policy opportunity_risks_update on opportunity_risks
  for update
  using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer')
  with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer');

drop policy if exists opportunity_risks_delete on opportunity_risks;
create policy opportunity_risks_delete on opportunity_risks
  for delete using (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );

-- =============================================================================
-- FIM 0015 — profiles.role='viewer' agora é somente-leitura de verdade em
-- opportunities/opportunity_phases/opportunity_risks (SELECT continua livre).
-- Tabelas novas de 0017 (documentos/anotações/histórico) já nascem com o
-- mesmo gate embutido nas suas próprias policies.
-- =============================================================================
