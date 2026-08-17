#!/usr/bin/env bash
# audit-service-role.sh — confirma que SUPABASE_SERVICE_ROLE_KEY não vaza em código client
# Falha CI se qualquer arquivo com 'use client' referenciar a chave.
set -euo pipefail

echo "1. SUPABASE_SERVICE_ROLE_KEY em arquivos 'use client'..."

# Lista arquivos com 'use client'
client_files=$(grep -rln "'use client'" app components lib 2>/dev/null || true)
violations=0

if [ -n "$client_files" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if grep -q "SUPABASE_SERVICE_ROLE_KEY\|service_role" "$f"; then
      echo "  VIOLATION: $f referencia service role key"
      violations=$((violations + 1))
    fi
  done <<< "$client_files"
fi

echo "2. SUPABASE_SERVICE_ROLE_KEY fora de paths permitidos..."

# Caminhos onde service role pode aparecer
allowed_regex='^(lib/supabase/(server|admin)\.ts|tests/|scripts/)'

hits=$(grep -rln "SUPABASE_SERVICE_ROLE_KEY" app components lib 2>/dev/null || true)
if [ -n "$hits" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if ! echo "$f" | grep -qE "$allowed_regex"; then
      # Só consideramos violação se NÃO for um arquivo client (já contado acima)
      if ! grep -q "'use client'" "$f" 2>/dev/null; then
        echo "  WARN: $f referencia service role key fora de lib/supabase/server.ts/admin.ts"
        violations=$((violations + 1))
      fi
    fi
  done <<< "$hits"
fi

if [ "$violations" -gt 0 ]; then
  echo "FALHA: $violations violação(ões) encontrada(s)"
  exit 1
fi
echo "OK: Auditoria de service-role key passou"
