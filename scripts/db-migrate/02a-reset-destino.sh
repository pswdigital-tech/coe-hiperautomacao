#!/usr/bin/env bash
# =============================================================================
# 02a-reset-destino.sh — ZERA o banco DESTINO. Passo destrutivo, roda antes do
# 02-restore.sh quando se quer refazer a migração do zero.
# =============================================================================
# Não toca na ORIGEM em momento algum.
#
# Limpa nesta ordem: public inteiro -> objetos do Storage -> usuários do auth.
# Storage antes de auth porque storage.objects.owner referencia auth.users.
#
# O schema public é recriado com dono pg_database_owner para reproduzir a ACL
# de um projeto novo; os GRANT e ALTER DEFAULT PRIVILEGES vêm depois, do
# próprio schema.sql.
#
# Os binários no S3 NÃO são apagados aqui (o DELETE só remove a linha de
# metadados). O 03-storage.mjs sobe tudo de novo com upsert.
# =============================================================================
. "$(dirname "$0")/lib/_common.sh"
require_vars TARGET_DB_URL
assert_distinct_dbs

c_step "Destino a ser ZERADO: $(db_host "$TARGET_DB_URL")"
psql "$TARGET_DB_URL" -c "
  select 'tabelas em public' as item, count(*)::text as valor from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
  union all select 'usuários auth', count(*)::text from auth.users
  union all select 'objetos storage', count(*)::text from storage.objects"

c_warn "Isto apaga TODOS os dados do banco de destino."
read -r -p "Confirma? digite ZERAR: " ok
[[ "$ok" == "ZERAR" ]] || { c_warn "cancelado"; exit 1; }

psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" <<'SQL'
drop schema if exists public cascade;
create schema public;
alter schema public owner to pg_database_owner;
grant usage on schema public to public;
comment on schema public is 'standard public schema';

-- storage.protect_delete barra DELETE direto nas tabelas do Storage; o GUC
-- abaixo é a válvula que o próprio trigger consulta.
set local storage.allow_delete_query = 'true';
delete from storage.objects;
delete from storage.buckets;

delete from auth.users;
SQL

c_step "Estado após o reset"
psql "$TARGET_DB_URL" -c "
  select 'tabelas em public' as item, count(*)::text as valor from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
  union all select 'usuários auth', count(*)::text from auth.users
  union all select 'objetos storage', count(*)::text from storage.objects
  union all select 'ACL do schema public', coalesce(array_to_string(nspacl,' | '),'(null)') from pg_namespace where nspname='public'"

c_ok "Destino zerado. Próximo: ./02-restore.sh"
