# Handoff — Apply manual da migration `0039_psw_staff_role.sql`

**Phase 17 · Plan 17-01 · [BLOCKING] checkpoint:human-action — APLICADA**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comandos de auto-apply do CLI) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0039_psw_staff_role.sql`](../../../supabase/migrations/0039_psw_staff_role.sql)
**Pré-requisito:** migrations `0001`..`0037` já aplicadas no projeto — em especial `0001` (`current_tenant_id`), `0015` (`current_user_role`), `0020`/`0021` (par enum isolado → RLS, o precedente direto deste procedimento). A `0038` é opcional e não é pré-requisito de nada aqui.

---

## ⚠️ ATOMICIDADE — leia antes de repetir o procedimento em qualquer outro ambiente

**Cole o conteúdo INTEIRO de `0039_psw_staff_role.sql` DE UMA VEZ no SQL Editor — NÃO cole junto com a `0040` (nem qualquer outra migration) no mesmo Run.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão, e o Postgres rejeita o uso de um valor de enum recém-adicionado antes do commit daquela transação — o erro que aparece é `unsafe use of new value "psw_staff" of enum type tenant_role`. É o mesmo procedimento do par `0020` → `0021`. Esta migration contém **um único** comando DDL (`alter type ... add value if not exists`) e nada mais — nenhuma policy, função ou constraint que o referencie.

---

## Passo a passo (como foi executado)

1. Supabase Dashboard do projeto → SQL Editor → New query.
2. Conteúdo INTEIRO de `supabase/migrations/0039_psw_staff_role.sql` colado e rodado **sozinho**, sem nenhuma outra migration no mesmo Run.
3. Resultado: **sucesso**.

## Prova de idempotência

O arquivo usa `alter type tenant_role add value if not exists 'psw_staff'` — rodar o mesmo conteúdo uma segunda vez termina sem erro (nenhum "already exists"/"duplicate object"), porque o `if not exists` torna o comando um no-op na segunda execução.

---

## Queries de verificação pós-apply

Estas são as queries de referência para qualquer reaplicação futura (outro ambiente, disaster recovery) — coladas aqui para registro, mesmo que o resultado detalhado desta aplicação em produção não tenha sido colado de volta neste documento (ver seção "Status do apply" abaixo).

```sql
-- 1. tenant_role deve ter 5 valores, com psw_staff por último
select e.enumlabel, e.enumsortorder
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'tenant_role'
order by e.enumsortorder;
-- esperado: member, tenant_admin, viewer, platform_admin, psw_staff

-- 2. Nenhum CHECK adicional restringindo profiles.role
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'profiles'::regclass
  and pg_get_constraintdef(oid) ilike '%role%';
-- esperado: zero linhas (ou nenhuma citando os valores do enum) — profiles.role
-- não tem CHECK extra além do próprio tipo do enum

-- 3. Smoke de promoção e login (SC-1/ACCESS-01) — usar uma conta de teste da PSW
update profiles set role = 'psw_staff' where email = '<email_de_teste_psw>';
-- esperado: UPDATE 1
-- confirmar login sem erro no app com essa conta

-- 4. Contagem de profiles promovidos — deve refletir exatamente o esperado
select count(*) from profiles where role::text = 'psw_staff';
```

---

## Nota sobre tipos TypeScript

`npm run gen:types` está **bloqueado** neste projeto (MCP aponta para o projeto errado, CLI sem privilégio — memória `supabase-type-gen-blocked`). `lib/database.types.ts` já foi editado **à mão** na Task 2 deste plano (`TenantRole` com o quinto valor `psw_staff`) e **não precisa ser regenerado** após o apply.

---

## Rollback

Não existe `ALTER TYPE ... DROP VALUE` no Postgres. `add value` é **irreversível**: uma vez aplicado, o valor `psw_staff` permanece no enum para sempre. O caminho de contenção, caso seja necessário, não é rollback — é **não promover ninguém** ao papel novo: enquanto nenhum `profile` carrega `psw_staff` e nenhuma policy o referencia, o valor é inerte e não muda o comportamento de nada no sistema.

---

## Status do apply (2026-08-06)

**APLICADA.** O PO rodou a migration `0039_psw_staff_role.sql` no SQL Editor do Supabase Cloud e confirmou sucesso ("acabei de aplicar, pode seguir") imediatamente após o `checkpoint:decision` da Task 3 ter sido resolvido com a opção `aplicar-agora`.

O enum `tenant_role` do banco de produção agora tem o valor `psw_staff`. Os resultados detalhados das 4 queries de verificação acima (contagem exata de valores do enum, ausência de CHECK adicional, smoke de promoção + login, contagem de profiles promovidos) **não foram colados de volta neste documento** — a confirmação recebida foi uma confirmação geral de sucesso do apply, não o output query-a-query. Isto é registrado como item de acompanhamento no SUMMARY do plano (`17-01-SUMMARY.md`), não como bloqueio: o PO confirmou explicitamente que o apply foi bem-sucedido e autorizou a continuação da fase.

**Os planos 17-02 em diante estão destravados.**

*Handoff gerado em 2026-08-06 (Phase 17 / Plan 17-01), redigido após confirmação do apply pelo PO.*
