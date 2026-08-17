# Handoff — Apply manual das migrations `0041_psw_staff_child_access.sql` e `0042_psw_staff_audit_trail.sql`

**Phase 17 · Plan 17-04 · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comandos de auto-apply do CLI) — padrão do projeto.
**Arquivos, NESTA ORDEM, em dois Runs SEPARADOS:**
1. [`supabase/migrations/0041_psw_staff_child_access.sql`](../../../supabase/migrations/0041_psw_staff_child_access.sql)
2. [`supabase/migrations/0042_psw_staff_audit_trail.sql`](../../../supabase/migrations/0042_psw_staff_audit_trail.sql)

**Pré-requisito DURO:** `0039_psw_staff_role.sql` e `0040_psw_staff_access_core.sql` já aplicadas e **commitadas** em produção (confirmado nos Plans 17-01 e 17-03). Se isso não for verdade, a `0041` falha ao referenciar `current_assigned_opportunity_ids()` (função inexistente).

**Decisão registrada no `checkpoint:decision` da Task 3 (ver 17-04-SUMMARY.md):** `aplicar-as-duas` — aplicar `0041` e `0042` nesta mesma sessão. O motivo original para hesitar (a `0042` conter uma cópia do corpo de `opportunity_audit_trail()` cuja fonte, `0038_audit_log.sql`, estaria instável/não commitada) **deixou de existir**: a `0038` já está commitada em produção desde o commit `f3d2846`, anterior a todo o trabalho desta fase. A `0042` continua **inteiramente condicional** (`to_regclass`/`to_regprocedure`) por D-15, independentemente disso.

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de UM arquivo por vez no SQL Editor — NÃO misture `0041` e `0042` no mesmo Run, e NÃO execute nenhum dos dois bloco a bloco.**

Cada arquivo, colado inteiro, roda como uma única transação implícita no SQL Editor: ou tudo commita, ou em caso de erro faz rollback atômico e nada muda. Rode `0041` até confirmar sucesso (incluindo a segunda execução de idempotência) **antes** de sequer abrir a query da `0042`.

---

## Facilitador — profile de QA real em produção (use estes valores, não placeholders)

Já existe um usuário `psw_staff` real, criado para esta fase, com atribuição já configurada:

| Campo | Valor |
|---|---|
| E-mail | `qa.pswstaff@pswdigital.com.br` |
| Profile id | `fa5f0000-0000-4000-8000-000000000002` |
| Role | `psw_staff` |
| Atribuições | 1 oportunidade da **Natura** (`seq_id = 9`) + 1 oportunidade da **Unidasul** (`seq_id = 50`, entre 43 no tenant) |

**NÃO modifique nem apague este profile nem suas atribuições.** Ele é reaproveitado nas verificações 7, 8 e 9 abaixo, e provavelmente também no Plan 17-08 (fecho visual).

Profile de outro tenant, papel **diferente** de `psw_staff` (usado como caso negativo na verificação 7): `admin.fgcoop@pswdigital.com.br`, id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, tenant FGCoop (`11111111-1111-1111-1111-111111111111`), role `tenant_admin` — fixture de produção desde a `0002`, não apagar.

Tenant Unidasul (id fixo, `0013`): `55551da5-0000-0000-0000-000000000001`.

---

## Passo a passo

### Query 0 — confirmar pré-requisitos (rode ANTES de tudo)

```sql
-- 0039 aplicada?
select e.enumlabel
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'tenant_role'
order by e.enumsortorder;
-- Esperado: 5 valores, incluindo 'psw_staff'.

-- 0040 aplicada?
select proname, provolatile, prosecdef
from pg_proc where proname = 'current_assigned_opportunity_ids';
-- Esperado: 1 linha, provolatile='s', prosecdef=true.
```

Se qualquer um dos dois vier vazio/incompleto, **PARE** — confirme `0039`/`0040` antes de prosseguir.

### Query 0b — resolver os identificadores reais (evita placeholders manuais nas queries 7/8/9)

```sql
select o.id as opportunity_id, o.seq_id, t.name as tenant_name, t.id as tenant_id
from opportunity_assignees oa
join opportunities o on o.id = oa.opportunity_id
join tenants t on t.id = o.tenant_id
where oa.profile_id = 'fa5f0000-0000-4000-8000-000000000002'
order by o.seq_id;
```
**Esperado:** exatamente **2 linhas** — `seq_id = 9` (tenant Natura) e `seq_id = 50` (tenant Unidasul, `tenant_id = 55551da5-0000-0000-0000-000000000001`). Anote os dois `opportunity_id` — chamados abaixo de **`<OPP_NATURA>`** e **`<OPP_UNIDASUL_ATRIBUIDA>`**.

```sql
-- Uma oportunidade da Unidasul NÃO atribuída ao staff de teste (o caso negativo
-- da verificação 7/8/9 — mesma lógica do teste decisivo ACCESS-04: mesmo
-- tenant, oportunidade específica diferente).
select id, seq_id
from opportunities
where tenant_id = '55551da5-0000-0000-0000-000000000001'
  and id not in (
    select opportunity_id from opportunity_assignees
    where profile_id = 'fa5f0000-0000-4000-8000-000000000002'
  )
limit 1;
```
**Esperado:** 1 linha. Anote o `id` — chamado abaixo de **`<OPP_UNIDASUL_NAO_ATRIBUIDA>`**.

### 1. Aplicar `0041_psw_staff_child_access.sql`

1. SQL Editor → **New query** → abrir o arquivo, selecionar tudo (Cmd/Ctrl+A), colar.
2. **Run**. Confirmar **`Success. No rows returned`**.
3. **Prova de idempotência**: colar o MESMO conteúdo de novo (sem alterar nada) → **Run** de novo. Esperado: sucesso de novo, sem erro de `already exists`/`duplicate object`.

### 2. Aplicar `0042_psw_staff_audit_trail.sql`

1. **New query** (nova aba/consulta — não reaproveitar a da `0041`) → colar o arquivo inteiro.
2. **Run**. Confirmar **`Success. No rows returned`**.
3. **Prova de idempotência**: colar de novo → **Run** de novo. Esperado: sucesso de novo, sem erro.

---

## Verificação pós-apply (9 obrigatórias, na ordem — cole cada query no mesmo SQL Editor)

### 1. Contagem EXATA de policies novas com sufixo `_psw_staff`

```sql
select tablename, policyname, cmd
from pg_policies
where policyname like '%\_psw\_staff' escape '\'
order by tablename, policyname;
```

**Esperado — 24 linhas logo após a `0041`** (a `0042` acrescenta a 25ª, ver abaixo):

| tabela | policy | cmd |
|---|---|---|
| opportunities | opportunities_select_psw_staff *(0040)* | SELECT |
| opportunities | opportunities_update_psw_staff | UPDATE |
| tenants | tenants_select_psw_staff *(0040)* | SELECT |
| profiles | profiles_select_psw_staff | SELECT |
| opportunity_phases | opportunity_phases_select_psw_staff | SELECT |
| opportunity_risks | opportunity_risks_select_psw_staff | SELECT |
| opportunity_risks | opportunity_risks_insert_psw_staff | INSERT |
| opportunity_risks | opportunity_risks_update_psw_staff | UPDATE |
| opportunity_risks | opportunity_risks_delete_psw_staff | DELETE |
| opportunity_tasks | opportunity_tasks_select_psw_staff | SELECT |
| opportunity_tasks | opportunity_tasks_insert_psw_staff | INSERT |
| opportunity_tasks | opportunity_tasks_update_psw_staff | UPDATE |
| opportunity_tasks | opportunity_tasks_delete_psw_staff | DELETE |
| opportunity_notes | opportunity_notes_select_psw_staff | SELECT |
| opportunity_notes | opportunity_notes_insert_psw_staff | INSERT |
| opportunity_notes | opportunity_notes_delete_psw_staff | DELETE |
| opportunity_documents | opportunity_documents_select_psw_staff | SELECT |
| opportunity_documents | opportunity_documents_insert_psw_staff | INSERT |
| opportunity_documents | opportunity_documents_delete_psw_staff | DELETE |
| opportunity_history | opportunity_history_select_psw_staff | SELECT |
| opportunity_assignees | opportunity_assignees_select_psw_staff | SELECT |
| storage.objects | opportunity_documents_storage_select_psw_staff | SELECT |
| storage.objects | opportunity_documents_storage_insert_psw_staff | INSERT |
| storage.objects | opportunity_documents_storage_delete_psw_staff | DELETE |

**Contagem = 2 (já existentes da 0040) + 22 (novas da 0041) = 24.** Se vier diferente de 24, **PARE** — alguma policy não foi criada ou foi criada com nome errado.

**Depois de aplicar a `0042`, rode a MESMA query de novo — esperado 25 linhas** (soma-se `audit_log_select_psw_staff` na tabela `audit_log`, porque `audit_log` já existe neste ambiente — ver verificação 9). Note que `invited_emails_insert_tenant_admin` (Bloco 6b da `0041`) **não aparece nesta lista** por não ter o sufixo `_psw_staff` — é a única exceção documentada, verificada separadamente na verificação 5.

### 2. Nenhuma policy pré-existente foi removida (D-09) — presença nominal por tabela

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in (
  'opportunities','tenants','profiles','opportunity_phases','opportunity_risks',
  'opportunity_tasks','opportunity_notes','opportunity_documents',
  'opportunity_history','opportunity_assignees','invited_emails'
)
order by tablename, policyname;
```

**Esperado — cada tabela precisa ter TODOS os nomes abaixo presentes** (a coluna "antes" já existia depois da `0040`; a coluna "depois" é o total esperado depois da `0041` — nenhum nome da coluna "antes" pode faltar):

| Tabela | Nomes que já existiam (não podem sumir) | Nomes novos desta migration | Total esperado |
|---|---|---|---|
| `opportunities` | `opportunities_select`, `opportunities_insert`, `opportunities_update`, `opportunities_delete`, `opportunities_select_platform_admin`, `opportunities_insert_platform_admin`, `opportunities_update_platform_admin`, `opportunities_delete_platform_admin`, `opportunities_select_psw_staff` (9) | `opportunities_update_psw_staff` | **10** |
| `tenants` | `tenants_select_own`, `tenants_insert_platform_admin`, `tenants_update_platform_admin`, `tenants_select_platform_admin`, `tenants_update_own_admin`, `tenants_select_psw_staff` (6) | — (não tocada) | **6** |
| `profiles` | `profiles_select_same_tenant`, `profiles_update_self`, `profiles_select_platform_admin` (3) | `profiles_select_psw_staff` | **4** |
| `opportunity_phases` | `opportunity_phases_select`, `opportunity_phases_insert`, `opportunity_phases_update`, `opportunity_phases_delete`, `opportunity_phases_select_platform_admin` (5) | `opportunity_phases_select_psw_staff` (**só SELECT — sem policy de escrita, por desenho**) | **6** |
| `opportunity_risks` | `opportunity_risks_select`, `opportunity_risks_insert`, `opportunity_risks_update`, `opportunity_risks_delete`, `opportunity_risks_select_platform_admin`, `opportunity_risks_insert_platform_admin`, `opportunity_risks_update_platform_admin`, `opportunity_risks_delete_platform_admin` (8) | `opportunity_risks_select_psw_staff`, `_insert_psw_staff`, `_update_psw_staff`, `_delete_psw_staff` | **12** |
| `opportunity_tasks` | `opportunity_tasks_select`, `opportunity_tasks_insert`, `opportunity_tasks_update`, `opportunity_tasks_delete` (4) | `opportunity_tasks_select_psw_staff`, `_insert_psw_staff`, `_update_psw_staff`, `_delete_psw_staff` | **8** |
| `opportunity_notes` | `opportunity_notes_select`, `opportunity_notes_insert`, `opportunity_notes_delete`, `opportunity_notes_insert_platform_admin`, `opportunity_notes_delete_platform_admin`, `opportunity_notes_select_platform_admin` (6) | `opportunity_notes_select_psw_staff`, `_insert_psw_staff`, `_delete_psw_staff` (**sem UPDATE, igual ao member**) | **9** |
| `opportunity_documents` | `opportunity_documents_select`, `opportunity_documents_insert`, `opportunity_documents_delete`, `opportunity_documents_insert_platform_admin`, `opportunity_documents_delete_platform_admin`, `opportunity_documents_select_platform_admin` (6) | `opportunity_documents_select_psw_staff`, `_insert_psw_staff`, `_delete_psw_staff` (**sem UPDATE**) | **9** |
| `opportunity_history` | `opportunity_history_select`, `opportunity_history_insert`, `opportunity_history_select_platform_admin` (3) | `opportunity_history_select_psw_staff` (**só SELECT — tabela congelada**) | **4** |
| `opportunity_assignees` | `opportunity_assignees_select`, `opportunity_assignees_insert`, `opportunity_assignees_update`, `opportunity_assignees_delete` (4) | `opportunity_assignees_select_psw_staff` (**só SELECT — atribuir é só do platform_admin, D-05**) | **5** |
| `invited_emails` | `invited_emails_select_admin`, `invited_emails_insert_admin`, `invited_emails_update_admin`, `invited_emails_delete_admin`, `invited_emails_select_tenant_admin`, `invited_emails_insert_tenant_admin`, `invited_emails_delete_tenant_admin` (7) | nenhuma nova — `invited_emails_insert_tenant_admin` é **recriada** (mesmo nome, predicado mais restrito — ver verificação 5) | **7** (mesma contagem, conteúdo mudou) |

Se QUALQUER nome da coluna "já existiam" não aparecer no resultado, **PARE** — D-09 foi violado.

### 3. `storage.objects` do bucket `opportunity-documents` — aditividade

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'opportunity\_documents\_storage\_%' escape '\'
order by policyname;
```
**Esperado — 6 linhas**: as 3 de `0018` (`opportunity_documents_storage_select`, `_insert`, `_delete`) **mais** as 3 novas (`_select_psw_staff`, `_insert_psw_staff`, `_delete_psw_staff`). (Há também um outro bucket, `tenant-branding`, com suas próprias 4 policies `tenant_branding_storage_*` — não filtradas por este `like` e não afetadas por esta fase; ignore-as se aparecerem numa consulta sem o filtro.)

### 4. `invited_emails_role_check` inclui o papel novo

```sql
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'invited_emails'::regclass and conname = 'invited_emails_role_check';
```
**Esperado:** 1 linha; `definicao` contém `'psw_staff'` na lista de valores permitidos (junto com `member`, `tenant_admin`, `viewer`).

### 5. `invited_emails_insert_tenant_admin` agora também exclui o papel novo

```sql
select policyname, cmd, with_check
from pg_policies
where tablename = 'invited_emails' and policyname = 'invited_emails_insert_tenant_admin';
```
**Esperado:** 1 linha; a coluna `with_check` contém, além de `current_user_role() = 'tenant_admin'::tenant_role`, uma condição do tipo `role <> ALL (ARRAY['platform_admin'::tenant_role, 'psw_staff'::tenant_role])` (o Postgres reformata `not in (...)` como `<> all(array[...])` ao serializar — o que importa é que **`psw_staff` apareça no texto**, junto com `platform_admin`).

### 6. `opportunity_tasks` continua com os DOIS triggers

```sql
select tgname, proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'opportunity_tasks'::regclass and not t.tgisinternal
order by tgname;
```
**Esperado — no mínimo 3 linhas** (a ordem alfabética do nome do trigger é a ordem de execução):
- `opportunity_tasks_depth_guard` → `check_task_depth` (**NÃO tocado por esta fase**)
- `opportunity_tasks_set_updated_at` → `set_updated_at`
- `opportunity_tasks_tenant_guard` → `check_task_tenant_coherence` (**reescrito** — mesma função, corpo novo)

Se `opportunity_tasks_tenant_guard` estiver ausente, ou se `opportunity_tasks_depth_guard` tiver desaparecido, **PARE**.

---

### 7. Smoke de responsável de tarefa (ACCESS-11/D-14) — 3 casos, BLOQUEANTE

Usa `<OPP_NATURA>` e `<OPP_UNIDASUL_NAO_ATRIBUIDA>` resolvidos na Query 0b. Cada caso roda isolado em `begin/rollback` — nada persiste.

**(a) ACEITA — staff QA como responsável de tarefa da oportunidade da Natura, à qual ele ESTÁ atribuído:**
```sql
begin;
insert into opportunity_tasks (opportunity_id, tenant_id, title, assignee_id)
select o.id, o.tenant_id, 'Smoke 17-04 (a) — aceitar', 'fa5f0000-0000-4000-8000-000000000002'
from opportunities o where o.id = '<OPP_NATURA>';
-- esperado: INSERT 0 1 (sem erro)
rollback;
```

**(b) REJEITA — staff QA como responsável de tarefa de uma oportunidade da Unidasul à qual ele NÃO está atribuído:**
```sql
begin;
insert into opportunity_tasks (opportunity_id, tenant_id, title, assignee_id)
select o.id, o.tenant_id, 'Smoke 17-04 (b) — rejeitar', 'fa5f0000-0000-4000-8000-000000000002'
from opportunities o where o.id = '<OPP_UNIDASUL_NAO_ATRIBUIDA>';
-- esperado: ERRO "Responsável de outra empresa não pode ser atribuído a esta tarefa."
rollback;
```

**(c) REJEITA — profile de outro tenant, papel diferente de `psw_staff` (admin FGCoop), como responsável de tarefa da Unidasul:**
```sql
begin;
insert into opportunity_tasks (opportunity_id, tenant_id, title, assignee_id)
select o.id, o.tenant_id, 'Smoke 17-04 (c) — rejeitar', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
from opportunities o where o.id = '<OPP_UNIDASUL_NAO_ATRIBUIDA>';
-- esperado: ERRO "Responsável de outra empresa não pode ser atribuído a esta tarefa."
rollback;
```

**Se (a) rejeitar, ou se (b)/(c) aceitarem, NÃO PROSSIGA** — `check_task_tenant_coherence()` foi reescrita incorretamente.

---

### 8. Smoke de Storage (D-12) — positivo + negativo, o negativo espera **403**

**Opção A — verificação por SQL (não exige arquivo real; testa a MESMA decisão de autorização que a API de Storage usa)**, impersonando o staff QA:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','fa5f0000-0000-4000-8000-000000000002','role','authenticated')::text, true);

-- Positivo: linhas de storage.objects sob o path da oportunidade Unidasul ATRIBUÍDA.
select count(*) as visiveis_atribuida
from storage.objects
where bucket_id = 'opportunity-documents'
  and (storage.foldername(name))[2] = '<OPP_UNIDASUL_ATRIBUIDA>';

-- Negativo: linhas de storage.objects sob o path da oportunidade Unidasul NÃO atribuída.
select count(*) as visiveis_nao_atribuida
from storage.objects
where bucket_id = 'opportunity-documents'
  and (storage.foldername(name))[2] = '<OPP_UNIDASUL_NAO_ATRIBUIDA>';
rollback;
```
**Esperado:** se já existir algum documento real anexado à oportunidade atribuída, `visiveis_atribuida` deve ser **> 0** (ou, se nenhuma das duas oportunidades tiver documento algum ainda, ambas vêm 0 — nesse caso, faça a Opção B abaixo para uma prova conclusiva). `visiveis_nao_atribuida` deve ser **sempre 0**, mesmo que existam documentos reais anexados àquela oportunidade — se vier `> 0`, a policy de Storage está errada, **não prossiga**.

**Opção B — prova end-to-end via UI (recomendada se a Opção A não tiver dado positivo real), com **403** explícito:**
1. Logado como `member`/`tenant_admin` da Unidasul, abra a oportunidade `seq_id 50` (atribuída) e anexe um arquivo pequeno de teste (aba Documentos).
2. Logado como `qa.pswstaff@pswdigital.com.br`, abra a MESMA oportunidade (deve aparecer na lista unificada dele) e baixe esse anexo — **esperado: download funciona**.
3. Ainda logado como `qa.pswstaff@pswdigital.com.br`, tente acessar diretamente a URL do Storage de um documento de OUTRA oportunidade da Unidasul (não atribuída) — por exemplo, copiando a URL de um anexo existente de `<OPP_UNIDASUL_NAO_ATRIBUIDA>` e abrindo-a numa aba onde a sessão do psw_staff está ativa — **esperado: erro 403 (Forbidden)** ao tentar baixar.
4. Remova o arquivo de teste do passo 1 ao final, se não for útil manter.

---

### 9. Verificação condicional da `0042` (D-15)

`audit_log` **já existe** neste ambiente (a `0038` está commitada) — então os dois blocos da `0042` devem ter sido ativados de verdade, não ficado inertes. Confirme:

```sql
-- a) a policy condicional foi criada
select policyname, cmd from pg_policies
where tablename = 'audit_log' and policyname = 'audit_log_select_psw_staff';
-- esperado: 1 linha, SELECT.
```

```sql
-- b) baseline: quantas linhas de audit_log existem para a oportunidade
-- Unidasul NÃO atribuída (para o negativo abaixo ter significado real).
select count(*) from audit_log
where table_name = 'opportunities' and record_id = '<OPP_UNIDASUL_NAO_ATRIBUIDA>';
```

```sql
-- c) impersonado como staff QA: RPC da oportunidade ATRIBUÍDA (Natura) —
-- pode vir vazio se ainda não houve mutação registrada, mas NÃO pode dar erro.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','fa5f0000-0000-4000-8000-000000000002','role','authenticated')::text, true);
select * from opportunity_audit_trail('<OPP_NATURA>');
rollback;
-- esperado: 0+ linhas, SEM ERRO.
```

```sql
-- d) impersonado como staff QA: RPC da oportunidade NÃO atribuída (Unidasul)
-- — precisa vir VAZIO mesmo que a query (b) acima tenha mostrado que existem
-- linhas de audit_log para ela.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','fa5f0000-0000-4000-8000-000000000002','role','authenticated')::text, true);
select * from opportunity_audit_trail('<OPP_UNIDASUL_NAO_ATRIBUIDA>');
rollback;
-- esperado: 0 linhas, mesmo que (b) tenha mostrado > 0.
```

**Se (d) devolver alguma linha, o gate ampliado da RPC está errado — não prossiga.** Se `audit_log` NÃO existisse neste ambiente, o esperado seria apenas "a `0042` rodou sem erro, nada a verificar aqui" — não é o caso deste ambiente.

---

## Nota sobre tipos TypeScript

Nenhuma coluna ou tabela nova em `0041`/`0042` — só função, trigger, constraint e policies. `lib/database.types.ts` **não muda** e não precisa ser regenerado (`gen:types` continua bloqueado — ver memória `supabase-type-gen-blocked`).

---

## Rollback (best-effort)

A maior parte é aditiva (policies) e reversível sem custo. O ponto delicado é a substituição de `check_task_tenant_coherence()` — regra viva de `opportunity_tasks` com dados desde a Phase 16 — e a substituição de `opportunity_audit_trail()`.

```sql
-- 1. Remove TODAS as 22 policies aditivas da 0041 (seguro):
drop policy if exists opportunities_update_psw_staff on opportunities;
drop policy if exists profiles_select_psw_staff on profiles;
drop policy if exists opportunity_phases_select_psw_staff on opportunity_phases;
drop policy if exists opportunity_risks_select_psw_staff on opportunity_risks;
drop policy if exists opportunity_risks_insert_psw_staff on opportunity_risks;
drop policy if exists opportunity_risks_update_psw_staff on opportunity_risks;
drop policy if exists opportunity_risks_delete_psw_staff on opportunity_risks;
drop policy if exists opportunity_tasks_select_psw_staff on opportunity_tasks;
drop policy if exists opportunity_tasks_insert_psw_staff on opportunity_tasks;
drop policy if exists opportunity_tasks_update_psw_staff on opportunity_tasks;
drop policy if exists opportunity_tasks_delete_psw_staff on opportunity_tasks;
drop policy if exists opportunity_notes_select_psw_staff on opportunity_notes;
drop policy if exists opportunity_notes_insert_psw_staff on opportunity_notes;
drop policy if exists opportunity_notes_delete_psw_staff on opportunity_notes;
drop policy if exists opportunity_documents_select_psw_staff on opportunity_documents;
drop policy if exists opportunity_documents_insert_psw_staff on opportunity_documents;
drop policy if exists opportunity_documents_delete_psw_staff on opportunity_documents;
drop policy if exists opportunity_history_select_psw_staff on opportunity_history;
drop policy if exists opportunity_assignees_select_psw_staff on opportunity_assignees;
drop policy if exists opportunity_documents_storage_select_psw_staff on storage.objects;
drop policy if exists opportunity_documents_storage_insert_psw_staff on storage.objects;
drop policy if exists opportunity_documents_storage_delete_psw_staff on storage.objects;

-- 2. Remove a policy condicional da 0042 (seguro), se existir:
drop policy if exists audit_log_select_psw_staff on audit_log;

-- 3. Restaura o CHECK e a policy de invited_emails à versão de 0028/0029:
alter table invited_emails drop constraint if exists invited_emails_role_check;
alter table invited_emails add constraint invited_emails_role_check
  check (role in ('member', 'tenant_admin', 'viewer'));

drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and role <> 'platform_admin'
  );

-- 4. Restaura check_task_tenant_coherence() à versão ORIGINAL de 0037 (sem a
--    branch de psw_staff):
create or replace function check_task_tenant_coherence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
  v_parent_opp     uuid;
begin
  select tenant_id into v_opp_tenant from opportunities where id = new.opportunity_id;
  if not found then
    raise exception 'Oportunidade inexistente.' using errcode = 'foreign_key_violation';
  end if;

  if new.tenant_id <> v_opp_tenant then
    raise exception 'tenant_id da tarefa não confere com o da oportunidade.'
      using errcode = 'check_violation';
  end if;

  if new.assignee_id is not null then
    select tenant_id into v_profile_tenant from profiles where id = new.assignee_id;
    if not found then
      raise exception 'Responsável inexistente.' using errcode = 'foreign_key_violation';
    end if;
    if v_profile_tenant <> v_opp_tenant then
      raise exception 'Responsável de outra empresa não pode ser atribuído a esta tarefa.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_task_id is not null then
    select opportunity_id into v_parent_opp from opportunity_tasks where id = new.parent_task_id;
    if v_parent_opp is distinct from new.opportunity_id then
      raise exception 'Subtarefa precisa pertencer à mesma oportunidade da tarefa-pai.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
-- o trigger opportunity_tasks_tenant_guard não precisa ser recriado — já
-- aponta para check_task_tenant_coherence() por nome.

-- 5. Restaura opportunity_audit_trail(uuid) à versão ORIGINAL de 0038 (gate
--    sem a exceção de psw_staff), se a 0038 existir neste ambiente:
do $$
begin
  if to_regprocedure('public.opportunity_audit_trail(uuid)') is not null then
    execute $sql$
      create or replace function opportunity_audit_trail(p_opportunity_id uuid)
      returns table (
        id bigint, table_name text, record_id uuid, action audit_action,
        actor_email text, changes jsonb, old_data jsonb, new_data jsonb,
        contexto text, created_at timestamptz
      )
      language plpgsql stable security definer set search_path = public
      as $body$
      declare
        v_tenant uuid;
      begin
        select o.tenant_id into v_tenant from opportunities o where o.id = p_opportunity_id;
        if v_tenant is null then return; end if;
        if not is_platform_admin() and v_tenant is distinct from current_tenant_id() then
          return;
        end if;
        return query
        select a.id, a.table_name, a.record_id, a.action, a.actor_email,
               a.changes, a.old_data, a.new_data, a.contexto, a.created_at
        from audit_log a
        where a.tenant_id = v_tenant
          and (
            (a.table_name = 'opportunities' and a.record_id = p_opportunity_id)
            or (
              a.table_name in ('opportunity_tasks', 'opportunity_risks',
                               'opportunity_notes', 'opportunity_documents',
                               'opportunity_assignees')
              and coalesce(a.new_data, a.old_data) ->> 'opportunity_id' = p_opportunity_id::text
            )
          )
        order by a.created_at desc;
      end;
      $body$;
    $sql$;
    execute 'revoke execute on function opportunity_audit_trail(uuid) from public, anon';
    execute 'grant execute on function opportunity_audit_trail(uuid) to authenticated';
  end if;
end;
$$;

-- 6. OBRIGATÓRIO antes de considerar o rollback completo — auditar tarefas
--    cujo assignee_id é de tenant DIFERENTE do da oportunidade (só possível
--    sob a regra nova): essas linhas continuam válidas no banco mesmo após
--    o rollback da função (o trigger só valida em INSERT/UPDATE, não
--    retroativamente).
select ot.id, ot.opportunity_id, ot.assignee_id, o.tenant_id as opp_tenant,
       p.tenant_id as assignee_tenant, p.role
from opportunity_tasks ot
join opportunities o on o.id = ot.opportunity_id
join profiles p on p.id = ot.assignee_id
where p.tenant_id <> o.tenant_id;
-- Qualquer linha aqui é um responsável cross-tenant criado sob a regra nova.
-- Decidir caso a caso se deve ser desatribuído manualmente.
```

Re-rodar `0041` e depois `0042` inteiras depois do rollback recria tudo na versão nova (ambas idempotentes).

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, todos os planos seguintes desta fase (17-05 em diante) estão bloqueados.** Eles pressupõem que as policies aditivas das tabelas filhas, do bucket, e a reescrita de `check_task_tenant_coherence()` já existem e estão corretas em produção.

---

## O que foi construído

`0041`: policies aditivas nas 7 tabelas filhas de oportunidade + `profiles` + `storage.objects`; `check_task_tenant_coherence()` reescrita; CHECK e policy de `invited_emails` ajustados. `0042`: acesso condicional (a `audit_log` e à RPC `opportunity_audit_trail`) à trilha de auditoria.

## Instruções

1. Confirmar Query 0 (`0039`/`0040` aplicadas).
2. Rodar Query 0b para resolver `<OPP_NATURA>`, `<OPP_UNIDASUL_ATRIBUIDA>`, `<OPP_UNIDASUL_NAO_ATRIBUIDA>`.
3. Aplicar `0041` (Run + Run de novo para idempotência).
4. Aplicar `0042` (Run + Run de novo para idempotência).
5. Rodar as 9 verificações, na ordem, substituindo os 3 placeholders resolvidos no passo 2.
6. Colar o resultado das 9 verificações na resposta a este checkpoint.
7. Se qualquer smoke (7, 8 ou 9-d) divergir do esperado, **não prosseguir**.

## Verificação (resumo)

- Contagem de policies `_psw_staff` bate exatamente (24 após `0041`, 25 após `0042`), e a lista de nomes confere.
- Todas as policies pré-existentes de todas as tabelas afetadas continuam presentes (exceto `invited_emails_insert_tenant_admin`, substituição documentada e mais restritiva).
- `invited_emails_role_check` inclui `psw_staff`; a policy de INSERT do `tenant_admin` o exclui.
- `opportunity_tasks` continua com os 3 triggers (incluindo `depth_guard`, intocado).
- Smoke de responsável de tarefa: aceita no caso legítimo, rejeita nos dois ilegítimos.
- Smoke de Storage: acesso à oportunidade atribuída funciona; à não atribuída nega (0 linhas / 403).
- `0042`: `audit_log_select_psw_staff` existe; a RPC devolve linhas (ou vazio sem erro) para a atribuída e SEMPRE vazio para a não atribuída, mesmo havendo histórico real dela.
- Cada arquivo rodou duas vezes sem erro.

**Resume-signal:** digite "aplicadas" (colando o resultado das 9 verificações) ou descreva a divergência encontrada.

*Handoff gerado em 2026-08-06 (Phase 17 / Plan 17-04).*
