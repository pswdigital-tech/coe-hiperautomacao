#!/usr/bin/env bash
# check-headers.sh — auditoria de headers de segurança
# Uso: bash scripts/security/check-headers.sh [URL]
# Default: http://localhost:3000
set -euo pipefail

URL="${1:-http://localhost:3000}"
REQUIRED_HEADERS=(
  "content-security-policy"
  "x-frame-options"
  "x-content-type-options"
  "referrer-policy"
  "strict-transport-security"
)

echo "Auditando headers em $URL"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERRO: curl não encontrado"
  exit 1
fi

response=$(curl -sI -L --max-time 10 "$URL" || true)
if [ -z "$response" ]; then
  echo "ERRO: Sem resposta de $URL — servidor está rodando?"
  exit 1
fi

headers_lc=$(echo "$response" | tr '[:upper:]' '[:lower:]')
missing=0

for h in "${REQUIRED_HEADERS[@]}"; do
  if echo "$headers_lc" | grep -q "^${h}:"; then
    echo "  OK   $h"
  else
    echo "  MISS $h"
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  echo "FALHA: $missing header(s) obrigatório(s) ausente(s) em $URL"
  exit 1
fi

echo "OK: Todos os headers obrigatórios presentes em $URL"
