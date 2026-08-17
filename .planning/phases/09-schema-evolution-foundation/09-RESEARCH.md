# Phase 9: Schema Evolution + Score/Risk/Contract Foundation — Research

**Researched:** 2026-06-04
**Phase type:** Supabase/Postgres SQL migration (write-only mode) + docs. No app code, no frontend.
**Consumes:** [09-CONTEXT.md](09-CONTEXT.md) (17 locked decisions). **Feeds:** gsd-planner.

> Migration alvo: **`supabase/migrations/0011_*.sql`** (próximo número após 0010). Write-only mode: arquivo `.sql` + handoff doc para apply manual no Supabase Cloud SQL Editor (NÃO `supabase db push`). Idempotente (`do $$ if not exists`, `add column if not exists`), espelhando 0010.

---

## 0. Key Findings (TL;DR para o planner)

1. **A regra do rpaScore foi RESOLVIDA por engenharia reversa — reproduz 64/64 linhas do `_giba` exatamente.** Ver §1. É expressão imutável sobre `criterios` jsonb → válida em coluna `GENERATED ... STORED`.
2. **GENERATED column sobre jsonb funciona** (Postgres 12+) desde que a expressão seja IMMUTABLE — `criterios->>'k'` + comparação + cast são imutáveis. Mesma técnica serve para `opportunity_risks.priority` (CASE 4×4 sobre dois enums). Ver §2.
3. **`tempo` muda de tipo** (`time_bucket` → novo enum de frequência). A coluna é usada pela view `opportunities_with_score` e pela função `opportunity_score()`, então a ordem obrigatória é: **DROP view → (recriar função) → criar enum → ALTER COLUMN TYPE USING → recriar view**. Ver §3.
4. **Backfill de critérios e benefícios tem assimetria de chaves:** critérios antigos têm 10 chaves (snake_case) → 8 novas (camelCase), 2 descartadas; benefícios antigos têm só **6** chaves → 8 novas, 2 ausentes no legado (`compliance`, `objetivosEstrategicos`). Valores antigos `'SIM'/'NAO'/'PARCIAL'`. Ver §4.
5. **`prioridade` no `_giba` é um objeto, mas no nosso banco os fatores de score são COLUNAS FLAT** (`esforco`, `complexidade`, `tempo`, `objetivo`). O novo `fte` é uma **coluna flat nova** (enum `fte_bucket`), não jsonb. A função `opportunity_score()` ganha um 5º parâmetro. Ver §6.
6. **Colunas legadas `risco` e `observacao` (migration 0009)** existem como texto livre e se sobrepõem conceitualmente à nova tabela `opportunity_risks`. Decisão do planner: manter (nota livre) vs deprecar. Não bloqueia. Ver §10.

---

## 1. rpaScore — regra derivada (SCORE-03, D-10) ✅ RESOLVIDO

O `_giba` NÃO contém fórmula; `rpaScore` aparece só como dado pré-computado em `const DATA=[...]` (§439). Extraí os 64 pares `{criterios, rpaScore}` e inferi a regra. **Validação: reproduz 64/64 valores exatamente (zero erro).**

**Regra (0–6):** soma de 6 indicadores; 2 dos 8 critérios são IGNORADOS.

| Critério | Conta? | Resposta "boa para RPA" (+1) |
|----------|--------|------------------------------|
| `totalmenteManual` | ✅ | `sim` **ou** `parcial` (manual/parcialmente manual = automatizável) |
| `regrasClaras` | ✅ | `sim` |
| `decisaoHumana` | ✅ | `nao` (sem decisão humana = bom) |
| `padronizacaoDocs` | ✅ | `sim` |
| `validacaoDados` | ✅ | `sim` |
| `schedulable` | ✅ | `sim` |
| `causaReclamacoes` | ❌ | — (não afeta o score) |
| `temDocumentacao` | ❌ | — (não afeta o score) |

> Nota: `totalmenteManual` é o ÚNICO critério onde `PARCIAL` aparece nos dados, e conta como crédito cheio (+1). Os outros 5 só têm `sim`/`nao`.

**Expressão SQL (valores canônicos lowercase `sim`/`nao`/`parcial` — D-08), IMMUTABLE, pronta p/ GENERATED column:**

```sql
(
    (criterios->>'totalmenteManual' in ('sim','parcial'))::int
  + (criterios->>'regrasClaras'     = 'sim')::int
  + (criterios->>'decisaoHumana'    = 'nao')::int
  + (criterios->>'padronizacaoDocs' = 'sim')::int
  + (criterios->>'validacaoDados'   = 'sim')::int
  + (criterios->>'schedulable'      = 'sim')::int
)::smallint
```

Quando `criterios` é NULL (linhas persona) o resultado é `0` (todos os `->>'k'` viram NULL → comparações NULL → `::int` de NULL... **cuidado:** `(NULL)::int` é NULL, não 0). **Landmine:** para linhas com `criterios` NULL a soma vira NULL. Decidir: ou `coalesce(...,0)` por termo, ou a GENERATED column inteira fica NULL quando `criterios is null` (aceitável — persona não tem rpaScore). Recomendo `coalesce` em cada termo OU `case when criterios is null then null else (...) end`. O planner escolhe; documentar no plano.

---

## 2. GENERATED columns sobre jsonb + IMMUTABLE (D-09, D-11, D-14)

**Confirmado (Postgres 12+):** `GENERATED ALWAYS AS (<expr>) STORED` aceita qualquer expressão **IMMUTABLE**. `jsonb ->> text`, comparações, `::int`/`::smallint` e `CASE` são todos imutáveis. Restrições:
- A expressão **não pode** referenciar outra GENERATED column, nem subquery, nem função VOLATILE/STABLE.
- Se usar função própria, ela **deve** ser declarada `IMMUTABLE`. Para evitar dependência frágil, **prefira CASE/expressão inline** dentro do `GENERATED AS` (recomendado para rpa_score e risk.priority).
- Alterar a expressão depois exige `ALTER TABLE ... ALTER COLUMN ... DROP EXPRESSION` + re-add (ou drop/add coluna). Aceitável em write-only mode.

**`rpa_score`:** coluna `smallint GENERATED ALWAYS AS (<expr do §1>) STORED`.

**`opportunity_risks.priority`:** coluna `risk_priority GENERATED ALWAYS AS (<CASE matriz 4×4>) STORED`, lendo as colunas enum `impacto` + `probabilidade` (mesma tabela, não-generated → OK). Matriz de `_giba:1180-1185`:

```
                 Provável     Possível    Improvável   Remota
Alto             Crítica      Crítica     Alta         Alta
Significativo    Crítica      Alta        Média        Média
Moderado         Alta         Média       Média        Baixa
Baixo            Alta         Média       Baixa        Baixa
```

CASE inline (usando rótulos ASCII-lowercase dos enums — ver §7):
```sql
case
  when impacto='alto'          and probabilidade in ('provavel','possivel')              then 'critica'
  when impacto='alto'                                                                     then 'alta'
  when impacto='significativo' and probabilidade='provavel'                               then 'critica'
  when impacto='significativo' and probabilidade='possivel'                               then 'alta'
  when impacto='significativo'                                                            then 'media'
  when impacto='moderado'      and probabilidade='provavel'                               then 'alta'
  when impacto='moderado'      and probabilidade in ('possivel','improvavel')             then 'media'
  when impacto='moderado'                                                                 then 'baixa'
  when impacto='baixo'         and probabilidade='provavel'                               then 'alta'
  when impacto='baixo'         and probabilidade='possivel'                               then 'media'
  when impacto='baixo'                                                                    then 'baixa'
end::risk_priority
```
(O planner deve validar cada célula contra a matriz acima — escrevi a partir dela mas é fácil errar uma célula.)

---

## 3. Migração da coluna `tempo` (MODEL-08, D-05)

`tempo` hoje é `time_bucket` (`pequeno`/`medio`/`grande` = duração). Vira frequência. **Não há cast implícito entre enums** → precisa `USING`. A coluna é referenciada por (a) a view `opportunities_with_score` e (b) a assinatura de `opportunity_score()`. Postgres bloqueia ALTER de coluna usada por view.

**Ordem obrigatória na migration:**
1. `drop view if exists opportunities_with_score;`
2. Criar enum novo: `create type frequency_bucket as enum ('diario','semanal','quinzenal','mensal','anual');` (idempotente via `do $$ if not exists`).
3. `alter table opportunities alter column tempo drop default;` (se houver) e então
   `alter table opportunities alter column tempo type frequency_bucket using (<map de frequencia text → enum>);`
   — como os valores antigos de `tempo` (duração) são DESCARTADOS, o `USING` deriva de `frequencia` (D-01), não de `tempo`:
   ```sql
   using (case lower(translate(frequencia,'áéíóúÁ','aeiouA'))
            when 'diario'    then 'diario'
            when 'semanal'   then 'semanal'
            when 'quinzenal' then 'quinzenal'
            when 'mensal'    then 'mensal'
            when 'anual'     then 'anual'
            else null end::frequency_bucket)
   ```
   (valores de `frequencia` no seed: `Diário/Semanal/Quinzenal/Mensal/Anual` — capitalizados e acentuados; `translate`+`lower` normaliza. Personas têm `frequencia` vazia/'–' → NULL.)
4. Recriar `opportunity_score()` com o novo peso de `tempo` (§6).
5. Recriar a view (§6).
6. **Opcional:** `drop type if exists time_bucket;` só se nenhuma outra coluna o usa (grep confirmou: `tempo` era o único uso). Manter por segurança não custa; o planner decide.

> **Landmine:** se a migration for idempotente/re-aplicável, o `ALTER COLUMN TYPE` falha na 2ª execução (já é `frequency_bucket`). Guardar com `do $$ if (select data_type ...) ... end$$` ou checar `pg_type` da coluna antes. Documentar no plano.

---

## 4. Backfill SQL (MODEL-09, D-01..D-04)

29 linhas: 20 `formulario` (têm `formulario_extras` com `criterios`+`beneficios`, `frequencia`), 9 `persona` (sem critérios, sem frequencia).

### 4a. Critérios → coluna `criterios` jsonb
Chaves antigas (em `formulario_extras->'criterios'`, snake_case, valores `'SIM'/'NAO'/'PARCIAL'`) → novas (camelCase, `'sim'/'nao'/'parcial'`). Mapa confirmado no seed 0003:

| Nova (camelCase) | Antiga (snake_case) |
|---|---|
| causaReclamacoes | causa_reclamacoes |
| totalmenteManual | totalmente_manual |
| regrasClaras | regras_claras |
| decisaoHumana | decisao_humana |
| padronizacaoDocs | padronizacao_docs |
| validacaoDados | validacao_dados |
| schedulable | schedulable |
| temDocumentacao | tem_documentacao |

Descartadas: `processo_uniforme`, `digitacao_manual`. Normalização de valor: `lower()` + `'NAO'→'nao'` (sem acento no legado; o canônico também é sem acento, então `lower('NAO')='nao'` direto). UPDATE só nas linhas `source='formulario' and formulario_extras ? 'criterios'`; personas ficam `criterios = NULL`.

```sql
update opportunities o
set criterios = jsonb_build_object(
  'causaReclamacoes', lower(c->>'causa_reclamacoes'),
  'totalmenteManual', lower(c->>'totalmente_manual'),
  'regrasClaras',     lower(c->>'regras_claras'),
  'decisaoHumana',    lower(c->>'decisao_humana'),
  'padronizacaoDocs', lower(c->>'padronizacao_docs'),
  'validacaoDados',   lower(c->>'validacao_dados'),
  'schedulable',      lower(c->>'schedulable'),
  'temDocumentacao',  lower(c->>'tem_documentacao')
)
from (select id, formulario_extras->'criterios' as c from opportunities) src
where o.id = src.id and src.c is not null;
```
(O planner deve garantir que `criterios` seja preenchido ANTES de a GENERATED `rpa_score` ser adicionada — ou adicionar a coluna GENERATED por último, já que ela recomputa automaticamente. Recomendado: adicionar `criterios` (plain) → backfill → adicionar `rpa_score` GENERATED.)

### 4b. Benefícios → coluna `beneficios` jsonb (assimetria!)
Legado tem só **6** chaves (`reducao_tempo, eliminacao_erros, produtividade, qualidade_dados, reducao_custos, reducao_retrabalho`); modelo novo tem **8** (camelCase + `compliance`, `objetivosEstrategicos`). Backfill mapeia as 6 existentes; as 2 novas ficam **ausentes** no legado. **Implicação para o CHECK (§5):** o CHECK de `beneficios` NÃO pode exigir exatamente 8 chaves, senão o backfill viola; use "subconjunto das chaves permitidas + valores 1–5" OU backfill as 2 ausentes como `null`. Recomendo CHECK por subconjunto.

### 4c. `fonte` e FTE
```sql
update opportunities set fonte = 'FGCoop' where fonte is null;   -- todas as 29 legadas
-- fte_horas e fte: ficam NULL (default). Nada a fazer (D-02).
```

---

## 5. CHECK constraints para jsonb (D-06, D-07, D-08)

**`criterios`** — exatamente as 8 chaves, valores em `('sim','nao','parcial')`; permitir NULL (personas):
```sql
constraint opportunities_criterios_chk check (
  criterios is null or (
    criterios ?& array['causaReclamacoes','totalmenteManual','regrasClaras','decisaoHumana',
                        'padronizacaoDocs','validacaoDados','schedulable','temDocumentacao']
    and (select bool_and(value::text in ('"sim"','"nao"','"parcial"'))
         from jsonb_each(criterios))
  )
)
```
(ou validar via `criterios->>'k' in ('sim','nao','parcial')` por chave — mais verboso mas mais legível. Planner escolhe.)

**`beneficios`** — subconjunto das 8 chaves permitidas, valores int 1–5 (NÃO exigir todas, por causa do legado de 6 chaves — §4b):
```sql
constraint opportunities_beneficios_chk check (
  beneficios is null or (
    (select bool_and(key in ('reducaoTempo','eliminacaoErros','produtividade','qualidadeDados',
                             'reducaoCustos','reducaoRetrabalho','compliance','objetivosEstrategicos')
                     and (value::text)::int between 1 and 5)
     from jsonb_each(beneficios))
  )
)
```

---

## 6. opportunity_score() reescrita (SCORE-01, SCORE-02, D-16)

Hoje: `opportunity_score(p_esforco effort_level, p_complexidade complexity_level, p_tempo time_bucket, p_objetivo smallint)`. Nova assinatura adiciona `p_fte fte_bucket` e troca o tipo de `p_tempo` para `frequency_bucket`. Mapeia `_giba:483-490` **literalmente** (incluindo fallbacks):

| Fator | Pesos (_giba) | Fallback |
|---|---|---|
| esforco (`effort_level`) | baixo:8, medio:14, alto:20 | 14 |
| complexidade (`complexity_level`) | baixo:20, medio:13, alto:6 ⚠️ INVERTIDO (menos complexo pontua mais) | 13 |
| tempo (`frequency_bucket`) | diario:20, semanal:16, quinzenal:12, mensal:8, anual:2 | 16 |
| objetivo (smallint 1–5) | 1:4,2:8,3:12,4:16,5:20 (= objetivo*4) | 12 |
| fte (`fte_bucket`) | muito_baixo:4, baixo:8, medio:12, alto:16, muito_alto:20 | 12 |

```sql
create or replace function opportunity_score(
  p_esforco effort_level, p_complexidade complexity_level,
  p_tempo frequency_bucket, p_objetivo smallint, p_fte fte_bucket
) returns int language sql immutable as $$
  select (
      case p_esforco when 'baixo' then 8 when 'medio' then 14 when 'alto' then 20 else 14 end
    + case p_complexidade when 'baixo' then 20 when 'medio' then 13 when 'alto' then 6 else 13 end
    + case p_tempo when 'diario' then 20 when 'semanal' then 16 when 'quinzenal' then 12
                   when 'mensal' then 8 when 'anual' then 2 else 16 end
    + case coalesce(p_objetivo,3) when 1 then 4 when 2 then 8 when 3 then 12 when 4 then 16 when 5 then 20 else 12 end
    + case p_fte when 'muito_baixo' then 4 when 'baixo' then 8 when 'medio' then 12
                 when 'alto' then 16 when 'muito_alto' then 20 else 12 end
  )::int;
$$;
```
> ⚠️ Difere da fórmula ANTIGA (3 fatores × 25 + objetivo, e complexidade NÃO invertida). É reescrita total, não ajuste. Confirmar que o resultado bate número-a-número com `calcScore` do `_giba` (a P10/SCORE-04 vai testar paridade).

**View** (DROP+CREATE — `o.*` reordena, padrão 0008/0009/0010; manter `security_invoker=true`):
```sql
drop view if exists opportunities_with_score;
create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte) as score,
  case when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 70 then 'alta'
       when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 40 then 'media'
       else 'baixa' end as priority_level
from opportunities o;
grant select on opportunities_with_score to authenticated;
```
> Thresholds `priority_level`: alta ≥70 / media 40–69 / baixa <40 (SCORE-02). Idêntico ao atual.

**Novas colunas de score em `opportunities`:** `fte_horas numeric` (MODEL-01), `fte fte_bucket` (MODEL-07, novo enum `('muito_baixo','baixo','medio','alto','muito_alto')`). Score continua **calculado na view, nunca persistido** (princípio travado).

---

## 7. opportunity_risks — DDL completo (RISK-04, D-12..D-15)

Enums (ASCII-lowercase, label pt-BR na UI — convenção 0001; ver Executor's Discretion no CONTEXT):
```sql
create type risk_type        as enum ('impedimento','risco','oportunidade');
create type risk_impact      as enum ('alto','significativo','moderado','baixo');
create type risk_probability as enum ('provavel','possivel','improvavel','remota');
create type risk_status      as enum ('novo','gerenciado','mitigado','ocorrido');
create type risk_priority    as enum ('critica','alta','media','baixa');
```
Tabela:
```sql
create table opportunity_risks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  descricao         text not null,
  tipo              risk_type not null,
  responsavel       text,                       -- text livre, tenant-agnóstico (D-13)
  impacto           risk_impact not null,
  probabilidade     risk_probability not null,
  status            risk_status not null default 'novo',
  resposta          text,                       -- resposta ao risco
  descricao_impacto text,
  priority          risk_priority generated always as (<CASE matriz §2>) stored,  -- D-14
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index opportunity_risks_tenant_idx       on opportunity_risks(tenant_id);
create index opportunity_risks_opportunity_idx  on opportunity_risks(opportunity_id);
```
RLS (espelha `opportunities` em 0001 — 4 policies + enable):
```sql
alter table opportunity_risks enable row level security;
create policy opportunity_risks_select on opportunity_risks for select using (tenant_id = current_tenant_id());
create policy opportunity_risks_insert on opportunity_risks for insert with check (tenant_id = current_tenant_id());
create policy opportunity_risks_update on opportunity_risks for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy opportunity_risks_delete on opportunity_risks for delete using (tenant_id = current_tenant_id());
```
+ trigger `set_updated_at` (já existe a função genérica em 0001) e grants `to authenticated`. O `Rxxx` de exibição é posicional na UI (P12), não coluna.

---

## 8. Write-only mode + idempotência (padrão v0.1)

- Arquivo: `supabase/migrations/0011_<slug>.sql` + handoff doc `09-MIGRATION-HANDOFF.md` (copy-paste-ready p/ Supabase Cloud SQL Editor). Padrão: `.planning/phases/07.5-hardening-seguranca-mvp/07.5-02-MIGRATION-HANDOFF.md`.
- Headers de transação como 0010: `set session characteristics as transaction read write; set default_transaction_read_only = off; set check_function_bodies = off;`.
- Idempotente: enums via `do $$ if not exists (select 1 from pg_type where typname=...) then create type ...`; colunas via `add column if not exists`; CHECK via `do $$ if not exists (select 1 from pg_constraint where conname=...)`; view via `drop view if exists` + `create view`.
- **[BLOCKING] apply manual** (autonomous: false): a migration NÃO roda via CLI; o usuário aplica no Dashboard. Após apply: `npm run gen:types` para regenerar `lib/database.types.ts` (consumido pela P10). Build/typecheck passam SEM o apply (tipos vêm de config, não do DB vivo) → falso-positivo se não houver gate de apply manual.

---

## 9. Validation Architecture (Nyquist)

A correção da migration é verificável por:
1. **Tenant isolation (RISK-04 SC4):** teste cruzado A≠B em `opportunity_risks` espelhando `tests/security/tenant-isolation.test.ts` (padrão `describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)` + lazy `serviceRoleClient()`). SELECT/UPDATE/DELETE cross-tenant → `[]`; INSERT com tenant_id forjado → erro 42501.
2. **rpaScore parity:** teste que, para um conjunto de `criterios` de exemplo (subset dos 64 do `_giba`), o `rpa_score` GENERATED bate com o valor esperado. Reusa a tabela de §1.
3. **Score parity (prep p/ SCORE-04):** comparar `opportunity_score()` SQL com `calcScore` JS do `_giba` em casos representativos (a verificação formal é P10, mas o caso de teste já pode existir aqui).
4. **Backfill no-data-loss:** após apply, `select count(*) from opportunities where source='formulario' and criterios is null` = 0 (todas as 20 form preenchidas) e `select count(*) ... where fonte='FGCoop'` = 29.
5. **priority matrix:** teste que `priority` GENERATED bate com a matriz `_giba:1180-1185` para as 16 combinações impacto×probabilidade.

> Em write-only mode os testes de integração ficam em **skip mode** até `.env.test` apontar p/ um projeto Supabase Cloud de teste com 0001..0011 aplicadas (padrão herdado de 7.5). Os testes de regra (rpaScore/score/matriz) podem ser puros (sem DB) — rodam sempre.

---

## 10. Landmines & decisões abertas p/ o planner

- **`criterios` NULL → rpa_score NULL** (§1): tratar com `coalesce` por termo ou `case when criterios is null`. Persona sem rpaScore é aceitável.
- **ALTER COLUMN TYPE não-idempotente** (§3): guardar contra re-aplicação.
- **CHECK de `beneficios` por subconjunto, não exato** (§4b/§5): senão o legado de 6 chaves viola.
- **Ordem GENERATED vs backfill** (§4a): adicionar `criterios` plain → backfill → adicionar `rpa_score` GENERATED (ou GENERATED por último — recomputa sozinha).
- **Colunas legadas `risco`/`observacao` (0009):** sobrepõem a nova tabela `opportunity_risks`. Manter como nota livre vs deprecar — decisão do planner; **não bloqueia** esta fase (CONTEXT `<deferred>`).
- **Matriz priority CASE** (§2): cada uma das 16 células deve ser conferida contra `_giba:1180-1185` — fácil errar uma.
- **`drop type time_bucket`** só se nada mais o usa (grep confirmou que `tempo` era único uso, mas confirmar de novo no momento do plano).
- **CONTRACT-01/02 (D-17):** editar `docs/PROJETO.md` (fórmula score §3 → nova; modelo de dados; wizard) e marcar `fgcoop-coe-v2.html` deprecated (banner no topo + nota). É tarefa de docs, não SQL — wave separada.

---

## RESEARCH COMPLETE
