# Handoff — Apply manual da migration `0037_opportunity_tasks.sql`

**Phase 16 · Plan 16-01 · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comandos de auto-apply do CLI) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0037_opportunity_tasks.sql`](../../../supabase/migrations/0037_opportunity_tasks.sql)
**Pré-requisito:** migrations `0001`..`0036` já aplicadas no projeto — em especial `0001` (`current_tenant_id`, `set_updated_at`), `0015` (`current_user_role`), `0021` (`is_platform_admin`), `0032` (padrão de trigger de coerência de tenant, referência de forma).

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0037_opportunity_tasks.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Esta migration cria o enum, a tabela, os 2 triggers de guarda, o trigger de `updated_at`, os 4 índices e as 4 policies de RLS em sequência. Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

---

## Passo a passo

1. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
2. Abrir `supabase/migrations/0037_opportunity_tasks.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
3. Clicar **Run** (Cmd/Ctrl+Enter).
4. Confirmar o resultado: **`Success. No rows returned`**.

---

## Prova de idempotência (obrigatória) — rodar o arquivo uma SEGUNDA vez

Depois do passo 4, **cole o MESMO conteúdo do arquivo novamente** (uma segunda vez, sem alterar nada) e clique **Run** de novo.

**Esperado:** a segunda execução também termina com **`Success. No rows returned`**, sem nenhum erro de objeto duplicado (`already exists`/`duplicate object`).

Isso funciona porque cada objeto criado tem um guard: `do $$ ... if not exists ... $$` no enum, `create table if not exists`, `create index if not exists`, `create or replace function` nas duas funções de trigger, e `drop policy if exists` / `drop trigger if exists` antes de cada `create policy` / `create trigger`. Rodar duas vezes não duplica nada — apenas recria as funções/triggers/policies de forma idêntica.

---

## Verificação pós-apply (cole estas queries no mesmo SQL Editor)

```sql
-- 1. Colunas: esperado 14, e NENHUMA de span/percentual agregado (D-02)
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'opportunity_tasks'
order by ordinal_position;
-- esperado: 14 linhas — id, opportunity_id, tenant_id, parent_task_id, title,
-- description, status, start_date, due_date, assignee_id, blocked_reason,
-- created_by, created_at, updated_at. Nenhuma coluna chamada progress/
-- computed_start/computed_due ou similar.

-- 2. Enum task_status: 4 valores, nesta ordem
select e.enumlabel, e.enumsortorder
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'task_status'
order by e.enumsortorder;
-- esperado: backlog, em_andamento, bloqueio, finalizado (nesta ordem)

-- 3. RLS habilitada
select relrowsecurity from pg_class where relname = 'opportunity_tasks';
-- esperado: true

-- 4. 4 policies, com o gate correto em cada uma
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'opportunity_tasks'
order by policyname;
-- esperado: 4 linhas (opportunity_tasks_select/insert/update/delete).
-- insert/update/delete citam current_user_role() <> 'viewer' (D-11);
-- select cita is_platform_admin() (D-12).

-- 5. 3 triggers
select tgname from pg_trigger
where tgrelid = 'opportunity_tasks'::regclass and not tgisinternal
order by tgname;
-- esperado: opportunity_tasks_depth_guard, opportunity_tasks_set_updated_at,
-- opportunity_tasks_tenant_guard

-- 6. Smoke test do guard de profundidade (D-01/TASK-02) — usar uma
--    opportunity_id e tenant_id reais que já existam no seu banco.
-- 6a. Tarefa raiz + subtarefa (OK)
insert into opportunity_tasks (opportunity_id, tenant_id, title)
values ('<opportunity_id_real>', '<tenant_id_real>', 'Smoke raiz')
returning id; -- anote como :raiz_id
insert into opportunity_tasks (opportunity_id, tenant_id, title, parent_task_id)
values ('<opportunity_id_real>', '<tenant_id_real>', 'Smoke subtarefa', '<raiz_id>')
returning id; -- anote como :sub_id
-- 6b. Tentar um 3º nível (deve FALHAR com "limite de 2 níveis")
insert into opportunity_tasks (opportunity_id, tenant_id, title, parent_task_id)
values ('<opportunity_id_real>', '<tenant_id_real>', 'Smoke neto', '<sub_id>');
-- esperado: ERRO "Uma subtarefa não pode ser filha de outra subtarefa (limite de 2 níveis)."
-- 6c. Tentar dar pai à tarefa raiz (que já tem filha) via UPDATE (deve FALHAR)
update opportunity_tasks set parent_task_id = '<sub_id>' where id = '<raiz_id>';
-- esperado: ERRO "Esta tarefa já tem subtarefas — não pode virar subtarefa de outra (limite de 2 níveis)."
-- Limpar:
delete from opportunity_tasks where id in ('<raiz_id>', '<sub_id>');

-- 7. Smoke test do guard de coerência de tenant (D-04/TASK-03) — usar um
--    profile_id de OUTRO tenant (diferente do tenant_id/opportunity_id usados).
insert into opportunity_tasks (opportunity_id, tenant_id, title, assignee_id)
values ('<opportunity_id_real>', '<tenant_id_real>', 'Smoke assignee cruzado', '<profile_id_de_outro_tenant>');
-- esperado: ERRO "Responsável de outra empresa não pode ser atribuído a esta tarefa."
-- (não deveria ter inserido nada — nada para limpar)

-- 8. Smoke test do CHECK de bloqueio (D-03)
insert into opportunity_tasks (opportunity_id, tenant_id, title, status)
values ('<opportunity_id_real>', '<tenant_id_real>', 'Smoke bloqueio sem motivo', 'bloqueio');
-- esperado: ERRO de violação de "opportunity_tasks_blocked_reason_chk"
-- (não deveria ter inserido nada — nada para limpar)
```

Se qualquer resultado divergir do esperado, **não prossiga** — copie o erro/divergência e descreva no checkpoint para que a migration seja corrigida antes de qualquer plano seguinte.

---

## Nota sobre tipos TypeScript

`npm run gen:types` está **bloqueado** neste projeto (MCP aponta para o projeto errado, CLI sem privilégio — memória `supabase-type-gen-blocked`). `lib/database.types.ts` já foi editado **à mão** na Task 2 deste plano (entrada `opportunity_tasks` + enum `task_status`) e **não precisa ser regenerado** após o apply.

---

## Rollback (best-effort)

A migration é aditiva (cria objetos novos, não altera tabelas existentes). Para reverter:

```sql
drop table if exists opportunity_tasks cascade;
drop type if exists task_status;
drop function if exists check_task_depth();
drop function if exists check_task_tenant_coherence();
```

Re-rodar a migration inteira depois do rollback recria tudo (é idempotente).

---

## Bloqueio explícito

**Enquanto este apply não for confirmado, todos os planos seguintes desta fase (16-02 em diante) estão bloqueados.** Eles leem e escrevem em `opportunity_tasks`, e nenhum teste de integração `skipIf` consegue passar sem a tabela existir no Cloud.

---

> **Esta é a fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration. Após aplicar no SQL Editor (incluindo a segunda execução de idempotência), **cole o resultado das 8 verificações** para fechar o checkpoint.

*Handoff gerado em 2026-08-05 (Phase 16 / Plan 16-01).*

---

## Resultado do apply (2026-08-05)

**Status: APLICADA — checkpoint fechado.** O PO rodou o arquivo no SQL Editor do Supabase Cloud (incluindo a segunda execução de idempotência) e colou o resultado consolidado das 8 verificações. Todas passaram:

1. **Colunas** — exatamente 14: `id`, `opportunity_id`, `tenant_id`, `parent_task_id`, `title`, `description`, `status`, `start_date`, `due_date`, `assignee_id`, `blocked_reason`, `created_by`, `created_at`, `updated_at`. Nenhuma coluna de span/percentual agregado. ✓ (TASK-11/D-02)
2. **Enum `task_status`** — 4 valores, na ordem `backlog`, `em_andamento`, `bloqueio`, `finalizado`. ✓ (D-03)
3. **RLS habilitada** — `true`. ✓
4. **Policies** — 4 no total; SELECT cita `is_platform_admin()` (D-12); as 3 policies de escrita citam `current_user_role() <> 'viewer'` (D-11). ✓
5. **Triggers** — `opportunity_tasks_depth_guard`, `opportunity_tasks_set_updated_at`, `opportunity_tasks_tenant_guard`. ✓
6. **Guard de profundidade, 3º nível via INSERT** — REJEITADO: "Uma subtarefa não pode ser filha de outra subtarefa (limite de 2 níveis)." ✓ (TASK-02/D-01)
7. **Guard de profundidade, re-parentamento via UPDATE** — REJEITADO com a mesma mensagem de limite de 2 níveis. Nota: o teste do PO bateu no ramo "irmão" do guard (dar como pai uma tarefa que já é subtarefa) em vez do ramo "já tem subtarefas" (dar pai a uma tarefa que já tem filhas) — ambos os ramos existem na função `check_task_depth()`, e o caminho de UPDATE está coberto de qualquer forma. D-01 se sustenta. ✓
8. **Coerência de tenant** — assignee de outra empresa REJEITADO: "Responsável de outra empresa não pode ser atribuído a esta tarefa." ✓ (TASK-03/D-04)
9. **CHECK de bloqueio** — REJEITADO por violar `opportunity_tasks_blocked_reason_chk`. ✓ (D-03)
10. **Limpeza do smoke-test** — ok, nenhum registro de teste remanescente. ✓

A idempotência foi exercida pelo PO conforme instruído (arquivo rodado duas vezes, segunda execução sem erro de objeto duplicado).

**Os planos 16-02 em diante estão destravados.**
