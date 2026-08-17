# Phase 16: Tarefas e Subtarefas por Oportunidade (Lista / Kanban / Gantt) - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning
**Source:** decisões travadas diretamente com o PO na abertura da fase (4 perguntas fechadas), + verificação do estado real do `main` pelo orquestrador.

<domain>
## Phase Boundary

Dentro de uma oportunidade, o usuário mapeia as **atividades de execução** como
tarefas com subtarefas (exatamente 2 níveis), atribui cada uma a **uma** pessoa
do próprio tenant e acompanha o conjunto em **três visões — Lista, Kanban e
Gantt**, expandindo/comprimindo as subtarefas de cada tarefa.

**Em escopo:** TASK-01 … TASK-11. Inclui: migration da tabela `opportunity_tasks`
(+ enum de status, RLS, constraint de 2 níveis, trigger de coerência de tenant do
assignee), tipos hand-maintained, Zod schema, queries de leitura, server actions
CRUD, form de tarefa/subtarefa, e as 3 views das atividades **de uma
oportunidade**.

**Fora de escopo:**
- Visão cross-oportunidade ("todas as tarefas do tenant") — é outra fase.
- Dependências entre tarefas (predecessora/sucessora), caminho crítico, baseline.
- Drag para **redimensionar/mover** barras no Gantt (o Gantt desta fase é
  leitura + expandir/comprimir; as datas se editam pelo formulário).
- Reordenação manual (`sort_order`) dentro de uma coluna do Kanban — o
  drag-and-drop do Kanban muda **status**, não ordem.
- Comentários, anexos, checklists e log de horas por tarefa.
- Notificar o responsável (e-mail/notificação) — o projeto já tem e-mail
  transacional, mas notificação de tarefa não foi pedida.
- Múltiplos responsáveis, responsável por texto livre, colunas de Kanban
  configuráveis por tenant — **explicitamente descartados pelo PO** (ver
  Deferred).
- Qualquer rota/query cross-tenant ou de admin de plataforma.

</domain>

<decisions>
## Implementation Decisions

### Travadas pelo PO (2026-08-04) — NÃO reabrir

- **D-01 (Hierarquia, 2 níveis):** tabela única `opportunity_tasks` com
  `parent_task_id` self-FK. Uma subtarefa **nunca** pode ter filhas. A regra é
  garantida **no banco** (constraint/trigger), não só na UI. Sem árvore de
  profundidade livre.
- **D-02 (Gantt / rollup):** `start_date` e `due_date` são **manuais** em tarefa
  e subtarefa. A tarefa-pai **exibe** o span agregado (menor `start_date` /
  maior `due_date` das filhas) e o **% de conclusão agregado**. Ambos são
  **calculados em runtime** (view SQL ou client) e **nunca persistidos** — mesma
  regra do score (princípio 3 do docs/PROJETO.md). Nenhuma coluna `progress`,
  `computed_start` ou similar em `opportunity_tasks`.
- **D-03 (Status / Kanban):** enum fixo de **4** valores mapeando 1:1 nas
  colunas, nesta ordem: **Backlog → Em Andamento → Bloqueio → Finalizado**. Sem
  colunas configuráveis por tenant. Mover um card para **Bloqueio exige o motivo
  do bloqueio** (`blocked_reason`) antes de concluir a movimentação; o motivo
  aparece no card e no detalhe.
- **D-04 (Responsável):** **um** responsável por tarefa — `assignee_id` FK →
  `profiles(id)`, obrigatoriamente do **mesmo tenant** da tarefa, validado **no
  banco** (trigger) além do RLS. O select de responsável lista **somente**
  profiles do tenant corrente. Sem múltiplos responsáveis e sem nome livre.

### Derivadas do estado real do código (verificadas no `main`, 2026-08-04)

- **D-05 (`profiles`, não `users`):** a tabela de pessoas do tenant no schema
  vivo é `profiles`. `opportunity_assignees.profile_id → profiles(id)` (0032) é o
  precedente. `assignee_id` referencia `profiles(id)`.
- **D-06 (numeração da migration):** a última migration no repo é
  `0036_public_opportunities_no_status_filter.sql`. A desta fase é **`0037`**.
  (O docs/PROJETO.md diz "a última é 0027" — está desatualizado.)
- **D-07 (Gantt sem biblioteca nova):** o projeto já tem **dois** Gantt zero-dep
  em CSS/Tailwind com barras posicionadas por porcentagem
  (`components/opportunities/gantt/GanttChart.tsx` e
  `components/proposal/GanttChart.tsx`). O Gantt de tarefas **segue esse
  padrão** — não introduzir dependência de Gantt. Isto elimina a pergunta
  "biblioteca vs. componente próprio": o precedente do repo já respondeu.
- **D-08 (seletor de pessoas já existe):** `lib/opportunities/assignees.ts`
  expõe `AssignableProfile` e já busca os profiles atribuíveis do tenant
  corrente (0032). O select de responsável **reusa** isso; não criar query nova
  de "pessoas do tenant".
- **D-09 (sem shadcn/ui):** `components/ui/` não existe — a UI é Tailwind escrito
  à mão. Compor no estilo vigente (ver `components/opportunities/modal/risk/`).
  **Não** introduzir shadcn nesta fase. *(Corrige a instrução genérica do
  docs/PROJETO.md, que assume shadcn instalado.)*
- **D-10 (analog end-to-end):** o vertical slice de **riscos** é o analog mais
  próximo e deve ser modelado de perto: `risk-schema.ts` (Zod `.strict()`) →
  `risk-actions.ts` (server actions, tenant server-derived, defesa
  mass-assignment, `revalidatePath`) → `queries.ts` (whitelist de colunas, sem
  `select('*')`) → `modal/risk/` (tabela + form + dialog + delete com
  confirmação) → sub-rotas em `app/(app)/opportunities/[id]/riscos/...`.

### Resolvidas após a pesquisa (2026-08-04)

- **D-11 (quem escreve tarefas) — travada pelo PO:** escrita liberada para
  **todos os papéis exceto `viewer`** (`member` e `tenant_admin` criam, editam,
  movem e excluem; `viewer` só lê). É o padrão real de `opportunity_risks`
  pós-0011/0015/0021 — **não** o de `opportunity_assignees`, que é admin-only.
  Racional: sem isso o Kanban esvazia, porque quem executa não conseguiria
  mover o próprio card. *(Resolve a Open Question 1 do RESEARCH.md.)*
- **D-12 (`platform_admin`):** mantém paridade com as tabelas irmãs —
  `is_platform_admin()` entra nas policies de `opportunity_tasks` como já entra
  em `opportunity_risks`/`opportunity_assignees`. É consistência de plataforma,
  não uma rota cross-tenant nova de produto. *(Resolve a Open Question 2.)*
- **D-13 (expand/collapse):** estado **independente por view** — Lista e Gantt
  não compartilham expansão. Requisito é apenas que seja por tarefa, não global
  (TASK-07/TASK-10). Estado local do componente basta; não persistir na URL.
  *(Resolve a Open Question 3.)*

### Executor's Discretion

- **Onde as 3 views vivem** (aba nova no modal de oportunidade vs. sub-rota
  dedicada `/opportunities/[id]/tarefas`): decidir seguindo o precedente de
  riscos, com atenção a que o Gantt e o Kanban precisam de largura — pode
  justificar sub-rota fullscreen em vez de caber dentro do modal.
- **Como as 3 views se alternam** (segmented control local, query param `?view=`,
  ou sub-rotas) — decidir; se usar query param, seguir o padrão da toolbar de
  oportunidades (`parseView`).
- **Escala/zoom do eixo do Gantt** (dia/semana/mês) e como lidar com tarefas sem
  data — decidir com bom senso; comportamento para datas ausentes precisa estar
  definido, não pode quebrar o layout.
- **Onde o rollup é calculado** — view SQL (`opportunity_tasks_with_rollup`) ou
  função pura em `lib/`. O requisito é que seja **fonte única** e não
  persistido; se houver espelho client+SQL, precisa de teste de paridade (o
  projeto já tem esse padrão em `score.ts`).
- Ordenação default de tarefas na Lista e dentro de cada coluna do Kanban.
- Rótulo/ID visível da tarefa (ex. "T001") e ícones/badges de status.
- Estado de expandir/comprimir: local (`useState`) vs. persistido na URL —
  requisito é apenas que seja **por tarefa**, não global.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Analog end-to-end (vertical slice de riscos — copiar a estrutura)
- `lib/opportunities/risk-schema.ts` — Zod `.strict()`, enums minúsculos, campos
  server-derived rejeitados no input.
- `lib/opportunities/risk-actions.ts` — server actions create/update/delete:
  `auth.getUser()` → `profile.tenant_id` → mutação escopada por tenant →
  `revalidatePath`. **Modelar as task actions a partir daqui.**
- `lib/opportunities/queries.ts` — whitelist de colunas (sem `select('*')`).
- `lib/opportunities/risk-labels.ts` — mapa enum(DB, minúsculo) → label PT da UI.
- `components/opportunities/modal/risk/{RiskTable,RiskForm,RiskFormDialog,RiskFormPage,DeleteRiskButton}.tsx`
  — tabela + form + dialog empilhado + exclusão com confirmação.
- `app/(app)/opportunities/[id]/riscos/**` — sub-rotas de CRUD (new / [id]/edit).

### Migration analog (tenant coherence + RLS + trigger)
- `supabase/migrations/0032_opportunity_assignees.sql` — **o analog mais
  importante da migration desta fase**: `tenant_id` denormalizado, trigger que
  exige que a oportunidade E o profile estejam no mesmo tenant, policies por
  papel (`current_tenant_id()`, `current_user_role()`, `is_platform_admin()`),
  idempotência e cabeçalho write-only mode.
- `supabase/migrations/0011_*.sql` — padrão de tabela filha com as 4 policies
  (`opportunity_risks`).

### Views a espelhar
- `components/opportunities/kanban/{Board,Column,Card}.tsx` — Kanban com dnd-kit
  (`useDroppable`, drag target, contagem por coluna). Analog do Kanban de tarefas.
- `components/opportunities/gantt/GanttChart.tsx` e
  `components/proposal/GanttChart.tsx` — **Gantt zero-dep**: barras posicionadas
  por `leftPct`/`widthPct` sobre um span temporal, legenda, `ongoing`. Analog do
  Gantt de tarefas (D-07).
- `components/opportunities/table.tsx` + `cells.tsx` — padrão de tabela/lista.

### Pessoas do tenant
- `lib/opportunities/assignees.ts` + `assignee-types.ts` — `AssignableProfile`,
  leitura dos profiles atribuíveis do tenant (D-08).
- `lib/opportunities/assignee-actions.ts` — gate de escrita por papel
  (`tenant_admin` atribui; `member`/`viewer` não).
- `components/opportunities/AssigneesPanel.tsx` — UI de seleção de pessoa já
  existente; referência de estilo para o select de responsável.

### Regra de projeto
- `docs/PROJETO.md` — princípios 1 (RLS/tenant), 3 (derivado é calculado, nunca
  persistido), idioma (código inglês / UI pt-BR). **Atenção:** o número de
  migration (0027) e a menção a shadcn no docs/PROJETO.md estão desatualizados — ver
  D-06 e D-09.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **dnd-kit já instalado** (`@dnd-kit/core` ^6.3.1, `@dnd-kit/sortable` ^10,
  `@dnd-kit/utilities` ^3.2.2) — zero dependência nova para o Kanban.
- **Gantt CSS zero-dep já existe em dois lugares** — zero dependência nova para
  o Gantt (D-07).
- **Busca de profiles do tenant já existe** (`assignees.ts`) — zero query nova
  para o select de responsável (D-08).
- **Trigger de coerência de tenant já escrito** em `0032` — copiar a forma para
  validar `assignee_id` da tarefa (D-04).
- Padrão de sub-rota de CRUD (`/opportunities/[id]/riscos/new`,
  `/[riskId]/edit`) pronto para clonar para tarefas.

### Established Patterns
- Enums minúsculos no DB + camada de labels PT na UI (`risk-labels.ts`).
- Server Components para leitura; `"use client"` só onde há interação
  (kanban, forms, dialogs).
- Mutação por server action com **tenant server-derived** — o client nunca envia
  `tenant_id` (defesa mass-assignment).
- Migrations em **write-only mode**: o arquivo é commitado e aplicado à mão no
  SQL Editor do Supabase Cloud; migrations são idempotentes e trazem cabeçalho
  explicando contexto/pré-requisitos.
- `lib/database.types.ts` é **hand-maintained** (type-gen bloqueado — MCP aponta
  para o projeto errado e `gen:types` não tem privilégio).
- Derivado nunca persistido: `score`, `rpa_score`, `opportunity_risks.priority`.
  O rollup de tarefa-pai entra nessa mesma família.

### Integration Points
- `supabase/migrations/0037_*.sql` — NOVO (tabela, enum, RLS, constraints,
  triggers).
- `lib/database.types.ts` — adicionar `opportunity_tasks` (Row/Insert/Update) e
  o enum de status **à mão**.
- `lib/opportunities/task-schema.ts`, `task-actions.ts`, `task-queries.ts` (ou
  extensão de `queries.ts`), `task-labels.ts` — NOVOS, espelhando os de risco.
- `components/opportunities/tasks/**` — NOVO (Lista, Kanban, Gantt, Form).
- `app/(app)/opportunities/[id]/**` — ponto de entrada das views/CRUD.
- `components/opportunities/modal/TabsNav.tsx` + `types.ts` — se as views forem
  uma aba do modal, registrar a aba aqui.
- `tests/schema/` e `tests/security/` — teste cross-tenant A≠B obrigatório
  (`skipIf` quando não há credencial, padrão do projeto).

</code_context>

<specifics>
## Specific Ideas

- Campos da tarefa/subtarefa (mesmo formulário nos dois níveis): título*,
  descrição, responsável (select de profiles do tenant), status, data de início,
  data de fim, motivo do bloqueio (condicional a `status = bloqueio`).
- Kanban: 4 colunas fixas; contador por coluna no header (como o Kanban de
  oportunidades já faz com FTE). Mover para Bloqueio abre um prompt pedindo o
  motivo — cancelar o prompt cancela a movimentação.
- Lista: linha da tarefa com chevron de expandir/comprimir; subtarefas indentadas
  abaixo; a linha da pai mostra span agregado e "n/m concluídas".
- Gantt: uma linha por tarefa; expandir revela as linhas das subtarefas; a barra
  da pai cobre do menor início ao maior fim das filhas, com preenchimento
  proporcional ao % concluído.
- `blocked_reason` deve ser exigido pelo Zod quando `status = 'bloqueio'` (regra
  no schema, não só na UI), e limpo/ignorado nos demais status.

</specifics>

<deferred>
## Deferred Ideas

Descartados **pelo PO** na abertura (não são gaps — são decisões):
- **Hierarquia de N níveis** (árvore livre) — descartada em favor de 2 níveis
  (D-01).
- **Múltiplos responsáveis por tarefa** (tabela de junção) — descartada em favor
  de 1 responsável (D-04).
- **Responsável por texto livre** (pessoa não cadastrada) — descartada; só
  profiles do tenant (D-04).
- **Colunas de Kanban configuráveis por tenant** — descartada; enum fixo de 4
  (D-03).
- **Coluna "Em Revisão"** — oferecida e não escolhida; o enum tem 4 valores.
- **Rollup persistido** (colunas `progress`/`computed_start`) — proibido por D-02.

Fora do escopo desta fase, candidatos a próxima:
- Visão cross-oportunidade de tarefas ("minhas tarefas" / board do tenant).
- Dependências entre tarefas e caminho crítico.
- Drag no Gantt para mover/redimensionar datas.
- Notificar o responsável ao ser atribuído (o projeto já tem e-mail
  transacional).
- Comentários/anexos/log de horas por tarefa.

</deferred>

---

*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Context gathered: 2026-08-04*
