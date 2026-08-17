-- =============================================================================
-- 0033_tenant_branding.sql — cor principal + logo por empresa (/configuracoes)
-- =============================================================================
-- CONTEXTO: o app tinha UMA identidade (azul PSW + logo PSW) hard-coded no CSS
-- (app/globals.css) e na Sidebar. Passa a ter identidade POR TENANT: o admin da
-- empresa escolhe a cor principal e envia a logo em /configuracoes.
--
--   brand_color  text  — hex '#rrggbb' (CHECK). null = usa o padrão PSW.
--   logo_path    text  — path no bucket público 'tenant-branding'
--                        ("{tenant_id}/<arquivo>"). null = usa a logo PSW.
--
-- A cor é UMA só: o shell deriva dela toda a paleta de marca (botão, nav,
-- focus ring) e ajusta luminosidade no dark mode — ver lib/branding/theme.ts.
-- Nada de guardar 10 tons no banco.
--
-- QUEM EDITA: `tenant_admin` (só a PRÓPRIA empresa) e `platform_admin`
-- (qualquer uma, via is_platform_admin() de 0021). member/viewer só leem.
--
-- GATE DE COLUNA: a policy `tenants_update_platform_admin` (0022) era a única
-- de update, e o grant de 0022 é `update on tenants` (todas as colunas). Abrir
-- update pro tenant_admin sem mais nada deixaria ele mexer em name/slug/status.
-- Por isso o trigger `tenants_branding_only_guard`: quem NÃO é platform_admin
-- só consegue alterar brand_color/logo_path — qualquer outra coluna levanta
-- exceção. RLS diz QUAIS linhas; o trigger diz QUAIS colunas.
--
-- IDEMPOTENTE. Pré-requisitos: 0001 (current_tenant_id), 0015
-- (current_user_role), 0021 (is_platform_admin), 0022 (grant/policy de update).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------
alter table tenants add column if not exists brand_color text;
alter table tenants add column if not exists logo_path   text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_brand_color_hex'
  ) then
    alter table tenants add constraint tenants_brand_color_hex
      check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2. RLS — update da própria empresa pelo tenant_admin
-- -----------------------------------------------------------------------------
drop policy if exists tenants_update_own_admin on tenants;
create policy tenants_update_own_admin on tenants
  for update using (
    id = current_tenant_id() and current_user_role() = 'tenant_admin'
  ) with check (
    id = current_tenant_id() and current_user_role() = 'tenant_admin'
  );

-- -----------------------------------------------------------------------------
-- 3. Gate de coluna — tenant_admin só mexe em branding
-- -----------------------------------------------------------------------------
create or replace function tenants_branding_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_platform_admin() then
    return new;                       -- PSW administra a empresa inteira
  end if;

  if new.id       <> old.id
     or new.name  <> old.name
     or new.slug  <> old.slug
     or new.status is distinct from old.status
     or new.created_at <> old.created_at then
    raise exception 'Apenas a cor e a logo da empresa podem ser alteradas aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists tenants_branding_only_guard on tenants;
create trigger tenants_branding_only_guard
  before update on tenants
  for each row execute function tenants_branding_only();

-- -----------------------------------------------------------------------------
-- 4. Bucket público 'tenant-branding'
-- -----------------------------------------------------------------------------
-- PÚBLICO de propósito: a logo aparece em telas anônimas (formulário público
-- /r/<slug>) e num <img> simples, sem signed URL. Não há dado sensível numa
-- logo. Escrita continua fechada: só admin, e só na pasta do próprio tenant
-- (convenção "{tenant_id}/<arquivo>", igual a 0018).
insert into storage.buckets (id, name, public)
values ('tenant-branding', 'tenant-branding', true)
on conflict (id) do update set public = true;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='tenant_branding_storage_select') then
    create policy tenant_branding_storage_select on storage.objects
      for select using (bucket_id = 'tenant-branding');
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='tenant_branding_storage_insert') then
    create policy tenant_branding_storage_insert on storage.objects
      for insert with check (
        bucket_id = 'tenant-branding'
        and (
          ((storage.foldername(name))[1] = current_tenant_id()::text
            and current_user_role() = 'tenant_admin')
          or is_platform_admin()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='tenant_branding_storage_update') then
    create policy tenant_branding_storage_update on storage.objects
      for update using (
        bucket_id = 'tenant-branding'
        and (
          ((storage.foldername(name))[1] = current_tenant_id()::text
            and current_user_role() = 'tenant_admin')
          or is_platform_admin()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='tenant_branding_storage_delete') then
    create policy tenant_branding_storage_delete on storage.objects
      for delete using (
        bucket_id = 'tenant-branding'
        and (
          ((storage.foldername(name))[1] = current_tenant_id()::text
            and current_user_role() = 'tenant_admin')
          or is_platform_admin()
        )
      );
  end if;
end$$;

-- =============================================================================
-- FIM 0033 — tenants.brand_color + tenants.logo_path, update de branding pelo
-- tenant_admin (com gate de coluna) e bucket público 'tenant-branding'.
-- Ver lib/branding/theme.ts (derivação da paleta) e app/(app)/configuracoes/.
-- =============================================================================
