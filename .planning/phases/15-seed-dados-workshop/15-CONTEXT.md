# Phase 15: Seed dos Dados Reais do Workshop I (Unidasul) - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Importar as **64 oportunidades reais do Workshop I** como dados de um novo tenant **"Unidasul"**, isolado dos demais tenants. É uma fase de **dados** (migration de seed write-only), não de UI nem de lógica de aplicação.

**Entrega (DATA-01 / SC do ROADMAP):**
1. Existe um tenant "Unidasul" + as 64 oportunidades associadas a ele.
2. As opps trazem os novos campos preenchidos (fonte = "Workshop I", critérios, benefícios, FTE) e score / `priority_level` / `rpa_score` calculam corretamente sobre elas.
3. Um usuário de outro tenant não enxerga nenhuma das 64 (verificação cruzada de RLS).

**Fora de escopo:** nenhuma mudança de schema (0011/0012 já entregaram o modelo), nenhuma UI nova, nenhum deploy. Limpeza dos tenants existentes (FGCoop / tenant de teste 99999999) NÃO é desta fase.
</domain>

<decisions>
## Implementation Decisions

### Fonte dos dados
- **D-01:** A fonte canônica dos 64 registros é o array `const DATA=[...]` embutido em **`_giba_wsi-dashboard.html:439`** — 64 objetos já na shape v0.2 (`fonte:"Workshop I"`, `criterios`, `beneficios`, `fteHoras`, `prioridade{esforco,complexidade,tempo,objetivo,fte}`, `ferramenta`, `area`, `subarea`, `processo`, `tipoProcesso[]`, `frequencia`, `volumeMedio`, `tempoExecucao`, `numPessoas`). Não há arquivo externo — o mockup versionado É a fonte da verdade.

### Acesso ao tenant Unidasul
- **D-02:** Criar o tenant Unidasul **+ um usuário admin de login** (paridade com `0002_seed_tenant_and_admin.sql`): tenant `Unidasul` (slug `unidasul`, UUID fixo próprio) + auth user + identity; o `profile` é criado automaticamente pelo trigger `handle_new_user` (0001) lendo `tenant_id` do `raw_app_meta_data`.
- **D-03:** Credenciais do admin: **`admin.unidasul@pswdigital.com.br` / `0123456789`**, com UUID fixo próprio (espelha exatamente a convenção do admin FGCoop do 0002). Permite logar no app como Unidasul para o UAT visual dos 64 ao vivo.
- **D-04:** `created_by` das 64 oportunidades aponta para o UUID desse admin user da Unidasul (não reusar o admin FGCoop).

### PII real
- **D-05:** Manter **nomes e e-mails reais** dos solicitantes exatamente como no `const DATA` (ex.: `rafaela.silva@unidasul.com.br`, gmails pessoais). É dado do próprio cliente piloto, em ambiente isolado por RLS — sem anonimização/máscara.

### Idempotência / re-execução
- **D-06:** Guard de idempotência por **contagem do tenant**: antes do bloco de INSERT das opps, checar se o tenant Unidasul já tem oportunidades; se já tiver (> 0), **pular o insert** (`raise notice`) em vez de duplicar. Espelha o sanity-check `do $$ ... raise exception/notice` do 0002/0003. Motivo: `seq_id` é atribuído pelo trigger `trg_opportunities_seq_id` por tenant (sem chave natural), então `ON CONFLICT` não protege contra duplicação — o guard por count é o mecanismo correto.

### Executor's Discretion
- Mapeamento mecânico campo-a-campo do `const DATA` → colunas de `opportunities` (segue o padrão do `0003_seed_fgcoop_opportunities.sql`, enumerando colunas).
- Próximo número de migration (`0013`) e nome do arquivo.
- Formato exato do handoff de apply manual (segue os handoffs anteriores).
- Estrutura do teste de isolamento cross-tenant (segue `tests/security/tenant-isolation.test.ts`, padrão skipIf + lazy-init).

### Folded Todos
Nenhum todo dobrado — os pendentes em STATE.md (apply de 0006/0007, env vars Vercel, `gen:types`) não pertencem a esta fase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fonte dos dados (os 64 registros)
- `_giba_wsi-dashboard.html` §439 (`const DATA=[...]`) — **fonte canônica dos 64 registros** na shape v0.2. Toda extração parte daqui (D-01).

### Padrões de seed a espelhar
- `supabase/migrations/0002_seed_tenant_and_admin.sql` — padrão de criação de tenant + auth user + identity (UUID fixo, `on conflict`, trigger cria profile). Espelhar para a Unidasul (D-02/D-03).
- `supabase/migrations/0003_seed_fgcoop_opportunities.sql` — padrão de INSERT em `opportunities` enumerando colunas, com `tenant_id`/`created_by`, sanity-check de pré-requisito. Modelo do bloco de insert dos 64 (D-04/D-06).

### Modelo / schema vigente
- `supabase/migrations/0011_schema_evolution_v02.sql` §89-97 (shape first-class de `criterios`: 8 chaves camelCase, valores `sim/nao/parcial`) e §120-141 (`rpa_score` GENERATED — conta 6 indicadores: `totalmenteManual` sim|parcial, `regrasClaras`=sim, `decisaoHumana`=nao, `padronizacaoDocs`=sim, `validacaoDados`=sim, `schedulable`=sim; `causaReclamacoes`/`temDocumentacao` NÃO contam). O seed insere `criterios`; **não** insere `rpa_score`/`score`/`priority_level`.
- `docs/PROJETO.md` — não-negociáveis (§1 RLS + teste cross-tenant obrigatório; §3 score/rpa_score/priority nunca persistidos; idioma; write-only mode de migrations).
- `lib/opportunities/score.ts` + `lib/opportunities/rpa.ts` — fórmulas de score (5 fatores) e rpa_score client-side, para conferir os valores computados contra os do mockup na verificação.

### Apply mode
- Handoffs anteriores (`.planning/phases/09-schema-evolution-foundation/09-MIGRATION-HANDOFF.md`, `.planning/phases/07.5-hardening-seguranca-mvp/07.5-02-MIGRATION-HANDOFF.md`) — formato do doc de apply manual write-only.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `0002`/`0003` migrations: templates diretos para tenant+admin e para o bloco de INSERT dos 64 (enumeração de colunas, casts de enum `::opportunity_source`/`::effort_level`/etc.).
- Trigger `handle_new_user` (0001): cria o `profile` do admin automaticamente a partir do `raw_app_meta_data.tenant_id` — não precisa inserir profile manualmente.
- Trigger `trg_opportunities_seq_id` + `next_seq_id()` (0006): atribui `seq_id` por tenant automaticamente — **não** setar `seq_id` no insert (é sobrescrito).
- `tests/security/tenant-isolation.test.ts` + `tests/setup/seed-test-tenants.ts`: padrão skipIf + lazy-init para o teste de isolamento cross-tenant da SC3.

### Established Patterns
- **Write-only migrations**: arquivo `0013_*.sql` + handoff de apply manual no Supabase Cloud SQL Editor (NÃO `supabase db push`). Idempotente onde possível.
- **Transformação de critérios**: o `const DATA` já usa as chaves camelCase do schema; só os valores precisam de `lower()` + de-acentuação (`"NÃO"`→`nao`, `"PARCIAL"`→`parcial`, `"SIM"`→`sim`).
- **Mapeamento de `prioridade`**: o DATA já traz `tempo` no domínio de frequência (`diario`/`semanal`/...) e `fte` como bucket (`muito_alto`/...) — casa direto com as colunas `tempo`(frequency_bucket) e `fte`(fte_bucket). `status` "Novo"→`'novo'`.

### Integration Points
- Colunas a preencher no insert: identificação (solicitante, email, area, subarea, processo), `fonte`='Workshop I', `tipo_processo[]`, `frequencia`, `volume_medio`, `tempo_execucao`, `num_pessoas`, `ferramenta`, os 5 fatores de score (`esforco`,`complexidade`,`tempo`,`objetivo`,`fte`), `fte_horas`, `criterios`(jsonb), `beneficios`(jsonb), `beneficio_qualitativo`, `status`, `source`='formulario', `created_by`.
- **NÃO** inserir: `seq_id` (trigger), `rpa_score` (GENERATED), `score`/`priority_level` (view).
</code_context>

<specifics>
## Specific Ideas

- Badge de origem no app mostra "📋 Workshop I · Unidasul" — `fonte`="Workshop I" + `tenant.name`="Unidasul" reproduzem isso (já consumido pelo Relatório da Phase 14 via `sourceLabel`).
- A Unidasul é um tenant **adicional** — coexiste com o FGCoop (29 opps) e o tenant de teste existente; nada é removido nesta fase.
</specifics>

<deferred>
## Deferred Ideas

- **Destino do tenant de teste 99999999** (4 opps órfãs mencionadas em STATE/Phase 9) — limpeza de dados, não pertence ao seed da Unidasul. Decidir em fase de housekeeping futura.
- **Anonimização de PII** — descartada para esta fase (D-05 mantém reais); se um ambiente de demo público surgir, revisitar.
- **Fase de Deploy** — adiada para milestone próprio (nota do ROADMAP), fora do v0.2.
</deferred>

---

*Phase: 15-seed-dados-workshop*
*Context gathered: 2026-06-05*
