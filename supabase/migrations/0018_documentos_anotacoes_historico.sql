-- =============================================================================
-- 0018_documentos_anotacoes_historico.sql — 3 tabelas novas (v0.3)
-- =============================================================================
-- opportunity_documents — anexos por oportunidade: link externo OU arquivo
--   real (Supabase Storage, bucket privado 'opportunity-documents').
-- opportunity_notes     — anotações estruturadas (autor + data), substituem
--   o padrão de texto único livre por uma lista cronológica de comentários.
-- opportunity_history   — auditoria automática: 1 linha por alteração feita
--   via updateOpportunity (server-side, nunca client-side). SOMENTE
--   select+insert — sem policy nem grant de update/delete: um log de
--   auditoria que pode ser editado/apagado pelo próprio usuário não serve
--   pra nada. Populada pela app (lib/opportunities/actions.ts), não por
--   trigger, porque o diff é calculado comparando o payload novo com a row
--   antes do update (mais simples em TS que em PL/pgSQL old/new record).
--
-- Todas as 3: tenant_id not null + RLS. Nas duas primeiras, insert/update/delete
-- também exigem current_user_role() <> 'viewer' (0015) — mesmo gate write das
-- tabelas de domínio existentes.
--
-- IDEMPOTENTE.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0001..0017 aplicadas (usa current_tenant_id() de 0001 e
-- current_user_role() de 0015).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- =============================================================================
-- opportunity_documents
-- =============================================================================
do $$ begin if not exists (select 1 from pg_type where typname='document_kind') then
  create type document_kind as enum ('link','arquivo'); end if; end$$;

create table if not exists opportunity_documents (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  kind            document_kind not null,
  nome            text not null,
  url             text,          -- kind='link'
  storage_path    text,          -- kind='arquivo' (Supabase Storage; bucket opportunity-documents)
  tipo            text,          -- mime type (arquivo) / null (link)
  size_bytes      int,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$ begin if not exists (select 1 from pg_constraint where conname='opportunity_documents_kind_chk') then
  alter table opportunity_documents add constraint opportunity_documents_kind_chk check (
    (kind = 'link'    and url is not null and storage_path is null) or
    (kind = 'arquivo' and storage_path is not null and url is null)
  ); end if; end$$;

create index if not exists opportunity_documents_tenant_idx      on opportunity_documents(tenant_id);
create index if not exists opportunity_documents_opportunity_idx on opportunity_documents(opportunity_id);

alter table opportunity_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='opportunity_documents' and policyname='opportunity_documents_select') then
    create policy opportunity_documents_select on opportunity_documents for select using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_documents' and policyname='opportunity_documents_insert') then
    create policy opportunity_documents_insert on opportunity_documents for insert with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer'); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_documents' and policyname='opportunity_documents_delete') then
    create policy opportunity_documents_delete on opportunity_documents for delete using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer'); end if;
end$$;
-- Sem policy/grant de UPDATE: um documento é substituído (delete+insert), não editado.
grant select, insert, delete on opportunity_documents to authenticated;

-- =============================================================================
-- opportunity_notes (anotações)
-- =============================================================================
create table if not exists opportunity_notes (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  texto           text not null check (char_length(texto) between 1 and 4000),
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists opportunity_notes_tenant_idx      on opportunity_notes(tenant_id);
create index if not exists opportunity_notes_opportunity_idx on opportunity_notes(opportunity_id);

alter table opportunity_notes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='opportunity_notes' and policyname='opportunity_notes_select') then
    create policy opportunity_notes_select on opportunity_notes for select using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_notes' and policyname='opportunity_notes_insert') then
    create policy opportunity_notes_insert on opportunity_notes for insert with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer'); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_notes' and policyname='opportunity_notes_delete') then
    create policy opportunity_notes_delete on opportunity_notes for delete using (tenant_id = current_tenant_id() and current_user_role() <> 'viewer'); end if;
end$$;
-- Sem UPDATE: uma anotação é apagada e recriada, não editada (mantém a data/autor honestos).
grant select, insert, delete on opportunity_notes to authenticated;

-- =============================================================================
-- opportunity_history (auditoria automática, imutável)
-- =============================================================================
create table if not exists opportunity_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  resumo          text not null,
  comentario      text,
  changed_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists opportunity_history_tenant_idx      on opportunity_history(tenant_id);
create index if not exists opportunity_history_opportunity_idx on opportunity_history(opportunity_id);

alter table opportunity_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='opportunity_history' and policyname='opportunity_history_select') then
    create policy opportunity_history_select on opportunity_history for select using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='opportunity_history' and policyname='opportunity_history_insert') then
    create policy opportunity_history_insert on opportunity_history for insert with check (tenant_id = current_tenant_id() and current_user_role() <> 'viewer'); end if;
end$$;
-- Deliberadamente SEM policy nem grant de update/delete — log de auditoria é
-- append-only. Nem o service_role da app tenta apagar; só um DBA via SQL Editor.
grant select, insert on opportunity_history to authenticated;

-- =============================================================================
-- Storage — bucket privado para anexos reais (kind='arquivo')
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('opportunity-documents', 'opportunity-documents', false)
on conflict (id) do nothing;

-- Convenção de path: "{tenant_id}/{opportunity_id}/{arquivo}" — o 1º segmento
-- da pasta É o tenant_id, então a policy escopa por ele (storage.foldername
-- é o helper padrão do Supabase Storage para isso).
do $$ begin
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='opportunity_documents_storage_select') then
    create policy opportunity_documents_storage_select on storage.objects
      for select using (
        bucket_id = 'opportunity-documents'
        and (storage.foldername(name))[1] = current_tenant_id()::text
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='opportunity_documents_storage_insert') then
    create policy opportunity_documents_storage_insert on storage.objects
      for insert with check (
        bucket_id = 'opportunity-documents'
        and (storage.foldername(name))[1] = current_tenant_id()::text
        and current_user_role() <> 'viewer'
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and schemaname='storage' and policyname='opportunity_documents_storage_delete') then
    create policy opportunity_documents_storage_delete on storage.objects
      for delete using (
        bucket_id = 'opportunity-documents'
        and (storage.foldername(name))[1] = current_tenant_id()::text
        and current_user_role() <> 'viewer'
      );
  end if;
end$$;

-- =============================================================================
-- FIM 0018 — opportunity_documents, opportunity_notes e opportunity_history
-- criadas (tenant_id + RLS + gate de viewer); bucket 'opportunity-documents'
-- privado no Storage com policies escopadas por pasta = tenant_id.
-- =============================================================================
