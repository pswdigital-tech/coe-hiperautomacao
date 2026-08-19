#!/usr/bin/env bash
# =============================================================================
# 02b-apply-extras.sh — aplica no DESTINO o que o dump padrão deixa para trás:
# o trigger de auth.users e as policies de RLS do Storage. Rodar DEPOIS do 02.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars TARGET_DB_URL
assert_distinct_dbs

EXTRAS="$DUMP_DIR/extras-auth-storage.sql"
[[ -f "$EXTRAS" ]] || { c_err "$EXTRAS não existe — rode ./01b-extras.sh"; exit 1; }

c_step "Aplicando extras no destino"
psql --single-transaction --variable ON_ERROR_STOP=1 --file "$EXTRAS" --dbname "$TARGET_DB_URL"

c_step "Conferência"
psql "$TARGET_DB_URL" -c "
  select 'policies em storage' as item, count(*)::text as valor from pg_policies where schemaname='storage'
  union all
  select 'triggers próprios em auth', count(*)::text
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid join pg_namespace np on np.oid=p.pronamespace
    where n.nspname='auth' and not t.tgisinternal and np.nspname='public'"
