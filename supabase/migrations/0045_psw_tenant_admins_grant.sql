-- =============================================================================
-- 0045_psw_tenant_admins_grant.sql — TRACER: concessão pessoa × empresa
-- (`psw_staff` como admin de N tenants) + as DUAS METADES da RLS em
-- `opportunities`/`tenants`
-- =============================================================================
-- CONTEXTO: a Phase 17 (`0039`/`0040`) criou o papel `psw_staff`, que enxerga
-- SOMENTE as oportunidades atribuídas a ele (`0044`). Esta fase (18) dá a esse
-- papel uma segunda via de acesso: uma pessoa da PSW pode ser admin de UMA OU
-- MAIS empresas ao mesmo tempo, exercendo ali os poderes de `tenant_admin`,
-- sem perder as atribuições que já tinha em outras empresas.
--
-- A EXPLICAÇÃO CENTRAL (o achado que mudou a forma desta fase): uma policy
-- RESTRICTIVE só SUBTRAI. Hoje, para um `psw_staff`, a camada PERMISSIVE não
-- concede NENHUMA linha de um tenant A ao qual ele não pertence — nem
-- `opportunities_select` (0001, filtra pelo tenant do próprio profile), nem
-- `opportunities_select_platform_admin` (0021, papel errado), nem
-- `opportunities_select_psw_staff` (0040, concede oportunidade a oportunidade,
-- nunca por tenant). Acrescentar um disjunto SÓ na restritiva `0044` produz
-- uma migration que aplica limpa, não erra em lugar nenhum e NÃO FAZ NADA —
-- ela apenas deixaria de subtrair algo que nunca foi concedido. Por isso este
-- arquivo entrega as DUAS METADES no mesmo pacote: policies PERMISSIVE novas
-- (que concedem) e o terceiro disjunto na RESTRICTIVE `0044` (que impede que
-- a concessão nova seja cortada de volta a zero). Cada metade é inútil sem a
-- outra.
--
-- POR QUE A CONCESSÃO É TABELA, E NÃO VALOR NOVO DE ENUM: `profiles` tem um
-- `role` e um `tenant_id` — um par por pessoa. "Admin nas empresas A e C, e
-- nas demais só o atribuído" é um par (pessoa × empresa) que SE REPETE: é
-- cardinalidade N:N, não um valor novo de estado. Nenhuma coluna enum expressa
-- isso. `profiles.tenant_id` continua único e NOT NULL (o tenant de LOTAÇÃO —
-- de qual empresa a pessoa é funcionária; para o staff PSW, sempre a PSW). A
-- pluralidade "é admin de N empresas" mora AO LADO, em `psw_tenant_admins`.
--
-- ESCOPO DELIBERADAMENTE ESTREITO desta migration: SOMENTE `opportunities` e
-- `tenants`. As sete tabelas filhas da fase anterior e a extensão a
-- `profiles` ficam para a migration seguinte da fase (fundação já pronta
-- aqui); a troca das policies vivas de `tenant_admin` pela fonte única
-- `is_tenant_admin_of()` (Storage incluso) fica para uma migration posterior
-- ainda. O estado intermediário — o staff-admin vê a oportunidade de A mas
-- ainda não vê as tabelas filhas dela (anotações/tarefas/riscos) — é
-- ESPERADO e estritamente menos permissivo, não um vazamento.
--
-- DESVIO AUTORIZADO DO PLANO (checkpoint da Task 2, resolvido pelo PO em
-- 2026-08-07): a fatia SELECT-only descrita acima deixaria o verbo UPDATE em
-- `opportunities` sem NENHUMA permissiva que o conceda ao staff-admin — nem
-- `opportunities_update` (0015, exige `tenant_id = current_tenant_id()`), nem
-- `opportunities_update_platform_admin` (0025, exige `is_platform_admin()`),
-- nem `opportunities_update_psw_staff` (0041, exige atribuição nominal). A
-- restritiva reemitida (BLOCO 7) é `for all` e já cobre o UPDATE do lado que
-- SUBTRAI, mas restritiva só subtrai — sem uma permissiva correspondente o
-- verbo fica igual ao caso já documentado acima (D-P) aplicado a escrita:
-- o UPDATE casaria ZERO linhas e devolveria `error === null`, o falso-sucesso
-- silencioso que a releitura por service-role do teste decisivo desta fase
-- foi escrita para pegar. Nenhuma outra migration da fase fecha isso depois
-- (a lista de policies do `18-05` não inclui `opportunities_update`). O PO
-- autorizou, portanto, o acréscimo de UMA permissiva a mais além do escopo
-- original — `opportunities_update_psw_admin` (BLOCO 6b) — mantendo tudo o
-- mais (INSERT/DELETE em `opportunities`, e as sete filhas) fora desta
-- migration.
--
-- OBJETOS NOVOS DESTA MIGRATION (lista final, já incorporando o desvio
-- acima):
--   tabela   psw_tenant_admins
--   índices  psw_tenant_admins_profile_only_idx, psw_tenant_admins_tenant_idx
--   funções  current_admin_tenant_ids(), effective_admin_tenant_ids(),
--            is_tenant_admin_of(uuid), check_psw_tenant_admin_role()
--   trigger  psw_tenant_admins_role_guard
--   policies psw_tenant_admins_select / _insert / _delete (sem _update)
--            opportunities_select_psw_admin      (PERMISSIVA nova, SELECT)
--            opportunities_update_psw_admin      (PERMISSIVA nova, UPDATE —
--                                                  desvio autorizado acima)
--            tenants_select_psw_admin            (PERMISSIVA nova, SELECT)
--            opportunities_psw_staff_only_assigned (REEMITIDA, 3 disjuntos)
--
-- WRITE-ONLY MODE — este arquivo NÃO é aplicado por este agente. O apply é
-- SEMPRE manual, no Supabase Cloud SQL Editor, por um humano (ver o handoff
-- desta fase). Nenhum comando de auto-apply de CLI pertence a este arquivo.
--
-- IDEMPOTENTE: todo `create table`/`create index` usa `if not exists`; toda
-- `create policy`/`create trigger` é precedida do `drop ... if exists`
-- correspondente. Rodar este arquivo duas vezes não produz erro.
--
-- PRÉ-REQUISITOS (já aplicados no `main` de produção antes desta migration):
--   - 0039_psw_staff_role.sql       (o papel `psw_staff` já existe, commitado)
--   - 0040_psw_staff_access_core.sql (current_assigned_opportunity_ids(), o
--     índice de suporte por profile_id, e a forma de helper a espelhar)
--   - 0044_psw_staff_only_assigned.sql (a restritiva viva que este arquivo
--     REEMITE com um terceiro disjunto — os dois disjuntos originais dela
--     têm que sair literalmente iguais aqui)
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- BLOCO 1 — a tabela da concessão
-- -----------------------------------------------------------------------------
-- Três escolhas de discrição registradas aqui, por extenso:
--
-- (a) `id` PRÓPRIO + `unique (profile_id, tenant_id)`, em vez de PK composta:
--     espelha `opportunity_assignees` (0032) e deixa o formulário de
--     revogação (18-04) carregar um único campo (o `id` da linha) em vez do
--     par de FKs.
-- (b) `granted_by` com `on delete set null`: a concessão SOBREVIVE à saída de
--     quem a concedeu — apagar a linha da concessão junto destruiria o acesso
--     vigente de outra pessoa por um motivo que não tem nada a ver com ela.
-- (c) esta tabela é a EXCEÇÃO DECLARADA à regra "toda tabela de domínio
--     carrega `tenant_id` do próprio usuário" (docs/PROJETO.md §1): ela carrega
--     `tenant_id`, mas como ALVO da concessão (a empresa administrada), não
--     como escopo de lotação de quem a lê — ela existe justamente para
--     expressar esse cruzamento pessoa × empresa.
create table if not exists psw_tenant_admins (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  tenant_id   uuid not null references tenants(id)  on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references profiles(id) on delete set null,
  unique (profile_id, tenant_id)
);

-- -----------------------------------------------------------------------------
-- BLOCO 2 — índices
-- -----------------------------------------------------------------------------
-- O primeiro serve os dois helpers de conjunto (filtro por `profile_id`) e é
-- o análogo direto de `opportunity_assignees_profile_only_idx` (0040:99-110).
-- O segundo serve a pergunta "quem administra esta empresa?" da tela
-- `/admin/staff` (plano futuro) — a tabela é pequena o bastante (dezenas de
-- linhas) para que o custo de manutenção do índice seja irrelevante frente ao
-- ganho de não precisar descobrir essa necessidade depois.
create index if not exists psw_tenant_admins_profile_only_idx
  on psw_tenant_admins(profile_id);
create index if not exists psw_tenant_admins_tenant_idx
  on psw_tenant_admins(tenant_id);

-- -----------------------------------------------------------------------------
-- BLOCO 3 — os três helpers
-- -----------------------------------------------------------------------------

-- (1) A CONCESSÃO PURA — espelha `current_assigned_opportunity_ids()`
--     (0040:86) byte a byte na forma: `setof uuid`, `security definer`,
--     `stable`, `set search_path`, `(select auth.uid())` para virar InitPlan
--     (avaliado uma vez por statement, não uma vez por linha varrida). É esta
--     função que o terceiro disjunto da restritiva (BLOCO 7) consome.
create or replace function current_admin_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from psw_tenant_admins
  where profile_id = (select auth.uid())
$$;

-- (2) O CONJUNTO EFETIVO — "de quais tenants o usuário corrente é admin",
--     unificando os dois ramos: `tenant_admin` (byte-equivalente ao predicado
--     antigo `current_user_role() = 'tenant_admin' and t = current_tenant_id()`
--     — é o que garante a não-regressão, D-J) e `psw_staff` (a concessão
--     desta fase, com o gate de papel embutido para que o curto-circuito não
--     precise ser repetido em cada policy consumidora).
create or replace function effective_admin_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- ramo tenant_admin: BYTE-EQUIVALENTE ao predicado antigo (D-J / não-regressão)
  select current_tenant_id()
  where current_user_role() = 'tenant_admin'
  union all
  -- ramo psw_staff: a concessão desta fase
  select tenant_id
  from psw_tenant_admins
  where profile_id = (select auth.uid())
    and current_user_role() = 'psw_staff'
$$;

-- (3) A FONTE ÚNICA DO PREDICADO "é admin deste tenant" (D-I / D-O) —
--     deliberadamente SEM `security definer` e SEM cláusula `set` de
--     configuração de sessão. As duas omissões são o que permite ao planner
--     do PostgreSQL INLINEAR esta função: `security definer` e `set` no
--     corpo de uma função SQL escalar bloqueiam o inlining, transformando-a
--     numa chamada opaca reavaliada por LINHA varrida (a função recebe uma
--     coluna da linha, `tenant_id`, como argumento — não existe forma de
--     envolvê-la em `(select …)` para virar InitPlan; a otimização correta
--     aqui é outra: fazer o planner INLINEAR o corpo dela no predicado
--     chamador). Depois do inlining, `is_tenant_admin_of(tenant_id)` vira
--     literalmente `tenant_id in (select public.effective_admin_tenant_ids())`
--     — uma subconsulta NÃO-correlacionada (a função de conjunto não recebe
--     argumento), que o planner hasheia uma vez por statement.
--
--     Não perde segurança por não ser definidora: quem fura a RLS é a (2),
--     que já é `security definer` com `search_path` fixo. A chamada interna
--     é QUALIFICADA POR SCHEMA (`public.effective_admin_tenant_ids()`) — isso
--     fecha o vetor de shadowing que a ausência do `set search_path` abriria.
--
--     Volatilidade `stable`, nunca `immutable`: o resultado depende de
--     `auth.uid()` (o usuário da SESSÃO corrente) e de conteúdo de tabela
--     (uma concessão pode ser revogada). Marcar `immutable` habilitaria
--     constant-folding em tempo de planejamento e reaproveitamento de plano
--     preparado ENTRE sessões de usuários diferentes — num predicado de RLS
--     isso não é imprecisão, é vazamento cross-tenant.
create or replace function is_tenant_admin_of(t uuid)
returns boolean
language sql
stable
as $$
  select coalesce(t in (select public.effective_admin_tenant_ids()), false)
$$;

-- -----------------------------------------------------------------------------
-- BLOCO 4 — trigger de coerência de papel
-- -----------------------------------------------------------------------------
-- Por que trigger, e não validação na Server Action: uma concessão gravada
-- para um profile de papel ERRADO (ex.: `member`) seria aceita pelas FKs e
-- NÃO FARIA NADA — o ramo `psw_staff` de `effective_admin_tenant_ids()` exige
-- `current_user_role() = 'psw_staff'`, então a linha ficaria inerte desde o
-- nascimento, um no-op silencioso — exatamente a classe de bug que esta fase
-- combate (D-P). O trigger, ao contrário de uma checagem em app, SOBREVIVE a
-- uma escrita por service-role (ex.: um script de suporte, ou o próprio SQL
-- Editor). Espelha `check_assignee_tenant()` (0040:134-176) na forma:
-- `plpgsql`, `security definer` (precisa ler `profiles` sem depender da RLS
-- de quem está escrevendo), `set search_path` fixo, e comparação do papel por
-- `role::text` — o mesmo padrão da `0021`, que não depende da ordem de
-- commit do valor do enum `tenant_role`.
create or replace function check_psw_tenant_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role tenant_role;
begin
  select role into v_role from profiles where id = new.profile_id;
  if not found then
    raise exception 'Pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;
  if v_role::text <> 'psw_staff' then
    raise exception 'A concessão de admin de empresa só existe para o papel psw_staff.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists psw_tenant_admins_role_guard on psw_tenant_admins;
create trigger psw_tenant_admins_role_guard
  before insert or update on psw_tenant_admins
  for each row execute function check_psw_tenant_admin_role();

-- -----------------------------------------------------------------------------
-- BLOCO 5 — RLS de `psw_tenant_admins`
-- -----------------------------------------------------------------------------
alter table psw_tenant_admins enable row level security;

-- (a) A ASSIMETRIA PROPOSITAL: a ESCRITA da concessão vem SEMPRE de
--     `is_platform_admin()` (0021), NUNCA do helper novo `is_tenant_admin_of()`.
--     Se viesse do helper novo, um staff-admin de A poderia CONCEDER em A —
--     exatamente a escalada lateral que D-B proíbe.
-- (b) O `tenant_admin` do tenant CONCEDIDO não lê estas linhas: quem da PSW
--     administra a empresa dele não é informação que o cliente receba nesta
--     fase. SELECT é `is_platform_admin()` OU a própria pessoa (para que o
--     servidor possa espelhar `isTenantAdminOf()` sem precisar de
--     service-role).
-- (c) AUSÊNCIA DELIBERADA de policy de UPDATE: uma concessão não se "edita" —
--     se concede e se revoga. Mesma disciplina de `audit_log` (0038:232-233):
--     a ausência de policy é a garantia, não a disciplina da app.
drop policy if exists psw_tenant_admins_select on psw_tenant_admins;
create policy psw_tenant_admins_select on psw_tenant_admins
  for select using (
    is_platform_admin() or profile_id = (select auth.uid())
  );

drop policy if exists psw_tenant_admins_insert on psw_tenant_admins;
create policy psw_tenant_admins_insert on psw_tenant_admins
  for insert with check (is_platform_admin());

drop policy if exists psw_tenant_admins_delete on psw_tenant_admins;
create policy psw_tenant_admins_delete on psw_tenant_admins
  for delete using (is_platform_admin());

-- Explícito em vez de depender de default privileges do schema `public`
-- (mitigação da suposição A4 da pesquisa — custo zero, remove a dependência).
revoke all on psw_tenant_admins from anon;
grant select, insert, delete on psw_tenant_admins to authenticated;

-- -----------------------------------------------------------------------------
-- BLOCO 6 — a metade PERMISSIVA da fatia (opportunities + tenants)
-- -----------------------------------------------------------------------------
-- Aditivas no sentido da 0040/0021: NENHUMA policy existente é dropada,
-- substituída ou relaxada. Para qualquer papel que não seja `psw_staff` COM
-- concessão, `is_tenant_admin_of()` reduz ao predicado antigo (o ramo
-- `tenant_admin` byte-equivalente, D-J) — então estas policies NUNCA
-- concedem nada de novo a ninguém além do staff-admin recém-concedido.
--
-- ESCOPO DESTA MIGRATION: SELECT nas duas tabelas, MAIS o UPDATE mínimo em
-- `opportunities` do Bloco 6b (desvio autorizado, ver cabeçalho). INSERT e
-- DELETE em `opportunities`, e todos os verbos nas sete tabelas filhas —
-- espelhando os verbos que um `tenant_admin` de fato tem em cada uma — ficam
-- para a migration seguinte da fase, junto da propagação às sete filhas.
drop policy if exists opportunities_select_psw_admin on opportunities;
create policy opportunities_select_psw_admin on opportunities
  for select using (is_tenant_admin_of(tenant_id));

-- Indispensável: sem o SELECT em `tenants`, o nome da empresa concedida não
-- resolve, e a coluna Empresa da listagem unificada fica vazia para o tenant
-- que veio da concessão (mesmo sintoma de "aba vazia sem erro" da 0041).
drop policy if exists tenants_select_psw_admin on tenants;
create policy tenants_select_psw_admin on tenants
  for select using (is_tenant_admin_of(id));

-- -----------------------------------------------------------------------------
-- BLOCO 6b — UPDATE em `opportunities` (DESVIO AUTORIZADO — ver cabeçalho)
-- -----------------------------------------------------------------------------
-- Por que este objeto existe, apesar do escopo original ser só-leitura: a
-- restritiva do BLOCO 7 é `for all` e portanto já cobre o UPDATE do lado que
-- SUBTRAI (ela deixaria de barrar o staff-admin de A) — mas uma RESTRICTIVE
-- só subtrai, nunca concede (a mesma regra do BLOCO 6). SEM esta permissiva,
-- nenhuma policy viva de `opportunities` concede UPDATE ao staff-admin sobre
-- uma oportunidade de A que não lhe foi atribuída nominalmente:
--   `opportunities_update` (0015)               exige tenant_id = current_tenant_id()
--   `opportunities_update_platform_admin` (0025) exige is_platform_admin()
--   `opportunities_update_psw_staff` (0041)      exige atribuição nominal
-- Nenhuma bate. O UPDATE casaria ZERO linhas e o Supabase devolveria
-- `error === null` — sucesso silencioso disfarçado (o mesmo padrão descrito
-- em `lib/security/role.ts:148-155`). É exatamente esse falso-sucesso que a
-- releitura por `serviceRoleClient()` no teste decisivo desta fase existe
-- para pegar. Escopo estritamente mínimo: SÓ este verbo, SÓ `opportunities` —
-- INSERT/DELETE em `opportunities` e todos os verbos nas sete filhas
-- continuam fora desta migration (D-A pleno é entregue de forma incremental).
drop policy if exists opportunities_update_psw_admin on opportunities;
create policy opportunities_update_psw_admin on opportunities
  for update
  using      (is_tenant_admin_of(tenant_id))
  with check (is_tenant_admin_of(tenant_id));

-- -----------------------------------------------------------------------------
-- BLOCO 7 — a metade RESTRITIVA da fatia: `opportunities_psw_staff_only_assigned`
-- REEMITIDA com um TERCEIRO disjunto
-- -----------------------------------------------------------------------------
-- Os dois primeiros disjuntos abaixo são LITERALMENTE os da `0044` — não
-- reescritos, não reformulados. `tests/schema/psw-staff-restrictive-rule.ts`
-- (18-01) é o detector estático desse invariante. O terceiro disjunto consome
-- `current_admin_tenant_ids()` (a concessão PURA, `setof uuid`,
-- NÃO-correlacionada) — e não `is_tenant_admin_of(tenant_id)` — porque dentro
-- de um predicado já protegido pelo curto-circuito de papel
-- (`current_user_role() is distinct from 'psw_staff'`), o ramo `tenant_admin`
-- do booleano é irrelevante e só pagaria custo à toa.
--
-- IMPORTANTE — escopo declarado: as SETE tabelas filhas do laço da `0044`
-- CONTINUAM com apenas os DOIS disjuntos originais nesta migration. Isso é
-- escopo da migration seguinte da fase, e o estado intermediário — o
-- staff-admin vê a oportunidade-raiz de A mas ainda não vê as filhas dela —
-- é ESTRITAMENTE MENOS PERMISSIVO, não um vazamento.
drop policy if exists opportunities_psw_staff_only_assigned on opportunities;
create policy opportunities_psw_staff_only_assigned on opportunities
  as restrictive
  for all
  using (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
    or tenant_id in (select current_admin_tenant_ids())
  )
  with check (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
    or tenant_id in (select current_admin_tenant_ids())
  );

-- =============================================================================
-- BLOCO 8 — Verificação pós-apply (rodar manualmente, resultado esperado
-- explícito em cada item — ver o handoff desta fase para a versão numerada
-- completa)
-- =============================================================================

-- V1. As 3 funções e o trigger existem com as propriedades corretas.
--     ESPERADO: `current_admin_tenant_ids` e `effective_admin_tenant_ids` com
--     `prosecdef = true` (security definer) e `proconfig` contendo
--     `search_path=public`; `is_tenant_admin_of` com `prosecdef = false` e
--     `proconfig` NULO — é a prova de que ela pode ser inlineada (D-Q).
-- select p.proname, p.provolatile, p.prosecdef, p.proconfig
-- from pg_proc p
-- where p.proname in ('current_admin_tenant_ids','effective_admin_tenant_ids','is_tenant_admin_of')
-- order by p.proname;

-- select tgname, tgrelid::regclass, tgtype
-- from pg_trigger
-- where tgname = 'psw_tenant_admins_role_guard';

-- V2. `psw_tenant_admins` tem exatamente 3 policies, nenhuma de UPDATE.
--     ESPERADO: 3 linhas — select/insert/delete.
select tablename, policyname, permissive, cmd
from pg_policies
where tablename = 'psw_tenant_admins'
order by policyname;

-- V3. A restritiva de `opportunities` contém o texto do terceiro disjunto.
--     ESPERADO: 1 linha.
select count(*) as esperado_1
from pg_policies
where tablename = 'opportunities'
  and policyname = 'opportunities_psw_staff_only_assigned'
  and qual like '%current_admin_tenant_ids%';

-- V4. As duas permissivas de SELECT novas existem.
--     ESPERADO: 2 linhas (opportunities_select_psw_admin, tenants_select_psw_admin).
select tablename, policyname, cmd
from pg_policies
where policyname like '%_select_psw_admin'
order by tablename;

-- V4b. A permissiva de UPDATE (desvio autorizado, BLOCO 6b) existe.
--      ESPERADO: 1 linha (opportunities_update_psw_admin, cmd = UPDATE).
select tablename, policyname, cmd
from pg_policies
where policyname = 'opportunities_update_psw_admin';

-- V5. A MEDIÇÃO QUE IMPORTA — o conjunto visível do staff sobe ao conceder e
--     volta ao revogar (fingindo a sessão do staff de teste):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
-- select count(*) as antes_da_concessao from opportunities;
-- rollback;
-- -- (conceder via platform_admin, repetir a contagem, e conferir que a
-- --  diferença é exatamente: select count(*) from opportunities where
-- --  tenant_id = '<TENANT_A>' and id not in (select opportunity_id from
-- --  opportunity_assignees where profile_id = '<UID_DO_STAFF>');)

-- V6. NÃO-REGRESSÃO — um `member`/`tenant_admin` não pode ter ganho nem
--     perdido nada. Rodar ANTES e DEPOIS da concessão e comparar os dois
--     números — têm que ser IDÊNTICOS.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DE_UM_MEMBER>','role','authenticated')::text, true);
-- select count(*) as visiveis from opportunities;
-- rollback;

-- V7. `EXPLAIN (analyze, buffers)` — prova de que o inlining aconteceu.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DO_STAFF_COM_CONCESSAO>','role','authenticated')::text, true);
-- explain (analyze, buffers) select count(*) from opportunities;
-- rollback;
--
-- SINAL ESPERADO: um nó `SubPlan`/`Hashed SubPlan` (ou InitPlan) referenciando
--   `effective_admin_tenant_ids`, AVALIADO UMA VEZ por statement.
-- SINAL DE ALARME: `Function Scan on is_tenant_admin_of` (ou subplano
--   correlacionado) com `loops` PROPORCIONAL ao número de linhas varridas —
--   isso significa que o inlining NÃO ocorreu. Se acontecer: confirmar que
--   `is_tenant_admin_of()` não ganhou `security definer` nem `set
--   search_path` por engano (V1); se persistir, expandir o predicado à mão
--   nas policies quentes é o último recurso, não a primeira tentativa.

-- =============================================================================
-- BLOCO 9 — ROLLBACK (nesta ordem — a ordem importa)
-- =============================================================================
-- 1. Dropar as três permissivas novas (a concessão para de conceder; nada
--    mais muda):
--      drop policy if exists opportunities_select_psw_admin on opportunities;
--      drop policy if exists opportunities_update_psw_admin on opportunities;
--      drop policy if exists tenants_select_psw_admin on tenants;
--
-- 2. REAPLICAR O ARQUIVO `0044_psw_staff_only_assigned.sql` NA ÍNTEGRA para
--    restaurar a restritiva com os DOIS disjuntos originais. NUNCA dropar
--    `opportunities_psw_staff_only_assigned` sem reaplicar a 0044 no lugar:
--    dropá-la sem substituição devolveria ao `psw_staff` o acesso POR TENANT
--    DA PSW que a `0044` removeu de propósito — isso é o detalhe que separa
--    um rollback correto de um incidente de segurança.
--
-- 3. Dropar o trigger e as três funções:
--      drop trigger if exists psw_tenant_admins_role_guard on psw_tenant_admins;
--      drop function if exists check_psw_tenant_admin_role();
--      drop function if exists is_tenant_admin_of(uuid);
--      drop function if exists effective_admin_tenant_ids();
--      drop function if exists current_admin_tenant_ids();
--
-- 4. Por último, decidir o destino da TABELA. Antes de decidir, listar as
--    concessões existentes (uma tabela vazia é reversível sem perda; uma
--    tabela com linhas exige decidir se os dados de concessão são
--    preservados para reconciliação manual, ou descartados):
--      select id, profile_id, tenant_id, granted_at, granted_by from psw_tenant_admins;
--    Se decidido dropar:
--      drop table if exists psw_tenant_admins;
-- =============================================================================
