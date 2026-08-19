#!/usr/bin/env bash
# Trecho comum a todos os passos: carrega .env, valida variáveis, helpers de log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_DIR="${DUMP_DIR:-$HERE/dump}"

if [[ -f "$HERE/.env" ]]; then
  set -a; . "$HERE/.env"; set +a
else
  echo "ERRO: $HERE/.env não existe. Copie env.example para .env e preencha." >&2
  exit 1
fi

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }
c_step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

require_vars() {
  local missing=0 v
  for v in "$@"; do
    if [[ -z "${!v:-}" || "${!v}" == *OLDREF* || "${!v}" == *NEWREF* ]]; then
      c_err "variável $v não preenchida no .env"; missing=1
    fi
  done
  [[ $missing -eq 0 ]] || exit 1
}

# Impede o erro mais caro possível: rodar o restore apontando pro banco antigo.
assert_distinct_dbs() {
  if [[ "${SOURCE_DB_URL:-}" == "${TARGET_DB_URL:-}" ]]; then
    c_err "SOURCE_DB_URL e TARGET_DB_URL são idênticas. Abortando."
    exit 1
  fi
}

# Extrai o host da connection string só para exibir (nunca imprime senha).
db_host() { sed -E 's#.*@([^/:]+).*#\1#' <<<"$1"; }
