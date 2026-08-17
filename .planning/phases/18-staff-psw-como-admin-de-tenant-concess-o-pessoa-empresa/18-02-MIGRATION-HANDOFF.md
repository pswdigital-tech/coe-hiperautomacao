# Handoff — Apply manual da migration `0045_psw_tenant_admins_grant.sql`

**Phase 18 · Plan 18-02 (TRACER) · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comando de CLI que aplique migration automaticamente, sem MCP) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0045_psw_tenant_admins_grant.sql`](../../../supabase/migrations/0045_psw_tenant_admins_grant.sql)
**Pré-requisitos aplicados:** `0039_psw_staff_role.sql`, `0040_psw_staff_access_core.sql`, `0044_psw_staff_only_assigned.sql`.

---

## ⚠️ ANTES DE QUALQUER COISA — `.env.test` ainda NÃO existe

Isto não bloqueia o apply desta migration, mas bloqueia a **Task 4** deste mesmo plano (o fechamento do tracer). Registrando aqui, no topo, para que a lacuna não seja descoberta só depois do apply:

- `.env.test` **não existe** na raiz do projeto hoje (confirmado no Plan 18-01). Sem ele, `NEXT_PUBLIC_SUPABASE_URL` não está definido para os testes, `tests/setup/global-setup.ts` roda em modo `unit-only`, e `tests/security/psw-staff-admin-grant.test.ts` inteiro cai em `describe.skipIf` — saindo `0` **sem executar nenhuma asserção**.
- Pela decisão do PO no Plan 18-01 (`env-test-populado`), **suíte pulada conta como FALHA, não como verde**, a partir desta fase. O gate por wave é `npm run test:security` com a **contagem de testes executados conferida**, não só o exit code.
- `tests/setup/global-setup.ts:23-32` só aceita URL de `.env.test` começando com `http://127.0.0.1`, `http://localhost`, ou contendo `-test.supabase.co`. Apontar para o Supabase de **produção** **ABORTA por design** — essa defesa não é para ser afrouxada.
- **Ação necessária, em paralelo a este apply:** popular `.env.test` (ou as variáveis equivalentes) apontando para um projeto Supabase de **teste** dedicado (ou Supabase local), antes da Task 4 rodar.
- **Sem isso, a Task 4 não pode fechar como sucesso** — nem os specs `a1/a2/c1/c2/c3/c5/c6/c7` poderão ser provados verdes, e qualquer alegação de "tracer fechado" ficaria sem evidência real.

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0045_psw_tenant_admins_grant.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Esta migration cria a tabela, os índices, os 3 helpers, o trigger, a RLS da tabela nova e as **3** policies de RLS aditivas em `opportunities`/`tenants` (2 de SELECT + 1 de UPDATE) e reemite a restritiva de `opportunities`, em sequência. Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

---

## Passo a passo

1. Confirmar que `0039`, `0040` e `0044` já estão aplicadas (se houver dúvida, `select policyname from pg_policies where policyname = 'opportunities_psw_staff_only_assigned';` deve devolver 1 linha antes do apply).
2. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
3. Abrir `supabase/migrations/0045_psw_tenant_admins_grant.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
4. Clicar **Run** (Cmd/Ctrl+Enter).
5. Confirmar o resultado: **`Success. No rows returned`** (o arquivo termina em `select`s de verificação comentados — nada é executado por eles; o parser do SQL Editor os ignora por estarem em linhas `--`).

---

## Prova de idempotência (obrigatória) — rodar o arquivo uma SEGUNDA vez

Depois do passo 5, **cole o MESMO conteúdo do arquivo novamente** (uma segunda vez, sem alterar nada) e clique **Run** de novo.

**Esperado:** a segunda execução também termina com **`Success. No rows returned`**, sem nenhum erro de objeto duplicado (`already exists`/`duplicate object`).

Isso funciona porque: `create table if not exists` e `create index if not exists` na tabela/índices; `create or replace function` nos 3 helpers e na função de trigger; `drop trigger if exists` antes do `create trigger`; e `drop policy if exists` antes de cada `create policy` — nenhum objeto duplica ao rodar duas vezes.

---

## Verificação pós-apply — as 12 verificações do plano (mais 1 do desvio autorizado)

### 1. `psw_tenant_admins` tem as 5 colunas certas; `profiles.tenant_id` continua NOT NULL

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'psw_tenant_admins'
order by ordinal_position;
```
**Esperado:** 5 linhas — `id` (uuid, NOT NULL, default `gen_random_uuid()`), `profile_id` (uuid, NOT NULL), `tenant_id` (uuid, NOT NULL), `granted_at` (timestamptz, NOT NULL, default `now()`), `granted_by` (uuid, **nullable**). Casa coluna a coluna com o bloco `psw_tenant_admins` de `lib/database.types.ts` (escrito em 18-01).

```sql
select is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'tenant_id';
```
**Esperado:** `NO` — a cardinalidade de `profiles.tenant_id` não mudou (D-D: a pluralidade mora só na tabela nova).

### 2. Os 2 índices da tabela nova

```sql
select indexname, indexdef
from pg_indexes
where tablename = 'psw_tenant_admins'
order by indexname;
```
**Esperado:** `psw_tenant_admins_profile_only_idx` sobre `(profile_id)`, `psw_tenant_admins_tenant_idx` sobre `(tenant_id)`, além da PK (`psw_tenant_admins_pkey`) e do índice implícito do `unique (profile_id, tenant_id)`.

### 3. As 3 funções — a distinção que prova o inlining (D-Q)

```sql
select
  p.proname,
  p.provolatile,   -- esperado: 's' (stable) nas 3
  p.prosecdef,     -- esperado: TRUE nas 2 de conjunto, FALSE em is_tenant_admin_of
  p.proconfig      -- esperado: contém 'search_path=public' nas 2 de conjunto, NULO em is_tenant_admin_of
from pg_proc p
where p.proname in ('current_admin_tenant_ids','effective_admin_tenant_ids','is_tenant_admin_of')
order by p.proname;
```
**Esperado, linha a linha:**
- `current_admin_tenant_ids`: `provolatile='s'`, `prosecdef=true`, `proconfig` contém `search_path=public`.
- `effective_admin_tenant_ids`: idem.
- `is_tenant_admin_of`: `provolatile='s'`, **`prosecdef=false`**, **`proconfig` NULO**. Esta linha é a mais fácil de perder num copiar-colar apressado — é ela que prova que o planner PODE inlinear a função (a verificação 12/EXPLAIN confirma que ele de fato inlineou).

### 4. Trigger `psw_tenant_admins_role_guard`

```sql
select tgname, proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'psw_tenant_admins'::regclass
  and not t.tgisinternal;
```
**Esperado:** 1 linha — `psw_tenant_admins_role_guard` / `check_psw_tenant_admin_role`.

### 5. `psw_tenant_admins` tem exatamente 3 policies, nenhuma de UPDATE

```sql
select policyname, permissive, cmd
from pg_policies
where tablename = 'psw_tenant_admins'
order by policyname;
```
**Esperado:** exatamente **3 linhas** — `psw_tenant_admins_select` (SELECT), `psw_tenant_admins_insert` (INSERT), `psw_tenant_admins_delete` (DELETE). Nenhuma com `cmd = UPDATE`.

### 6. `opportunities` — a restritiva reemitida + as pré-existentes intactas

```sql
select policyname, permissive, cmd, qual
from pg_policies
where tablename = 'opportunities' and policyname = 'opportunities_psw_staff_only_assigned';
```
**Esperado:** 1 linha, `permissive = RESTRICTIVE`, `cmd = ALL`, e o texto de `qual` contendo `current_admin_tenant_ids` (o terceiro disjunto) **além** de `current_assigned_opportunity_ids` (o segundo, literal da `0044`).

```sql
select policyname, permissive, cmd
from pg_policies
where tablename = 'opportunities'
order by policyname;
```
**Esperado:** todas as policies pré-existentes de `opportunities` continuam lá (`opportunities_select`, `opportunities_insert`, `opportunities_update`, `opportunities_delete`, as `_platform_admin`, `opportunities_select_psw_staff`, `opportunities_update_psw_staff`, `opportunities_psw_staff_only_assigned`) **mais** as 3 novas desta migration (ver item 7). Nenhuma pré-existente pode ter desaparecido — compare com a contagem de antes do apply.

### 7. As policies novas desta migration — 3 linhas (2 SELECT + 1 UPDATE, desvio autorizado)

```sql
select tablename, policyname, cmd
from pg_policies
where policyname in ('opportunities_select_psw_admin','opportunities_update_psw_admin','tenants_select_psw_admin')
order by tablename, policyname;
```
**Esperado:** **3 linhas**:
- `opportunities` / `opportunities_select_psw_admin` / `SELECT`
- `opportunities` / `opportunities_update_psw_admin` / `UPDATE` — **objeto extra, fora da lista original do plano**, acrescentado por desvio autorizado do PO no checkpoint da Task 2 (ver nota abaixo).
- `tenants` / `tenants_select_psw_admin` / `SELECT`

> **Nota sobre o desvio autorizado:** a fatia originalmente desenhada para esta migration era só-leitura em `opportunities`/`tenants`. Ao preparar este handoff, ficou confirmado que nenhuma policy viva concederia UPDATE ao staff-admin sobre uma oportunidade do tenant concedido que não lhe foi atribuída nominalmente (`opportunities_update` exige `tenant_id=current_tenant_id()`; `opportunities_update_platform_admin` exige `is_platform_admin()`; `opportunities_update_psw_staff` exige atribuição) — e nenhum plano futuro da fase fecha essa lacuna (a lista de policies do `18-05` não inclui `opportunities_update`). Sem correção, o teste decisivo da Task 4 (`c5`, escrita com releitura por `serviceRoleClient()`) casaria zero linhas e devolveria `error === null` — o falso-sucesso silencioso que a fase inteira existe para evitar. O PO autorizou o acréscimo de **um único objeto extra**, `opportunities_update_psw_admin`, mantendo todo o resto do escopo (INSERT/DELETE em `opportunities`, as 7 tabelas filhas) fora desta migration.

### 8. Smoke do trigger de coerência de papel (bloqueante)

Troque `<PROFILE_MEMBER>` por um profile real com `role = 'member'`, e `<PROFILE_PSW_STAFF>` por um profile real com `role = 'psw_staff'`. Troque `<TENANT_QUALQUER>` por qualquer `tenant_id` real.

**(a) Conceder a um `member` → deve REJEITAR**
```sql
begin;
insert into psw_tenant_admins (profile_id, tenant_id) values ('<PROFILE_MEMBER>', '<TENANT_QUALQUER>');
-- esperado: ERRO "A concessão de admin de empresa só existe para o papel psw_staff."
rollback;
```

**(b) Conceder a um `psw_staff` → deve ACEITAR**
```sql
begin;
insert into psw_tenant_admins (profile_id, tenant_id) values ('<PROFILE_PSW_STAFF>', '<TENANT_QUALQUER>');
-- esperado: INSERT 0 1 (sem erro)
rollback;
```

### 9. A MEDIÇÃO QUE IMPORTA — o conjunto visível do staff sobe ao conceder e volta ao revogar

Troque `<UID_DO_STAFF>` pelo id real de um profile `psw_staff` de teste, e `<TENANT_A>` por um tenant onde ele **não** tem nem concessão nem atribuição hoje.

```sql
-- (i) ANTES de qualquer concessão:
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
select count(*) as antes_da_concessao from opportunities;
rollback;
```

```sql
-- (ii) Conceder de fora da sessão impersonada (como platform_admin real, ou service-role):
insert into psw_tenant_admins (profile_id, tenant_id, granted_by)
values ('<UID_DO_STAFF>', '<TENANT_A>', '<UID_DE_UM_PLATFORM_ADMIN>');
```

```sql
-- (iii) DEPOIS da concessão, mesma impersonação:
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
select count(*) as depois_da_concessao from opportunities;
rollback;
```

```sql
-- (iv) A diferença tem que ser EXATAMENTE isto:
select count(*) as esperado_como_diferenca
from opportunities
where tenant_id = '<TENANT_A>'
  and id not in (
    select opportunity_id from opportunity_assignees where profile_id = '<UID_DO_STAFF>'
  );
```

```sql
-- (v) Revogar:
delete from psw_tenant_admins where profile_id = '<UID_DO_STAFF>' and tenant_id = '<TENANT_A>';
```

```sql
-- (vi) O conjunto visível VOLTA exatamente ao valor do passo (i):
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
select count(*) as depois_de_revogar from opportunities;
rollback;
```
**Esperado:** `depois_da_concessao - antes_da_concessao = esperado_como_diferenca`, e `depois_de_revogar = antes_da_concessao`. Se a diferença for `0`, a fase está inerte (a metade PERMISSIVA não pegou) — **não prosseguir**, o defeito está na `0045`.

### 10. NÃO-REGRESSÃO — um `member` do tenant A não pode ter ganho nem perdido nada

Troque `<UID_DE_UM_MEMBER_DO_TENANT_A>` por um profile `member` real do mesmo `<TENANT_A>` usado acima. Rodar **antes** e **depois** da concessão do passo 9(ii)/9(v):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DE_UM_MEMBER_DO_TENANT_A>','role','authenticated')::text, true);
select count(*) as visiveis_member from opportunities;
rollback;
```
**Esperado:** o número é **idêntico** antes e depois da concessão/revogação do staff. Qualquer diferença é regressão — não prosseguir.

### 11. Smoke de D-B — o staff-admin NÃO consegue conceder nem revogar por conta própria

Com a concessão do passo 9 **ainda ativa** (ou recriada), impersonar o staff:

```sql
-- (a) INSERT — deve dar ERRO explícito:
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
insert into psw_tenant_admins (profile_id, tenant_id) values ('<UID_DO_STAFF>', '<OUTRO_TENANT_QUALQUER>');
-- esperado: ERRO de RLS (42501) — a policy psw_tenant_admins_insert exige is_platform_admin()
rollback;
```

```sql
-- (b) DELETE — deve casar ZERO linhas, SEM erro:
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
delete from psw_tenant_admins where tenant_id = '<TENANT_A>' returning id;
-- esperado: DELETE 0 (nenhuma linha retornada, nenhum erro)
rollback;
```
**Os dois resultados são diferentes de propósito** — (a) erro explícito, (b) sucesso silencioso de zero linhas — e **ambos são obrigatórios**: são as duas formas que a RLS toma ao negar (o `INSERT` tem `with check`, então a RLS barra antes de gravar; o `DELETE` só tem `using`, então a linha simplesmente não casa o filtro).

### 12. `EXPLAIN (analyze, buffers)` — prova de que o inlining aconteceu

Com a concessão do passo 9 ativa:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
explain (analyze, buffers) select count(*) from opportunities;
rollback;
```
**SINAL ESPERADO:** um nó `SubPlan`/`Hashed SubPlan` (ou `InitPlan`) referenciando `effective_admin_tenant_ids`, com **`loops=1`** (avaliado uma única vez por statement) — não por linha.

**SINAL DE ALARME:** `Function Scan on is_tenant_admin_of` (ou qualquer subplano correlacionado) com `loops` **proporcional ao número de linhas varridas** de `opportunities`. Isso significa que o inlining **não** ocorreu.

**Se der o sinal de alarme:** primeiro, reconferir a verificação 3 — `is_tenant_admin_of` não pode ter ganho `security definer` nem `proconfig` (`set search_path`) por engano no apply (copiar-colar errado, ou uma versão desatualizada do arquivo). Se a verificação 3 estiver correta e o alarme persistir mesmo assim, registrar o plano observado no resultado deste handoff — a correção nesse caso seria expandir o predicado à mão nas policies quentes, e isso é dívida a tratar num plano futuro, não motivo para reverter esta migration.

### 13. Smoke do desvio autorizado — UPDATE efetivo (não apenas sem erro)

Com a concessão do passo 9 ativa, e `<OPP_ID_NAO_ATRIBUIDA_DO_TENANT_A>` sendo uma oportunidade real do `<TENANT_A>` que **não** está em `opportunity_assignees` para `<UID_DO_STAFF>`:

```sql
-- (a) update como o staff-admin:
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
update opportunities set observacao = 'smoke-desvio-update-psw-admin' where id = '<OPP_ID_NAO_ATRIBUIDA_DO_TENANT_A>';
-- esperado: UPDATE 1 (uma linha afetada — não zero)
commit;
```
```sql
-- (b) releitura fora da sessão impersonada, para confirmar que persistiu de verdade:
select observacao from opportunities where id = '<OPP_ID_NAO_ATRIBUIDA_DO_TENANT_A>';
-- esperado: 'smoke-desvio-update-psw-admin'
```
**Esperado:** `UPDATE 1` (não zero) no passo (a), e o valor realmente persistido no passo (b). Se o `UPDATE` casar zero linhas apesar de `error` não aparecer, é o falso-sucesso silencioso que `opportunities_update_psw_admin` existe para eliminar — **não prosseguir**, o defeito está na `0045`.

---

## Nota sobre tipos TypeScript

`npm run gen:types` está **bloqueado** neste projeto (MCP aponta para o projeto errado, CLI sem privilégio — memória `supabase-type-gen-blocked`). O bloco `psw_tenant_admins` já foi escrito **à mão** em `lib/database.types.ts` no Plan 18-01, e a verificação 1 acima confere coluna a coluna contra ele. Nenhuma regeneração é necessária após este apply.

---

## Rollback

**Ordem — a ordem importa, na mesma sequência do Bloco 9 do arquivo da migration:**

```sql
-- 1. Dropar as TRÊS permissivas novas (a concessão para de conceder; nada mais muda):
drop policy if exists opportunities_select_psw_admin on opportunities;
drop policy if exists opportunities_update_psw_admin on opportunities;
drop policy if exists tenants_select_psw_admin on tenants;
```

```sql
-- 2. REAPLICAR O ARQUIVO 0044_psw_staff_only_assigned.sql NA ÍNTEGRA para
--    restaurar a restritiva com os DOIS disjuntos originais.
--    NUNCA dropar `opportunities_psw_staff_only_assigned` sem reaplicar a 0044
--    no lugar: dropá-la sem substituição devolveria ao psw_staff o acesso
--    POR TENANT DA PSW que a 0044 removeu de propósito — é o detalhe que
--    separa um rollback correto de um incidente de segurança.
```

```sql
-- 3. Dropar o trigger e as três funções:
drop trigger if exists psw_tenant_admins_role_guard on psw_tenant_admins;
drop function if exists check_psw_tenant_admin_role();
drop function if exists is_tenant_admin_of(uuid);
drop function if exists effective_admin_tenant_ids();
drop function if exists current_admin_tenant_ids();
```

```sql
-- 4. Por último, decidir o destino da TABELA. Antes de decidir, listar as
--    concessões existentes:
select id, profile_id, tenant_id, granted_at, granted_by from psw_tenant_admins;
-- Se decidido dropar (só depois de confirmar que nenhuma concessão precisa
-- ser preservada para reconciliação manual):
-- drop table if exists psw_tenant_admins;
```

Re-rodar a migration `0045` inteira depois do rollback recria tabela/índices/helpers/trigger/policies na versão nova (é idempotente).

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, todos os planos seguintes desta fase (18-03 em diante) estão bloqueados.** Eles propagam a concessão às 7 tabelas filhas, à tela `/admin/staff`, à troca das 11 policies vivas de `tenant_admin` pela fonte única e às Server Actions de admin — todos assumindo que `psw_tenant_admins`, os 3 helpers, o trigger de coerência e as 3 policies de RLS em `opportunities`/`tenants` desta migration já existem e estão corretos em produção.

**Task 4 deste mesmo plano (18-02) também depende deste apply** — e, adicionalmente, depende de `.env.test` estar populado (ver aviso no topo deste documento).

---

> **Esta é a fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration, nem via CLI de auto-apply, nem via MCP. Após aplicar no SQL Editor (incluindo a segunda execução de idempotência) e rodar as 13 verificações acima, **cole o resultado** para fechar este checkpoint.

**Resume-signal:** digite "aplicada" (colando o resultado das 13 verificações) ou descreva a divergência encontrada.

*Handoff gerado em 2026-08-07 (Phase 18 / Plan 18-02, TRACER).*
