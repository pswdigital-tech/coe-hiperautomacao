# Handoff — Apply manual da migration `0013_seed_unidasul_opportunities.sql`

**Phase 15 · Plan 15-01 · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, **apply manual no SQL Editor** — sem comandos de auto-apply do CLI) — padrão do projeto.
**Arquivo:** [`supabase/migrations/0013_seed_unidasul_opportunities.sql`](../../../supabase/migrations/0013_seed_unidasul_opportunities.sql)
**Pré-requisito:** migrations `0001`..`0012` já aplicadas no projeto (schema v0.2 completo: enums `frequency_bucket`/`fte_bucket`, colunas `criterios`/`beneficios`/`fte_horas`/`fonte`, `rpa_score` GENERATED, view `opportunities_with_score`, triggers `seq_id` + `handle_new_user`).

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0013_seed_unidasul_opportunities.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Esta migration cria o tenant + admin (Blocos 1-2), valida pré-requisitos (Bloco 3) e insere as 64 oportunidades (Bloco 4). Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

**Idempotência (D-06):** re-rodar a migration inteira é **seguro**. O INSERT das 64 é guardado por contagem do tenant — se a Unidasul já tem oportunidades, o bloco emite `NOTICE: Unidasul já tem oportunidades — pulando insert (idempotência D-06).` em vez de duplicar. O tenant e o admin usam `on conflict` / `if not exists`. (O `seq_id` é atribuído pelo trigger por tenant, sem chave natural, então `ON CONFLICT` não protegeria contra duplicação — o guard por count é o mecanismo correto.)

---

## Passo a passo

1. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
2. Abrir `supabase/migrations/0013_seed_unidasul_opportunities.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
3. Clicar **Run** (Cmd/Ctrl+Enter).
4. Confirmar o resultado: **`Success. No rows returned`** (ou, se a Unidasul já tinha opps, a `NOTICE` de skip da idempotência — também sucesso).

---

## Verificação pós-apply (cole estas queries no mesmo SQL Editor)

```sql
-- SC1: tenant Unidasul existe
select id, name, slug from tenants where slug = 'unidasul';
-- esperado: 1 linha (id 55551da5-0000-0000-0000-000000000001, name 'Unidasul')

-- SC1: admin Unidasul existe, email confirmado, role tenant_admin
select u.email, u.email_confirmed_at, p.tenant_id, p.role
  from auth.users u
  left join profiles p on p.id = u.id
  where u.email = 'admin.unidasul@pswdigital.com.br';
-- esperado: 1 linha, email_confirmed_at não-nulo, tenant_id = 55551da5-...,
--           role = 'tenant_admin'

-- SC1: 64 opps associadas ao tenant Unidasul
select count(*) from opportunities o
  join tenants t on t.id = o.tenant_id
  where t.slug = 'unidasul';
-- esperado: 64

-- SC1: created_by das 64 = admin Unidasul
select count(*) from opportunities o
  join tenants t on t.id = o.tenant_id
  where t.slug = 'unidasul'
    and o.created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
-- esperado: 64

-- SC2: campos novos preenchidos (fonte/criterios/beneficios/fte_horas)
select count(*) from opportunities o
  join tenants t on t.id = o.tenant_id
  where t.slug = 'unidasul'
    and (fonte <> 'Workshop I' or criterios is null or beneficios is null or fte_horas is null);
-- esperado: 0

-- SC2: score + priority_level computam na view (nunca persistidos)
select count(*) from opportunities_with_score s
  join tenants t on t.id = s.tenant_id
  where t.slug = 'unidasul'
    and (s.score is null or s.priority_level is null);
-- esperado: 0

-- SC2: rpa_score GENERATED computa (0–6, nunca null para as 64)
select count(*) from opportunities o
  join tenants t on t.id = o.tenant_id
  where t.slug = 'unidasul' and o.rpa_score is null;
-- esperado: 0

-- Smoke: distribuição de priority_level das 64 (alta>=70 / media 40-69 / baixa<40)
select priority_level, count(*) from opportunities_with_score s
  join tenants t on t.id = s.tenant_id
  where t.slug = 'unidasul'
  group by 1
  order by 1;
-- esperado: soma das contagens = 64

-- Smoke: score da 1ª opp (seq_id menor) — paridade validada no planejamento = 100
select o.seq_id, s.score, s.priority_level, o.rpa_score
  from opportunities_with_score s
  join opportunities o on o.id = s.id
  join tenants t on t.id = s.tenant_id
  where t.slug = 'unidasul'
  order by o.seq_id
  limit 1;
-- esperado: score 100 para a opp "Ja automatize meus processos" (Moises / TI)
```

Se qualquer valor divergir do esperado, **não rode `npm run gen:types`** — copie o erro/divergência e descreva no checkpoint.

---

## (Opcional) Regenerar tipos TypeScript

Esta migration **não muda o schema** — apenas insere dados (as colunas `criterios`/`beneficios`/`fte_horas`/`fonte`/`rpa_score` já existem desde a 0011). Portanto `npm run gen:types` provavelmente é **no-op** e **não é obrigatório**. Rodar só se quiser confirmar que os tipos seguem inalterados:

```bash
npm run gen:types
```

---

## (Opcional) Validar antes em branch

Para de-riscar o apply, é possível testar primeiro numa **branch do Supabase** (Dashboard → Branches, ou MCP `create_branch` → rodar a migration → as queries de verificação → `delete_branch`). A branch clona schema + migrations; as 64 só aparecem após rodar a 0013 lá.

---

## Rollback (best-effort)

A migration é **aditiva** (não altera schema nem dados de outros tenants). Para reverter o seed da Unidasul:

```sql
-- 1. remover as 64 opps da Unidasul (cascade lida com opportunity_phases/risks)
delete from opportunities where tenant_id = '55551da5-0000-0000-0000-000000000001'::uuid;

-- 2. (opcional) remover admin + identity + profile + tenant
delete from auth.identities where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
delete from profiles      where id      = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
delete from auth.users    where id      = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
delete from tenants       where id      = '55551da5-0000-0000-0000-000000000001'::uuid;
```

> Re-rodar a migration inteira re-semeia tudo (idempotente). Após o passo 1, o guard por count volta a 0 → o próximo apply re-insere as 64.

---

## PII (nota de segurança — T-15-02, decisão D-05)

A `0013` carrega **nomes e e-mails reais** dos solicitantes do Workshop I (dado do cliente piloto, isolado por RLS no runtime). **Não exportar/publicar** o arquivo fora do repo/projeto Supabase. Se surgir ambiente de demo público, revisitar anonimização (deferido em `15-CONTEXT.md`).

## Senha do admin (nota — T-15-04, decisão D-04)

O admin Unidasul usa a senha de seed conhecida `0123456789` (espelha a convenção do admin FGCoop do 0002). Rotação é tarefa de pré-produção, fora do escopo deste seed.

---

> **Esta é a fronteira humana write-only (docs/PROJETO.md):** o agente NÃO aplica a migration. Após aplicar no SQL Editor, **cole o resultado das queries de verificação** para fechar o checkpoint.

*Handoff gerado em 2026-06-05 (Phase 15 / Plan 15-01).*
