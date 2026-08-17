-- =============================================================================
-- 0051_staff_opportunity_registration.sql — registro de oportunidade PELO STAFF
-- =============================================================================
-- CONTEXTO: hoje uma oportunidade nasce por dois caminhos — o formulário
-- público (`/r/<slug>`, RPC anônima `create_public_opportunity`) ou o wizard
-- autenticado (`/opportunities/new`, insert direto), que grava SEMPRE no tenant
-- do PROFILE de quem está logado. Falta o terceiro: alguém da PSW (staff ou
-- super-admin) registrando uma oportunidade EM NOME de uma empresa cliente —
-- tipicamente uma demanda levantada em workshop, reunião ou call, que hoje
-- alguém tem que abrir o link público do cliente para digitar.
--
-- POR QUE UMA RPC E NÃO UMA POLICY DE INSERT: para um `psw_staff`, a policy
-- RESTRICTIVE `opportunities_psw_staff_only_assigned` (0045, BLOCO 7) é
-- `for all` e o seu `with check` só passa quando (a) a linha está entre as
-- ATRIBUÍDAS nominalmente — impossível num INSERT, a linha ainda não existe,
-- logo não pode ter assignee — ou (b) o tenant está entre os ADMINISTRADOS
-- (`current_admin_tenant_ids()`). Conceder também o caso "tenho oportunidade
-- atribuída neste tenant, logo posso registrar outra" exigiria um QUARTO
-- disjunto naquela restritiva; como ela é `for all`, esse disjunto ampliaria
-- de tabela o alcance do staff em SELECT/UPDATE/DELETE — ele passaria a
-- enxergar e editar TODAS as oportunidades de qualquer empresa onde tenha uma
-- única atribuição. Isso destrói a granularidade nominal que é a razão de ser
-- da 0040/0044. Uma RPC SECURITY DEFINER entrega exatamente o verbo pedido
-- (INSERT), no escopo pedido, sem tocar em nenhuma policy viva.
--
-- QUEM PODE, E ONDE (espelha a regra de produto, 2026-08-10):
--   platform_admin → qualquer tenant ativo (já é o dono da carteira).
--   psw_staff      → união de (i) tenants ADMINISTRADOS (`psw_tenant_admins`,
--                    0045) com (ii) tenants onde ele tem ao menos uma
--                    oportunidade ATRIBUÍDA (`opportunity_assignees`, 0032).
--                    É a MESMA união que a Sidebar já usa para montar o
--                    seletor de empresa (app/(app)/layout.tsx) e que a
--                    listagem usa na coluna "Empresa" — nenhum alcance novo é
--                    inventado aqui, só o verbo INSERT sobre um conjunto que a
--                    pessoa já enxerga.
--   demais papéis  → NADA. `member`/`tenant_admin`/`viewer` continuam com o
--                    caminho de sempre (`/opportunities/new`, insert direto no
--                    próprio tenant pela policy da 0015). Esta RPC recusa.
--
-- O tenant-alvo é o ÚNICO parâmetro de escopo e é validado DENTRO da função,
-- contra o `auth.uid()` da sessão — nunca contra o que o cliente afirma ser.
-- Um id fora do conjunto levanta exceção (e não "insere no lugar errado" nem
-- "casa zero linhas em silêncio", o falso-sucesso descrito em
-- lib/security/role.ts:148-155).
--
-- O PAYLOAD VEM COMO JSONB, e não como 30 parâmetros posicionais no estilo de
-- `create_public_opportunity`: aquela assinatura já foi rasgada e recriada 4
-- vezes (0007/0012/0026/0035) porque acrescentar um campo obriga a dropar o
-- overload inteiro e reemitir o grant. Como aqui o chamador é SEMPRE nosso
-- próprio código autenticado (nunca um cliente anônimo), a validação de
-- domínio já acontece no TypeScript antes da chamada, e o jsonb deixa o
-- schema evoluir sem migration de assinatura. As coerções de enum continuam
-- defensivas abaixo (valor fora do domínio → null, jamais exceção de cast).
--
-- IDEMPOTENTE — seguro de re-rodar. Pré-requisitos: 0032, 0040, 0045.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. staff_writable_tenant_ids() — o conjunto "onde posso registrar"
-- -----------------------------------------------------------------------------
-- Mesma forma de `current_assigned_opportunity_ids()` (0040:86) e
-- `current_admin_tenant_ids()` (0045:145): `setof uuid`, `stable`,
-- `security definer` com `search_path` fixo (precisa ler `profiles`,
-- `psw_tenant_admins` e `opportunity_assignees` sem depender da RLS de quem
-- chama), e `(select auth.uid())` para virar InitPlan.
--
-- Devolve conjunto VAZIO para qualquer papel que não seja `platform_admin` ou
-- `psw_staff` — é este vazio que faz a autorização da RPC abaixo recusar por
-- construção, sem precisar de um `if role = ...` separado que pudesse
-- divergir. É também a fonte que o app consulta para MONTAR o seletor de
-- empresa da tela de registro: uma única definição para o que a UI oferece e
-- para o que o banco aceita.
create or replace function staff_writable_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- ramo platform_admin: a carteira inteira (só empresas ativas — registrar
  -- numa empresa desativada seria criar trabalho num contrato encerrado).
  select t.id
    from tenants t
   where t.status = 'active'
     and current_user_role() = 'platform_admin'

  union

  -- ramo psw_staff (i): empresas ADMINISTRADAS por concessão (0045)
  select a.tenant_id
    from psw_tenant_admins a
   where a.profile_id = (select auth.uid())
     and current_user_role() = 'psw_staff'

  union

  -- ramo psw_staff (ii): empresas onde há ao menos uma oportunidade ATRIBUÍDA
  select e.tenant_id
    from opportunity_assignees e
   where e.profile_id = (select auth.uid())
     and current_user_role() = 'psw_staff'
$$;

comment on function staff_writable_tenant_ids() is
  'Empresas em que o usuário corrente pode REGISTRAR uma oportunidade em nome do cliente (0051). platform_admin: todas as ativas. psw_staff: administradas (psw_tenant_admins) ∪ com atribuição (opportunity_assignees). Demais papéis: vazio.';

grant execute on function staff_writable_tenant_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_staff_opportunity(p_tenant_id, p_payload) — o INSERT autorizado
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER pelo motivo explicado no cabeçalho (a restritiva de 0045
-- barraria o INSERT do staff no ramo "atribuído"). A função NÃO é um bypass
-- genérico: ela valida o tenant-alvo contra `staff_writable_tenant_ids()`
-- ANTES de qualquer escrita, grava `created_by = auth.uid()` (a autoria real,
-- que o formulário público não tem como registrar) e fixa
-- `source = 'formulario'` / `status = 'novo'` — os mesmos valores do
-- caminho público, para que a oportunidade registrada pelo staff entre no
-- pipeline exatamente como entraria se o cliente a tivesse digitado.
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
    -- Mensagem única e deliberadamente ambígua: não distingue "empresa não
    -- existe" de "empresa fora do seu escopo" (mesma disciplina de
    -- ADMIN_SCOPE_DENIED_MESSAGE em lib/security/role.ts).
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

  -- E-mail: ao contrário do formulário público, aqui é OPCIONAL — quem
  -- registra é o CoE, e a demanda levantada numa reunião muitas vezes não tem
  -- um e-mail de solicitante confiável. Quando vier, tem que ser válido.
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

  -- ── INSERT ───────────────────────────────────────────────────────────────
  insert into opportunities (
    tenant_id, source, request_type, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    ferramenta, esforco, complexidade, tempo, objetivo,
    status, formulario_extras, observacao,
    criterios, beneficios, fte_horas, fte, responsavel, criticidade,
    execucoes_mes, parent_opportunity_id, created_by
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
    (select auth.uid())
  )
  returning id into v_opp_id;

  return v_opp_id;
end;
$$;

comment on function create_staff_opportunity(uuid, jsonb) is
  'Registra uma oportunidade EM NOME de uma empresa cliente (0051). Autoriza o tenant-alvo contra staff_writable_tenant_ids() antes de escrever; grava created_by = auth.uid(), source=formulario, status=novo.';

grant execute on function create_staff_opportunity(uuid, jsonb) to authenticated;

-- =============================================================================
-- Smoke (após aplicar):
--   -- 1. o conjunto visto por QUEM ESTÁ LOGADO (rode autenticado, não como
--   --    postgres — como service role o current_user_role() é null e o
--   --    resultado é corretamente vazio):
--   select * from staff_writable_tenant_ids();
--
--   -- 2. registro autorizado (troque o uuid por um da lista acima):
--   select create_staff_opportunity('<tenant-uuid>'::uuid, jsonb_build_object(
--     'solicitante','smoke staff','area','TI','processo','proc smoke staff',
--     'objetivo',3,'esforco','medio','complexidade','medio','tempo','mensal'));
--   select seq_id, tenant_id, source, status, created_by
--     from opportunities where solicitante = 'smoke staff';
--
--   -- 3. registro NEGADO num tenant fora do escopo — ESPERADO: exceção
--   --    'Empresa não encontrada ou fora do seu escopo de acesso'
--   select create_staff_opportunity('<uuid-de-tenant-alheio>'::uuid, '{}'::jsonb);
--
--   -- 4. limpeza:
--   delete from opportunities where solicitante = 'smoke staff';
-- =============================================================================
