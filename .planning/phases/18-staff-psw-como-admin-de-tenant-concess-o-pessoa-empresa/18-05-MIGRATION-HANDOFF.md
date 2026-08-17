# Handoff — Apply manual da migration `0047_tenant_admin_predicate_swap.sql`

**Phase 18 · Plan 18-05 · [BLOCKING] checkpoint:human-action · write-only (Supabase Cloud)**
**Arquivo:** [`supabase/migrations/0047_tenant_admin_predicate_swap.sql`](../../../supabase/migrations/0047_tenant_admin_predicate_swap.sql)
**Pré-requisitos:** `0045_psw_tenant_admins_grant.sql` e `0046_psw_admin_child_tables.sql` já aplicadas e confirmadas (Plans 18-02 e 18-03).

**Decisão do checkpoint da Task 2 (já resolvida pelo PO):** `aplicar-as-11` — as 11 policies trocadas de uma vez, com medição de byte-equivalência antes/depois. A `0047` fica exatamente como está escrita; nada foi ajustado.

Ids concretos usados neste handoff, já resolvidos (nenhuma substituição manual em nenhuma query abaixo):

| Papel | Id | Observação |
|---|---|---|
| `psw_staff` de teste | `8029d05c-1b7a-47aa-beea-2d11568b2ef6` | igor.boas@pswdigital.com.br |
| `platform_admin` | `dddddddd-dddd-dddd-dddd-dddddddddddd` | usado só para `granted_by` |
| tenant FGCoop (tenant A) | `11111111-1111-1111-1111-111111111111` | 32 oportunidades reais |

Todo `tenant_admin` de A, todo tenant de controle (B), toda oportunidade/assignee de A usados abaixo são resolvidos **por subconsulta inline** dentro da própria query — nada para o PO substituir à mão em query nenhuma.

**Disciplina de escrita deste documento:** a ÚNICA escrita que persiste fora de uma transação com `rollback` é a concessão de teste em `psw_tenant_admins` (Passo B abaixo) — e ela é revogada no fim do mesmo documento (Passo F). Todo teste de poder de escrita (inserir convite, atualizar branding, atualizar atribuição) roda dentro de `begin; … rollback;`: a policy é exercitada de verdade (o `with check`/`using` é avaliado pelo banco), mas a linha nunca é commitada. Cada bloco abaixo declara, em uma linha, exatamente o que toca.

---

## ⚠️⚠️ ANTES DE APLICAR — leia e execute isto PRIMEIRO, antes de colar a `0047` no SQL Editor

**Depois do apply não há como recuperar o texto antigo das 11 policies.** Pular esta seção torna o rollback cego (você teria que reconstituir o predicado antigo lendo os 4 arquivos de origem à mão, sob pressão, num incidente) e torna a Verificação Decisiva #1 impossível de julgar (você não tem contra o que comparar).

**O QUE ESTE PASSO TOCA:** nada é escrito. As duas queries abaixo são `select` puro (a segunda usa `begin; … rollback;` só para poder impersonar a sessão do `tenant_admin` — nenhuma linha é alterada).

### A1. Exportar o texto VIVO das 11 policies (rodar e SALVAR o resultado — copiar para fora do SQL Editor, num arquivo de texto ou nota)

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where policyname in (
  'opportunity_assignees_insert','opportunity_assignees_update','opportunity_assignees_delete',
  'invited_emails_select_tenant_admin','invited_emails_delete_tenant_admin','invited_emails_insert_tenant_admin',
  'tenants_update_own_admin','tenant_branding_storage_insert','tenant_branding_storage_update',
  'tenant_branding_storage_delete','audit_log_select'
)
order by tablename, policyname;
```

**Esperado:** 11 linhas. Guarde o resultado inteiro — é o único registro que sobrevive do predicado antigo depois do apply.

### A2. Baseline de byte-equivalência — o que um `tenant_admin` de A (FGCoop) enxerga HOJE, ANTES do apply

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from profiles where tenant_id = '11111111-1111-1111-1111-111111111111' and role = 'tenant_admin' limit 1),
  'role','authenticated'
)::text, true);

select
  (select count(*) from invited_emails where tenant_id = '11111111-1111-1111-1111-111111111111') as convites_visiveis,
  (select count(*) from tenants        where id        = '11111111-1111-1111-1111-111111111111') as proprio_tenant_visivel,
  (select count(*) from audit_log      where tenant_id = '11111111-1111-1111-1111-111111111111') as log_visivel,
  (select count(*) from opportunity_assignees where tenant_id = '11111111-1111-1111-1111-111111111111') as atribuicoes_visiveis;
rollback;
```

Se `sub` sair nulo (nenhum `tenant_admin` cadastrado no FGCoop hoje), a query devolve erro visível no `set_config` — não um falso-positivo silencioso. Nesse caso registre "sem fixture de `tenant_admin` no FGCoop" em vez de inventar um id, e pule a Verificação Decisiva #1 (a #7 do plano) explicitamente, documentando a lacuna.

**ANOTE OS 4 NÚMEROS.** Eles são o baseline que a Verificação Decisiva #1 (logo abaixo, pós-apply) precisa reproduzir exatamente.

---

## Atomicidade do apply

**Cole o conteúdo INTEIRO de `0047_tenant_admin_predicate_swap.sql` DE UMA VEZ no SQL Editor — não execute bloco a bloco.** O paste multi-statement roda numa única transação: ou tudo commita, ou em erro faz rollback atômico e nada muda.

## Passo a passo

1. Confirmar que `0046` está aplicada: `select count(*) from pg_policies where policyname like '%\_psw\_admin' escape '\'` deve devolver mais que zero antes do apply. Se vier zero, **pare**.
2. Rodar a seção "ANTES DE APLICAR" acima e **guardar os dois resultados**.
3. Supabase Dashboard → **SQL Editor** → **New query** → colar o conteúdo INTEIRO de `supabase/migrations/0047_tenant_admin_predicate_swap.sql`. **Run**.
4. Confirmar **`Success. No rows returned`**.
5. **Prova de idempotência:** colar o MESMO conteúdo novamente (sem alterar nada) e **Run** de novo. Esperado: o mesmo `Success. No rows returned`, sem erro de objeto duplicado.
6. Rodar as verificações abaixo, **DECISIVAS primeiro**.

---

## VERIFICAÇÕES DECISIVAS — rodar estas TRÊS primeiro, nesta ordem

> As verificações complementares (seção seguinte) importam, mas nos dois applies anteriores desta fase elas simplesmente não foram executadas. Estas três aqui são as que decidem se o apply fica ou se reverte — não pule para as complementares antes de rodar as três.

### DECISIVA #1 — Byte-equivalência do `tenant_admin` de cliente (a que pega o modo de falha GRAVE e silencioso)

**O QUE TOCA:** nada é escrito — mesma query da seção A2, dentro de `begin; … rollback;`.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from profiles where tenant_id = '11111111-1111-1111-1111-111111111111' and role = 'tenant_admin' limit 1),
  'role','authenticated'
)::text, true);

select
  (select count(*) from invited_emails where tenant_id = '11111111-1111-1111-1111-111111111111') as convites_visiveis,
  (select count(*) from tenants        where id        = '11111111-1111-1111-1111-111111111111') as proprio_tenant_visivel,
  (select count(*) from audit_log      where tenant_id = '11111111-1111-1111-1111-111111111111') as log_visivel,
  (select count(*) from opportunity_assignees where tenant_id = '11111111-1111-1111-1111-111111111111') as atribuicoes_visiveis;
rollback;
```

**Esperado:** os 4 números **IDÊNTICOS** aos anotados na seção A2, ANTES do apply. **Se qualquer um divergir, NÃO PROSSEGUIR** — a byte-equivalência falhou, o primeiro ramo de `is_tenant_admin_of()` não reproduziu o predicado antigo, e o `tenant_admin` de algum cliente ganhou ou perdeu acesso silenciosamente. Reverter pelo Rollback abaixo.

### DECISIVA #2 — A barreira de escalada de convite continua de pé

**O QUE TOCA:** nada é escrito — `select` puro em `pg_policies`.

```sql
select policyname, with_check
from pg_policies
where policyname = 'invited_emails_insert_tenant_admin'
  and with_check ilike '%role not in%platform_admin%psw_staff%';
```

**Esperado:** **1 linha.** Se sair **0, PARE E REVERTA IMEDIATAMENTE** pela ordem do Rollback — significa que um `tenant_admin` de cliente (ou agora um staff-admin) voltou a poder convidar alguém como `psw_staff` direto pela API.

### DECISIVA #3 — o staff-admin de A consegue o que GRANT-04 promete (poderes reais, nada persiste)

**O QUE TOCA:** Passo (i) escreve em `psw_tenant_admins` (a concessão de teste — permanece até o Passo F no fim deste documento, onde é revogada). Os passos (ii)-(v) rodam dentro de `begin; … rollback;` — testam o `with check`/`using` de verdade, mas nada é commitado.

**(i) Conceder o staff no FGCoop, só se ainda não houver concessão ativa** — escreve **apenas** em `psw_tenant_admins`:

```sql
insert into psw_tenant_admins (profile_id, tenant_id, granted_by)
values (
  '8029d05c-1b7a-47aa-beea-2d11568b2ef6',
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-dddddddddddd'
)
on conflict (profile_id, tenant_id) do nothing;
```

**(ii) Inserir convite legítimo em A (esperado: aceita)** — dentro de `begin/rollback`, nada persiste:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

insert into invited_emails (email, tenant_id, role, invited_by)
values (
  'zzz-teste-18-05@example.invalid',
  '11111111-1111-1111-1111-111111111111',
  'member',
  '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
)
returning id, email, tenant_id, role;
rollback;
```

**Esperado:** o `insert … returning` devolve 1 linha, sem erro. O `rollback` garante que nada fica gravado.

**(iii) Atualizar o branding de A (esperado: aceita)** — dentro de `begin/rollback`, nada persiste:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

update tenants
set brand_color = '#123456'
where id = '11111111-1111-1111-1111-111111111111'
returning id, brand_color;
rollback;
```

**Esperado:** o `update … returning` devolve 1 linha, sem erro.

**(iv) Ler o log de auditoria de A (esperado: traz linhas ou zero por falta de dado, mas sem erro de permissão)** — `select` puro, nada escrito:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);
select count(*) as linhas_de_log from audit_log where tenant_id = '11111111-1111-1111-1111-111111111111';
rollback;
```

**Esperado:** a query roda sem erro de permissão (contagem pode ser 0 ou maior, dependendo de haver mutações registradas no FGCoop — o que importa é a AUSÊNCIA de erro).

**(v) Escalada de convite pelo staff-admin — tentar convidar `psw_staff` em A (esperado: REJEITADO)** — dentro de `begin/rollback`, nada persiste; espera-se erro de RLS:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','8029d05c-1b7a-47aa-beea-2d11568b2ef6','role','authenticated'
)::text, true);

insert into invited_emails (email, tenant_id, role, invited_by)
values (
  'zzz-teste-escalada-18-05@example.invalid',
  '11111111-1111-1111-1111-111111111111',
  'psw_staff',
  '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
);
rollback;
```

**Esperado:** erro (`new row violates row-level security policy` ou equivalente) — a inserção é REJEITADA. O `rollback` fecha a transação de qualquer forma. **Se este insert for aceito, PARE E REVERTA IMEDIATAMENTE** — é a mesma escalada que a DECISIVA #2 detecta de outro ângulo.

---

## Verificações complementares (rodar depois das 3 decisivas acima)

### C1. As 11 policies presentes pelo nome, todas chamando a fonte única — esperado 11 linhas

```sql
select tablename, policyname
from pg_policies
where policyname in (
  'opportunity_assignees_insert','opportunity_assignees_update','opportunity_assignees_delete',
  'invited_emails_select_tenant_admin','invited_emails_delete_tenant_admin','invited_emails_insert_tenant_admin',
  'tenants_update_own_admin','tenant_branding_storage_insert','tenant_branding_storage_update',
  'tenant_branding_storage_delete','audit_log_select'
)
and (qual ilike '%is_tenant_admin_of%' or with_check ilike '%is_tenant_admin_of%')
order by tablename, policyname;
```

**Esperado:** exatamente 11 linhas. A query filtra por LISTA DE NOMES, não por padrão de sufixo — uma policy renomeada por engano aparece como AUSENTE, não como falso-positivo.

### C2. A policy de remoção de convites preserva a condição de convite não usado

```sql
select policyname from pg_policies
where policyname = 'invited_emails_delete_tenant_admin'
  and qual ilike '%used_at is null%';
```

**Esperado:** 1 linha.

### C3. As 3 policies novas do bucket privado existem; nenhuma com verbo de atualização

```sql
select policyname, cmd from pg_policies
where policyname like 'opportunity_documents_storage_%_psw_admin'
order by policyname;
```

**Esperado:** 3 linhas (`select`, `insert`, `delete`). Se aparecer uma 4ª com `cmd = UPDATE`, **não prosseguir**.

### C4. Nenhuma policy de Storage desta fase converte segmento de caminho para identificador

```sql
select policyname from pg_policies
where schemaname = 'storage'
  and (qual ilike '%::uuid%' or with_check ilike '%::uuid%');
```

**Esperado:** 0 linhas.

### C5. O CHECK de papel convidável está inalterado — comparar com o texto anotado na seção "ANTES DE APLICAR" (se ainda não anotado, rodar agora e conferir contra `0041`: `check (role in ('member','tenant_admin','viewer','psw_staff'))`)

```sql
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conname = 'invited_emails_role_check';
```

**Esperado:** `definicao` idêntica à da `0041` — `CHECK ((role = ANY (ARRAY['member'::tenant_role, 'tenant_admin'::tenant_role, 'viewer'::tenant_role, 'psw_staff'::tenant_role])))` (a ordem/formatação exata pode variar por versão do Postgres; o CONJUNTO de 4 valores é o que importa).

### C6. Negativo em B — as mesmas 4 tentativas de leitura/escrita do staff-admin, num tenant SEM concessão

**O QUE TOCA:** nada é escrito — tudo dentro de `begin; … rollback;`.

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
  limit 1
)
select
  (select count(*) from invited_emails where tenant_id in (select id from controle)) as convites_visiveis_em_b,
  (select count(*) from tenants        where id        in (select id from controle)) as tenant_b_visivel,
  (select count(*) from audit_log      where tenant_id in (select id from controle)) as log_visivel_em_b;
rollback;
```

**Esperado:** as 3 contagens **zero**. **Se qualquer uma vier diferente de zero, NÃO PROSSEGUIR** — é vazamento cross-tenant (T-18-42 do threat register do plano).

Tentativa de escrita em B (esperado: erro):

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
  limit 1
)
insert into invited_emails (email, tenant_id, role, invited_by)
select 'zzz-teste-negativo-18-05@example.invalid', id, 'member', '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
from controle;
rollback;
```

**Esperado:** erro de RLS (a inserção é rejeitada — `is_tenant_admin_of(tenant_id)` é falso para B).

### C7. Segunda execução do arquivo (idempotência) já confirmada no Passo 5 acima — não repetir aqui, só registrar o resultado colado.

---

## Rollback

**ORDEM OBRIGATÓRIA — reaplicar, NESTA ORDEM, os 4 arquivos abaixo. Reaplicar a `0029` DEPOIS da `0041` deixaria valendo a versão PERMISSIVA DEMAIS de `invited_emails_insert_tenant_admin` (sem a barreira `role not in (...)`) — é o detalhe que separa um rollback correto de um incidente de segurança.**

1. Dropar as 3 policies novas do bucket privado:
   ```sql
   drop policy if exists opportunity_documents_storage_select_psw_admin on storage.objects;
   drop policy if exists opportunity_documents_storage_insert_psw_admin on storage.objects;
   drop policy if exists opportunity_documents_storage_delete_psw_admin on storage.objects;
   ```
2. Reaplicar `supabase/migrations/0029_tenant_admin_invites.sql` NA ÍNTEGRA (restaura as 3 policies de `invited_emails` com o predicado antigo — a de INSERT fica temporariamente SEM a barreira, corrigido no passo 5).
3. Reaplicar `supabase/migrations/0033_tenant_branding.sql` NA ÍNTEGRA (restaura `tenants_update_own_admin` e as 3 policies de Storage do bucket de branding).
4. Reaplicar `supabase/migrations/0038_audit_log.sql` NA ÍNTEGRA (restaura `audit_log_select`).
5. **POR ÚLTIMO** — reaplicar SOMENTE o BLOCO 6b de `supabase/migrations/0041_psw_staff_child_access.sql` (a recriação de `invited_emails_insert_tenant_admin` com `role not in ('platform_admin', 'psw_staff')`), fechando a janela aberta no passo 2. **Nunca pular. Nunca executar antes do passo 2.**
6. `opportunity_assignees_insert/_update/_delete` (Bloco A da `0047`) não têm arquivo de origem único para reaplicar — reemitir manualmente com o texto ANOTADO na seção "ANTES DE APLICAR" (A1).

---

## Passo F — Revogar a concessão de teste (rodar ao final, depois de todas as verificações)

**O QUE TOCA:** apaga a linha de `psw_tenant_admins` criada no Passo (i) da DECISIVA #3. Nenhuma outra tabela é tocada aqui — todos os outros testes de escrita já foram desfeitos por `rollback`.

```sql
delete from psw_tenant_admins
where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6'
  and tenant_id  = '11111111-1111-1111-1111-111111111111';
```

Se a concessão já existisse ANTES deste handoff (por um teste de wave anterior), **não a revogue** — verifique com `select granted_at from psw_tenant_admins where profile_id = '8029d05c-1b7a-47aa-beea-2d11568b2ef6' and tenant_id = '11111111-1111-1111-1111-111111111111';` antes de decidir; se `granted_at` for muito anterior a hoje, é provável que seja de uma wave anterior — registre a dúvida em vez de apagar às cegas.

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, os planos `18-06` em diante estão BLOQUEADOS** — a camada de servidor (`isTenantAdminOf`/`resolveAdminTenantId`, plano `18-06`) pressupõe que a RLS já concede o que GRANT-04 promete.

---

> **Fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration — nem por comando de CLI que faça auto-apply de migration, nem via MCP. Após aplicar no SQL Editor (incluindo a segunda execução de idempotência), rodar as 3 verificações DECISIVAS + as complementares, e revogar a concessão de teste (Passo F), **cole o resultado** para fechar este checkpoint.

**Resume-signal:** digite "aplicada" (colando o resultado das 10 verificações, incluindo os números da seção "ANTES DE APLICAR") ou descreva a divergência encontrada.

*Handoff gerado em 2026-08-07 (Phase 18 / Plan 18-05).*
