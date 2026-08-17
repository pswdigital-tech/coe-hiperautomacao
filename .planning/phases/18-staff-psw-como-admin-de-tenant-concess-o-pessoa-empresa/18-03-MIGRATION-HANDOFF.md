# Handoff — Apply manual da migration `0046_psw_admin_child_tables.sql`

**Phase 18 · Plan 18-03 · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comando de CLI que aplique migration automaticamente, sem MCP) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0046_psw_admin_child_tables.sql`](../../../supabase/migrations/0046_psw_admin_child_tables.sql)
**Pré-requisito duro:** `0045_psw_tenant_admins_grant.sql` já aplicada e confirmada (Plan 18-02 — ver `18-02-SUMMARY.md`). Sem ela, este arquivo falha ruidosamente (função `is_tenant_admin_of`/`current_admin_tenant_ids` inexistente) — esse é o comportamento esperado, não um bug.

Ids concretos usados neste handoff, já resolvidos (nenhuma substituição manual necessária em nenhuma query abaixo):

| Papel | Id | Observação |
|---|---|---|
| `psw_staff` de teste | `8029d05c-1b7a-47aa-beea-2d11568b2ef6` | igor.boas@pswdigital.com.br |
| `platform_admin` | `dddddddd-dddd-dddd-dddd-dddddddddddd` | usado só para `granted_by` se uma concessão de teste for necessária |
| tenant FGCoop (tenant A) | `11111111-1111-1111-1111-111111111111` | 32 oportunidades reais |

Todas as demais peças que uma query precisa (um `member`/`tenant_admin` do FGCoop, uma oportunidade de A não atribuída ao staff, um tenant de controle) são resolvidas **por subconsulta inline** dentro da própria query — nada para o PO substituir à mão.

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0046_psw_admin_child_tables.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Esta migration cria 22 policies permissivas novas (nas 7 tabelas filhas), reemite as 7 restritivas da `0044` e cria `profiles_select_psw_admin`, em sequência. Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

---

## Passo a passo

1. Confirmar que a `0045` está aplicada: `select proname from pg_proc where proname = 'is_tenant_admin_of';` deve devolver 1 linha antes do apply. Se devolver 0, **pare** — a 0046 vai falhar ruidosamente, o que é esperado, mas não há motivo para gastar o ciclo.
2. **Antes de aplicar**, rodar a query da Verificação 3 abaixo e **anotar os números** — eles são a linha de base da não-regressão (comparar com o mesmo valor depois do apply).
3. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
4. Abrir `supabase/migrations/0046_psw_admin_child_tables.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
5. Clicar **Run** (Cmd/Ctrl+Enter).
6. Confirmar o resultado: **`Success. No rows returned`**.

---

## Prova de idempotência (obrigatória) — rodar o arquivo uma SEGUNDA vez

Depois do passo 6, **cole o MESMO conteúdo do arquivo novamente** (sem alterar nada) e clique **Run** de novo.

**Esperado:** a segunda execução também termina com **`Success. No rows returned`**, sem nenhum erro de objeto duplicado (`already exists`/`duplicate object`). Isso funciona porque todo `create policy` é precedido do `drop policy if exists` correspondente, e o laço checa `to_regclass`/coluna antes de agir.

---

## Verificação pós-apply — as 8 verificações do plano

### 1. Inventário — permissivas novas por tabela (`_psw_admin`), esperado 4/4/4/4/3/3/2

```sql
select tablename, count(*) as permissivas_psw_admin
from pg_policies
where policyname like '%\_psw\_admin' escape '\'
  and tablename in (
    'opportunity_phases','opportunity_risks','opportunity_tasks',
    'opportunity_assignees','opportunity_notes','opportunity_documents',
    'opportunity_history'
  )
group by tablename
order by tablename;
```

**Esperado:** `opportunity_phases=4`, `opportunity_risks=4`, `opportunity_tasks=4`, `opportunity_assignees=4`, `opportunity_notes=3`, `opportunity_documents=3`, `opportunity_history=2`.

> **⚠️ ALERTA:** qualquer tabela com **mais** verbos do que o previsto acima significa que o staff-admin ganhou poder que um `tenant_admin` daquele tenant **não tem** (ex.: UPDATE em `opportunity_history`, ou UPDATE em `opportunity_notes`/`opportunity_documents`). Se isso acontecer, **não prosseguir** — o defeito está na `0046`, reportar a divergência em vez de seguir para a Task 3.

### 2. As 7 restritivas contêm o terceiro disjunto — esperado 7 linhas

```sql
select tablename, policyname
from pg_policies
where policyname like '%_psw_staff_only_assigned'
  and tablename <> 'opportunities'
  and qual like '%current_admin_tenant_ids%'
order by tablename;
```

**Esperado:** exatamente 7 linhas — `opportunity_phases`, `opportunity_risks`, `opportunity_notes`, `opportunity_documents`, `opportunity_history`, `opportunity_tasks`, `opportunity_assignees`.

### 3. As policies pré-existentes de cada filha continuam TODAS presentes (rodar ANTES e DEPOIS do apply)

```sql
select tablename, count(*) as total_policies
from pg_policies
where tablename in (
  'opportunity_phases','opportunity_risks','opportunity_tasks',
  'opportunity_assignees','opportunity_notes','opportunity_documents',
  'opportunity_history'
)
group by tablename
order by tablename;
```

**Esperado:** o número de `total_policies` por tabela DEPOIS do apply é igual ao número ANTES **mais** as novas desta migration (as `_psw_admin` da Verificação 1 e, nas 7, a `_psw_staff_only_assigned` reemitida não muda a contagem — é `drop`+`create`, não soma). Nenhuma policy pré-existente pode ter sumido.

### 4. `profiles_select_psw_admin` presente; `profiles` SEM nenhuma restritiva

```sql
select policyname, permissive, cmd from pg_policies where tablename = 'profiles' order by policyname;
```

**Esperado:** `profiles_select_psw_admin` presente com `permissive = PERMISSIVE`, `cmd = SELECT`. Nenhuma linha com `permissive = RESTRICTIVE`.

### 5. PROPAGAÇÃO (positivo) — com concessão ativa no FGCoop, as 7 filhas de uma oportunidade não atribuída ficam visíveis ao staff

Passo (i) — conceder ao staff no FGCoop (se ainda não houver concessão ativa; escrita mínima, escopada só a `psw_tenant_admins`, revogada no passo (vi) abaixo):

```sql
insert into psw_tenant_admins (profile_id, tenant_id, granted_by)
values (
  '8029d05c-1b7a-47aa-beea-2d11568b2ef6',
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-dddddddddddd'
)
on conflict (profile_id, tenant_id) do nothing;
```

Passo (ii) — escolher, por subconsulta, uma oportunidade do FGCoop **não atribuída** ao staff (nenhuma substituição manual):

```sql
select id, processo
from opportunities
where tenant_id = '11111111-1111-1111-1111-111111111111'
  and id not in (
    select opportunity_id from opportunity_assignees
    where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
  )
limit 1;
```

Anote o `id` devolvido (chame-o de `<OPP_A>` mentalmente — ele é usado, em SQL puro, pela subconsulta abaixo, então nenhuma colagem manual é necessária):

Passo (iii) — a contagem de linhas visíveis ao staff-admin em cada uma das 7 filhas, ligadas a essa oportunidade, impersonando a sessão dele:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

with alvo as (
  select id from opportunities
  where tenant_id = '11111111-1111-1111-1111-111111111111'
    and id not in (
      select opportunity_id from opportunity_assignees
      where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
    )
  limit 1
)
select
  (select count(*) from opportunity_phases      where opportunity_id in (select id from alvo)) as phases,
  (select count(*) from opportunity_risks       where opportunity_id in (select id from alvo)) as risks,
  (select count(*) from opportunity_notes       where opportunity_id in (select id from alvo)) as notes,
  (select count(*) from opportunity_documents   where opportunity_id in (select id from alvo)) as documents,
  (select count(*) from opportunity_history     where opportunity_id in (select id from alvo)) as history,
  (select count(*) from opportunity_tasks       where opportunity_id in (select id from alvo)) as tasks,
  (select count(*) from opportunity_assignees   where opportunity_id in (select id from alvo)) as assignees;
rollback;
```

**Esperado:** todas as 7 contagens **maiores que zero QUANDO HOUVER DADO** naquela oportunidade nas tabelas correspondentes. Se a oportunidade escolhida pela Verificação 5(ii) não tiver linha nenhuma numa filha específica (ex.: nenhuma tarefa cadastrada), essa coluna pode legitimamente sair `0` por falta de dado — não confundir com falta de propagação. Se **todas** saírem zero, ou se uma coluna específica que deveria ter dado sair zero, **não prosseguir**: o defeito está na `0046`.

### 6. NEGATIVO — as mesmas 7 contagens para um tenant de controle (sem concessão nem atribuição) → todas zero

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

with controle as (
  select t.id
  from tenants t
  where t.id <> '11111111-1111-1111-1111-111111111111'
    and not exists (
      select 1 from psw_tenant_admins pa
      where pa.tenant_id = t.id and pa.profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
    )
    and not exists (
      select 1 from opportunity_assignees oa
      join opportunities o on o.id = oa.opportunity_id
      where o.tenant_id = t.id and oa.profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
    )
  limit 1
)
select
  (select count(*) from opportunity_phases    op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as phases,
  (select count(*) from opportunity_risks     op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as risks,
  (select count(*) from opportunity_notes     op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as notes,
  (select count(*) from opportunity_documents op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as documents,
  (select count(*) from opportunity_history   op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as history,
  (select count(*) from opportunity_tasks     op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as tasks,
  (select count(*) from opportunity_assignees op join opportunities o on o.id = op.opportunity_id where o.tenant_id in (select id from controle)) as assignees;
rollback;
```

**Esperado:** todas as 7 contagens **zero**. **Se qualquer uma vier diferente de zero, NÃO PROSSEGUIR — é vazamento cross-tenant** (T-18-22 do threat register do plano).

### 7. NÃO-REGRESSÃO — `member` e `tenant_admin` do FGCoop, antes e depois, nas 7 filhas

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from profiles where tenant_id = '11111111-1111-1111-1111-111111111111' and role = 'member' limit 1),
  'role','authenticated'
)::text, true);

select
  (select count(*) from opportunity_phases    where tenant_id = '11111111-1111-1111-1111-111111111111') as phases,
  (select count(*) from opportunity_risks     where tenant_id = '11111111-1111-1111-1111-111111111111') as risks,
  (select count(*) from opportunity_notes     where tenant_id = '11111111-1111-1111-1111-111111111111') as notes,
  (select count(*) from opportunity_documents where tenant_id = '11111111-1111-1111-1111-111111111111') as documents,
  (select count(*) from opportunity_history   where tenant_id = '11111111-1111-1111-1111-111111111111') as history,
  (select count(*) from opportunity_tasks     where tenant_id = '11111111-1111-1111-1111-111111111111') as tasks,
  (select count(*) from opportunity_assignees where tenant_id = '11111111-1111-1111-1111-111111111111') as assignees;
rollback;
```

Repita a mesma query trocando `role = 'member'` por `role = 'tenant_admin'` no `set_config`. Se nenhum profile com esse papel existir no FGCoop hoje, a query devolve `sub` nulo e o `set_config` falha visivelmente (não um falso-positivo silencioso) — nesse caso registre "não executável, sem fixture" em vez de inventar um id.

**Esperado:** rodar esta MESMA query **antes** do apply da `0046` e **depois**, e comparar — os 7 números têm que ser **idênticos** nos dois momentos, tanto para `member` quanto para `tenant_admin`. Qualquer diferença é regressão — **não prosseguir**.

### 8. BASELINE PRESERVADO — revogada a concessão, o staff volta exatamente ao que via antes

Passo (i) — revogar a concessão de teste criada na Verificação 5(i):

```sql
delete from psw_tenant_admins
where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
  and tenant_id  = '11111111-1111-1111-1111-111111111111';
```

Passo (ii) — repetir a query de contagem da Verificação 5(iii) (mesma oportunidade — a subconsulta a resolve de novo por não estar mais atribuída nem concedida):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

with alvo as (
  select id from opportunities
  where tenant_id = '11111111-1111-1111-1111-111111111111'
    and id not in (
      select opportunity_id from opportunity_assignees
      where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
    )
  limit 1
)
select
  (select count(*) from opportunity_phases    where opportunity_id in (select id from alvo)) as phases,
  (select count(*) from opportunity_risks     where opportunity_id in (select id from alvo)) as risks,
  (select count(*) from opportunity_notes     where opportunity_id in (select id from alvo)) as notes,
  (select count(*) from opportunity_documents where opportunity_id in (select id from alvo)) as documents,
  (select count(*) from opportunity_history   where opportunity_id in (select id from alvo)) as history,
  (select count(*) from opportunity_tasks     where opportunity_id in (select id from alvo)) as tasks,
  (select count(*) from opportunity_assignees where opportunity_id in (select id from alvo)) as assignees;
rollback;
```

**Esperado:** todas as 7 contagens voltam a **zero** (a mesma oportunidade que era visível na Verificação 5 deixa de ser, em todas as filhas, porque a concessão foi revogada) — exatamente o baseline medido antes de qualquer concessão nesta fase.

---

## Rollback

**Ordem — a ordem importa, na mesma sequência do Bloco E do arquivo da migration:**

```sql
-- 1. Dropar as policies com o sufixo desta fase nas 7 tabelas:
do $$
declare t text;
begin
  foreach t in array array[
    'opportunity_phases','opportunity_risks','opportunity_tasks',
    'opportunity_assignees','opportunity_notes','opportunity_documents',
    'opportunity_history'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_select_psw_admin', t);
    execute format('drop policy if exists %I on %I', t || '_insert_psw_admin', t);
    execute format('drop policy if exists %I on %I', t || '_update_psw_admin', t);
    execute format('drop policy if exists %I on %I', t || '_delete_psw_admin', t);
  end loop;
end $$;
```

```sql
-- 2. Dropar a permissiva de profiles:
drop policy if exists profiles_select_psw_admin on profiles;
```

```sql
-- 3. REAPLICAR O ARQUIVO 0044_psw_staff_only_assigned.sql NA ÍNTEGRA para
--    restaurar as 7 restritivas com os DOIS disjuntos originais. NUNCA dropar
--    `<tabela>_psw_staff_only_assigned` sem reaplicar a 0044 no lugar:
--    dropá-la sem substituição devolveria ao psw_staff o acesso POR TENANT DA
--    PSW que a 0044 removeu de propósito nas 7 filhas — é o detalhe que
--    separa um rollback correto de um incidente de segurança. A restritiva de
--    `opportunities` NÃO é tocada por este rollback (escopo da 0045).
```

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, o Plan 18-05 está BLOQUEADO** — o swap das policies vivas de `tenant_admin` pela fonte única (`is_tenant_admin_of()`) pressupõe que a propagação às 7 tabelas filhas já está funcionando corretamente.

A Task 3 deste mesmo plano (18-03) — os specs `c4`/`c8`/`c9` em `tests/security/psw-staff-admin-grant.test.ts` — também depende deste apply.

---

> **Esta é a fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration, nem via comando de CLI que faça auto-apply de migration, nem via MCP. Após aplicar no SQL Editor (incluindo a segunda execução de idempotência) e rodar as 8 verificações acima, **cole o resultado** para fechar este checkpoint.

**Resume-signal:** digite "aplicada" (colando o resultado das 8 verificações) ou descreva a divergência encontrada.

*Handoff gerado em 2026-08-07 (Phase 18 / Plan 18-03).*
