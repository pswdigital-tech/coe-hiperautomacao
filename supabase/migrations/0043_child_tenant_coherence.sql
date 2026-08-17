-- =============================================================================
-- 0043_child_tenant_coherence.sql — guarda de coerência de tenant nas tabelas
-- filhas que carregam `tenant_id` próprio
-- =============================================================================
-- POR QUE ESTE ARQUIVO EXISTE: durante a verificação da 0041 (Phase 17, Plan
-- 17-04) o PO encontrou 5 linhas em `opportunity_notes` e 2 em
-- `opportunity_risks` carimbadas com o `tenant_id` do tenant PSW
-- (cccccccc-…) mas penduradas em oportunidades do tenant 55551da5-….
--
-- A investigação exonerou a 0041 — nenhuma policy dela concede essas linhas —
-- e encontrou um defeito PRÉ-EXISTENTE, anterior a esta fase:
--
--   • `opportunity_assignees` tem guarda de coerência (check_assignee_tenant, 0032/0040).
--   • `opportunity_tasks`     tem guarda de coerência (check_task_tenant_coherence, 0037/0041).
--   • `opportunity_notes`, `opportunity_risks`, `opportunity_documents` e
--     `opportunity_history` NÃO TÊM NENHUMA.
--
-- E as policies de INSERT dessas tabelas validam o `tenant_id` DA LINHA
-- (`tenant_id = current_tenant_id() and current_user_role() <> 'viewer'`),
-- nunca que o `opportunity_id` pertence a esse tenant. Resultado: qualquer
-- usuário não-viewer pode pendurar nota/risco/documento em QUALQUER
-- oportunidade do sistema, bastando saber o id — a linha fica visível ao
-- tenant dele e invisível ao tenant dono da oportunidade.
--
-- SEVERIDADE, COM PRECISÃO: isto NÃO exfiltra dado do tenant vítima — o
-- conteúdo da linha é de quem a escreveu. É um defeito de integridade e
-- poluição de dados, mais um oráculo fraco de existência de id. Real, precisa
-- de correção, mas não é vazamento de leitura de dado alheio.
--
-- ESCOPO: apenas a guarda estrutural. A correção das linhas já divergentes
-- está em `scripts/fix/0043-recarimbar-linhas-divergentes.sql`, deliberadamente
-- separada — recarimbar uma linha muda quem a enxerga, e essa decisão exige
-- olhar o conteúdo antes (ver o cabeçalho daquele arquivo).
--
-- Aplicar esta migration com linhas divergentes já existentes é SEGURO: o
-- trigger é BEFORE INSERT OR UPDATE, então não toca em linha parada. O único
-- efeito é que um UPDATE futuro numa dessas linhas passa a exigir o
-- `tenant_id` correto — o que é o comportamento desejado.
--
-- IDEMPOTENTE: `create or replace function`, e `drop trigger if exists` antes
-- de cada `create trigger`. Rodar duas vezes não falha nem duplica.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. Função genérica de guarda
-- -----------------------------------------------------------------------------
-- Uma função só para as quatro tabelas: todas têm o mesmo par de colunas
-- (`opportunity_id`, `tenant_id`), então o corpo não precisa saber em qual
-- delas está rodando — `TG_TABLE_NAME` entra só na mensagem de erro.
--
-- `security definer` para conseguir ler `opportunities` sem depender da RLS
-- do chamador: a guarda tem que valer inclusive para escrita por service_role,
-- que é o caminho pelo qual um script ou uma server action mal escrita cria
-- exatamente o tipo de linha que este arquivo existe para impedir. Mesmo
-- padrão de `check_assignee_tenant()` (0040) e `check_task_tenant_coherence()`
-- (0041).
--
-- NOTA sobre psw_staff: aqui NÃO há exceção por papel, diferente de
-- `check_assignee_tenant()`. A regra "a linha filha pertence ao tenant da sua
-- oportunidade" (D-10) vale para TODOS os papéis, inclusive psw_staff — o
-- `tenant_id` de uma nota nunca representa o tenant de quem escreveu, sempre
-- o da oportunidade. O acesso do psw_staff a essas linhas vem das policies
-- aditivas da 0041 (`opportunity_id in (select current_assigned_opportunity_ids())`),
-- não de carimbar o próprio tenant na linha.
create or replace function check_child_tenant_coherence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant uuid;
begin
  select tenant_id into v_opp_tenant
  from opportunities
  where id = new.opportunity_id;

  if v_opp_tenant is null then
    raise exception 'Oportunidade % inexistente.', new.opportunity_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id is distinct from v_opp_tenant then
    raise exception
      'tenant_id de %.% nao confere com o da oportunidade (linha=%, oportunidade=%).',
      TG_TABLE_NAME, new.id, new.tenant_id, v_opp_tenant
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Triggers — só nas tabelas que de fato têm as duas colunas
-- -----------------------------------------------------------------------------
-- O laço confere `information_schema.columns` em vez de assumir o schema.
-- `opportunity_phases`, por exemplo, NÃO tem `tenant_id` (é escopada pela
-- oportunidade, e por isso nunca apresentou o problema) — ela simplesmente
-- não entra, sem precisar de exceção escrita à mão. Se um dia ganhar a
-- coluna, basta rodar este arquivo de novo.
do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunity_notes',
    'opportunity_risks',
    'opportunity_documents',
    'opportunity_history'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'pulando % — tabela nao existe', t;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'tenant_id'
    ) or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'opportunity_id'
    ) then
      raise notice 'pulando % — nao tem o par opportunity_id/tenant_id', t;
      continue;
    end if;

    execute format('drop trigger if exists %I on %I', t || '_tenant_guard', t);
    execute format(
      'create trigger %I before insert or update on %I
         for each row execute function check_child_tenant_coherence()',
      t || '_tenant_guard', t
    );
    raise notice 'guarda criada em %', t;
  end loop;
end $$;

-- =============================================================================
-- Verificação pós-apply
-- =============================================================================
-- 1. As guardas existem (esperado: 4 linhas — notes, risks, documents, history)
select c.relname as tabela, t.tgname as trigger, p.proname as funcao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where p.proname = 'check_child_tenant_coherence'
order by c.relname;

-- 2. Quantas linhas divergentes ainda existem (a guarda NÃO corrige o passado)
select 'opportunity_notes' as tabela, count(*) as divergentes
  from opportunity_notes n join opportunities o on o.id = n.opportunity_id
  where n.tenant_id is distinct from o.tenant_id
union all
select 'opportunity_risks', count(*)
  from opportunity_risks r join opportunities o on o.id = r.opportunity_id
  where r.tenant_id is distinct from o.tenant_id
union all
select 'opportunity_documents', count(*)
  from opportunity_documents d join opportunities o on o.id = d.opportunity_id
  where d.tenant_id is distinct from o.tenant_id
union all
select 'opportunity_history', count(*)
  from opportunity_history h join opportunities o on o.id = h.opportunity_id
  where h.tenant_id is distinct from o.tenant_id;
-- Esperado AGORA: notes=5, risks=2 (as linhas achadas na verificação da 0041).
-- Elas só zeram depois de rodar scripts/fix/0043-recarimbar-linhas-divergentes.sql.

-- 3. A guarda funciona (deve REJEITAR) — troque <OPP_DE_OUTRO_TENANT> por uma
--    oportunidade cujo tenant NÃO seja o do seu profile:
-- begin;
-- insert into opportunity_notes (opportunity_id, tenant_id, texto)
-- values ('<OPP_DE_OUTRO_TENANT>', current_tenant_id(), 'smoke');
-- -- esperado: ERRO "tenant_id de opportunity_notes.… nao confere …"
-- rollback;

-- =============================================================================
-- FIM 0043 — a partir daqui nenhuma linha nova pode nascer com tenant_id
-- divergente do tenant da sua oportunidade, em nenhuma das 4 tabelas filhas
-- que carregam tenant_id próprio. As linhas já existentes ficam como estão:
-- ver scripts/fix/0043-recarimbar-linhas-divergentes.sql.
-- =============================================================================
