# Phase 9: Schema Evolution + Score/Risk/Contract Foundation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Uma migration (write-only mode: arquivo `.sql` + handoff de apply manual no Supabase Cloud SQL Editor — padrão v0.1) que evolui o schema global do produto para o contrato `_giba_wsi-dashboard.html`:

1. **Evolui `opportunities`** — adiciona `fte_horas`, `rpa_score`, `fonte`, `tipo_processo (text[])`, `beneficio_qualitativo`, colunas dedicadas `criterios (jsonb)` e `beneficios (jsonb)`, bucket `prioridade.fte`; troca a semântica de `tempo` (duração → frequência).
2. **Reescreve `opportunity_score()`** para 5 fatores × 20 = 100 (`_giba:483-490`) e recria a view `opportunities_with_score` (score + `priority_level` alta ≥70 / média 40–69 / baixa <40).
3. **Cria `opportunity_risks`** (tenant_id not null + RLS + 4 policies padrão por `current_tenant_id()`).
4. **Backfill** das 29 oportunidades FGCoop existentes sem perda de dados.
5. **Troca de contrato** — `_giba_wsi-dashboard.html` vira fonte da verdade visual/modelo; `fgcoop-coe-v2.html` marcado deprecated; docs/PROJETO.md atualizado (nova fórmula de score, novo modelo, novo wizard).

**Fora desta fase (são Phases 10–15):** queries/server actions/Zod/tipos (P10), wizard 5-steps (P11), UI da aba Risco (P12), atualizações de telas (P13), view Relatório (P14), seed Unidasul (P15). Nenhuma UI nem código de app aqui — só schema + funções SQL + docs.

</domain>

<decisions>
## Implementation Decisions

### Backfill dos dados FGCoop existentes (MODEL-09)
- **D-01:** `prioridade.tempo` (novo fator frequência) é **derivado da coluna `frequencia` que já existe** nas 20 oportunidades de formulário (mapa direto: `Diário→diario`, `Semanal→semanal`, `Quinzenal→quinzenal`, `Mensal→mensal`, `Anual→anual`). As 9 personas (sem `frequencia`) ficam com `tempo = NULL` — a função de score já trata ausente via fallback (`||16` = semanal). Sem perda, sem chute em persona.
- **D-02:** `fte_horas` e `prioridade.fte` ficam **NULL** nas 29 linhas legadas (não há esse dado). Score usa fallback do fator FTE (`||12` = medio). Coerente com MODEL-10 (preenchível manual agora / IA depois) e não distorce o ranking penalizando dados antigos.
- **D-03:** `fonte = 'FGCoop'` nas 29 linhas legadas **do tenant FGCoop** (`11111111-…`) — distingue do `'Workshop I'` que entra na Phase 15 (Unidasul) e preserva rastreabilidade de origem. **Refinado na execução (dry-run):** o backfill é escopado ao tenant FGCoop — o banco tinha 33 oportunidades, sendo 4 de um tenant distinto (`99999999-…`) que NÃO devem ser carimbadas 'FGCoop' (ficam `fonte` NULL). Além disso, 2 valores de `frequencia` fora dos 5 buckets foram mapeados (`eventual`→`anual`, `5 vezes por dia`→`diario`) para evitar `tempo` NULL.
- **D-04:** Backfill dos 8 critérios a partir de `formulario_extras->'criterios'` é mecânico: 8 das chaves novas batem 1:1 com as antigas (`causaReclamacoes←causa_reclamacoes`, `totalmenteManual←totalmente_manual`, `regrasClaras←regras_claras`, `decisaoHumana←decisao_humana`, `padronizacaoDocs←padronizacao_docs`, `validacaoDados←validacao_dados`, `schedulable←schedulable`, `temDocumentacao←tem_documentacao`). As 2 antigas extras (`processo_uniforme`, `digitacao_manual`) são **descartadas**. Valores `'SIM'/'NAO'` antigos normalizam para `'sim'/'nao'`. As 9 personas não têm critérios → `criterios = NULL`.

### Semântica da coluna `tempo` (MODEL-08)
- **D-05:** A coluna `tempo` hoje é o enum `time_bucket` (pequeno/medio/grande = duração). Cria-se um **enum novo de frequência** (ex.: `frequency_bucket` com `diario/semanal/quinzenal/mensal/anual`) e migra-se a coluna para ele, **descartando os valores de duração antigos** (substituídos pela frequência derivada de `frequencia` — D-01). A função de score passa a usar os pesos de frequência (`diario:20,semanal:16,quinzenal:12,mensal:8,anual:2`).

### Forma de armazenar critérios + benefícios (MODEL-06)
- **D-06:** **8 critérios → coluna dedicada `criterios jsonb`** (top-level em `opportunities`, separada de `formulario_extras`), com CHECK validando as 8 chaves esperadas. "First-class" (MODEL-06) é satisfeito por **coluna jsonb própria e validada**, NÃO por 8 colunas escalares. Decisão explícita do PO.
- **D-07:** **8 benefícios (escala 1–5) → coluna dedicada `beneficios jsonb`** com CHECK de shape. São agregados/exibidos, não filtrados individualmente nem usados no rpaScore → jsonb basta e mantém a tabela enxuta.
- **D-08:** Valores canônicos dos critérios = **`'sim' / 'nao' / 'parcial'`** (ASCII minúsculo), aplicados via CHECK sobre o jsonb (não há tipo enum Postgres dedicado, já que o dado vive em jsonb). UI renderiza o label pt-BR (`✓ SIM` / `✗ NÃO` / `~ PARCIAL`) — mapa de exibição fica nas Phases de UI.

### rpaScore — armazenamento + regra (MODEL-02, SCORE-03)
- **D-09:** `rpa_score` é uma **coluna GENERATED ALWAYS AS ... STORED**, derivada deterministicamente de `criterios` jsonb. Resolve a tensão MODEL-02 ("armazena") × SCORE-03/SC3 ("derivado, não persistido como input manual arbitrário"): a coluna existe/é armazenada, mas o valor vem **sempre** da regra, nunca de input manual. Compatível com MODEL-10 (IA preenche os critérios → `rpa_score` recalcula sozinho).
- **D-10:** A **regra de derivação 0–6 não existe no contrato** (`_giba` traz `rpaScore` só como dado pronto no seed). Será **inferida por engenharia reversa** pelo researcher, cruzando `criterios × rpaScore` nos registros do `_giba`, e **validada por reproduzir os valores existentes** (garante que a Phase 15 / seed Unidasul bata com o contrato). O peso de `PARCIAL` sai da inferência.
- **D-11:** A expressão da coluna GENERATED **precisa ser IMMUTABLE** — a função de derivação (se houver) deve ser marcada `IMMUTABLE`; caso contrário, inline da expressão CASE/jsonb imutável.

### Tabela `opportunity_risks` (RISK-04; estrutura p/ RISK-01/02/05 que a UI da P12 consome)
- **D-12:** Vocabulário fixo como **enums Postgres**: `risk_type` (Impedimento/Risco/Oportunidade), `risk_impact` (Alto/Significativo/Moderado/Baixo), `risk_probability` (Provável/Possível/Improvável/Remota), `risk_status` (Novo/Gerenciado/Mitigado/Ocorrido). Consistente com o padrão de enums do `0001`. (Rótulos exatos vs ASCII-lowercase ficam a critério do planner seguindo a convenção do 0001 — ver Executor's Discretion.)
- **D-13:** `responsavel` = **coluna text livre** (tenant-agnóstica). 'UnidaSul' do `_giba` é tenant-específico; text livre evita amarrar o schema a um tenant. Futuro possível: FK p/ tabela de partes.
- **D-14:** `priority` (Crítica/Alta/Média/Baixa) = **coluna GENERATED ALWAYS AS** encodando a matriz 4×4 (`_giba:1180-1185`) sobre `impacto`+`probabilidade`. Atende RISK-02 no próprio schema; simétrico com D-09; nunca input manual.
- **D-15:** `opportunity_risks` carrega `tenant_id uuid not null` + RLS ativado + as 4 policies padrão (select/insert/update/delete por `current_tenant_id()`). Critério de sucesso inclui teste cruzado A≠B (tenant A não vê riscos de B). Demais campos livres: `descricao`, `resposta` (resposta ao risco), `descricao_impacto` (text). O ID de exibição `Rxxx` é posicional/derivado na UI (Phase 12), não coluna.

### Score + view (SCORE-01, SCORE-02)
- **D-16:** `opportunity_score()` reescrita para os 5 fatores × 20 batendo **literalmente** `_giba:483-490`: `ef{baixo:8,medio:14,alto:20}` + `cx{baixo:20,medio:13,alto:6}` + `tm{diario:20,semanal:16,quinzenal:12,mensal:8,anual:2}` + `ob{1:4,2:8,3:12,4:16,5:20}` + `ft{muito_baixo:4,baixo:8,medio:12,alto:16,muito_alto:20}`, com os mesmos fallbacks do JS (`14/13/16/12/12`). View `opportunities_with_score` recriada via **DROP + CREATE** (não CREATE OR REPLACE — `o.*` reordena colunas e o Postgres bloqueia com 42P16; padrão já usado em 0008/0009/0010) expondo `score` + `priority_level` (alta ≥70 / média 40–69 / baixa <40). Score **continua calculado em runtime, nunca persistido em coluna**.

### Troca de contrato (CONTRACT-01, CONTRACT-02)
- **D-17:** `_giba_wsi-dashboard.html` documentado como fonte da verdade visual/modelo; `docs/PROJETO.md` atualizado (nova fórmula de score 5-fatores, novo modelo de campos, novo wizard 5-steps, nova matriz de risco); `fgcoop-coe-v2.html` marcado **deprecated** (banner/nota no topo + atualização das referências em docs/PROJETO.md).

### Executor's Discretion
- Nome exato dos novos enums/colunas (seguir convenção do `0001`: snake_case, inglês p/ identificador, valor de domínio em minúsculo pt quando aplicável — ex.: `frequency_bucket`, `fte_bucket`, `rpa_score`, `fte_horas`, `tipo_processo`, `beneficio_qualitativo`, `criterios`, `beneficios`).
- Rótulos dos enums de risco: ASCII-lowercase (`impedimento/risco/oportunidade`, `alto/significativo/moderado/baixo`, etc.) seguindo a convenção do 0001, com label pt-BR na UI — **a menos** que o researcher constate que reproduzir o `_giba` (Phase 15) fique mais simples com os rótulos exatos.
- Índices novos (ex.: `opportunities(tenant_id, fonte)`, índice p/ ordenação por score/fte) — decidir conforme as queries da P10/P13.
- Estrutura precisa do CHECK de shape dos jsonb `criterios`/`beneficios` (validar chaves + valores).
- Thresholds do bucket `fte_horas` → `prioridade.fte` **não** são definidos nesta fase (legado fica NULL; preenchimento manual/IA depois) — se necessário, é decisão da P11 (wizard).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato visual/modelo (fonte da verdade v0.2)
- `_giba_wsi-dashboard.html` §483-490 — fórmula `calcScore` (5 fatores × 20, pesos e fallbacks) → SCORE-01/SCORE-02, D-16
- `_giba_wsi-dashboard.html` §1180-1185 — `RISK_PRIO_MATRIX` (matriz impacto×probabilidade → prioridade) → RISK-02, D-14
- `_giba_wsi-dashboard.html` §461-480 — `CRIT_LABELS` (8 critérios) e `BEN_LABELS` (8 benefícios) → MODEL-06, D-06/D-07
- `_giba_wsi-dashboard.html` §439 (`const DATA=[...]`) — shape canônico de uma oportunidade nova (campos `fteHoras`, `rpaScore`, `fonte`, `tipoProcesso`, `criterios`, `beneficios`, `prioridade{esforco,complexidade,tempo,objetivo,fte}`, `riscos[]`, `beneficioQualitativo`) e os valores de `rpaScore` a serem reproduzidos pela regra (D-10)

### Escopo / requisitos / decisões
- `.planning/ROADMAP.md` §"Phase 9" — Goal + 5 Success Criteria (autoridade do escopo desta fase)
- `.planning/REQUIREMENTS.md` — MODEL-01..10, SCORE-01..03, RISK-04, CONTRACT-01/02 (REQ-IDs desta fase)
- `.planning/PROJECT.md` §"Key Decisions" — score-não-persistido, RLS, `_giba` como contrato global

### Schema atual (a evoluir)
- `supabase/migrations/0001_init.sql` §96-221 — tabela `opportunities` atual, `current_tenant_id()`, `opportunity_score()` antiga (3-fatores+objetivo), view `opportunities_with_score`, enums (`effort_level`, `complexity_level`, `time_bucket`, `automation_tool`, `opportunity_status`, `phase_key`)
- `supabase/migrations/0008_request_type.sql`, `0009_observacao_risco.sql`, `0010_ai_enrichment.sql` — colunas recentes (`request_type`, `observacao`, `risco`, `ai_enrichment_*`) + **padrão DROP+CREATE da view** (`o.*` reordena → 42P16) que esta migration DEVE seguir
- `supabase/migrations/0003_seed_fgcoop_opportunities.sql` — as 29 linhas legadas (20 formulário com `criterios`/`frequencia`, 9 persona) que o backfill processa (D-01..D-04)

### Padrão de processo (write-only mode)
- `.planning/phases/07.5-hardening-seguranca-mvp/07.5-02-MIGRATION-HANDOFF.md` — exemplo do handoff copy-paste-ready p/ apply manual no Supabase Cloud SQL Editor (padrão a replicar nesta migration). Após apply: `npm run gen:types`.

### Doc a atualizar
- `docs/PROJETO.md` — fórmula de score (§3), modelo de dados, princípios; + `fgcoop-coe-v2.html` (marcar deprecated) → CONTRACT-01/02, D-17

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `current_tenant_id()` (0001): helper SECURITY DEFINER STABLE — reusar nas 4 policies de `opportunity_risks` (mesmo padrão `tenant_id = current_tenant_id()`).
- Padrão de enum + `do $$ ... if not exists ... create type`  (0008/0010): migrations idempotentes — replicar para os novos enums (`frequency_bucket`, `fte_bucket`, `risk_*`).
- Padrão `alter table ... add column if not exists` (0009/0010): aditivo e idempotente.
- View `opportunities_with_score` com `security_invoker = true` (0001/0010): manter a flag ao recriar.

### Established Patterns
- **DROP + CREATE da view** (não CREATE OR REPLACE) sempre que colunas novas entram via `o.*` — Postgres bloqueia com 42P16. Já é o padrão de 0008/0009/0010.
- **Write-only mode**: migration roda no Supabase Cloud (hosted), não local Docker → arquivo `.sql` + handoff doc (não `supabase db push`).
- **Score nunca persistido**: calculado na função/view, nunca coluna. rpa_score e risk.priority seguem o espírito via GENERATED (derivado, não input manual).
- Coluna `risco text` (0009) é texto livre legado — **não** é a tabela estruturada; `opportunity_risks` é nova e separada. Avaliar se `risco`/`observacao` (0009) são migrados ou ficam.

### Integration Points
- `lib/database.types.ts` — regenerar via `npm run gen:types` após apply (consumido pela P10).
- A função/view nova é a base que P10 (queries/Zod/score preview) e P13 (telas) leem.
- `opportunity_score()` muda assinatura (ganha `p_fte`); todos os call-sites (view + futuros) precisam acompanhar — a view é o único call-site hoje.

</code_context>

<specifics>
## Specific Ideas

- A fórmula de score deve bater **número a número** com `_giba:483-490`, incluindo os fallbacks (`14/13/16/12/12`) — a P10 (SCORE-04) vai verificar paridade cliente/servidor contra exatamente isso.
- A regra de rpaScore é "inferida e validada contra o dado do `_giba`" — o critério de aceitação é reproduzir os `rpaScore` já presentes no seed, não inventar uma fórmula plausível.
- Critérios first-class via jsonb dedicado (não 8 colunas) — decisão consciente do PO, registrar para que plan-checker não trate como gap de MODEL-06.

</specifics>

<deferred>
## Deferred Ideas

- **Thresholds `fte_horas` → `prioridade.fte`** (regra de bucketização do FTE numérico) — não definidos aqui; legado fica NULL. Decisão da Phase 11 (wizard) ou do 2º momento (IA).
- **Geração por IA dos campos derivados** (`fte_horas`, `rpa_score` override, `riscos`, score) — Future Requirement AI-GEN / REALIGN-7.6, fora do v0.2 (schema só fica compatível — MODEL-10).
- **`responsavel` como FK p/ tabela de partes/responsáveis** — text livre agora; estruturar só se um tenant pedir.
- **Migração/depreciação das colunas `risco`/`observacao` (0009)** vs nova tabela `opportunity_risks` — o planner decide se a coluna `risco` text livre é aposentada, mantida como nota, ou ignorada (não bloqueia esta fase).

</deferred>

---

*Phase: 09-schema-evolution-foundation*
*Context gathered: 2026-06-04*
