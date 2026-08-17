# Phase 12: Registro de Riscos (UI do modal) - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Dentro do modal de uma oportunidade, o usuário gerencia riscos estruturados —
cadastra, edita e remove — com prioridade auto-calculada pela matriz
impacto×probabilidade. A aba "Risco" do modal **lista** os riscos (leitura); o
CRUD (criar/editar/excluir) vive numa **sub-rota interceptada** (modal aninhado)
aberta a partir dos botões da aba.

**Em escopo:** RISK-01 (cadastrar risco com todos os campos), RISK-02 (prioridade
auto pela matriz), RISK-03 (editar/excluir), RISK-05 (aba Risco lista em tabela).
Inclui: query de leitura dos riscos de uma oportunidade, server actions
create/update/delete de risco, sub-rota de formulário, reescrita da aba Risco.

**Fora de escopo:** tabela/RLS de `opportunity_risks` (já em Phase 9), schema de
validação `riskInputSchema` (já em Phase 10), realinhamento das 8 abas do modal
ao novo modelo (Phase 13), exibição de riscos em KPI/tabela/relatório.

</domain>

<decisions>
## Implementation Decisions

### Interação / arquitetura no modal
- **D-01:** A aba "Risco" do modal mantém a **tabela de leitura** dos riscos da
  oportunidade (satisfaz RISK-05): colunas ID (R001…), descrição, tipo,
  responsável, impacto, probabilidade, prioridade, status, ações. Layout fiel a
  `_giba:1198-1232` (badges de tipo/prioridade).
- **D-02:** O **CRUD vive numa sub-rota dedicada interceptada** (modal aninhado),
  seguindo o padrão de parallel/intercepting routes do `@modal` atual
  (`app/(app)/@modal/(.)opportunities/[id]/...`). Os botões "+ Adicionar" /
  ✏️ editar / 🗑️ excluir da aba abrem essa sub-rota. Acesso direto via URL deve
  renderizar fullscreen (mesmo contrato do modal de oportunidade).
  - ⚠️ **Risco técnico para o researcher:** aninhar uma intercepting route SOBRE
    um modal já interceptado é não-trivial no Next.js App Router. O researcher
    deve investigar o mecanismo exato (novo slot paralelo aninhado vs. rota
    interceptada filha vs. dialog client-side dentro da sub-rota) e validar que o
    acesso direto à URL ainda funciona fullscreen.
- **D-03:** `RiscoTab.tsx` deixa de exibir o campo legado de texto livre `risco`
  e passa a renderizar a tabela estruturada. A aba pode permanecer Server
  Component para a leitura (busca via query); a interatividade de escrita fica na
  sub-rota. (O campo legado `risco` em texto livre é "notas livres legadas",
  ≠ `opportunity_risks` — ver Deferred.)

### Prioridade (matriz impacto×probabilidade)
- **D-04:** A prioridade é exibida **somente após salvar** — sem espelho ao vivo
  no client. A fonte da verdade é o trigger SQL `set_risk_priority()` (coluna
  GENERATED `priority`, matriz `_giba:1180-1185`). Satisfaz RISK-02: a prioridade
  é auto-calculada, o usuário nunca a escolhe; ela só aparece depois do
  round-trip de persistência. No formulário, o campo "Prioridade" é read-only
  (não é input).

### Persistência / refresh / exclusão
- **D-05:** Mutação via **server actions** (`'use server'`), mesmo padrão de
  `lib/opportunities/actions.ts`: validação com `riskInputSchema.safeParse`,
  tenant/`opportunity_id` server-derived (nunca do client — defesa
  mass-assignment), `revalidatePath` das rotas afetadas + `router.refresh()` no
  client para re-buscar a lista. Modal/aba permanece aberto após a operação.
- **D-06:** **Excluir pede confirmação** antes de remover (mais seguro que o
  mockup, que exclui imediato). Após confirmar, a lista reflete a remoção.

### Labels / enums / Responsável
- **D-07:** Enums internos sempre **minúsculos** (DB): `tipo`
  (impedimento|risco|oportunidade), `impacto` (alto|significativo|moderado|baixo),
  `probabilidade` (provavel|possivel|improvavel|remota), `status`
  (novo|gerenciado|mitigado|ocorrido). Uma **camada de labels** mapeia para o
  PT Title-Case da UI (ex.: `novo` → "Risco Novo", `alto` → "Alto") — análoga ao
  mapeamento de badges do `_giba`. Centralizar o mapa de labels (um módulo) para
  reuso entre tabela e formulário.
- **D-08:** **Responsável = texto livre com sugestões** (PSW / UnidaSul como
  hints), não dropdown fixo. Tenant-agnóstico, alinhado a docs/PROJETO.md/`risk-schema`
  (o responsável varia por tenant; não hardcodar valores de um tenant).

### Executor's Discretion
- Estilo visual fino dos badges, espaçamentos e ícones (seguir `_giba` como
  referência, compor com primitivos shadcn).
- Tratamento de erros de validação/servidor no formulário (exibição de
  `fieldErrors`/mensagem) — seguir o padrão já usado no wizard.
- Ordenação default da tabela de riscos (sugestão: por prioridade desc, depois
  por criação) — não foi travado; o executor decide com bom senso.
- Geração do rótulo "Rxxx" (sequencial por índice como no mockup, ou derivado) —
  o executor decide; o mockup usa índice 1-based zero-padded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato visual + matriz de risco
- `_giba_wsi-dashboard.html` §1178-1260 — RISK HELPERS, `RISK_PRIO_MATRIX`,
  `renderRiscoTab`, `openRiskForm`, badges de tipo/prioridade, tabela e formulário
  de risco. Fonte da verdade visual da aba Risco.
- `_giba_wsi-dashboard.html` §1180-1185 — matriz impacto×probabilidade →
  Crítica/Alta/Média/Baixa (espelha o trigger SQL).

### Schema / validação / tabela (já entregues)
- `lib/opportunities/risk-schema.ts` — `riskInputSchema` (`.strict()`), enums e
  `RiskInput`. Input de create/update DEVE validar por aqui. `priority`,
  `id`, `tenant_id`, `opportunity_id` são rejeitados/server-derived.
- `lib/database.types.ts` §362-414 — tipos da tabela `opportunity_risks`
  (Row/Insert/Update); `priority` é trigger-set (não enviar).
- `.planning/phases/09-schema-evolution-foundation/09-CONTEXT.md` — decisões da
  tabela, RLS (4 policies) e do trigger `set_risk_priority()`.

### Padrões de aplicação a reutilizar
- `lib/opportunities/actions.ts` — padrão de server actions (validação Zod,
  tenant server-derived, `revalidatePath`, defesa mass-assignment). Modelar
  create/update/deleteRisk a partir de `updateOpportunity`/`deleteOpportunity`.
- `lib/opportunities/queries.ts` §29 — whitelist de colunas (sem `select('*')`);
  adicionar query de leitura de riscos no mesmo estilo.
- `app/(app)/@modal/(.)opportunities/[id]/page.tsx` + `components/opportunities/modal/`
  — arquitetura do modal interceptado e tabs (`OpportunityDetail`, `TabsNav`,
  `RiscoTab`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `riskInputSchema` (`lib/opportunities/risk-schema.ts`): validação pronta da
  Phase 10 — usar direto nas server actions de risco.
- Padrão de server actions em `lib/opportunities/actions.ts`
  (`updateOpportunity`/`deleteOpportunity`): copiar a estrutura (auth.getUser →
  profile.tenant_id → update escopado por tenant → revalidatePath).
- Arquitetura `@modal` (parallel + intercepting routes) já montada para o modal
  de oportunidade — base para a sub-rota de risco.
- Tipos `opportunity_risks` já em `lib/database.types.ts` (Row/Insert/Update).

### Established Patterns
- Modal hoje é **read-only** (Server Components); o wizard é o editor. Phase 12
  introduz o **primeiro CRUD interativo dentro/sobre o modal** — via sub-rota.
- "Espelho de fórmula no client + DB autoritativo" (paridade de score, Phase 10)
  foi **considerado mas NÃO usado aqui** (D-04: prioridade só após salvar).
- UI pt-BR / código inglês; enums minúsculos no DB com camada de labels na UI.

### Integration Points
- `RiscoTab.tsx` — reescrever (de texto livre para tabela estruturada).
- `lib/opportunities/queries.ts` — adicionar `fetchRisksForOpportunity(id)`.
- `lib/opportunities/actions.ts` (ou novo `risk-actions.ts`) — create/update/delete.
- `app/(app)/@modal/...` — adicionar a sub-rota interceptada de formulário de risco.

</code_context>

<specifics>
## Specific Ideas

- A tabela e o formulário devem espelhar `_giba` (badges 🚧/⚠️/💡 por tipo;
  badges de cor por prioridade; ID "R001"; botões ✏️/🗑️).
- Status do DB `novo|gerenciado|mitigado|ocorrido` exibe como
  "Risco Novo|Risco Gerenciado|Risco Mitigado|Risco Ocorrido" (labels do mockup).
- Formulário: Descrição* , Tipo, Responsável (texto livre), Impacto,
  Probabilidade, Prioridade (read-only/auto), Status, Resposta ao Risco,
  Descrição do Impacto (ver `_giba:1238-1260`).

</specifics>

<deferred>
## Deferred Ideas

- **Preview ao vivo da prioridade** no formulário (espelho da matriz em TS) —
  considerado e descartado para esta fase (D-04). Pode voltar como melhoria de UX.
- **Campo legado `risco` (texto livre)** — é "notas livres legadas" (0009),
  distinto de `opportunity_risks`. Decidir seu destino (mover p/ Observação ou
  remover da UI) faz parte do realinhamento das abas em **Phase 13**.
- **Exibir riscos/prioridade em KPI, tabela e Relatório** — Phases 13/14.

[Nenhum scope creep registrado — discussão ficou dentro do escopo da fase.]

</deferred>

---

*Phase: 12-registro-riscos-modal*
*Context gathered: 2026-06-05*
