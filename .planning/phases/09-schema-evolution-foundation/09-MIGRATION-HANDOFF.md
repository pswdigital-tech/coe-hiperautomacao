# Handoff — Apply manual da migration `0011_schema_evolution_v02.sql`

**Phase 9 · Plan 09-01 · [BLOCKING] checkpoint:human-action**
**Modo:** write-only (Supabase Cloud, sem `supabase db push`) — padrão v0.1.
**Arquivo:** [`supabase/migrations/0011_schema_evolution_v02.sql`](../../../supabase/migrations/0011_schema_evolution_v02.sql)
**Pré-requisito:** migrations `0001`..`0010` já aplicadas no projeto.

---

## ⚠️ ATOMICIDADE — leia antes

**Cole o conteúdo INTEIRO de `0011_schema_evolution_v02.sql` DE UMA VEZ no SQL Editor — NÃO execute bloco a bloco.**

O SQL Editor do Supabase envolve um paste multi-statement em **uma única transação** por padrão. Como esta migration **derruba e recria** a view `opportunities_with_score` (a view é dropada no passo 3 e só recriada no passo 12), rodar bloco a bloco deixaria a view órfã se você parasse no meio. Colando tudo de uma vez: ou **tudo** commita, ou em caso de erro faz **rollback atômico** e nada muda.

**Nota de recuperação:** se por engano a view `opportunities_with_score` sumir (apply parcial), basta **re-rodar a migration inteira de uma vez** — ela é idempotente e o último bloco recria a view.

---

## Passo a passo

1. Abrir o **Supabase Dashboard** do projeto → **SQL Editor** → **New query**.
2. Abrir `supabase/migrations/0011_schema_evolution_v02.sql`, **selecionar tudo** (Cmd/Ctrl+A) e **colar** no editor.
3. Clicar **Run** (Cmd/Ctrl+Enter).
4. Confirmar o resultado: **`Success. No rows returned`**.

---

## Verificação pós-apply (cole estas queries no mesmo SQL Editor)

```sql
-- 1. Backfill sem perda: nenhuma formulario ficou sem criterios
select count(*) from opportunities where source='formulario' and criterios is null;
-- esperado: 0

-- 2. Backfill resiliente: nenhum criterio fora do domínio (seq_id 18 defaultado p/ 'nao')
select count(*) from opportunities
where source='formulario' and not (criterios->>'padronizacaoDocs' in ('sim','nao','parcial'));
-- esperado: 0

-- 3. tempo derivado de frequencia: nenhuma formulario com tempo nulo (personas excluídas)
select count(*) from opportunities where source='formulario' and tempo is null;
-- esperado: 0

-- 4. fonte backfilled nas 29 legadas
select count(*) from opportunities where fonte='FGCoop';
-- esperado: 29

-- 5. RLS + 4 policies em opportunity_risks
select count(*) from pg_policies where tablename='opportunity_risks';
-- esperado: 4
select c.relrowsecurity from pg_class c where c.relname='opportunity_risks';
-- esperado: true

-- 6. tempo agora é frequency_bucket
select atttypid::regtype::text from pg_attribute
where attrelid='opportunities'::regclass and attname='tempo';
-- esperado: frequency_bucket

-- 7. smoke do score (5 fatores) — bate _giba:483-490
-- (casts explícitos: literais 'unknown' não resolvem a função sem tipar os enums)
select opportunity_score('alto'::effort_level,'baixo'::complexity_level,'diario'::frequency_bucket,5::smallint,'muito_alto'::fte_bucket);   -- esperado: 100  (20+20+20+20+20)
select opportunity_score('alto'::effort_level,'alto'::complexity_level,'anual'::frequency_bucket,1::smallint,'muito_baixo'::fte_bucket);    -- esperado: 36   (20+6+2+4+4)

-- 8. smoke do rpa_score GENERATED (deve refletir os criterios)
select rpa_score from opportunities where source='formulario' and rpa_score is not null limit 3;
-- esperado: valores 0–6 (e null para personas)

-- 9. smoke do priority GENERATED (matriz) — sem inserir nada, só conferir a expressão na 1ª inserção real depois
```

Se qualquer valor divergir do esperado, **não rode `gen:types`** — copie o erro/divergência e descreva no checkpoint.

---

## Regenerar tipos TypeScript

Depois do apply bem-sucedido:

```bash
npm run gen:types
```

Isso regenera `lib/database.types.ts` com as novas colunas (`fte_horas`, `rpa_score`, `criterios`, `beneficios`, `fte`, `tipo_processo`, `beneficio_qualitativo`, `fonte`) e a tabela `opportunity_risks` — consumidos pela **Phase 10** e pelos testes de integração do **Plan 09-03** (que saem do skip mode quando `.env.test` apontar para um Cloud de teste com 0011 aplicada).

---

## (Opcional) Validar antes em branch

Se quiser de-riscar o apply em produção, é possível testar a migration primeiro numa **branch do Supabase** (cópia isolada via Dashboard → Branches, ou MCP `create_branch` → `apply_migration` → rodar as queries de verificação → `delete_branch`). A branch clona o schema/migrations; os counts de backfill só batem se a branch tiver os dados legados.

---

## Rollback (best-effort)

Se precisar reverter (a migration NÃO é destrutiva de dados de oportunidade, mas troca o tipo de `tempo` e a assinatura de `opportunity_score`):

```sql
-- 1. tabela nova + view
drop view if exists opportunities_with_score;
drop table if exists opportunity_risks;

-- 2. colunas novas em opportunities (rpa_score é GENERATED — drop normal)
alter table opportunities
  drop column if exists rpa_score, drop column if exists fte,
  drop column if exists beneficios, drop column if exists criterios,
  drop column if exists beneficio_qualitativo, drop column if exists tipo_processo,
  drop column if exists fonte, drop column if exists fte_horas;
alter table opportunities drop constraint if exists opportunities_criterios_chk;
alter table opportunities drop constraint if exists opportunities_beneficios_chk;

-- 3. tempo de volta para time_bucket (os valores de frequência viram NULL — duração antiga foi perdida)
alter table opportunities alter column tempo type time_bucket using (null::time_bucket);

-- 4. enums novos
drop type if exists risk_priority; drop type if exists risk_status;
drop type if exists risk_probability; drop type if exists risk_impact; drop type if exists risk_type;
drop type if exists fte_bucket; drop type if exists frequency_bucket;

-- 5. restaurar opportunity_score() de 4 args (copiar de 0001_init.sql §194-209) e recriar a view antiga (0010 §73-83)
```

> ⚠️ Rollback de `tempo` perde a informação de duração original (já tinha sido descartada no apply). Em produção, prefira corrigir via nova migration a reverter.

---

*Handoff gerado em 2026-06-04 (Phase 9 / Plan 09-01).*
