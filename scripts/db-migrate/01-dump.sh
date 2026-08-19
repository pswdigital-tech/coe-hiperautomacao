#!/usr/bin/env bash
# =============================================================================
# 01-dump.sh — extrai roles + schema + dados da ORIGEM. Só lê, não escreve nada.
# =============================================================================
# Usa `supabase db dump` e não pg_dump cru de propósito: o CLI aplica a
# filtragem específica do Supabase (tira schemas internos, comenta roles
# reservadas, injeta IF NOT EXISTS). pg_dump direto traz as tripas da
# plataforma e o restore morre em erro de permissão.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars SOURCE_DB_URL
assert_distinct_dbs

mkdir -p "$DUMP_DIR"
c_step "Origem: $(db_host "$SOURCE_DB_URL")  ->  $DUMP_DIR"

c_step "1/3 roles"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$DUMP_DIR/roles.sql" --role-only
c_ok "roles.sql ($(wc -l < "$DUMP_DIR/roles.sql" | tr -d ' ') linhas)"

c_step "2/3 schema (public + schemas próprios; auth/storage são da plataforma)"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$DUMP_DIR/schema.sql"
c_ok "schema.sql ($(wc -l < "$DUMP_DIR/schema.sql" | tr -d ' ') linhas)"

c_step "3/3 dados (public + auth + storage)"
# storage.buckets_vectors / storage.vector_indexes: tabelas novas do Storage que
# podem não existir no destino ainda — a doc oficial manda excluir sempre.
excl=( -x "storage.buckets_vectors" -x "storage.vector_indexes" )
for t in ${EXTRA_EXCLUDES:-}; do excl+=( -x "$t" ); done
[[ -n "${EXTRA_EXCLUDES:-}" ]] && c_warn "excluindo também: $EXTRA_EXCLUDES"

supabase db dump --db-url "$SOURCE_DB_URL" -f "$DUMP_DIR/data.sql" --use-copy --data-only "${excl[@]}"
c_ok "data.sql ($(du -h "$DUMP_DIR/data.sql" | cut -f1))"

c_step "Sanidade do dump"
grep -c '^COPY ' "$DUMP_DIR/data.sql" | xargs -I{} echo "    blocos COPY: {}"
for t in auth.users public.opportunities public.tenants public.profiles; do
  if grep -q "^COPY \"${t%%.*}\".\"${t##*.}\"" "$DUMP_DIR/data.sql"; then c_ok "$t presente"
  else c_warn "$t NÃO aparece no dump (tabela vazia na origem?)"; fi
done

c_step "Dump pronto. Confira os arquivos e siga para ./02-restore.sh"
ls -lh "$DUMP_DIR"
