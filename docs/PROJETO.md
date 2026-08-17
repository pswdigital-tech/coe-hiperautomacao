# PROJETO.md — CoE Hiperautomação

Convenções e regras de engenharia deste projeto (leitura obrigatória para quem — pessoa ou agente — for mexer no código). Para a visão de produto, requisitos e decisões consulte sempre [.planning/PROJECT.md](.planning/PROJECT.md). Para o estado atual da execução, [.planning/STATE.md](.planning/STATE.md).

## O que estamos construindo

SaaS multi-tenant de gestão de pipeline de automações. O cliente loga e enxerga **apenas** as demandas da sua empresa. **Fonte da verdade visual + modelo de dados (v0.2):** [_giba_wsi-dashboard.html](_giba_wsi-dashboard.html) — score de 5 fatores, FTE, RPA Fit, registro de riscos e view de Relatório. O mockup antigo [fgcoop-coe-v2.html](fgcoop-coe-v2.html) está **deprecated** (era o contrato do v0.1). Stack-alvo: Next.js 16 + Supabase + Vercel.

## Workflow (Get Shit Done)

O time usa o framework GSD (pasta [get-shit-done/](get-shit-done/)). Convenções:

- Todo estado do projeto vive em `.planning/` — `PROJECT.md`, `STATE.md` e (futuramente) `ROADMAP.md`, `milestones/v0.1/phases/...`.
- Antes de começar trabalho, leia `.planning/STATE.md` para saber em que fase está.
- Para criar um novo plano de fase use `/gsd-plan-phase`. Para executar use `/gsd-execute-phase`.
- Não invente artefatos fora de `.planning/` — se precisar de um doc novo, siga o template em `get-shit-done/sdk/prompts/templates/`.

## Idioma

- **UI e textos visíveis ao usuário final**: pt-BR (cliente brasileiro).
- **Código** (variáveis, tabelas, colunas, nomes de função): inglês. Ex: `opportunity`, `tenant_id`, `current_status`, não `oportunidade_id`.
- **Mensagens de commit, PR e documentação interna**: pt-BR está OK; manter consistente.

## Princípios não-negociáveis

### 1. Isolamento multi-tenant é existencial

- Toda tabela de domínio carrega `tenant_id uuid not null` com FK para `tenants(id)`.
- Toda tabela tem **Row Level Security ativado** e policies que filtram por `tenant_id = (select tenant_id from users where id = auth.uid())`.
- Nenhuma query no backend pode esquecer o filtro — confiar no RLS como defesa em profundidade, mas filtrar explícito quando possível.
- Em testes, sempre rodar pelo menos um caso "tenant A não vê dados de tenant B".

### 2. O mockup é o contrato visual

[_giba_wsi-dashboard.html](_giba_wsi-dashboard.html) é a especificação visual + modelo de dados (v0.2). Antes de evoluir/melhorar UI, replique a estrutura exibida ali. Mudanças de layout só após paridade. (`fgcoop-coe-v2.html` está **deprecated** — não use como referência.)

### 3. Score é calculado, nunca persistido

**Score de prioridade (v0.4 — blend 50/30/20, migration 0027).** O score deixou de ser só os 5 fatores: agora é a **média ponderada de 3 blocos**, cada um normalizado 0–100 (fonte única: `lib/opportunities/score.ts` `calcPriorityScore` ≡ função SQL `opportunity_score()` 7-args; parity em `tests/schema/score-rule.test.ts`):

```
score = round( (5·Fat + 3·Ben + 2·Crit) / (5 + 3·[ben?] + 2·[crit?]) )    # 0–100
  Fat  = 5 fatores × 20 (abaixo)                       — sempre presente
  Ben  = (média das notas 1–5 pontuadas − 1)/4 × 100   — null se nada pontuado → sai do denominador
  Crit = favorabilidade dos 8 critérios /8 × 100       — null se criterios null → sai do denominador
priority_level: alta >=70 / media 40–69 / baixa <40    # limites INALTERADOS
```

Sub-scores são **arredondados a inteiro ANTES** do blend (garante client `Math.round` ≡ SQL `round` numeric). Bloco Fatores (os 5 fatores, `_giba:483-490`):

```
ef = {baixo:8, medio:14, alto:20}                              # esforço (fallback 14)
cx = {baixo:20, medio:13, alto:6}                              # complexidade — INVERTIDO: menos complexo pontua mais (fallback 13)
tm = {diario:20, semanal:16, quinzenal:12, mensal:8, anual:2}  # tempo = frequência (fallback 16)
ob = {1:4, 2:8, 3:12, 4:16, 5:20}                              # objetivo × 4 (fallback 12)
ft = {muito_baixo:4, baixo:8, medio:12, alto:16, muito_alto:20}# FTE (fallback 12)
Fat = ef + cx + tm + ob + ft   # 0–100
```

Bloco Crit: cada critério `sim=1 / parcial=0.5 / não=0` na direção favorável (`decisaoHumana` INVERTIDO: menos decisão humana pontua mais). **Nota:** isto **desvia do mockup** `_giba` (que só tinha os 5 fatores) — foi decisão de produto (2026-07-22).

Persistir o score gera bug quando a fórmula mudar. Calcular no SELECT (view `opportunities_with_score` / função SQL `opportunity_score()`) ou no client — **nunca persistir**. Idem `rpa_score` (0–6) e `opportunity_risks.priority`: são colunas **GENERATED** (derivadas dos critérios / da matriz impacto×probabilidade), nunca input manual.

### 4. Admin / cross-tenant fica para depois

Não criar rotas, páginas ou queries que cruzem tenants no MVP. Se for inevitável, marque com `// TODO: admin-only — milestone pós-MVP` e abra issue.

## Stack & convenções de código

- **Next.js 16** (App Router). Server Components por padrão; `"use client"` só onde for necessário (forms, modais, kanban interativo).
- **Tailwind + shadcn/ui** para a UI. Para componentes idiossincráticos do mockup (kanban, modal multi-aba) compor a partir de primitivos shadcn em vez de reescrever do zero.
- **Supabase JS client** para queries de leitura no cliente; Server Actions / Route Handlers para mutações.
- **TypeScript** estrito (`strict: true`). Tipos gerados via `supabase gen types typescript`.
- **Estrutura de pastas** (proposta inicial):
  - `app/` rotas — `(auth)/login`, `(app)/opportunities`, etc.
  - `components/` componentes compartilhados
  - `lib/` clientes Supabase, helpers, types
  - `supabase/` migrations + seed

## Modelo de dados (v0.2 — evoluído pela migration 0011)

```
tenants(id, name, slug, created_at)
users(id, tenant_id, email, role, created_at)  -- role: 'member' (futuro 'admin')
opportunities(
  id, tenant_id, seq_id, source,           -- 'persona' | 'formulario'
  solicitante, email, area, subarea, processo,
  frequencia, volume_medio, tempo_execucao, num_pessoas,
  ferramentas (text[]),                    -- 0055: slugs de automation_tools (multi-seleção) — FONTE DA VERDADE
  ferramenta,                              -- 'rpa'|'n8n'|'ambos' — DERIVADA de ferramentas por trigger, nunca input
  -- fatores de score (colunas flat, compõem opportunity_score):
  esforco, complexidade,                   -- effort_level / complexity_level
  tempo,                                   -- frequency_bucket: diario|semanal|quinzenal|mensal|anual (era duração no v0.1)
  objetivo,                                -- smallint 1–5
  fte,                                     -- fte_bucket: muito_baixo..muito_alto (5º fator, v0.2)
  -- campos novos v0.2:
  fte_horas (numeric),                     -- FTE estimado h/mês
  rpa_score (smallint GENERATED),          -- 0–6 derivado de criterios (RPA Fit), nunca manual
  fonte (text),                            -- rótulo de origem (ex. 'Workshop I', 'FGCoop')
  tipo_processo (text[]), beneficio_qualitativo (text),
  criterios (jsonb),                       -- 8 chaves sim|nao|parcial (first-class, com CHECK)
  beneficios (jsonb),                      -- 8 chaves escala 1–5 (com CHECK)
  status, persona_extras (jsonb nullable), formulario_extras (jsonb nullable),
  escopo_automacao (text[]), beneficios_esperados (text[]),
  observacao (text), risco (text),         -- notas livres legadas (0009; ≠ tabela opportunity_risks)
  created_at, updated_at, created_by
)
opportunity_phases(
  id, opportunity_id, phase_key,           -- 'em_analise' | 'planejamento' | ...
  started_at, finished_at
)
automation_tools(                           -- NOVO 0055 — catálogo do seletor de ferramentas
  id, tenant_id nullable,                  -- NULL = catálogo global (seed: rpa, n8n, databricks, sap, uipath);
                                           -- não-nulo = registrada por um usuário, visível SÓ para o tenant dele.
                                           -- ÚNICA tabela de domínio com tenant_id nullable (exceção consciente ao §1)
  slug, nome, icone, ordem, ativo, created_by, created_at, updated_at
)
opportunity_risks(                          -- NOVO v0.2 — registro de riscos estruturado
  id, opportunity_id, tenant_id,           -- tenant_id not null + RLS (4 policies)
  descricao, tipo,                         -- impedimento | risco | oportunidade
  responsavel,                             -- text livre tenant-agnóstico (não enum: 'PSW'/cliente varia por tenant)
  impacto,                                 -- alto | significativo | moderado | baixo
  probabilidade,                           -- provavel | possivel | improvavel | remota
  status,                                  -- novo | gerenciado | mitigado | ocorrido
  resposta, descricao_impacto,
  priority (GENERATED)                     -- critica|alta|media|baixa, da matriz impacto×probabilidade
)
```

RLS policy padrão em toda tabela com `tenant_id` (helper `current_tenant_id()` de 0001):
```sql
alter table <table> enable row level security;
create policy <table>_select on <table> for select using (tenant_id = current_tenant_id());
-- + insert (with check), update (using + with check), delete (using) — 4 policies por tabela.
```

### Wizard 5-steps (v0.2)

Substitui o split persona/formulário do v0.1 por um **único wizard de 5 steps** (ref. [_giba_wsi-dashboard.html:1504-1597](_giba_wsi-dashboard.html#L1504-L1597)):

`Identificação → Processo → Critérios → Benefícios → Priorização`

- **Critérios**: os 8 critérios (SIM/NÃO/PARCIAL).
- **Benefícios**: os 8 benefícios (escala 1–5) + estimativa de FTE em h/mês.
- **Priorização**: os 5 fatores de score (incl. bucket de FTE), com os pesos visíveis.

### Matriz de risco

`opportunity_risks.priority` é auto-calculada pela matriz impacto × probabilidade (ref. [_giba_wsi-dashboard.html:1180-1185](_giba_wsi-dashboard.html#L1180-L1185)) → Crítica / Alta / Média / Baixa. É coluna GENERATED — o usuário nunca escolhe a prioridade manualmente.

### Compatibilidade com IA (MODEL-10)

Os campos derivados (`criterios`, `fte_horas`, `rpa_score` via critérios, riscos, score) são **preenchíveis manualmente agora e por IA depois** (Phase 7.6 realinhada ao 2º momento), sem exigir refatoração de schema. O schema já fica compatível com o enrichment server-side.

## Comandos GSD úteis neste projeto

- `/gsd-progress` — onde estamos
- `/gsd-plan-phase` — planejar próxima fase (a partir do roadmap em STATE.md)
- `/gsd-execute-phase` — executar fase planejada
- `/gsd-verify-work` — UAT conversacional
- `/gsd-ship` — PR + review pré-merge

## O que NÃO fazer

- Não criar painel admin / rotas super-admin no MVP.
- Não persistir score calculado.
- Não usar schema-per-tenant — RLS está decidido.
- Não desviar do esqueleto do mockup sem discussão explícita.
- Não criar tabelas sem `tenant_id` (exceto `tenants` e tabelas globais como `feature_flags`, se existirem).

## Referências externas

- **Next.js App Router**: https://nextjs.org/docs/app
- **Supabase + Next.js**: https://supabase.com/docs/guides/auth/server-side/nextjs
- **Supabase RLS**: https://supabase.com/docs/guides/database/postgres/row-level-security
- **shadcn/ui**: https://ui.shadcn.com
- **Vercel deploy**: https://vercel.com/docs

---
*Última atualização: 2026-06-04 — troca de contrato v0.2 (`_giba_wsi-dashboard.html`): score de 5 fatores, modelo evoluído (FTE/RPA Fit/critérios/benefícios/`opportunity_risks`), wizard 5-steps. `fgcoop-coe-v2.html` deprecated. Anterior: 2026-05-20 bootstrap a partir do mockup.*
