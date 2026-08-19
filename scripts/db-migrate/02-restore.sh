#!/usr/bin/env bash
# =============================================================================
# 02-restore.sh — ESCREVE no banco DESTINO. Passo destrutivo.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars TARGET_DB_URL
assert_distinct_dbs

for f in roles.sql schema.sql data.sql; do
  [[ -f "$DUMP_DIR/$f" ]] || { c_err "$DUMP_DIR/$f não existe — rode ./01-dump.sh primeiro"; exit 1; }
done

c_step "Destino: $(db_host "$TARGET_DB_URL")"
echo "    Vai aplicar: roles.sql -> schema.sql -> data.sql"
echo "    Tamanho dos dados: $(du -h "$DUMP_DIR/data.sql" | cut -f1)"
echo
read -r -p "Confirma escrever nesse banco? digite SIM: " ok
[[ "$ok" == "SIM" ]] || { c_warn "cancelado"; exit 1; }

# session_replication_role = replica desliga os triggers durante a carga.
# Sem isso, os triggers do app (sync de fase, guard de branding, audit) disparam
# durante o restore e reescrevem/rejeitam linhas que deveriam entrar como estão.
if [[ "${RELAXED:-0}" == "1" ]]; then
  c_warn "modo RELAXED: sem --single-transaction e sem ON_ERROR_STOP."
  c_warn "Serve para LISTAR todos os erros de uma vez, não para o restore final."
  psql \
    --file "$DUMP_DIR/roles.sql" \
    --file "$DUMP_DIR/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$DUMP_DIR/data.sql" \
    --dbname "$TARGET_DB_URL" 2>&1 | tee "$DUMP_DIR/restore-relaxed.log"
  c_warn "erros encontrados: $(grep -c '^ERROR' "$DUMP_DIR/restore-relaxed.log" || true) (ver $DUMP_DIR/restore-relaxed.log)"
else
  psql \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --file "$DUMP_DIR/roles.sql" \
    --file "$DUMP_DIR/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$DUMP_DIR/data.sql" \
    --dbname "$TARGET_DB_URL" 2>&1 | tee "$DUMP_DIR/restore.log"
  c_ok "restore aplicado em transação única"
fi

c_step "Restore concluído. Próximo: ./03-storage.mjs (arquivos) e ./04-verify.sh"
