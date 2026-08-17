-- =============================================================================
-- 0048_phase_planned_dates.sql — datas ESTIMADAS por fase (planejado × realizado)
-- =============================================================================
-- CONTEXTO: `opportunity_phases.started_at/finished_at` são o tempo REALIZADO —
-- carimbados pela trigger `sync_opportunity_phase()` (0004/0017) quando o
-- status da oportunidade muda. Continuam intocados e continuam automáticos.
--
-- Esta migration acrescenta o tempo ESTIMADO: `planned_start_at` /
-- `planned_end_at`, editáveis à mão na aba "Fases". São `date` (não
-- timestamptz): estimativa de cronograma se dá em dia, não em hora — e `date`
-- evita o deslize de fuso que um timestamp meia-noite-UTC produziria no
-- pt-BR.
--
-- CONSEQUÊNCIA DE RLS QUE ESTA MIGRATION PRECISA RESOLVER: até aqui
-- `opportunity_phases` era escrita EXCLUSIVAMENTE pela trigger SECURITY
-- DEFINER, e por isso 0025 (platform_admin) e 0041 (psw_staff) documentaram
-- explicitamente que NÃO davam policy de escrita nesta tabela — "ampliação de
-- superfície sem função". A partir de agora o app escreve direto (server
-- action de estimativa), então essas duas exceções deixam de valer e as
-- permissivas de escrita passam a ser necessárias:
--   • member / tenant_admin  → já cobertos pela 0015 (tenant_id + não-viewer).
--   • psw_admin              → já coberto pela 0046 (is_tenant_admin_of).
--   • platform_admin         → CRIADO AQUI.
--   • psw_staff (atribuído)  → CRIADO AQUI (mesmo predicado das filhas na 0041;
--                              a restritiva da 0044/0046 continua valendo por
--                              cima e é ela que mantém o escopo "só atribuídas").
-- Viewer continua sem escrita: a 0015 nega, e nenhuma policy nova o alcança.
--
-- Pré-requisitos: 0001, 0004/0017, 0015, 0021, 0041, 0044, 0046.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Colunas de estimativa
-- -----------------------------------------------------------------------------
alter table opportunity_phases
  add column if not exists planned_start_at date,
  add column if not exists planned_end_at   date;

-- Coerência mínima: fim estimado não pode ser anterior ao início estimado.
-- Nulls passam (estimativa parcial é legítima — só a data de início conhecida,
-- por exemplo).
alter table opportunity_phases
  drop constraint if exists opportunity_phases_planned_range_chk;

alter table opportunity_phases
  add constraint opportunity_phases_planned_range_chk
  check (
    planned_start_at is null
    or planned_end_at is null
    or planned_end_at >= planned_start_at
  );

comment on column opportunity_phases.planned_start_at is
  'Início ESTIMADO da fase (editável à mão). O realizado é started_at, carimbado pela trigger.';
comment on column opportunity_phases.planned_end_at is
  'Fim ESTIMADO da fase (editável à mão). O realizado é finished_at, carimbado pela trigger.';

-- -----------------------------------------------------------------------------
-- 2. platform_admin — escrita cross-tenant em opportunity_phases
-- -----------------------------------------------------------------------------
-- Revoga a exceção documentada em 0025:15-16. `is_platform_admin()` (0021) é
-- SECURITY DEFINER. Sem INSERT o super-admin não conseguiria estimar uma fase
-- ainda não alcançada (a linha não existe até o status chegar nela).
drop policy if exists opportunity_phases_insert_platform_admin on opportunity_phases;
create policy opportunity_phases_insert_platform_admin on opportunity_phases
  for insert with check (is_platform_admin());

drop policy if exists opportunity_phases_update_platform_admin on opportunity_phases;
create policy opportunity_phases_update_platform_admin on opportunity_phases
  for update using (is_platform_admin()) with check (is_platform_admin());

-- DELETE segue sem policy de propósito: apagar linha de fase apagaria o
-- histórico REALIZADO. Limpar uma estimativa é UPDATE para null.

-- -----------------------------------------------------------------------------
-- 3. psw_staff atribuído — escrita escopada em opportunity_phases
-- -----------------------------------------------------------------------------
-- Revoga a exceção documentada em 0041:240-254, pelo mesmo motivo. Predicado
-- LITERALMENTE o das filhas na 0041 (curto-circuito por papel +
-- `current_assigned_opportunity_ids()`); a restritiva reemitida pela 0046
-- (Bloco B) continua por cima, então o escopo "só atribuídas / só concedidas"
-- não depende só destas permissivas.
drop policy if exists opportunity_phases_insert_psw_staff on opportunity_phases;
create policy opportunity_phases_insert_psw_staff on opportunity_phases
  for insert
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

drop policy if exists opportunity_phases_update_psw_staff on opportunity_phases;
create policy opportunity_phases_update_psw_staff on opportunity_phases
  for update
  using (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() = 'psw_staff'
    and opportunity_id in (select current_assigned_opportunity_ids())
  );

-- =============================================================================
-- FIM 0048 — estimativa por fase disponível; realizado (trigger) inalterado.
-- =============================================================================
