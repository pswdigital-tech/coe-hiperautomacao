#!/usr/bin/env bash
# =============================================================================
# 04-verify.sh — compara ORIGEM x DESTINO linha a linha, tabela a tabela.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars SOURCE_DB_URL TARGET_DB_URL
assert_distinct_dbs
mkdir -p "$DUMP_DIR"

c_step "Contando as duas pontas"
psql "$SOURCE_DB_URL" -f "$HERE/lib/counts.sql" -A -F'|' -t > "$DUMP_DIR/counts-origem.txt"
psql "$TARGET_DB_URL" -f "$HERE/lib/counts.sql" -A -F'|' -t > "$DUMP_DIR/counts-destino.txt"

# Tabelas que a gente EXCLUIU de propósito: divergência nelas é esperada, não erro.
esperado_divergir="$(tr ' ' '|' <<<"${EXTRA_EXCLUDES:-} storage.buckets_vectors storage.vector_indexes" | sed 's/||*/|/g;s/^|//;s/|$//')"

c_step "Comparativo"
# Os dois arquivos já vêm ordenados do SQL (order by 1). A ordem de leitura é
# preservada em ord[] porque `for (t in arr)` no awk não tem ordem definida —
# ordenar o resultado por fora jogaria cabeçalho e resumo no meio dos dados.
awk -F'|' -v ok="$(printf '\033[32mOK\033[0m')" \
        -v dif="$(printf '\033[31mDIFERE\033[0m')" \
        -v espr="$(printf '\033[33mesperado\033[0m')" \
        -v excl="$esperado_divergir" '
  NR==FNR { src[$1]=$2; ord[++n]=$1; next }
  { tgt[$1]=$2 }
  END {
    m=split(excl, e, "|"); for (i=1;i<=m;i++) if (e[i] != "") skip[e[i]]=1
    printf "    %-42s %10s %10s   %s\n", "TABELA", "ORIGEM", "DESTINO", "STATUS"
    for (i=1;i<=n;i++) {
      t=ord[i]; s=src[t]+0
      if (!(t in tgt))      { printf "    %-42s %10d %10s   %s\n", t, s, "-", dif " (ausente no destino)"; bad++; continue }
      g=tgt[t]+0
      status = (s==g) ? ok : ((t in skip) ? espr : dif)
      if (s!=g && !(t in skip)) bad++
      printf "    %-42s %10d %10d   %s\n", t, s, g, status
    }
    for (t in tgt) if (!(t in src)) { printf "    %-42s %10s %10d   %s\n", t, "-", tgt[t], dif " (só no destino)"; bad++ }
    printf "\n"
    if (bad) printf "    %d tabela(s) com divergencia NAO esperada — investigue antes do corte.\n", bad
    else     printf "    Todas as tabelas batem (fora as excluidas de proposito).\n"
  }
' "$DUMP_DIR/counts-origem.txt" "$DUMP_DIR/counts-destino.txt"

c_step "Checagens funcionais no destino"
psql "$TARGET_DB_URL" -c "select count(*) as usuarios_auth from auth.users"
psql "$TARGET_DB_URL" -c "select id, name from public.tenants order by name"
psql "$TARGET_DB_URL" -c "select id, name, public from storage.buckets order by id"
psql "$TARGET_DB_URL" -c "select count(*) as policies_public from pg_policies where schemaname='public'"
psql "$TARGET_DB_URL" -c "select count(*) as funcoes_public from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
psql "$TARGET_DB_URL" -c "select count(*) as tabelas_sem_rls from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and not c.relrowsecurity"
psql "$TARGET_DB_URL" -c "select count(*) from public.opportunities_with_score" >/dev/null \
  && c_ok "view opportunities_with_score responde" \
  || c_err "view opportunities_with_score quebrada"
