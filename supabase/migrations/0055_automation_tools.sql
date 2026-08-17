-- =============================================================================
-- 0055_automation_tools.sql — catálogo de ferramentas + multi-seleção
-- =============================================================================
-- CONTEXTO: até aqui a ferramenta sugerida de uma oportunidade era UMA das três
-- do enum `automation_tool` ('rpa' | 'n8n' | 'ambos', 0001:39). Duas mudanças de
-- produto (2026-08-14):
--   1. Uma oportunidade pode sugerir MAIS DE UMA ferramenta (checkbox, não
--      radio) — o valor 'ambos' vira redundante e SAI da UI.
--   2. O usuário pode REGISTRAR uma ferramenta nova (Databricks, SAP, UiPath,
--      ou qualquer sistema da casa), e ela passa a estar disponível na seleção.
--
-- ESCOPO DE VISIBILIDADE (decisão do PO, 2026-08-14): o seed das 5 ferramentas
-- é GLOBAL (`tenant_id is null` — todo mundo vê); ferramenta registrada por um
-- usuário fica VISÍVEL SÓ PARA O TENANT DELE. Sem isso o nome de um sistema
-- interno de um cliente apareceria na lista de outro cliente — vazamento de
-- informação por um caminho que não é o dado da oportunidade, mas é vazamento
-- do mesmo jeito (docs/PROJETO.md §1).
--
-- POR QUE A COLUNA LEGADA `ferramenta` CONTINUA VIVA: três caminhos de escrita
-- gravam nela e não passam pela UI nova — `create_public_opportunity` (0026),
-- `create_staff_opportunity` (0051) e o enriquecimento por IA
-- (lib/ai/enrichment.ts). Em vez de reescrever os três, ela vira DERIVADA:
-- o trigger `sync_opportunity_ferramentas()` mantém as duas colunas coerentes
-- nos dois sentidos — array → enum sempre, e enum → array quando a escrita só
-- tocou o legado. Assim `ferramenta` segue servindo os consumidores antigos
-- (mix do relatório) sem nunca divergir do array, que é a fonte da verdade.
--
-- IDEMPOTENTE: `create table if not exists`, `add column if not exists`,
-- `create or replace function`, `drop policy if exists` antes de cada
-- `create policy`, seed com `on conflict do nothing`.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
--
-- Pré-requisitos: 0001 (`current_tenant_id`, `set_updated_at`, enum
-- `automation_tool`), 0015 (`current_user_role`), 0021 (`is_platform_admin`),
-- 0051 (`staff_writable_tenant_ids`).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Tabela automation_tools — catálogo global + por tenant
-- -----------------------------------------------------------------------------
-- `tenant_id` é NULLABLE de propósito, e é a única tabela de domínio do projeto
-- onde isso é verdade: `null` significa "catálogo global da plataforma" (o seed
-- abaixo), não "esqueci o tenant". Todo o resto do projeto segue a regra do
-- docs/PROJETO.md §1 (`tenant_id not null`); aqui a exceção é o que permite as 5
-- ferramentas-base existirem uma vez só em vez de replicadas por tenant.
create table if not exists automation_tools (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  -- Chave estável usada em `opportunities.ferramentas` — minúscula, sem acento,
  -- gerada a partir do nome (lib/opportunities/tools.ts `slugifyTool`).
  slug        text not null,
  nome        text not null,
  -- Emoji do badge. Opcional: ferramenta registrada pelo usuário sai sem, e a
  -- UI cai num ícone genérico.
  icone       text,
  -- Ordem de exibição no seletor: as duas ferramentas-casa primeiro, o resto do
  -- seed depois, e o que o tenant registrar por último (default 100).
  ordem       smallint not null default 100,
  ativo       boolean not null default true,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint automation_tools_slug_chk
    check (slug ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint automation_tools_nome_chk
    check (length(trim(nome)) between 1 and 40)
);

-- Unicidade em dois índices parciais, não um `unique(tenant_id, slug)`: em
-- Postgres `null` nunca é igual a `null`, então a constraint composta deixaria
-- criar 'sap' global duas vezes. O parcial `where tenant_id is null` fecha isso.
create unique index if not exists automation_tools_global_slug_idx
  on automation_tools(slug) where tenant_id is null;
create unique index if not exists automation_tools_tenant_slug_idx
  on automation_tools(tenant_id, slug) where tenant_id is not null;
create index if not exists automation_tools_tenant_idx
  on automation_tools(tenant_id);

drop trigger if exists automation_tools_set_updated_at on automation_tools;
create trigger automation_tools_set_updated_at
  before update on automation_tools
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. RLS de automation_tools
-- -----------------------------------------------------------------------------
alter table automation_tools enable row level security;

-- SELECT: catálogo global (sempre) + o do próprio tenant + o dos tenants em que
-- um papel da PSW pode trabalhar. O último disjunto existe para o caso concreto
-- de um `psw_staff` editando a oportunidade de um cliente: sem ele, a
-- ferramenta que o próprio cliente registrou sumiria do seletor no meio da
-- edição (e a UI marcaria o valor gravado como desconhecido).
drop policy if exists automation_tools_select on automation_tools;
create policy automation_tools_select on automation_tools
  for select using (
    tenant_id is null
    or tenant_id = current_tenant_id()
    or is_platform_admin()
    or tenant_id in (select staff_writable_tenant_ids())
  );

-- INSERT: `tenant_id is not null` barra a criação de ferramenta GLOBAL pela
-- app — o catálogo global só cresce por migration. `viewer` não registra nada.
drop policy if exists automation_tools_insert on automation_tools;
create policy automation_tools_insert on automation_tools
  for insert with check (
    tenant_id is not null
    and current_user_role() <> 'viewer'
    and (
      tenant_id = current_tenant_id()
      or tenant_id in (select staff_writable_tenant_ids())
    )
  );

-- UPDATE/DELETE: só administração (renomear/desativar um registro errado).
-- Sem tela hoje — existe para não precisar de migration quando houver.
drop policy if exists automation_tools_update on automation_tools;
create policy automation_tools_update on automation_tools
  for update
  using (
    tenant_id is not null
    and (
      (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
      or is_platform_admin()
      or tenant_id in (select staff_writable_tenant_ids())
    )
  )
  with check (tenant_id is not null);

drop policy if exists automation_tools_delete on automation_tools;
create policy automation_tools_delete on automation_tools
  for delete using (
    tenant_id is not null
    and (
      (tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin')
      or is_platform_admin()
      or tenant_id in (select staff_writable_tenant_ids())
    )
  );

grant select, insert, update, delete on automation_tools to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Seed do catálogo global — as 5 pedidas pelo PO
-- -----------------------------------------------------------------------------
insert into automation_tools (tenant_id, slug, nome, icone, ordem)
values
  (null, 'rpa',        'RPA',        '🤖', 10),
  (null, 'n8n',        'n8n',        '⚡', 20),
  (null, 'databricks', 'Databricks', '🧱', 30),
  (null, 'sap',        'SAP',        '🏢', 40),
  (null, 'uipath',     'UiPath',     '🔷', 50)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4. opportunities.ferramentas — o array que passa a ser a fonte da verdade
-- -----------------------------------------------------------------------------
alter table opportunities
  add column if not exists ferramentas text[] not null default '{}'::text[];

-- Teto defensivo (a UI limita antes, o Zod também). Sem CHECK de formato por
-- elemento: `check` não aceita subquery, e a normalização (trim/lower/dedup)
-- fica no trigger abaixo, que é o único caminho de escrita.
alter table opportunities
  drop constraint if exists opportunities_ferramentas_chk;
alter table opportunities
  add constraint opportunities_ferramentas_chk
  check (cardinality(ferramentas) <= 12);

-- Busca por ferramenta na lista é sempre "contém" (`ferramentas @> '{sap}'`).
create index if not exists opportunities_ferramentas_idx
  on opportunities using gin (ferramentas);

-- -----------------------------------------------------------------------------
-- 5. Trigger de coerência array ⇄ enum legado
-- -----------------------------------------------------------------------------
-- Regras, nesta ordem:
--   a. normaliza o array (trim, minúscula, sem vazios, sem repetido, ordenado);
--   b. se a escrita NÃO tocou o array mas mexeu no enum legado (INSERT das RPCs
--      públicas/staff, UPDATE do enriquecimento por IA), expande o enum para o
--      array — é o que mantém os caminhos antigos funcionando sem reescrevê-los;
--   c. deriva o enum legado do array, SEMPRE. {rpa,n8n} → 'ambos' preserva a
--      semântica de quem lê a coluna antiga; um array só com ferramenta de fora
--      do enum (ex. {sap}) deixa o legado nulo, que é a verdade — não existe
--      valor de `automation_tool` que represente SAP.
create or replace function sync_opportunity_ferramentas()
returns trigger
language plpgsql
as $$
declare
  v_norm text[];
begin
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
    into v_norm
    from (
      select lower(trim(u.x)) as t
        from unnest(coalesce(new.ferramentas, '{}'::text[])) as u(x)
    ) s
   where s.t <> '';

  if tg_op = 'INSERT' then
    if cardinality(v_norm) = 0 and new.ferramenta is not null then
      v_norm := case new.ferramenta
                  when 'ambos' then array['n8n', 'rpa']
                  when 'rpa'   then array['rpa']
                  when 'n8n'   then array['n8n']
                end;
    end if;
  else
    if v_norm is not distinct from coalesce(old.ferramentas, '{}'::text[])
       and new.ferramenta is distinct from old.ferramenta
       and new.ferramenta is not null then
      v_norm := case new.ferramenta
                  when 'ambos' then array['n8n', 'rpa']
                  when 'rpa'   then array['rpa']
                  when 'n8n'   then array['n8n']
                end;
    end if;
  end if;

  new.ferramentas := v_norm;
  new.ferramenta := (
    case
      when 'rpa' = any(v_norm) and 'n8n' = any(v_norm) then 'ambos'
      when 'rpa' = any(v_norm) then 'rpa'
      when 'n8n' = any(v_norm) then 'n8n'
      else null
    end
  )::automation_tool;

  return new;
end;
$$;

comment on function sync_opportunity_ferramentas() is
  'Mantém opportunities.ferramentas (array, fonte da verdade) e opportunities.ferramenta (enum legado, derivado) coerentes nos dois sentidos (0055).';

drop trigger if exists opportunities_sync_ferramentas on opportunities;
create trigger opportunities_sync_ferramentas
  before insert or update on opportunities
  for each row execute function sync_opportunity_ferramentas();

-- -----------------------------------------------------------------------------
-- 6. Backfill do histórico — 'ambos' vira {n8n,rpa} (a opção sai da UI)
-- -----------------------------------------------------------------------------
-- Triggers desligados durante o backfill de propósito: com eles ligados, este
-- UPDATE em massa (a) carimbaria `updated_at` em toda a base, fazendo cada
-- oportunidade parecer editada hoje, e (b) geraria uma linha de `audit_log` por
-- oportunidade para uma mudança que é de schema, não de conteúdo. `DISABLE
-- TRIGGER USER` não desliga os triggers internos de constraint/FK.
alter table opportunities disable trigger user;

update opportunities
   set ferramentas = case ferramenta
                       when 'ambos' then array['n8n', 'rpa']
                       when 'rpa'   then array['rpa']
                       when 'n8n'   then array['n8n']
                       else '{}'::text[]
                     end
 where cardinality(ferramentas) = 0
   and ferramenta is not null;

alter table opportunities enable trigger user;

-- -----------------------------------------------------------------------------
-- 7. Recria a view para que `o.*` passe a incluir `ferramentas`
-- -----------------------------------------------------------------------------
-- Mesmo motivo das 0035/0049/0050: `select o.*` é expandido no CREATE, então a
-- view não enxerga coluna adicionada depois. Corpo idêntico ao da 0050 — só a
-- lista de colunas implícita muda.
drop view if exists opportunities_with_score;
create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- Smoke (após aplicar):
--   -- 1. catálogo global veio com as 5:
--   select slug, nome, icone, ordem, tenant_id from automation_tools order by ordem;
--
--   -- 2. a view enxerga a coluna nova:
--   select column_name from information_schema.columns
--    where table_name = 'opportunities_with_score' and column_name = 'ferramentas'; -- 1 linha
--
--   -- 3. backfill: nenhuma linha com enum preenchido e array vazio:
--   select count(*) from opportunities
--    where ferramenta is not null and cardinality(ferramentas) = 0;  -- 0
--
--   -- 4. 'ambos' virou os dois:
--   select seq_id, ferramenta, ferramentas from opportunities
--    where ferramenta = 'ambos' limit 5;   -- ferramentas = {n8n,rpa}
--
--   -- 5. trigger nos dois sentidos (rodar numa oportunidade de teste):
--   --    array → enum:
--   update opportunities set ferramentas = array['SAP ',' rpa','rpa']
--    where id = '<uuid>' returning ferramentas, ferramenta;  -- {rpa,sap} / 'rpa'
--   --    enum → array (caminho do enriquecimento por IA):
--   update opportunities set ferramenta = 'ambos'
--    where id = '<uuid>' returning ferramentas, ferramenta;  -- {n8n,rpa} / 'ambos'
--
--   -- 6. RLS: ferramenta de outro tenant não aparece (rodar autenticado):
--   select slug, tenant_id from automation_tools;  -- só globais + as do meu tenant
-- =============================================================================
