-- 0025_platform_admin_write_rls.sql — RLS cross-tenant de ESCRITA para super-admin
-- =============================================================================
-- CONTEXTO: a 0021 deu ao platform_admin apenas SELECT cross-tenant sobre
-- opportunities/opportunity_phases. Resultado: o super-admin conseguia VER as
-- oportunidades de qualquer empresa, mas qualquer UPDATE/INSERT/DELETE casava
-- 0 linhas silenciosamente (a policy de escrita da 0015 exige
-- `tenant_id = current_tenant_id()`, e o tenant do admin ≠ tenant do registro).
-- Sintoma: trocar o status "confirmava" na UI mas revertia no refresh.
--
-- Esta migration adiciona policies ADITIVAS (OR com as existentes) que liberam
-- INSERT/UPDATE/DELETE ao platform_admin em qualquer tenant. Para os demais
-- roles nada muda — continuam restritos ao próprio tenant pela 0015.
--
-- `is_platform_admin()` (0021) é SECURITY DEFINER — lê profiles sem recursão RLS.
-- opportunity_phases NÃO precisa de policy: é escrito pela trigger
-- sync_opportunity_phase() (SECURITY DEFINER), que ignora RLS.
-- =============================================================================

-- opportunities --------------------------------------------------------------
drop policy if exists opportunities_insert_platform_admin on opportunities;
create policy opportunities_insert_platform_admin on opportunities
  for insert with check (is_platform_admin());

drop policy if exists opportunities_update_platform_admin on opportunities;
create policy opportunities_update_platform_admin on opportunities
  for update using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists opportunities_delete_platform_admin on opportunities;
create policy opportunities_delete_platform_admin on opportunities
  for delete using (is_platform_admin());

-- opportunity_risks ----------------------------------------------------------
drop policy if exists opportunity_risks_insert_platform_admin on opportunity_risks;
create policy opportunity_risks_insert_platform_admin on opportunity_risks
  for insert with check (is_platform_admin());

drop policy if exists opportunity_risks_update_platform_admin on opportunity_risks;
create policy opportunity_risks_update_platform_admin on opportunity_risks
  for update using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists opportunity_risks_delete_platform_admin on opportunity_risks;
create policy opportunity_risks_delete_platform_admin on opportunity_risks
  for delete using (is_platform_admin());

drop policy if exists opportunity_risks_select_platform_admin on opportunity_risks;
create policy opportunity_risks_select_platform_admin on opportunity_risks
  for select using (is_platform_admin());

-- opportunity_documents ------------------------------------------------------
drop policy if exists opportunity_documents_insert_platform_admin on opportunity_documents;
create policy opportunity_documents_insert_platform_admin on opportunity_documents
  for insert with check (is_platform_admin());

drop policy if exists opportunity_documents_delete_platform_admin on opportunity_documents;
create policy opportunity_documents_delete_platform_admin on opportunity_documents
  for delete using (is_platform_admin());

drop policy if exists opportunity_documents_select_platform_admin on opportunity_documents;
create policy opportunity_documents_select_platform_admin on opportunity_documents
  for select using (is_platform_admin());

-- opportunity_notes ----------------------------------------------------------
drop policy if exists opportunity_notes_insert_platform_admin on opportunity_notes;
create policy opportunity_notes_insert_platform_admin on opportunity_notes
  for insert with check (is_platform_admin());

drop policy if exists opportunity_notes_delete_platform_admin on opportunity_notes;
create policy opportunity_notes_delete_platform_admin on opportunity_notes
  for delete using (is_platform_admin());

drop policy if exists opportunity_notes_select_platform_admin on opportunity_notes;
create policy opportunity_notes_select_platform_admin on opportunity_notes
  for select using (is_platform_admin());

-- opportunity_history --------------------------------------------------------
-- Só SELECT: history é log append-only (insert via trigger/action; sem update/delete).
drop policy if exists opportunity_history_select_platform_admin on opportunity_history;
create policy opportunity_history_select_platform_admin on opportunity_history
  for select using (is_platform_admin());
