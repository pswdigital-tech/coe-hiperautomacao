#!/usr/bin/env bash
# =============================================================================
# 01b-extras.sh — extrai o que o dump padrão NÃO leva: alterações feitas por nós
# nos schemas auth e storage (trigger de signup + policies de RLS do Storage).
# Só lê a origem.
# =============================================================================
# O `supabase db dump` exclui auth e storage de propósito, porque a estrutura
# desses schemas é da plataforma. O efeito colateral é que TUDO que as migrations
# 0018/0033/0040/0044/0046/0047/0057 criaram lá dentro fica para trás: sem isso
# o projeto novo sobe com o bucket privado sem policy (anexo não sobe nem baixa)
# e sem o trigger que cria o profile no cadastro.
#
# Gera o DDL a partir do catálogo da origem, não das migrations, para pegar o
# estado real — inclusive ajustes aplicados direto no SQL Editor.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars SOURCE_DB_URL
mkdir -p "$DUMP_DIR"
OUT="$DUMP_DIR/extras-auth-storage.sql"

c_step "Lendo triggers e policies de auth/storage na origem"

{
  echo "-- Gerado por 01b-extras.sh a partir do catálogo da ORIGEM."
  echo "-- Aplicar no DESTINO DEPOIS do 02-restore.sh (depende das funções de public)."
  echo "set search_path = public;"
  echo
  echo "-- ---------------------------------------------------------------------"
  echo "-- Triggers próprios em auth.* (os de storage.* são nativos da plataforma)"
  echo "-- ---------------------------------------------------------------------"
  psql "$SOURCE_DB_URL" -Atc "
    select 'drop trigger if exists ' || quote_ident(t.tgname) || ' on ' ||
           quote_ident(n.nspname) || '.' || quote_ident(c.relname) || ';' || chr(10) ||
           pg_get_triggerdef(t.oid) || ';'
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace np on np.oid = p.pronamespace
    where n.nspname = 'auth' and not t.tgisinternal and np.nspname = 'public'
    order by c.relname, t.tgname"
  echo
  echo "-- ---------------------------------------------------------------------"
  echo "-- Policies de RLS em storage.*"
  echo "-- ---------------------------------------------------------------------"
  psql "$SOURCE_DB_URL" -Atc "
    select 'drop policy if exists ' || quote_ident(policyname) || ' on ' ||
           quote_ident(schemaname) || '.' || quote_ident(tablename) || ';' || chr(10) ||
           'create policy ' || quote_ident(policyname) || ' on ' ||
           quote_ident(schemaname) || '.' || quote_ident(tablename) ||
           case when permissive = 'PERMISSIVE' then ' as permissive' else ' as restrictive' end ||
           ' for ' || lower(cmd) ||
           ' to ' || array_to_string(roles, ', ') ||
           coalesce(' using (' || qual || ')', '') ||
           coalesce(' with check (' || with_check || ')', '') || ';'
    from pg_policies
    where schemaname = 'storage'
    order by tablename, policyname"
} > "$OUT"

c_ok "$OUT"
echo "    triggers: $(grep -c '^CREATE TRIGGER' "$OUT" || true)"
echo "    policies: $(grep -c '^create policy' "$OUT" || true)"
