-- =============================================================================
-- 0004_phase_sync_trigger.sql — Trigger de sincronia opportunity_phases
-- =============================================================================
-- Quando opportunities.status muda, mantém opportunity_phases em dia:
--   • Fecha (finished_at = now()) a fase anterior se ela ainda estava aberta
--   • Abre/reabre a fase nova (started_at = now(), finished_at = null)
--
-- Status `novo` é pré-pipeline — não vira phase row.
-- Demais status mapeiam 1:1 ao enum phase_key.
--
-- Pré-requisito: 0001_init.sql aplicado.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- function sync_opportunity_phase
-- -----------------------------------------------------------------------------
create or replace function sync_opportunity_phase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_phase phase_key;
  v_new_phase phase_key;
begin
  -- 'novo' não tem phase_key correspondente — vira null.
  v_old_phase := case
    when tg_op = 'UPDATE' and old.status::text <> 'novo'
      then old.status::text::phase_key
    else null
  end;
  v_new_phase := case
    when new.status::text <> 'novo'
      then new.status::text::phase_key
    else null
  end;

  -- UPDATE sem mudança de status: nada a fazer.
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  -- Fecha fase anterior (só se existia e estava aberta).
  if v_old_phase is not null then
    update opportunity_phases
      set finished_at = now()
      where opportunity_id = new.id
        and phase_key = v_old_phase
        and finished_at is null;
  end if;

  -- Abre/reabre fase nova. UPSERT: se já existia (caso de mover pra trás),
  -- preserva o started_at original e zera o finished_at.
  if v_new_phase is not null then
    insert into opportunity_phases
      (tenant_id, opportunity_id, phase_key, started_at, finished_at)
    values
      (new.tenant_id, new.id, v_new_phase, now(), null)
    on conflict (opportunity_id, phase_key) do update
      set started_at  = coalesce(opportunity_phases.started_at, excluded.started_at),
          finished_at = null;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- trigger
-- -----------------------------------------------------------------------------
drop trigger if exists trg_opportunities_phase_sync on opportunities;

create trigger trg_opportunities_phase_sync
  after insert or update of status on opportunities
  for each row execute function sync_opportunity_phase();

-- =============================================================================
-- FIM 0004 — Trigger de sincronia de fases ativo.
-- =============================================================================
