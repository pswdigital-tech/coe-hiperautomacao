#!/usr/bin/env bash
# =============================================================================
# 00-preflight.sh — checa tudo ANTES de tocar em qualquer banco. Não escreve nada.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars SOURCE_DB_URL TARGET_DB_URL
assert_distinct_dbs

fail=0

c_step "Ferramentas locais"
for bin in supabase psql docker; do
  if command -v "$bin" >/dev/null 2>&1; then c_ok "$bin: $(command -v "$bin")"
  else c_err "$bin não encontrado no PATH"; fail=1; fi
done

# O CLI roda pg_dump dentro de um container da imagem Postgres do Supabase,
# justamente para a versão do dump casar com a do servidor. Sem Docker no ar,
# o passo 01 falha.
if docker info >/dev/null 2>&1; then c_ok "Docker está rodando"
else c_err "Docker não está rodando — abra o Docker Desktop (supabase db dump depende dele)"; fail=1; fi

c_step "Conectividade"
if psql "$SOURCE_DB_URL" -Atc 'select 1' >/dev/null 2>&1; then
  c_ok "ORIGEM  $(db_host "$SOURCE_DB_URL") — versão: $(psql "$SOURCE_DB_URL" -Atc 'show server_version')"
else c_err "não consegui conectar na ORIGEM ($(db_host "$SOURCE_DB_URL"))"; fail=1; fi

if psql "$TARGET_DB_URL" -Atc 'select 1' >/dev/null 2>&1; then
  c_ok "DESTINO $(db_host "$TARGET_DB_URL") — versão: $(psql "$TARGET_DB_URL" -Atc 'show server_version')"
else c_err "não consegui conectar no DESTINO ($(db_host "$TARGET_DB_URL"))"; fail=1; fi

[[ $fail -eq 0 ]] || { c_err "preflight falhou — corrija os itens acima antes de seguir"; exit 1; }

c_step "Destino está vazio?"
existing=$(psql "$TARGET_DB_URL" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
if [[ "$existing" == "0" ]]; then
  c_ok "schema public do destino está vazio (0 tabelas) — restore limpo"
else
  c_warn "o destino JÁ TEM $existing tabelas em public. O restore vai conflitar."
  psql "$TARGET_DB_URL" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" | sed 's/^/    - /'
  c_warn "para zerar: psql \"\$TARGET_DB_URL\" -c 'drop schema public cascade; create schema public;'"
  c_warn "           e depois: grant usage on schema public to anon, authenticated, service_role;"
fi

c_step "Extensões da origem que precisam existir no destino"
# Extensões não vêm no dump de schema (o CLI exclui o schema 'extensions').
# Se a origem usa alguma fora do default, precisa ser habilitada no Dashboard
# do destino ANTES do restore, senão funções que dependem dela quebram.
src_ext=$(psql "$SOURCE_DB_URL" -Atc "select extname from pg_extension order by 1")
tgt_ext=$(psql "$TARGET_DB_URL" -Atc "select extname from pg_extension order by 1")
faltando=$(comm -23 <(echo "$src_ext") <(echo "$tgt_ext") || true)
if [[ -z "$faltando" ]]; then
  c_ok "destino já tem todas as extensões da origem"
else
  c_warn "faltam no destino (habilite em Database > Extensions antes do restore):"
  echo "$faltando" | sed 's/^/    - /'
fi

c_step "Objetos grandes / cron / vault na origem (não vêm no dump padrão)"
# Atribui antes de imprimir: num pipe, o status de saída seria o do sed e o
# fallback nunca rodaria.
if cron_n=$(psql "$SOURCE_DB_URL" -Atc "select count(*) from cron.job" 2>/dev/null); then
  [[ "$cron_n" == "0" ]] && c_ok "cron: nenhum job agendado" || c_warn "cron: $cron_n job(s) — recriar à mão no destino, não vêm no dump"
else
  c_ok "cron: extensão não instalada"
fi
if vault_n=$(psql "$SOURCE_DB_URL" -Atc "select count(*) from vault.secrets" 2>/dev/null); then
  [[ "$vault_n" == "0" ]] && c_ok "vault: nenhum segredo" || c_warn "vault: $vault_n segredo(s) — recriar à mão no destino, não vêm no dump"
else
  c_ok "vault: sem segredos acessíveis"
fi

c_step "Retrato da origem (guardado para conferência no passo 04)"
mkdir -p "$DUMP_DIR"
psql "$SOURCE_DB_URL" -f "$HERE/lib/counts.sql" -A -F'|' -t > "$DUMP_DIR/counts-origem.txt"
c_ok "$(wc -l < "$DUMP_DIR/counts-origem.txt" | tr -d ' ') tabelas contadas -> $DUMP_DIR/counts-origem.txt"
echo
awk -F'|' '{printf "    %-45s %s\n", $1, $2}' "$DUMP_DIR/counts-origem.txt"

c_step "Preflight OK. Próximo: ./01-dump.sh"
