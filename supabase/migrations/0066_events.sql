-- =============================================================================
-- 0066_events.sql — eventos de levantamento (workshops) por empresa
-- =============================================================================
-- CONTEXTO: o formulário público é por EMPRESA (`/r/<slug>`), então tudo que um
-- cliente registra cai num acervo só, sem dizer em que ocasião foi levantado.
-- O CoE roda workshops e quer (a) um link de formulário por evento, (b) saber
-- quantas oportunidades cada evento rendeu e (c) ver só as daquele evento.
--
-- O QUE ENTRA:
--   1. tabela `events` — um evento pertence a UMA empresa; `slug` único por
--      empresa (é o que vai na URL `/r/<empresa>/<evento>`); `status`
--      active|closed (encerrado = o link público para de aceitar respostas);
--      `is_default` marca o evento-padrão "Registro avulso" da empresa.
--   2. EVENTO PADRÃO por empresa — linha real, criada aqui para as empresas
--      existentes (backfill) e por trigger para toda empresa nova. Recebe o
--      que ninguém vinculou a evento nenhum (registro manual sem escolha,
--      importação em massa, seeds, link antigo `/r/<empresa>`). Não tem link
--      público, não encerra, não some.
--   3. `opportunities.event_id` NOT NULL — toda oportunidade tem evento. Um
--      trigger BEFORE INSERT/UPDATE preenche o padrão quando ninguém informa e
--      recusa evento de OUTRA empresa (mesma disciplina de
--      `check_child_tenant_coherence()`, 0043). Assim os caminhos de criação
--      que não escolhem evento (wizard do cliente, `import_opportunities`,
--      migrations de seed) continuam funcionando sem mudar uma linha.
--   4. RLS de `events`: LÊ quem lê as oportunidades da empresa (membros do
--      tenant, super-admin, psw_staff com concessão ou atribuição); ESCREVE
--      só `is_platform_admin() ∪ is_tenant_admin_of(tenant_id)` — exatamente
--      o predicado da importação em massa (0059). Nenhum predicado novo.
--   5. `events_with_counts` — a lista da tela, com a contagem de oportunidades
--      VISÍVEIS (0030) por evento; `security_invoker`, então a contagem só
--      enxerga o que a RLS deixa o chamador ver.
--   6. `fetch_public_event(tenant_slug, event_slug)` — a porta anônima do
--      formulário por evento (mesma forma de `fetch_public_tenant`, 0034).
--   7. `create_public_opportunity` ganha o 30º parâmetro `p_event_slug`
--      (default null → forward-compatível): resolve o evento DENTRO da RPC,
--      recusa evento inexistente ou encerrado; null = padrão (link antigo).
--   8. `create_staff_opportunity` lê `event_id` do payload e valida que o
--      evento é da empresa-alvo antes de escrever.
--
-- A VIEW `opportunities_with_score` é `select o.*` e o Postgres congela a
-- expansão do `*` na criação — sem o bloco 5 o app quebra com "column
-- event_id does not exist" (mesma lição da 0061/0062/0065). `create or
-- replace view` não serve (coluna nova entraria antes de `score`), por isso
-- drop + create, com o grant reemitido.
--
-- IDEMPOTENTE: `if not exists`, `create or replace`, `drop ... if exists`
-- antes de cada policy/trigger, backfill com `where ... is null`.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0001, 0015, 0021, 0030, 0035, 0045, 0051, 0059, 0065.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Tabela `events`
-- -----------------------------------------------------------------------------
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null
               constraint events_name_len check (length(trim(name)) between 2 and 120),
  -- Vai na URL pública: só minúsculas, dígitos e hífen simples entre blocos.
  slug         text not null
               constraint events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  description  text
               constraint events_description_len check (description is null or length(description) <= 1000),
  starts_at    date not null default current_date,
  ends_at      date
               constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at),
  status       text not null default 'active'
               constraint events_status_domain check (status in ('active', 'closed')),
  is_default   boolean not null default false,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_tenant_slug_unique unique (tenant_id, slug)
);

comment on table events is
  'Eventos de levantamento (workshops etc.) por empresa (0066). Cada evento tem link público próprio (/r/<empresa>/<slug>); o evento is_default recebe o que não foi vinculado a nenhum.';

-- Um único evento padrão por empresa.
create unique index if not exists events_one_default_per_tenant_idx
  on events (tenant_id) where is_default;
create index if not exists events_tenant_starts_idx
  on events (tenant_id, starts_at desc);

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
  before update on events
  for each row execute function set_updated_at();

-- Guarda do evento padrão e da imutabilidade da empresa. Trigger (e não
-- checagem na Server Action) para que uma escrita por service-role ou pelo
-- SQL Editor também respeite a regra (mesma razão da 0045, bloco 4).
create or replace function guard_event_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- O padrão só sai junto com a empresa: num `on delete cascade` de
    -- `tenants` a linha-mãe já não existe quando este trigger dispara.
    if old.is_default
       and exists (select 1 from tenants where id = old.tenant_id) then
      raise exception 'O evento padrão da empresa não pode ser excluído.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Um evento não muda de empresa.'
      using errcode = 'check_violation';
  end if;

  if old.is_default then
    if not new.is_default then
      raise exception 'O evento padrão da empresa não pode deixar de ser padrão.'
        using errcode = 'check_violation';
    end if;
    if new.status <> 'active' then
      raise exception 'O evento padrão da empresa não pode ser encerrado.'
        using errcode = 'check_violation';
    end if;
  elsif new.is_default then
    raise exception 'Só existe um evento padrão por empresa, criado pelo sistema.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists events_row_guard on events;
create trigger events_row_guard
  before update or delete on events
  for each row execute function guard_event_row();

-- -----------------------------------------------------------------------------
-- 2. Evento padrão — "Registro avulso"
-- -----------------------------------------------------------------------------
-- `security definer`: é chamada por trigger de `tenants` (o super-admin que
-- cria a empresa) e pelo trigger de `opportunities` (qualquer papel que
-- insere) — nos dois casos precisa ler/escrever `events` sem depender da RLS
-- de quem disparou.
create or replace function ensure_default_event(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from events
   where tenant_id = p_tenant_id and is_default
   limit 1;

  if v_id is null then
    insert into events (tenant_id, name, slug, description, is_default, starts_at)
    values (
      p_tenant_id,
      'Registro avulso',
      'registro-avulso',
      'Oportunidades registradas sem evento associado (registro manual, importação, link geral).',
      true,
      coalesce((select created_at::date from tenants where id = p_tenant_id), current_date)
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function ensure_default_event(uuid) is
  'Devolve o id do evento padrão ("Registro avulso") da empresa, criando-o se ainda não existir (0066).';

-- Toda empresa nova nasce com o padrão.
create or replace function create_default_event_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform ensure_default_event(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_default_event on tenants;
create trigger tenants_default_event
  after insert on tenants
  for each row execute function create_default_event_for_tenant();

-- Backfill: todas as empresas existentes (inclusive suspensas — as
-- oportunidades delas também precisam de um evento para o NOT NULL do bloco 3).
select ensure_default_event(id) from tenants;

-- -----------------------------------------------------------------------------
-- 3. `opportunities.event_id` + trigger de coerência/preenchimento
-- -----------------------------------------------------------------------------
alter table opportunities
  add column if not exists event_id uuid references events(id) on delete restrict;

comment on column opportunities.event_id is
  'Evento em que a oportunidade foi levantada (0066). Nunca null: o trigger resolve_opportunity_event() preenche o evento padrão da empresa quando ninguém informa.';

create index if not exists opportunities_tenant_event_idx
  on opportunities (tenant_id, event_id);

-- Trigger ANTES do backfill: garante que qualquer INSERT concorrente durante o
-- apply já saia com evento.
create or replace function resolve_opportunity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_tenant uuid;
begin
  if new.event_id is null then
    new.event_id := ensure_default_event(new.tenant_id);
    return new;
  end if;

  select tenant_id into v_event_tenant from events where id = new.event_id;

  if v_event_tenant is null then
    raise exception 'Evento % inexistente.', new.event_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_event_tenant is distinct from new.tenant_id then
    raise exception 'O evento não pertence à empresa da oportunidade.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunities_event_guard on opportunities;
create trigger opportunities_event_guard
  before insert or update of event_id, tenant_id on opportunities
  for each row execute function resolve_opportunity_event();

update opportunities o
   set event_id = e.id
  from events e
 where e.tenant_id = o.tenant_id
   and e.is_default
   and o.event_id is null;

alter table opportunities alter column event_id set not null;

-- -----------------------------------------------------------------------------
-- 4. RLS de `events`
-- -----------------------------------------------------------------------------
alter table events enable row level security;

-- LEITURA — espelha quem lê `opportunities` da empresa:
--   membros do tenant (0001), super-admin (0021), psw_staff com concessão OU
--   atribuição (a união que `staff_writable_tenant_ids()` já calcula, 0051).
drop policy if exists events_select_own on events;
create policy events_select_own on events
  for select using (tenant_id = current_tenant_id());

drop policy if exists events_select_platform_admin on events;
create policy events_select_platform_admin on events
  for select using (is_platform_admin());

drop policy if exists events_select_psw_staff on events;
create policy events_select_psw_staff on events
  for select using (
    current_user_role() = 'psw_staff'
    and tenant_id in (select staff_writable_tenant_ids())
  );

-- ESCRITA — só quem administra a empresa (predicado da importação, 0059).
drop policy if exists events_insert_admin on events;
create policy events_insert_admin on events
  for insert with check (is_platform_admin() or is_tenant_admin_of(tenant_id));

drop policy if exists events_update_admin on events;
create policy events_update_admin on events
  for update
  using (is_platform_admin() or is_tenant_admin_of(tenant_id))
  with check (is_platform_admin() or is_tenant_admin_of(tenant_id));

drop policy if exists events_delete_admin on events;
create policy events_delete_admin on events
  for delete using (is_platform_admin() or is_tenant_admin_of(tenant_id));

grant select, insert, update, delete on events to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Views — `opportunities_with_score` recriada (coluna nova) + contagens
-- -----------------------------------------------------------------------------
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

-- O grant cai junto com o drop da view — reemitir é obrigatório, não opcional.
grant select on opportunities_with_score to authenticated;

-- A lista da tela /eventos. Conta só oportunidades VISÍVEIS (0030), que é o
-- mesmo recorte da listagem — o número da tela de eventos e o "Ver
-- oportunidades" batem. `security_invoker`: RLS de `events` e de
-- `opportunities` aplicadas ao chamador.
drop view if exists events_with_counts;

create view events_with_counts with (security_invoker = true) as
select e.*,
  (select count(*) from opportunities o
    where o.event_id = e.id and o.visivel)::int as opportunities_count
from events e;

grant select on events_with_counts to authenticated;

-- -----------------------------------------------------------------------------
-- 6. fetch_public_event — porta anônima do formulário por evento
-- -----------------------------------------------------------------------------
-- Devolve também `status` (a página mostra "encerrado" em vez de 404) e NUNCA
-- o evento padrão (ele não tem link público). Empresa suspensa → nada.
drop function if exists public.fetch_public_event(text, text);

create function public.fetch_public_event(p_tenant_slug text, p_event_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  starts_at date,
  ends_at date,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.name, e.slug, e.description, e.starts_at, e.ends_at, e.status
    from events e
    join tenants t on t.id = e.tenant_id
   where t.slug = p_tenant_slug
     and t.status = 'active'
     and e.slug = p_event_slug
     and not e.is_default
   limit 1;
$$;

grant execute on function public.fetch_public_event(text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. create_public_opportunity + p_event_slug (30º param)
-- -----------------------------------------------------------------------------
-- Mesma abordagem de 0026/0035: DROP do overload de 29 + CREATE do de 30 (o
-- novo param com DEFAULT null → o link antigo `/r/<empresa>` continua chamando
-- sem ele e cai no evento padrão pelo trigger). Corpo idêntico ao de 0035,
-- somando a resolução do evento e a coluna no INSERT.
drop function if exists public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text,
  jsonb, jsonb, numeric, text, text, text, int, uuid
);

create or replace function public.create_public_opportunity(
  p_tenant_slug text,
  p_solicitante text,
  p_email text,
  p_area text,
  p_subarea text,
  p_processo text,
  p_frequencia text,
  p_volume_medio text,
  p_tempo_execucao text,
  p_num_pessoas text,
  p_ferramenta text,
  p_escopo_automacao text[],
  p_beneficios_esperados text[],
  p_esforco text,
  p_complexidade text,
  p_tempo text,
  p_objetivo smallint,
  p_formulario_extras jsonb,
  p_request_type text default 'nova_oportunidade'::text,
  p_observacao text default null::text,
  p_risco text default null::text,
  p_criterios jsonb default null::jsonb,
  p_beneficios jsonb default null::jsonb,
  p_fte_horas numeric default null::numeric,
  p_fte text default null::text,
  p_responsavel text default null::text,
  p_criticidade text default null::text,
  p_execucoes_mes int default null::int,
  p_parent_opportunity_id uuid default null::uuid,
  -- ── novo (0066): evento em que a solicitação foi levantada ──
  p_event_slug text default null::text
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_tenant_id    uuid;
  v_opp_id       uuid;
  v_item         text;
  v_request_type opportunity_request_type;
  v_parent_id    uuid;
  v_event_id     uuid;
  v_event_status text;
begin
  -- =====================================================================
  -- Length / array / jsonb limits
  -- =====================================================================
  if length(coalesce(p_solicitante, '')) > 200 then
    raise exception 'solicitante excede 200 caracteres';
  end if;
  if length(coalesce(p_email, '')) > 200 then
    raise exception 'email excede 200 caracteres';
  end if;
  if length(coalesce(p_area, '')) > 200 then
    raise exception 'área excede 200 caracteres';
  end if;
  if length(coalesce(p_subarea, '')) > 200 then
    raise exception 'subárea excede 200 caracteres';
  end if;
  if length(coalesce(p_processo, '')) > 2000 then
    raise exception 'processo excede 2000 caracteres';
  end if;
  if length(coalesce(p_frequencia, '')) > 60 then
    raise exception 'frequência excede 60 caracteres';
  end if;
  if length(coalesce(p_volume_medio, '')) > 60 then
    raise exception 'volume médio excede 60 caracteres';
  end if;
  if length(coalesce(p_tempo_execucao, '')) > 60 then
    raise exception 'tempo de execução excede 60 caracteres';
  end if;
  if length(coalesce(p_num_pessoas, '')) > 60 then
    raise exception 'número de pessoas excede 60 caracteres';
  end if;
  if length(coalesce(p_observacao, '')) > 2000 then
    raise exception 'observacao excede 2000 caracteres';
  end if;
  if length(coalesce(p_risco, '')) > 2000 then
    raise exception 'risco excede 2000 caracteres';
  end if;
  if length(coalesce(p_responsavel, '')) > 200 then
    raise exception 'responsavel excede 200 caracteres';
  end if;
  if length(coalesce(p_event_slug, '')) > 80 then
    raise exception 'evento excede 80 caracteres';
  end if;

  if coalesce(array_length(p_escopo_automacao, 1), 0) > 20 then
    raise exception 'escopo_automacao excede 20 itens';
  end if;
  if p_escopo_automacao is not null then
    foreach v_item in array p_escopo_automacao loop
      if length(coalesce(v_item, '')) > 200 then
        raise exception 'item de escopo excede 200 caracteres';
      end if;
    end loop;
  end if;

  if coalesce(array_length(p_beneficios_esperados, 1), 0) > 20 then
    raise exception 'beneficios_esperados excede 20 itens';
  end if;
  if p_beneficios_esperados is not null then
    foreach v_item in array p_beneficios_esperados loop
      if length(coalesce(v_item, '')) > 200 then
        raise exception 'item de benefícios excede 200 caracteres';
      end if;
    end loop;
  end if;

  if p_formulario_extras is not null
     and length(p_formulario_extras::text) > 8192 then
    raise exception 'formulario_extras excede 8KB';
  end if;
  if p_criterios is not null and length(p_criterios::text) > 4096 then
    raise exception 'criterios excede 4KB';
  end if;
  if p_beneficios is not null and length(p_beneficios::text) > 4096 then
    raise exception 'beneficios excede 4KB';
  end if;
  if p_execucoes_mes is not null and p_execucoes_mes < 0 then
    raise exception 'execucoes_mes não pode ser negativo';
  end if;

  -- =====================================================================
  -- Validações originais
  -- =====================================================================
  if p_solicitante is null or length(trim(p_solicitante)) < 2 then
    raise exception 'Nome do solicitante é obrigatório';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  if p_area is null or length(trim(p_area)) < 2 then
    raise exception 'Área é obrigatória';
  end if;
  if p_processo is null or length(trim(p_processo)) < 3 then
    raise exception 'Descrição do processo é obrigatória';
  end if;
  if p_objetivo is null or p_objetivo < 1 or p_objetivo > 5 then
    raise exception 'Alinhamento estratégico deve estar entre 1 e 5';
  end if;

  -- request_type → enum, com fallback seguro
  if p_request_type in (
    'nova_oportunidade','melhoria_automacao','duvidas_terceiros',
    'incidente','treinamento'
  ) then
    v_request_type := p_request_type::opportunity_request_type;
  else
    v_request_type := 'nova_oportunidade';
  end if;

  -- =====================================================================
  -- Resolve tenant + evento + INSERT
  -- =====================================================================
  select id into v_tenant_id
    from tenants
   where slug = p_tenant_slug and status = 'active'
   limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant não encontrado ou inativo';
  end if;

  -- evento (0066): slug informado tem que existir NA empresa, não ser o
  -- padrão (sem link público) e estar ativo. Aqui o erro é explícito, ao
  -- contrário do parent abaixo: a página pública já mostrou o evento ao
  -- visitante, então "não encontrado"/"encerrado" não revela nada novo — e
  -- gravar em silêncio no padrão esconderia do CoE que o link expirou.
  if p_event_slug is not null and length(trim(p_event_slug)) > 0 then
    select id, status into v_event_id, v_event_status
      from events
     where tenant_id = v_tenant_id
       and slug = trim(p_event_slug)
       and not is_default
     limit 1;

    if v_event_id is null then
      raise exception 'Evento não encontrado';
    end if;
    if v_event_status <> 'active' then
      raise exception 'Evento encerrado';
    end if;
  end if;

  -- parent: só sobrevive se existir E for do MESMO tenant. Id alheio/inválido
  -- vira null (silencioso de propósito — não damos ao anônimo um oráculo que
  -- confirme "este uuid existe na empresa X").
  if p_parent_opportunity_id is not null then
    select id into v_parent_id
      from opportunities
     where id = p_parent_opportunity_id
       and tenant_id = v_tenant_id
     limit 1;
  end if;

  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao, risco,
    criterios, beneficios, fte_horas, fte, responsavel, criticidade, execucoes_mes,
    parent_opportunity_id, event_id
  ) values (
    v_tenant_id, 'formulario', v_request_type,
    trim(p_solicitante), trim(p_email),
    trim(p_area), nullif(trim(coalesce(p_subarea,'')),''),
    trim(p_processo), nullif(trim(coalesce(p_frequencia,'')),''),
    nullif(trim(coalesce(p_volume_medio,'')),''),
    nullif(trim(coalesce(p_tempo_execucao,'')),''),
    nullif(trim(coalesce(p_num_pessoas,'')),''),
    case
      when p_ferramenta in ('rpa', 'n8n', 'ambos') then p_ferramenta::automation_tool
      else null
    end,
    coalesce(p_escopo_automacao, '{}'),
    coalesce(p_beneficios_esperados, '{}'),
    case when p_esforco in ('baixo', 'medio', 'alto') then p_esforco::effort_level else null end,
    case when p_complexidade in ('baixo', 'medio', 'alto') then p_complexidade::complexity_level else null end,
    case when p_tempo in ('diario', 'semanal', 'quinzenal', 'mensal', 'anual') then p_tempo::frequency_bucket else null end,
    p_objetivo,
    'novo',
    p_formulario_extras,
    nullif(trim(coalesce(p_observacao, '')), ''),
    nullif(trim(coalesce(p_risco, '')), ''),
    p_criterios,
    p_beneficios,
    p_fte_horas,
    case when p_fte in ('muito_baixo','baixo','medio','alto','muito_alto') then p_fte::fte_bucket else null end,
    nullif(trim(coalesce(p_responsavel, '')), ''),
    case when p_criticidade in ('baixa','media','alta','critica') then p_criticidade::criticidade_level else null end,
    p_execucoes_mes,
    v_parent_id,
    -- null → o trigger resolve_opportunity_event() preenche o padrão
    v_event_id
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$function$;

grant execute on function public.create_public_opportunity(
  text, text, text, text, text, text, text, text, text, text, text,
  text[], text[], text, text, text, smallint, jsonb, text, text, text,
  jsonb, jsonb, numeric, text, text, text, int, uuid, text
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. create_staff_opportunity — lê `event_id` do payload
-- -----------------------------------------------------------------------------
-- Corpo idêntico ao de 0051, somando a validação do evento (tem que ser da
-- empresa-alvo; encerrado É aceito — quem registra é o CoE, e uma demanda
-- levantada num workshop pode ser digitada depois de ele fechar) e a coluna
-- no INSERT. Payload jsonb, então a assinatura não muda.
create or replace function create_staff_opportunity(
  p_tenant_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_id       uuid;
  v_parent_id    uuid;
  v_event_id     uuid;
  v_request_type opportunity_request_type;
  v_objetivo     smallint;
  v_raw_type     text;
begin
  -- ── autorização (antes de qualquer escrita) ──────────────────────────────
  if p_tenant_id is null then
    raise exception 'Empresa é obrigatória';
  end if;

  if not exists (
    select 1 from staff_writable_tenant_ids() s where s = p_tenant_id
  ) then
    raise exception 'Empresa não encontrada ou fora do seu escopo de acesso';
  end if;

  -- ── validações de conteúdo (espelham create_public_opportunity/0035) ─────
  if length(coalesce(p_payload->>'solicitante', '')) > 200 then
    raise exception 'solicitante excede 200 caracteres';
  end if;
  if length(coalesce(p_payload->>'email', '')) > 200 then
    raise exception 'email excede 200 caracteres';
  end if;
  if length(coalesce(p_payload->>'area', '')) > 200 then
    raise exception 'área excede 200 caracteres';
  end if;
  if length(coalesce(p_payload->>'subarea', '')) > 200 then
    raise exception 'subárea excede 200 caracteres';
  end if;
  if length(coalesce(p_payload->>'processo', '')) > 2000 then
    raise exception 'processo excede 2000 caracteres';
  end if;
  if length(coalesce(p_payload->>'responsavel', '')) > 200 then
    raise exception 'responsavel excede 200 caracteres';
  end if;
  if length(coalesce(p_payload->>'observacao', '')) > 2000 then
    raise exception 'observacao excede 2000 caracteres';
  end if;
  if p_payload->'formulario_extras' is not null
     and length((p_payload->'formulario_extras')::text) > 8192 then
    raise exception 'formulario_extras excede 8KB';
  end if;
  if p_payload->'criterios' is not null
     and length((p_payload->'criterios')::text) > 4096 then
    raise exception 'criterios excede 4KB';
  end if;
  if p_payload->'beneficios' is not null
     and length((p_payload->'beneficios')::text) > 4096 then
    raise exception 'beneficios excede 4KB';
  end if;

  if coalesce(trim(p_payload->>'solicitante'), '') = ''
     or length(trim(p_payload->>'solicitante')) < 2 then
    raise exception 'Nome do solicitante é obrigatório';
  end if;
  if coalesce(trim(p_payload->>'area'), '') = ''
     or length(trim(p_payload->>'area')) < 2 then
    raise exception 'Área é obrigatória';
  end if;
  if coalesce(trim(p_payload->>'processo'), '') = ''
     or length(trim(p_payload->>'processo')) < 3 then
    raise exception 'Descrição do processo é obrigatória';
  end if;

  if coalesce(p_payload->>'email', '') <> ''
     and p_payload->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;

  v_objetivo := coalesce((p_payload->>'objetivo')::smallint, 3::smallint);
  if v_objetivo < 1 or v_objetivo > 5 then
    raise exception 'Alinhamento estratégico deve estar entre 1 e 5';
  end if;

  v_raw_type := coalesce(p_payload->>'request_type', 'nova_oportunidade');
  if v_raw_type in (
    'nova_oportunidade','melhoria_automacao','duvidas_terceiros',
    'incidente','treinamento'
  ) then
    v_request_type := v_raw_type::opportunity_request_type;
  else
    v_request_type := 'nova_oportunidade';
  end if;

  -- parent: só sobrevive se existir E for do MESMO tenant-alvo (idêntico ao
  -- tratamento de 0035 — id alheio vira null em silêncio, sem virar oráculo).
  if coalesce(p_payload->>'parent_opportunity_id', '') <> '' then
    select id into v_parent_id
      from opportunities
     where id = (p_payload->>'parent_opportunity_id')::uuid
       and tenant_id = p_tenant_id
     limit 1;
  end if;

  -- evento (0066): ao contrário do parent, evento errado é ERRO, não null —
  -- quem registra escolheu o evento numa lista da própria empresa; um id fora
  -- dela só chega aqui por chamada fora da tela, e gravar no padrão em
  -- silêncio esconderia isso.
  if coalesce(p_payload->>'event_id', '') <> '' then
    select id into v_event_id
      from events
     where id = (p_payload->>'event_id')::uuid
       and tenant_id = p_tenant_id
     limit 1;
    if v_event_id is null then
      raise exception 'Evento não encontrado ou fora da empresa escolhida';
    end if;
  end if;

  -- ── INSERT ───────────────────────────────────────────────────────────────
  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao,
    criterios, beneficios, fte_horas, fte, responsavel, criticidade,
    execucoes_mes, parent_opportunity_id, created_by, event_id
  ) values (
    p_tenant_id,
    'formulario',
    v_request_type,
    trim(p_payload->>'solicitante'),
    nullif(trim(coalesce(p_payload->>'email', '')), ''),
    trim(p_payload->>'area'),
    nullif(trim(coalesce(p_payload->>'subarea', '')), ''),
    trim(p_payload->>'processo'),
    nullif(trim(coalesce(p_payload->>'frequencia', '')), ''),
    nullif(trim(coalesce(p_payload->>'volume_medio', '')), ''),
    nullif(trim(coalesce(p_payload->>'tempo_execucao', '')), ''),
    nullif(trim(coalesce(p_payload->>'num_pessoas', '')), ''),
    case when p_payload->>'ferramenta' in ('rpa','n8n','ambos')
         then (p_payload->>'ferramenta')::automation_tool end,
    case when p_payload->>'esforco' in ('baixo','medio','alto')
         then (p_payload->>'esforco')::effort_level end,
    case when p_payload->>'complexidade' in ('baixo','medio','alto')
         then (p_payload->>'complexidade')::complexity_level end,
    case when p_payload->>'tempo' in ('diario','semanal','quinzenal','mensal','anual')
         then (p_payload->>'tempo')::frequency_bucket end,
    v_objetivo,
    'novo',
    p_payload->'formulario_extras',
    nullif(trim(coalesce(p_payload->>'observacao', '')), ''),
    p_payload->'criterios',
    p_payload->'beneficios',
    (p_payload->>'fte_horas')::numeric,
    case when p_payload->>'fte' in ('muito_baixo','baixo','medio','alto','muito_alto')
         then (p_payload->>'fte')::fte_bucket end,
    nullif(trim(coalesce(p_payload->>'responsavel', '')), ''),
    case when p_payload->>'criticidade' in ('baixa','media','alta','critica')
         then (p_payload->>'criticidade')::criticidade_level end,
    (p_payload->>'execucoes_mes')::int,
    v_parent_id,
    (select auth.uid()),
    -- null → o trigger resolve_opportunity_event() preenche o padrão
    v_event_id
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$$;

comment on function create_staff_opportunity(uuid, jsonb) is
  'Registra uma oportunidade EM NOME de uma empresa cliente (0051/0066). Autoriza o tenant-alvo contra staff_writable_tenant_ids() antes de escrever; valida event_id contra a empresa; grava created_by = auth.uid(), source=formulario, status=novo.';

grant execute on function create_staff_opportunity(uuid, jsonb) to authenticated;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APPLY — rodar e conferir
-- =============================================================================
-- -- 1. Toda empresa tem exatamente 1 evento padrão (count = nº de tenants):
-- select count(*) from events where is_default;
--
-- -- 2. Nenhuma oportunidade sem evento, e a coluna é not null:
-- select count(*) from opportunities where event_id is null;   -- 0
-- select is_nullable from information_schema.columns
--  where table_name = 'opportunities' and column_name = 'event_id';  -- NO
--
-- -- 3. A view enxerga a coluna nova:
-- select event_id from opportunities_with_score limit 1;
--
-- -- 4. Contagem por evento (autenticado):
-- select name, slug, status, is_default, opportunities_count from events_with_counts;
--
-- -- 5. Porta anônima (troque os slugs):
-- select * from public.fetch_public_event('<empresa>', '<evento>');
--
-- -- 6. Guarda: as duas abaixo têm que FALHAR:
-- delete from events where is_default;
-- update events set status = 'closed' where is_default;
--
-- -- 7. Trigger de coerência: tem que FALHAR (evento de outra empresa):
-- update opportunities set event_id = (select id from events where tenant_id <> opportunities.tenant_id limit 1)
--  where id = (select id from opportunities limit 1);
-- =============================================================================
-- FIM 0066 — events + evento padrão + opportunities.event_id + RPCs públicas
-- e de staff cientes de evento.
-- =============================================================================
