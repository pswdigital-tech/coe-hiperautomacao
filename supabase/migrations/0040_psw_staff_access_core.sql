-- =============================================================================
-- 0040_psw_staff_access_core.sql — TRACER: helper de acesso por atribuição,
-- trigger de coerência reescrito e as 2 policies aditivas de SELECT
-- =============================================================================
-- CONTEXTO: a 0039 (JÁ APLICADA e COMMITADA em produção) adicionou o valor
-- 'psw_staff' ao enum tenant_role, sozinha, sem nada que o referenciasse. Esta
-- migration dá a esse papel o seu mecanismo de acesso: uma pessoa da PSW,
-- cadastrada 1x no tenant da PSW, passa a enxergar — via `opportunity_assignees`
-- (0032) — exatamente as oportunidades às quais foi atribuída, em qualquer
-- tenant. Não é acesso ao tenant inteiro (isso é `platform_admin`, 0021); é
-- acesso oportunidade-a-oportunidade, por atribuição (D-01/D-04).
--
-- PRÉ-REQUISITO DURO: a 0039 precisa estar APLICADA e COMMITADA no banco antes
-- de rodar esta migration. O Postgres não permite usar um valor de enum
-- recém-criado antes do commit da transação que o criou — se a 0040 rodar
-- antes do commit da 0039 (ex.: coladas juntas no mesmo Run do SQL Editor),
-- o erro é: `unsafe use of new value "psw_staff" of enum type tenant_role`
-- (hint: "New enum values must be committed before they can be used"). Se você
-- vir esse erro, a causa é essa — não o SQL desta migration.
--
-- DESIGN (por que é seguro):
--   1. `current_assigned_opportunity_ids()` é SECURITY DEFINER (lê
--      opportunity_assignees sem recursão de RLS), espelhando
--      `is_platform_admin()` (0021) na forma — mesma assinatura
--      `language sql / stable / security definer / set search_path = public`.
--   2. As duas policies novas são ADITIVAS. No Postgres, múltiplas policies
--      PERMISSIVE de um mesmo comando (SELECT) são combinadas com OR — logo
--      NENHUMA policy existente por tenant é tocada, dropada ou relaxada
--      (D-09). Um usuário que não seja `psw_staff` continua com visibilidade
--      byte-idêntica à de hoje: o predicado novo tem
--      `current_user_role() = 'psw_staff' and ...` como short-circuit — para
--      qualquer outro papel essa policy simplesmente nunca concede a linha, e
--      as policies antigas (`opportunities_select`, `tenants` por tenant,
--      `opportunities_select_platform_admin`) continuam avaliadas exatamente
--      como antes. Nada foi removido, então não há como esta migration
--      estreitar acesso de ninguém — só pode alargar, e só para `psw_staff`.
--   3. Escopo deliberadamente LIMITADO A SELECT em `opportunities` e `tenants`.
--      Escrita, tabelas filhas (`opportunity_phases`, `opportunity_risks`,
--      `opportunity_documents`, `opportunity_notes`, `opportunity_history`,
--      `opportunity_tasks`), Storage, `profiles`, `invited_emails` e
--      `audit_log` são a próxima migration (0041, Plan 17-04) — manter essa
--      fatia fina é o que permite provar o mecanismo ponta-a-ponta (banco →
--      RLS → fetchOpportunities() → tela) com o menor risco possível antes de
--      expandir mecanicamente o mesmo padrão às demais tabelas.
--   4. `psw_staff` e `platform_admin` (0021) são papéis INDEPENDENTES, não
--      hierárquicos (D-06): nada neste arquivo consulta `is_platform_admin()`,
--      e o helper `is_platform_admin()` continua sem saber que `psw_staff`
--      existe. Um não é nível do outro.
--
-- IDEMPOTENTE: `create or replace function`, `create index if not exists`,
-- `drop trigger if exists` + `create trigger`, e `drop policy if exists` antes
-- de cada `create policy` — rodar este arquivo duas vezes não falha nem
-- duplica nada.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor (ver
-- 17-03-MIGRATION-HANDOFF.md). O agente que escreveu este arquivo NÃO o
-- aplicou — o apply é ação humana, atrás de um checkpoint:decision +
-- checkpoint:human-action dedicados (a reescrita do trigger abaixo é
-- classificada `one-way`: ela substitui a ÚNICA barreira de banco contra
-- atribuição cruzada indevida, viva em produção).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Helper — current_assigned_opportunity_ids()
-- -----------------------------------------------------------------------------
-- Retorna o conjunto FIXO (independente da linha corrente) de opportunity_id
-- aos quais o usuário autenticado está atribuído. `setof uuid` consumido via
-- `id in (select current_assigned_opportunity_ids())` em vez de um
-- `exists (...)` correlacionado: o guia oficial de performance de RLS do
-- Supabase mostra que produzir o conjunto fixo primeiro e comparar com IN
-- evita que o planner reexecute a subquery a cada linha varrida (RESEARCH
-- Pattern 1, benchmark deles: ~9000ms → ~20ms nessa reescrita exata).
--
-- `(select auth.uid())` — não `auth.uid()` cru — é obrigatório: o Postgres
-- transforma a chamada envolvida em `select` num InitPlan, avaliado 1x por
-- statement em vez de 1x por linha (RESEARCH Pattern 2, benchmark: 179ms →
-- 9ms). As demais funções deste arquivo (que chamam `current_user_role()` e o
-- helper abaixo dentro das policies) se beneficiam do mesmo mecanismo.
--
-- Este helper NÃO consulta `is_platform_admin()` — psw_staff e platform_admin
-- são papéis independentes, nunca níveis um do outro (D-06).
create or replace function current_assigned_opportunity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select opportunity_id
  from opportunity_assignees
  where profile_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- 2. Índice de suporte — opportunity_assignees_profile_only_idx
-- -----------------------------------------------------------------------------
-- O índice composto existente, opportunity_assignees_profile_idx (0032),
-- COMEÇA por tenant_id — o Postgres não pula a 1ª coluna de um índice
-- composto para buscar só pela 2ª. O helper acima filtra APENAS por
-- profile_id (de propósito: é o ponto de ignorar o tenant), então o índice
-- composto não é usado eficientemente para essa busca. Decisão documentada
-- (RESEARCH Pattern 3): criar o índice agora, mesmo com a tabela ainda
-- pequena — o custo de manutenção é desprezível e esta policy passa a ser
-- avaliada em toda leitura de oportunidade de todo usuário do sistema.
create index if not exists opportunity_assignees_profile_only_idx
  on opportunity_assignees(profile_id);

-- -----------------------------------------------------------------------------
-- 3. Trigger de coerência de tenant — check_assignee_tenant() REESCRITO
-- -----------------------------------------------------------------------------
-- Substitui a versão de 0032:51-75, que hoje rejeita TODO vínculo em que o
-- profile não é do mesmo tenant da oportunidade. Esta é a ÚNICA barreira de
-- banco contra atribuição cruzada indevida — sobrevive inclusive a uma
-- escrita por service-role (as policies de INSERT/UPDATE/DELETE de
-- opportunity_assignees continuam admin-only e não são tocadas aqui).
--
-- Comparação por `role::text` (padrão de 0021), não pelo enum direto, para
-- não depender da ordem de commit do valor novo.
--
-- Os 4 casos que este trigger cobre (smoke tests obrigatórios no handoff):
--   a) profile do MESMO tenant da oportunidade            → ACEITA (regra de
--      sempre, preservada integralmente para todo papel)
--   b) profile de OUTRO tenant, papel <> psw_staff         → REJEITA (regra
--      de sempre, preservada integralmente)
--   c) profile com papel psw_staff, qualquer tenant         → ACEITA (única
--      mudança de comportamento desta migration)
--   d) tenant_id da LINHA <> tenant_id da oportunidade      → REJEITA para
--      TODOS os papéis, inclusive psw_staff (D-10) — a linha de vínculo
--      nunca representa o tenant do profile, sempre o da oportunidade.
create or replace function check_assignee_tenant()
returns trigger
language plpgsql
security definer            -- precisa enxergar opportunities/profiles sem RLS
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
  v_profile_role   tenant_role;
begin
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;
  select tenant_id, role into v_profile_tenant, v_profile_role
    from profiles where id = new.profile_id;

  if v_opp_tenant is null or v_profile_tenant is null then
    raise exception 'Oportunidade ou pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;

  -- tenant_id da LINHA sempre = tenant_id da oportunidade (D-10) — vale para
  -- TODOS os papéis, inclusive psw_staff. Caso d) do smoke test.
  if new.tenant_id <> v_opp_tenant then
    raise exception 'tenant_id do vínculo não confere com o da oportunidade.'
      using errcode = 'check_violation';
  end if;

  -- Só psw_staff pode ter profile de tenant DIFERENTE do da oportunidade.
  -- Para qualquer outro papel, a regra de sempre (0032) permanece intacta.
  if v_profile_role::text <> 'psw_staff' and v_profile_tenant <> v_opp_tenant then
    raise exception 'Atribuição cruzada entre empresas não é permitida.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Mesmo nome de trigger de 0032 — a FUNÇÃO é substituída (create or replace
-- acima), o trigger só precisa ser recriado para apontar para a nova versão.
drop trigger if exists opportunity_assignees_tenant_guard on opportunity_assignees;
create trigger opportunity_assignees_tenant_guard
  before insert or update on opportunity_assignees
  for each row execute function check_assignee_tenant();

-- -----------------------------------------------------------------------------
-- 4. Policies aditivas de SELECT (D-09 — OR com as policies existentes)
-- -----------------------------------------------------------------------------
-- Cada `drop policy if exists` abaixo nomeia APENAS uma policy com sufixo
-- _psw_staff, própria desta migration — nenhuma policy pré-existente
-- (opportunities_select, opportunities_select_platform_admin, as por tenant
-- de tenants, etc.) é dropada, substituída ou relaxada.

-- opportunities: o predicado é "esta oportunidade específica está no conjunto
-- de atribuídas", NUNCA "existe alguma atribuição no tenant desta
-- oportunidade" — é exatamente o erro que o teste negativo decisivo
-- (`não vê oportunidade não atribuída do mesmo tenant`, ACCESS-04) existe
-- para pegar. `current_user_role() = 'psw_staff'` funciona como short-circuit:
-- para os demais papéis a subquery nem chega a rodar.
drop policy if exists opportunities_select_psw_staff on opportunities;
create policy opportunities_select_psw_staff on opportunities
  for select using (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  );

-- tenants: sem nome/slug da empresa, a coluna "Empresa" e o filtro por
-- empresa da lista unificada (SC-7/D-03) não têm o que exibir nem como
-- resolver o slug. O recorte abaixo é seguro porque expõe APENAS as empresas
-- onde a pessoa tem oportunidade de fato atribuída — nunca a carteira de
-- clientes inteira (a alternativa "tenants_sem_abertura" foi considerada e
-- descartada no checkpoint:decision deste plano; ver SUMMARY).
drop policy if exists tenants_select_psw_staff on tenants;
create policy tenants_select_psw_staff on tenants
  for select using (
    current_user_role() = 'psw_staff'
    and id in (
      select o.tenant_id
      from opportunities o
      where o.id in (select current_assigned_opportunity_ids())
    )
  );

-- =============================================================================
-- RESTRIÇÃO DE ESCOPO, EXPLÍCITA: este arquivo NÃO contém policy de INSERT,
-- UPDATE ou DELETE; NÃO toca em `profiles`, nas tabelas filhas
-- (opportunity_phases/opportunity_risks/opportunity_documents/
-- opportunity_notes/opportunity_history/opportunity_tasks), em
-- `storage.objects`, em `invited_emails` nem em `audit_log`. Tudo isso é a
-- migration 0041 (Plan 17-04) — esta fatia fica deliberadamente fina para
-- provar o mecanismo ponta-a-ponta com o menor risco possível.
-- =============================================================================

-- =============================================================================
-- FIM 0040 — current_assigned_opportunity_ids() existe; o índice de suporte
-- existe; check_assignee_tenant() aceita atribuição cross-tenant SOMENTE para
-- psw_staff, mantendo a rejeição de sempre para todos os demais papéis, e
-- rejeitando SEMPRE (todos os papéis) tenant_id de linha divergente do da
-- oportunidade (D-10); opportunities e tenants têm SELECT aditivo para
-- psw_staff, escopado às oportunidades atribuídas. Nenhuma policy existente
-- foi tocada. A view opportunities_with_score (security_invoker) herda a
-- nova visibilidade automaticamente, sem mudança própria.
--
-- PRÓXIMO PASSO: migration 0041 (Plan 17-04), numa execução SEPARADA, depois
-- de confirmado o apply desta (0040) — escrita escopada, tabelas filhas,
-- Storage, invited_emails e audit_log.
-- =============================================================================
