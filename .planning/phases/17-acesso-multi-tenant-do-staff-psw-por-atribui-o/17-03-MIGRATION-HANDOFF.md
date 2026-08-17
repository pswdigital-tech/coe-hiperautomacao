# Handoff — Apply manual da migration `0040_psw_staff_access_core.sql`

**Phase 17 · Plan 17-03 (TRACER) · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comandos de auto-apply do CLI) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0040_psw_staff_access_core.sql`](../../../supabase/migrations/0040_psw_staff_access_core.sql)

**Pré-requisito DURO:** a migration `0039_psw_staff_role.sql` já foi aplicada e **commitada** em produção (confirmado no Plan 17-01, `checkpoint:human-action` fechado). Se por qualquer motivo isso não for verdade neste ambiente, a `0040` falha com:

```
ERROR: unsafe use of new value "psw_staff" of enum type tenant_role
HINT: New enum values must be committed before they can be used.
```

Se você vir exatamente esse erro, a causa é essa — confirme a `0039` primeiro (query 0 abaixo) antes de investigar o SQL da `0040`.

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0040_psw_staff_access_core.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Esta migration cria o helper, o índice, reescreve o trigger e cria as 2 policies aditivas em sequência. Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

---

## Passo a passo

**Query 0 — confirmar o pré-requisito (rode ANTES de tudo):**

```sql
select e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'tenant_role'
order by e.enumsortorder;
```
**Esperado:** a lista de valores do enum inclui `psw_staff` (5 valores no total). Se não incluir, PARE — a `0039` não está aplicada/commitada neste ambiente.

1. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
2. Abrir `supabase/migrations/0040_psw_staff_access_core.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
3. Clicar **Run** (Cmd/Ctrl+Enter).
4. Confirmar o resultado: **`Success. No rows returned`**.

---

## Prova de idempotência (obrigatória) — rodar o arquivo uma SEGUNDA vez

Depois do passo 4, **cole o MESMO conteúdo do arquivo novamente** (uma segunda vez, sem alterar nada) e clique **Run** de novo.

**Esperado:** a segunda execução também termina com **`Success. No rows returned`**, sem nenhum erro de objeto duplicado (`already exists`/`duplicate object`).

Isso funciona porque cada objeto criado tem um guard: `create or replace function` no helper e no trigger, `create index if not exists` no índice, e `drop policy if exists` / `drop trigger if exists` antes de cada `create policy` / `create trigger`. Rodar duas vezes não duplica nada — apenas recria as funções/trigger/policies de forma idêntica.

---

## Verificação pós-apply (cole estas queries no mesmo SQL Editor)

### 1. Helper `current_assigned_opportunity_ids()` — existe, `stable`, `security definer`, `search_path=public`

```sql
select
  p.proname,
  p.provolatile,       -- esperado: 's' (stable)
  p.prosecdef,         -- esperado: true (security definer)
  p.proconfig           -- esperado: contém 'search_path=public'
from pg_proc p
where p.proname = 'current_assigned_opportunity_ids';
```
**Esperado:** 1 linha; `provolatile = 's'`; `prosecdef = true`; `proconfig` contém `search_path=public`.

### 2. Exatamente 2 policies com sufixo `_psw_staff`

```sql
select tablename, policyname, cmd
from pg_policies
where policyname like '%\_psw\_staff' escape '\'
order by tablename, policyname;
```
**Esperado:** exatamente **2 linhas**:
- `opportunities` / `opportunities_select_psw_staff` / `SELECT`
- `tenants` / `tenants_select_psw_staff` / `SELECT`

### 3. Nenhuma policy pré-existente de `opportunities` foi removida (D-09)

```sql
select policyname, cmd
from pg_policies
where tablename = 'opportunities'
order by policyname;
```
**Esperado:** a policy nova (`opportunities_select_psw_staff`) **somada** às que já existiam antes desta migration — no mínimo `opportunities_select` (tenant), `opportunities_select_platform_admin` (0021), e as de escrita (`opportunities_insert`/`opportunities_update`/`opportunities_delete` ou equivalentes de 0015/0025). **Nenhuma delas pode ter desaparecido.** Se a contagem de linhas aqui for igual à contagem de antes do apply **+ 1**, D-09 está confirmado.

### 4. Índice de suporte `opportunity_assignees_profile_only_idx`

```sql
select indexname, indexdef
from pg_indexes
where tablename = 'opportunity_assignees'
order by indexname;
```
**Esperado:** entre os índices listados, `opportunity_assignees_profile_only_idx` definido sobre `(profile_id)`, além dos já existentes (`opportunity_assignees_opportunity_idx`, `opportunity_assignees_profile_idx`, a PK).

### 5. Trigger `opportunity_assignees_tenant_guard` continua existindo, apontando para `check_assignee_tenant()`

```sql
select tgname, proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'opportunity_assignees'::regclass
  and not t.tgisinternal;
```
**Esperado:** 1 linha — `opportunity_assignees_tenant_guard` / `check_assignee_tenant`.

---

## 6. Os 4 smoke tests do trigger `check_assignee_tenant()` (bloqueantes)

**Antes de rodar:** substitua os placeholders abaixo por valores reais do seu banco:
- `<OPP_ID>` — id de uma oportunidade real existente, do **tenant A**.
- `<TENANT_A>` — o `tenant_id` dessa oportunidade (`select tenant_id from opportunities where id = '<OPP_ID>'`).
- `<PROFILE_TENANT_A>` — `id` de um profile (`member`/`tenant_admin`/`viewer`) que pertence ao **mesmo** `<TENANT_A>`.
- `<PROFILE_OUTRO_TENANT>` — `id` de um profile que pertence a um tenant **diferente** de `<TENANT_A>` (qualquer papel que não seja `psw_staff` hoje serve — o smoke (c)/(d) promove esse profile a `psw_staff` **dentro da própria transação**, e o `rollback` desfaz a promoção também).
- `<TENANT_DO_PROFILE_OUTRO_TENANT>` — o `tenant_id` desse segundo profile (`select tenant_id from profiles where id = '<PROFILE_OUTRO_TENANT>'`).

Cada smoke roda em `begin; ... rollback;` — **nada persiste**, inclusive a promoção temporária a `psw_staff` do smoke (c)/(d).

**(a) Profile do MESMO tenant da oportunidade → deve ACEITAR**
```sql
begin;
insert into opportunity_assignees (opportunity_id, profile_id, tenant_id)
values ('<OPP_ID>', '<PROFILE_TENANT_A>', '<TENANT_A>');
-- esperado: INSERT 0 1 (sem erro)
rollback;
```

**(b) Profile de OUTRO tenant, papel diferente de `psw_staff` → deve REJEITAR**
```sql
begin;
insert into opportunity_assignees (opportunity_id, profile_id, tenant_id)
values ('<OPP_ID>', '<PROFILE_OUTRO_TENANT>', '<TENANT_A>');
-- esperado: ERRO "Atribuição cruzada entre empresas não é permitida."
rollback;
```

**(c) Profile com papel `psw_staff` (promovido só dentro desta transação), oportunidade de OUTRO tenant → deve ACEITAR**
```sql
begin;
update profiles set role = 'psw_staff' where id = '<PROFILE_OUTRO_TENANT>';
insert into opportunity_assignees (opportunity_id, profile_id, tenant_id)
values ('<OPP_ID>', '<PROFILE_OUTRO_TENANT>', '<TENANT_A>');
-- esperado: INSERT 0 1 (sem erro) — aceito mesmo sendo profile de outro tenant
rollback;
```

**(d) `tenant_id` da LINHA diferente do `tenant_id` da oportunidade, mesmo sendo `psw_staff` → deve REJEITAR (D-10)**
```sql
begin;
update profiles set role = 'psw_staff' where id = '<PROFILE_OUTRO_TENANT>';
insert into opportunity_assignees (opportunity_id, profile_id, tenant_id)
values ('<OPP_ID>', '<PROFILE_OUTRO_TENANT>', '<TENANT_DO_PROFILE_OUTRO_TENANT>');
-- esperado: ERRO "tenant_id do vínculo não confere com o da oportunidade."
rollback;
```

**Se qualquer um dos 4 divergir do esperado, NÃO PROSSIGA** — este trigger é a única barreira de banco contra atribuição cruzada indevida.

---

## 7. Smoke do teste negativo decisivo (ACCESS-04) — a versão em banco do spec que mais importa

Duas formas equivalentes — escolha uma:

**Opção A — via Vitest, se `.env.test` estiver populado:**
```bash
npx vitest run tests/security/psw-staff-isolation.test.ts -t "não vê oportunidade não atribuída do mesmo tenant"
```
**Esperado:** 1 teste passando (não em skip).

**Opção B — via SQL Editor, impersonando o usuário `psw_staff`** (funciona mesmo sem `.env.test`; use um profile real com `role = 'psw_staff'`, ou promova um temporariamente dentro do mesmo `begin/rollback` como nos smokes acima):
```sql
begin;
-- Impersona o usuário autenticado (troque <PSW_STAFF_USER_ID> pelo id real em auth.users/profiles):
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<PSW_STAFF_USER_ID>', 'role', 'authenticated')::text, true);

-- A oportunidade Y abaixo deve ser uma oportunidade do MESMO tenant de uma
-- oportunidade atribuída a <PSW_STAFF_USER_ID>, mas SEM atribuição própria:
select id from opportunities where id = '<OPP_ID_NAO_ATRIBUIDA_MESMO_TENANT>';
-- esperado: 0 linhas (vazio)
rollback;
```
**Esperado:** a query devolve **zero linhas** — o `psw_staff` não vê a oportunidade não atribuída do mesmo tenant. Se devolver a linha, a policy foi escrita como "tenant onde tem alguma atribuição" em vez de "oportunidade específica atribuída" — é exatamente o vazamento que este plano existe para prevenir; **não prossiga**, volte para ajustar a `0040`.

---

## Nota sobre tipos TypeScript

`npm run gen:types` está **bloqueado** neste projeto (MCP aponta para o projeto errado, CLI sem privilégio — memória `supabase-type-gen-blocked`). Esta migration **não adiciona coluna nem tabela** — só função, índice, trigger e policies — então `lib/database.types.ts` **não muda** e não precisa ser regenerado após o apply.

---

## Rollback (best-effort)

Esta migration é **majoritariamente** aditiva (policies e índice), mas o trigger reescrito substitui uma função viva — o rollback dele é o passo delicado.

```sql
-- 1. Remove as duas policies aditivas (seguro, sem efeito colateral):
drop policy if exists opportunities_select_psw_staff on opportunities;
drop policy if exists tenants_select_psw_staff on tenants;

-- 2. Remove o índice de suporte (seguro):
drop index if exists opportunity_assignees_profile_only_idx;

-- 3. Restaura check_assignee_tenant() para a versão de 0032 (a regra ANTIGA,
--    sem a exceção para psw_staff):
create or replace function check_assignee_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
begin
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;
  select tenant_id into v_profile_tenant from profiles      where id = new.profile_id;

  if v_opp_tenant is null or v_profile_tenant is null then
    raise exception 'Oportunidade ou pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id <> v_opp_tenant or v_profile_tenant <> v_opp_tenant then
    raise exception 'Atribuição cruzada entre empresas não é permitida.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
-- o trigger opportunity_assignees_tenant_guard não precisa ser recriado — ele
-- já aponta para check_assignee_tenant() por nome, e create or replace acima
-- já trocou o corpo da função.

-- 4. OBRIGATÓRIO antes de considerar o rollback completo — auditar se algum
--    vínculo cross-tenant foi criado enquanto a regra nova esteve ativa (essas
--    linhas permanecem válidas no banco mesmo depois do rollback do trigger,
--    porque o trigger só valida no INSERT/UPDATE, não retroativamente):
select oa.id, oa.opportunity_id, oa.profile_id, oa.tenant_id as linha_tenant,
       o.tenant_id as opp_tenant, p.tenant_id as profile_tenant, p.role
from opportunity_assignees oa
join opportunities o on o.id = oa.opportunity_id
join profiles p       on p.id = oa.profile_id
where p.tenant_id <> o.tenant_id;
-- Qualquer linha aqui é um vínculo cross-tenant criado sob a regra nova.
-- Se o rollback for por causa de um bug na regra, decidir caso a caso se
-- essas linhas devem ser removidas manualmente.
```

Re-rodar a migration `0040` inteira depois do rollback recria helper/índice/policies/trigger na versão nova (é idempotente).

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, todos os planos seguintes desta fase (17-04 em diante) estão bloqueados.** Eles leem/escrevem nas tabelas filhas e em `invited_emails`/Storage assumindo que o mecanismo de acesso por atribuição (`current_assigned_opportunity_ids()` + o trigger reescrito) já existe e está correto em produção.

---

> **Esta é a fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration. Após aplicar no SQL Editor (incluindo a segunda execução de idempotência) e rodar as 7 verificações acima (incluindo os 4 smoke tests do trigger e o smoke do teste negativo), **cole o resultado** para fechar este checkpoint.

**Resume-signal:** digite "aplicada" (colando o resultado das 7 verificações) ou descreva a divergência encontrada.

*Handoff gerado em 2026-08-06 (Phase 17 / Plan 17-03, TRACER).*

---

## Resultado do apply (2026-08-06)

**Status: APLICADA — checkpoint fechado.** O PO rodou o arquivo no SQL Editor do Supabase Cloud (incluindo a segunda execução de idempotência) e colou o resultado consolidado das 7 verificações. Todas passaram:

1. **Helper** — `current_assigned_opportunity_ids`: `provolatile='s'` (stable), `prosecdef=true` (security definer), `proconfig=["search_path=public"]`. Assinatura correta. ✓
2. **Policies novas** — exatamente 2 com sufixo `_psw_staff`: `opportunities_select_psw_staff` e `tenants_select_psw_staff`, ambas `SELECT`. ✓
3. **Aditividade (D-09), confirmada empiricamente** — `opportunities` passou a ter **9** policies: as **8 pré-existentes** (`opportunities_select`, `opportunities_insert`, `opportunities_update`, `opportunities_delete` + as 4 `_platform_admin`) **mais** `opportunities_select_psw_staff`. Nenhuma pré-existente foi removida. ✓
4. **Índice** — `opportunity_assignees_profile_only_idx` criado como `btree (profile_id)`, ao lado do composto antigo `(tenant_id, profile_id)`. ✓
5. **Trigger** — `opportunity_assignees_tenant_guard` → `check_assignee_tenant`. (A query também listou `audit_opportunity_assignees` → `audit_trigger`, objeto da `0038`, não relacionado a esta migration — presença esperada, não é regressão.) ✓
6. **Os 4 smoke tests do trigger**, todos conforme o esperado:
   - (a) profile do mesmo tenant → **ACEITOU** (`Success. No rows returned`).
   - (b) profile de outro tenant, papel comum → **REJEITOU** com `ERROR 23514: Atribuição cruzada entre empresas não é permitida.` (contexto: `check_assignee_tenant()` linha 25).
   - (c) profile `psw_staff` (promovido dentro da transação), oportunidade de outro tenant → **ACEITOU**.
   - (d) `tenant_id` da linha divergente do da oportunidade, mesmo sendo `psw_staff` → **REJEITOU** com `ERROR 23514: tenant_id do vínculo não confere com o da oportunidade.` (contexto: `check_assignee_tenant()` linha 18, D-10). ✓
7. **Smoke do negativo decisivo (ACCESS-04) — PASSOU, com medição quantitativa.** Impersonando um `psw_staff` real (`current_user=authenticated`, `auth.uid()` correto, `current_user_role()='psw_staff'` — os três controles confirmados), com exatamente UMA atribuição no tenant A:
   - tenant A (`5f4d4463-…`): **1 oportunidade visível, de 43 existentes no tenant.**
   - tenant do próprio profile (`11111111-…`): 33 visíveis, pela policy por tenant pré-existente (comportamento antigo intacto, sem regressão).

   O número que importa é **1 de 43**. Se a policy tivesse sido escrita como "tenant onde há alguma atribuição" em vez de "esta oportunidade atribuída", teriam aparecido as 43. Este é hoje o único veredito comportamental real do ACCESS-04 nesta fase — `tests/security/psw-staff-isolation.test.ts` continua em `describe.skipIf` (`.env.test` ausente) e não executou.

**Observação registrada para a fase (não é ação deste plano):** o seed de teste do Vitest usa o mesmo projeto Supabase da produção — o tenant `11111111-1111-1111-1111-111111111111` e o profile `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` (fixtures de `tests/setup/seed-test-tenants.ts`) já existem no banco de produção. Apontar `.env.test` para este mesmo projeto seria perigoso, pois a suíte de segurança cria e apaga tenants/profiles nele. A pendência de `.env.test` (Phase 7.5, carryover) provavelmente exige um projeto Supabase **separado** de teste, não apenas popular o arquivo — relevante para o Plan 17-05 e para o fechamento da fase.

**Os planos 17-04 em diante estão destravados.**
