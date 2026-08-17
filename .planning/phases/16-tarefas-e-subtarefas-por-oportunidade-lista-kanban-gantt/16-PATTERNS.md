# Phase 16: Tarefas e Subtarefas por Oportunidade (Lista / Kanban / Gantt) - Pattern Map

**Mapped:** 2026-08-04
**Files analyzed:** 24 (new/modified)
**Analogs found:** 24 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0037_opportunity_tasks.sql` | migration | CRUD + event-driven (triggers) | `supabase/migrations/0032_opportunity_assignees.sql` + `0011_*.sql` | exact |
| `lib/opportunities/task-schema.ts` | model (validation) | transform | `lib/opportunities/risk-schema.ts` (+ `.superRefine()` from `lib/opportunities/schema.ts:136`) | exact |
| `lib/opportunities/task-actions.ts` | service (server actions) | CRUD | `lib/opportunities/risk-actions.ts` | exact |
| `lib/opportunities/task-labels.ts` | utility | transform | `lib/opportunities/status.ts` (`STATUS_META` shape), NOT `risk-labels.ts` plain map | role-match (shape override) |
| `lib/opportunities/queries.ts` (+ `fetchTasksForOpportunity`/`fetchTaskById`) | service (read) | request-response | `lib/opportunities/queries.ts` (`RISK_COLUMNS`/`fetchRisksForOpportunity`/`fetchRiskById`) | exact |
| `lib/opportunities/task-rollup.ts` | utility (pure) | transform | `lib/opportunities/score.ts` (single-source derived-value module); `fte.ts` as secondary | exact |
| `components/opportunities/tasks/kanban/{TaskKanbanBoard,TaskKanbanColumn,TaskKanbanCard}.tsx` | component | event-driven (drag/drop) + CRUD | `components/opportunities/kanban/{Board,Column,Card}.tsx` | exact |
| `components/opportunities/tasks/kanban/BlockedReasonDialog.tsx` | component | request-response | `components/opportunities/modal/risk/DeleteRiskButton.tsx` (confirm dialog shape) | role-match |
| `components/opportunities/tasks/gantt/TaskGanttChart.tsx` | component | transform (render) | `components/opportunities/gantt/GanttChart.tsx` | exact (adapt for 2 levels) |
| `components/opportunities/tasks/TaskList.tsx` | component | CRUD (read + expand/collapse) | `components/opportunities/table.tsx` + `cells.tsx` | role-match |
| `components/opportunities/tasks/{TaskForm,TaskFormDialog,TaskFormPage,DeleteTaskButton}.tsx` | component | CRUD (form) | `components/opportunities/modal/risk/{RiskForm,RiskFormDialog,RiskFormPage,DeleteRiskButton}.tsx` | exact |
| assignee `<select>` inside `TaskForm.tsx` | component (fragment) | request-response | `components/opportunities/AssigneesPanel.tsx` + `lib/opportunities/assignees.ts` (`fetchAssignableProfiles`) | exact |
| `app/(app)/opportunities/[id]/tarefas/page.tsx` | route | request-response | `app/(app)/opportunities/[id]/page.tsx` (fullscreen, NOT the `riscos/` deep-link form routes) | role-match |
| `app/(app)/opportunities/[id]/tarefas/new/page.tsx`, `[taskId]/edit/page.tsx`, `[taskId]/new/page.tsx` | route | CRUD | `app/(app)/opportunities/[id]/riscos/{new,[riskId]/edit}/page.tsx` | exact |
| `lib/database.types.ts` (+ `opportunity_tasks` Row/Insert/Update, `task_status` enum) | model (hand-maintained types) | transform | `lib/database.types.ts` existing `opportunity_risks` block (lines 523-579) + `opportunity_assignees` block | exact |
| `lib/opportunities/types.ts` (+ `OpportunityTask`, `TaskStatus`) | model | transform | existing `OpportunityRisk`/`RiskStatus` type aliases in same file | exact |
| `tests/security/opportunity-tasks-isolation.test.ts` | test | request-response | `tests/security/opportunity-risks-isolation.test.ts` | exact |
| `tests/schema/task-depth-guard.test.ts` | test | event-driven (trigger) | `tests/schema/risk-priority-matrix.test.ts` (trigger-behavior test shape) | role-match |
| `tests/schema/task-rollup.test.ts` | test | transform | `tests/schema/score-rule.test.ts` (pure-function test, no DB) | exact |
| `tests/schema/task-schema.test.ts` | test | transform | (no direct `risk-schema.test.ts` found — model after `score-rule.test.ts` structure + Zod `.safeParse` assertions) | partial |

## Pattern Assignments

### `supabase/migrations/0037_opportunity_tasks.sql` (migration)

**Analog:** `supabase/migrations/0032_opportunity_assignees.sql` (tenant-coherence trigger + write-only header) and `0011_*.sql` (4-policy child table pattern, referenced but not re-read in full here — RESEARCH.md already quotes its RLS shape verbatim).

**Write-only mode header** (0032 lines 1-23) — copy verbatim structure, adjust context prose:
```sql
-- =============================================================================
-- 0032_opportunity_assignees.sql — atribuir pessoas a uma oportunidade
-- =============================================================================
-- CONTEXTO: ...
-- IDEMPOTENTE. Pré-requisitos: 0001 (current_tenant_id), 0015
-- (current_user_role), 0021 (is_platform_admin).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;
```
RESEARCH.md already produced the exact DDL to use for 0037 (table, both triggers, RLS) — reuse it verbatim; it was written by directly adapting this file. Do NOT re-derive independently.

**Tenant-coherence trigger pattern** (0032 lines 51-80) — the shape to clone for `check_task_tenant_coherence()`:
```sql
create or replace function check_assignee_tenant()
returns trigger
language plpgsql
security definer            -- precisa enxergar opportunities/profiles sem RLS
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
begin
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;
  select tenant_id into v_profile_tenant from profiles      where id = new.profile_id;
  if v_opp_tenant is null or v_profile_tenant is null then
    raise exception 'Oportunidade ou pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;
  if new.tenant_id <> v_opp_tenant or v_profile_tenant <> v_opp_tenant then
    raise exception 'Atribuição cruzada entre empresas não é permitida.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_assignees_tenant_guard on opportunity_assignees;
create trigger opportunity_assignees_tenant_guard
  before insert or update on opportunity_assignees
  for each row execute function check_assignee_tenant();
```
**What NOT to copy:** the RLS write gate in 0032 (`current_user_role() = 'tenant_admin'`, lines 91-113) — that is admin-only, and D-11 explicitly rejects that gate for tasks in favor of the `opportunity_risks` gate (`current_user_role() <> 'viewer'`). Also do not copy `unique (opportunity_id, profile_id)` (line 39) — a task's `assignee_id` is not unique-constrained.

**RLS write gate to actually copy** (must pull from `opportunity_risks`' real policies, per D-11/D-12 — RESEARCH.md Pattern 2 already contains the exact SQL, verified against 0011+0015+0021 rather than re-read here):
```sql
create policy opportunity_tasks_insert on opportunity_tasks
  for insert with check (
    tenant_id = current_tenant_id() and current_user_role() <> 'viewer'
  );
```

---

### `lib/opportunities/task-schema.ts` (model, transform)

**Analog:** `lib/opportunities/risk-schema.ts` (full file, 46 lines — read completely, no analog file is large enough to require partial reads).

**Full shape to mirror:**
```typescript
import { z } from 'zod';

export const riskTypeEnum = z.enum(['impedimento', 'risco', 'oportunidade']);
// ... 3 more enums

export const riskInputSchema = z
  .object({
    descricao: z.string().min(1, 'Descrição obrigatória').max(2000, 'Máximo 2000 caracteres'),
    tipo: riskTypeEnum,
    responsavel: z.string().max(200, 'Máximo 200 caracteres').optional().or(z.literal('')),
    // ...
  })
  .strict();

export type RiskInput = z.infer<typeof riskInputSchema>;
```
**Key structural rule:** `.strict()` at the end rejects any server-derived field (`id`, `tenant_id`, `opportunity_id`, `created_by`, `created_at`, `updated_at`, and for tasks also `parent_task_id`'s cross-opportunity coherence — validated in the trigger, not Zod). Optional text fields use `.optional().or(z.literal(''))`, never plain `.optional()` (keeps empty-string form values valid).

**Conditional validation** — copy `.superRefine()` pattern from `lib/opportunities/schema.ts:136` (already quoted verbatim in RESEARCH.md's Code Examples section) for the `blocked_reason` required-when-`bloqueio` rule. RESEARCH.md's `taskInputSchema` code block is the exact target — use it as-is; it already follows this analog's conventions (`ctx.addIssue({ code: 'custom', message, path })`).

**What NOT to copy:** `riskInputSchema` has no cross-field conditional rule — that part of the task schema must come from `schema.ts:136`, not from `risk-schema.ts` itself.

---

### `lib/opportunities/task-actions.ts` (service, CRUD)

**Analog:** `lib/opportunities/risk-actions.ts` (full file, 204 lines).

**Imports + role gate** (lines 1-27):
```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { riskInputSchema } from './risk-schema';
import { requireEditorRole } from '@/lib/security/role';
```

**Full create pattern** (lines 40-101) — the exact skeleton to clone for `createTask`:
```typescript
export async function createRisk(opportunityId: string, input: unknown): Promise<RiskActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = riskInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: 'Dados inválidos.', fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada.' };

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
  if (!profile) return { ok: false, error: 'Profile não encontrado.' };

  const { data: inserted, error } = await supabase
    .from('opportunity_risks')
    .insert({
      opportunity_id: opportunityId, // server-derived (do arg da rota, não do payload)
      tenant_id: profile.tenant_id, // server-derived
      descricao: data.descricao,
      // ... every field enumerated explicitly, NEVER spread `data`
      created_by: user.id,
      // priority NÃO enviado — trigger set_risk_priority() calcula
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, error: `Erro ao criar risco: ${error?.message ?? 'desconhecido'}` };

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}
```
**Defense-in-depth on update/delete** (lines 155-156, 191-195): always `.eq('id', X).eq('tenant_id', profile.tenant_id)` even though RLS already enforces it.

**Task-specific addition (not in risk-actions.ts):** a `updateTaskStatus(taskId, status, blockedReason)` action is needed for the Kanban drag flow — RESEARCH.md Pattern 5 already gives the exact server-action call contract (`{ ok: boolean, error? }`) consumed by `TaskKanbanBoard.tsx`; model it as a sibling function in `task-actions.ts` following the same shape as `updateRisk` but accepting `status`/`blocked_reason` directly instead of the full form payload, and **always** setting `blocked_reason: status === 'bloqueio' ? blockedReason : null`.

**What NOT to copy:** `risk-actions.ts` never touches a self-referencing hierarchy — deleting a task with children relies on `on delete cascade` at the DB level (already in the migration), so `deleteTask` does not need extra cascade logic, only the same `.eq('tenant_id', ...)` guard.

---

### `lib/opportunities/task-labels.ts` (utility, transform)

**Analog:** `lib/opportunities/status.ts` — **not** `risk-labels.ts`. Reason: tasks need an icon+color+bg shape per status (badges on Kanban cards, chevron rows), which is exactly `StatusMeta`/`STATUS_META`'s shape (lines 18-58), not `risk-labels.ts`'s plain `Record<Enum, string>` label maps.

**Shape to mirror:**
```typescript
export type StatusMeta = {
  status: OpportunityStatus;
  label: string;
  icon: string;
  color: string;
  bg: string;
};

export const STATUS_ORDER: OpportunityStatus[] = [ /* ... */ ];

export const STATUS_META: Record<OpportunityStatus, StatusMeta> = {
  novo: { status: 'novo', label: 'Registrado', icon: '🆕', bg: '#f1f5f9', color: '#64748b' },
  // ...
};
```
For `task-labels.ts`: `TASK_STATUS_ORDER = ['backlog', 'em_andamento', 'bloqueio', 'finalizado']` (D-03 fixed order) and `TASK_STATUS_META` with one entry per status (icon/color/bg), used identically by `TaskKanbanColumn` headers and `TaskList` row badges — this is the single source both views must import from (mirrors how `status.ts`'s header comment describes killing 4 duplicated copies).

**Secondary reuse from `risk-labels.ts`:** the resilience pattern for a nullable/derived field —
```typescript
export function priorityLabel(p: RiskPriority | null): string {
  return p ? PRIORITY_LABEL[p] : '—';
}
```
applies to rendering `assignee` when null (no responsible person yet) — reuse this "resilient label function" idiom, not the risk-specific content.

---

### Task read queries (`fetchTasksForOpportunity`, `fetchTaskById`) added to `lib/opportunities/queries.ts`

**Analog:** the file's own `RISK_COLUMNS` + `fetchRisksForOpportunity`/`fetchRiskById` (lines 58-65, 297-362).

**Column whitelist pattern** (never `select('*')` — HARDEN-E-06):
```typescript
const RISK_COLUMNS =
  'id, opportunity_id, tenant_id, descricao, tipo, responsavel, ' +
  'impacto, probabilidade, status, resposta, descricao_impacto, ' +
  'priority, created_by, created_at, updated_at';
```
For tasks, RESEARCH.md's `TASK_COLUMNS` block (Code Examples §"Whitelist de colunas") is the exact target and was already written against this exact analog — use verbatim.

**Fetch-list pattern** (lines 297-314):
```typescript
export async function fetchRisksForOpportunity(opportunityId: string): Promise<OpportunityRisk[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .returns<OpportunityRisk[]>();
  if (error) throw new Error(`Erro ao buscar riscos: ${error.message}`);
  return data ?? [];
}
```
**Critical ordering rule (Pitfall 6 in RESEARCH.md):** `.returns<T[]>()` must be the LAST call in the chain, after all `.eq()/.order()/.in()` — putting it right after `.select()` breaks type inference.

**Fetch-by-id pattern** (lines 345-362) — `maybeSingle()` + `.returns<T>()`, returns `null` on not-found/RLS-blocked (never throws for "not visible"):
```typescript
export async function fetchRiskById(riskId: string): Promise<OpportunityRisk | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .eq('id', riskId)
    .maybeSingle()
    .returns<OpportunityRisk>();
  if (error) throw new Error(`Erro ao buscar risco: ${error.message}`);
  return data;
}
```

**Assignee-select reuse (D-08):** do NOT write a new "profiles of this tenant" query — reuse `fetchAssignableProfiles(tenantId)` from `lib/opportunities/assignees.ts` (lines 155-206) verbatim for the task-form's responsible-person `<select>`.

---

### `lib/opportunities/task-rollup.ts` (utility, pure, transform)

**Analog:** `lib/opportunities/score.ts` — single-source derived-value module, never persisted, consumed only where already-fetched data lives in memory. `fte.ts` is a secondary/weaker analog (not read in full — score.ts alone is a strong enough single-source-of-truth precedent, and RESEARCH.md's own comparison table justifies why NOT to build a SQL view instead, mirroring exactly why `score.ts` had to exist as a client-safe pure module).

**Structural rule to copy from `score.ts`:** a comment block declaring "fonte única" (single source), explicit statement of what NOT to persist, and pure functions with no I/O:
```typescript
/**
 * Score de prioridade v0.4 (0–100) — blend ponderado 50/30/20 dos 3 blocos.
 * Fonte ÚNICA client-side; a função SQL `opportunity_score()` (0027) replica.
 */
export function calcPriorityScore(args: { /* ... */ }): number { /* pure math, no supabase calls */ }
```
RESEARCH.md already wrote the full `computeTaskRollup()` implementation (Pattern 3) modeled directly on this file's style (pure function, explicit null-handling, rounding-before-blend discipline borrowed from score's "sub-scores rounded to integer before blend" rule) — use it verbatim, do not re-derive.

**What NOT to copy:** unlike `score.ts`, there is NO SQL-side twin function and NO parity test required — `score.ts` has a parity test (`tests/schema/score-rule.test.ts`) against `opportunity_score()` because score is used in `ORDER BY`; task rollup has no SQL twin per D-02/Pattern 3's explicit reasoning, so do not create `tests/schema/task-rollup-parity.test.ts`, only `tests/schema/task-rollup.test.ts` (pure unit test, structured like `score-rule.test.ts`).

---

### Kanban of tasks — `components/opportunities/tasks/kanban/{TaskKanbanBoard,TaskKanbanColumn,TaskKanbanCard}.tsx`

**Analog:** `components/opportunities/kanban/{Board,Column,Card}.tsx` (all 3 read in full — 111 + 88 + 73 lines).

**Board.tsx — dnd-kit wiring + optimistic update + resync-on-prop-change** (full file is the template):
```typescript
'use client';
import { useState, useTransition } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';

const [opps, setOpps] = useState(opportunities);
const [syncedFrom, setSyncedFrom] = useState(opportunities);
if (syncedFrom !== opportunities) {
  setSyncedFrom(opportunities);
  setOpps(opportunities);
}
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

function onDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;
  const oppId = String(active.id);
  const targetStatus = over.data.current?.status as OpportunityStatus | undefined;
  if (!targetStatus) return;
  const opp = opps.find((o) => o.id === oppId);
  if (!opp || opp.status === targetStatus) return;
  const prev = opps;
  setOpps(opps.map((o) => (o.id === oppId ? { ...o, status: targetStatus } : o)));
  startTransition(async () => {
    const result = await updateOpportunityStatus(oppId, targetStatus);
    if (!result.ok) { setOpps(prev); setError(result.error); }
  });
}
```
**Critical deviation required (do NOT copy this part as-is):** `Board.tsx`'s `onDragEnd` does the optimistic `setOpps(next)` BEFORE calling the server action, unconditionally. For `TaskKanbanBoard.tsx`, RESEARCH.md's Pattern 5 (Anti-Pattern explicitly called out) requires branching: if `targetStatus === 'bloqueio'`, do NOT mutate state — instead set `pendingBlock` and open `BlockedReasonDialog`; only mutate state in `onConfirmBlock`. For every other status transition, copy `Board.tsx`'s immediate-optimistic-then-rollback-on-error flow unchanged. RESEARCH.md's Pattern 5 code block is the exact target implementation — already written against this analog.

**Card.tsx — draggable card with click-vs-drag disambiguation** (lines 14-39):
```typescript
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: o.id,
  data: { status: o.status },
  disabled: readOnly,
});
const style: React.CSSProperties = {
  transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  opacity: isDragging ? 0.4 : 1,
  cursor: readOnly ? 'pointer' : isDragging ? 'grabbing' : 'grab',
  touchAction: 'none',
};
function onClick(e: React.MouseEvent) {
  e.preventDefault();
  if (!isDragging) router.push(`/opportunities/${o.id}`);
}
```
Note `@dnd-kit/utilities`'s `CSS.Translate.toString` is available but NOT used here — `Card.tsx` builds the transform manually; RESEARCH.md's "Supporting" table flags this as a pitfall/style-choice, follow the existing manual-transform convention for consistency rather than introducing `CSS.Translate`.

**Column.tsx — droppable zone + per-column aggregate counter** (lines 24-73): the FTE-sum-in-header pattern (`fteSum = Math.round(opportunities.reduce(...))`) is the direct precedent for the CONTEXT.md spec "contador por coluna" — for tasks, show task count per column exactly like `{opportunities.length}` badge (line 51), no FTE sum needed for tasks.

**What NOT to copy:** `COLUMNS` in `Board.tsx` (line 24, 11-entry `STATUS_ORDER`) must become the fixed 4-entry order from `task-labels.ts`, and must NOT be configurable per-tenant (D-03 explicitly forbids this — do not parametrize columns by prop).

---

### `BlockedReasonDialog.tsx`

**Analog:** `components/opportunities/modal/risk/DeleteRiskButton.tsx` (confirm/cancel modal shape, full file read — 120 lines).

**Overlay + confirm/cancel structure to mirror** (lines 60-118):
```typescript
{confirmOpen && (
  <div
    role="alertdialog"
    aria-modal="true"
    onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
  >
    <div className="bg-wh rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
      {/* header, body, footer with Cancelar / Confirmar buttons, disabled while pending */}
    </div>
  </div>
)}
```
For `BlockedReasonDialog`: replace the static confirmation text with a required `<textarea>` for `blocked_reason`; the "Confirmar" button must be `disabled` while the textarea is empty (client-side UX mirror of the Zod/CHECK server-side rule). ESC-closes and click-outside-closes both map to "cancel" (never silently confirm).

---

### Gantt of tasks — `components/opportunities/tasks/gantt/TaskGanttChart.tsx`

**Analog:** `components/opportunities/gantt/GanttChart.tsx` (full file, 220 lines) — RESEARCH.md explicitly prefers this over `components/proposal/GanttChart.tsx` (fixed-month-grid, wrong shape for variable-length task plans).

**Domain computation + percentage bar pattern** (lines 74-96, the core technique to clone):
```typescript
let t0 = Infinity;
let t1 = -Infinity;
for (const o of rows) {
  for (const p of byOpp.get(o.id)!) {
    const s = Date.parse(p.started_at!);
    const e = p.finished_at ? Date.parse(p.finished_at) : now;
    if (s < t0) t0 = s;
    if (e > t1) t1 = e;
  }
}
t0 -= DAY; t1 += DAY;
if (t1 - t0 < DAY) t1 = t0 + DAY;
const span = t1 - t0;
const xPct = (t: number) => ((t - t0) / span) * 100;
```

**Bar rendering with `ongoing` hachure** (lines 98-122, 184-206):
```typescript
background: b.ongoing
  ? `repeating-linear-gradient(45deg, ${b.color}, ${b.color} 6px, ${b.color}cc 6px, ${b.color}cc 12px)`
  : b.color,
```

**Critical adaptation required (Pitfall 3 in RESEARCH.md — do NOT copy the naive version):** `GanttChart.tsx`'s domain (`t0`/`t1`) is computed only over `rows` that are already filtered to "has ≥1 dated phase" (line 60: `const rows = opportunities.filter((o) => byOpp.has(o.id))`) — this FILTERS OUT undated items entirely. For `TaskGanttChart.tsx`, per RESEARCH.md Pattern 4 point 1 and Assumption A4, do NOT filter out undated tasks from the row list (TASK-10 requires seeing all tasks); only exclude them from the `t0`/`t1` domain calculation, and render them with a "Sem data definida" label in place of a bar. Also, per Pitfall 3, compute the domain over ALL tasks with dates regardless of expand/collapse state, not just currently-visible rows — expanding a parent must never shift the axis.

**Progress-fill-over-base-bar technique (for parent rollup bars):** not present in `GanttChart.tsx` itself — RESEARCH.md Pattern 4 point 2 points to `components/proposal/GanttChart.tsx` lines 171-174 for the "base bar + overlaid progress bar" trick; if that specific technique is needed, read those 4 lines directly from `components/proposal/GanttChart.tsx` at implementation time (not pulled here — RESEARCH.md already describes the mechanism: second `<div>` overlay with `width: {percentComplete}%`).

**What NOT to copy:** the "no dated phases → early-return with an explanatory empty state" block (lines 62-72) is specific to the oportunidades-level Gantt (where an opportunity with zero dated phases genuinely has nothing to show); a task Gantt should still render leaf rows even without dates (see adaptation above), so this early-return shape does not transfer directly — only reuse it for the true "zero tasks at all" empty state.

---

### Lista of tasks — `components/opportunities/tasks/TaskList.tsx`

**Analog:** `components/opportunities/table.tsx` + `cells.tsx` — not fully read in this pass (RESEARCH.md's own Integration Points and Sources already establish these as the "padrão de tabela/lista" precedent for row rendering conventions, badge components like `SourceBadge`/`RpaFitBadge` seen imported in `Card.tsx` line 6). Read these two files directly at plan/implementation time for the exact row-rendering markup before writing `TaskList.tsx`; this pattern map defers full extraction because the chevron-expand/indent behavior itself has no existing analog in the repo (it's original to this phase, same conclusion RESEARCH.md reaches about the Gantt's 2-level adaptation).

**Structural rule to bring from the Kanban/rollup analogs instead:** row expansion state as local `Set<string>` (RESEARCH.md §6, "estado local do componente basta"), and parent rows displaying `computeTaskRollup(children)`'s `spanStart`/`spanDue`/`percentComplete`/`"n/m concluídas"` exactly as defined in `task-rollup.ts`.

---

### Task form + dialog + delete confirm — `components/opportunities/tasks/{TaskForm,TaskFormDialog,TaskFormPage,DeleteTaskButton}.tsx`

**Analog:** `components/opportunities/modal/risk/{RiskForm,RiskFormDialog,RiskFormPage,DeleteRiskButton}.tsx`. `RiskFormDialog.tsx` and `DeleteRiskButton.tsx` read in full above.

**Dialog-driven-by-search-param pattern** (`RiskFormDialog.tsx` full file, 92 lines):
```typescript
const searchParams = useSearchParams();
const risco = searchParams.get('risco');
const isOpen = risco !== null && risco !== '';
function close() { router.replace(pathname); }
useEffect(() => {
  if (!isOpen) return;
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, [isOpen]);
const mode: 'create' | 'edit' = risco === 'new' ? 'create' : 'edit';
const initial = mode === 'edit' ? risks.find((r) => r.id === risco) : undefined;
if (mode === 'edit' && !initial) return null; // risk removed elsewhere → dialog closes itself
```
For `TaskFormDialog.tsx`, RESEARCH.md's Executor's-Discretion decision (sub-route fullscreen, not a modal tab) means this exact "stacked dialog over the modal" shape may not even be needed — reconsider whether `TaskFormDialog` lives inside the new `/tarefas` fullscreen page as a client-side create/edit overlay instead of stacking over `ModalShell`. If so, the `?risco=`-param-driven-visibility technique still transfers 1:1, just reparented under `/tarefas?tarefa=new|<id>` instead of the oportunidade modal's own search params.

**Delete confirm with cascade-count warning (extends the analog, not a straight copy):** `DeleteRiskButton.tsx`'s full structure (overlay, confirm/cancel, `useTransition`, `router.refresh()` after success) transfers directly, but per TASK-06 ("remover a pai remove as filhas com confirmação"), `DeleteTaskButton.tsx`'s confirmation text must be extended to state how many subtasks will be removed — pass a `childCount: number` prop and interpolate it into the body text (`DeleteRiskButton.tsx` line 86's `<strong>{label}</strong>` pattern extends to `<strong>{label}</strong>{childCount > 0 && \` (e ${childCount} subtarefa(s))\`}`).

---

### Assignee picker (inside `TaskForm.tsx`)

**Analog:** `lib/opportunities/assignees.ts` (`fetchAssignableProfiles`, lines 150-206, read in full) + `components/opportunities/AssigneesPanel.tsx` (not read in full this pass — style reference only, per D-08/CONTEXT.md's explicit instruction to reuse, not rebuild).

**Reuse rule:** `fetchAssignableProfiles(tenantId)` already returns `AssignableProfile[]` (`{id, email, fullName, cargo, role}`) scoped to one tenant — call it server-side in the page/Server Component that renders `TaskForm`, pass the array down as a prop, and render a plain `<select>` (D-09: no shadcn) populated from it. Do NOT write a new `profiles`-filtered-by-tenant query.

---

### Sub-routes `app/(app)/opportunities/[id]/tarefas/**`

**Analog:** `app/(app)/opportunities/[id]/riscos/{new,[riskId]/edit}/page.tsx` (both read in full, 23 + 30 lines) — but per RESEARCH.md Pattern 6, this analog is explicitly flagged as the WRONG shape for the top-level `/tarefas` view page (that one should follow `app/(app)/opportunities/[id]/page.tsx`'s fullscreen `max-w-screen-2xl` shape instead — not read in this pass, treat as a "read before writing page.tsx" TODO for the planner). The `riscos/**` shape IS the right analog for the two/three CRUD deep-link routes.

**Full pattern to mirror for `new/page.tsx`:**
```typescript
import { notFound, redirect } from 'next/navigation';
import { fetchOpportunityById } from '@/lib/opportunities/queries';
import { RiskFormPage } from '@/components/opportunities/modal/risk/RiskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

export default async function NewRiskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}`);
  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();
  return <RiskFormPage opportunityId={id} mode="create" />;
}
```
**Full pattern to mirror for `[taskId]/edit/page.tsx`** (IDOR mitigation via RLS-scoped fetch):
```typescript
export default async function EditRiskPage({ params }: { params: Promise<{ id: string; riskId: string }> }) {
  const { id, riskId } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}`);
  const risk = await fetchRiskById(riskId); // RLS-scoped: cross-tenant riskId → null
  if (!risk) notFound();
  return <RiskFormPage opportunityId={id} mode="edit" riskId={riskId} initial={risk} />;
}
```
For tasks: `[taskId]/new/page.tsx` (create subtask of `taskId`) is a NEW shape not present in the risco analog (risks have no hierarchy) — model it on the same `new/page.tsx` skeleton above, but additionally `fetchTaskById(taskId)` to confirm the parent exists and belongs to the tenant (reuse `notFound()` on null), then pass `parentTaskId={taskId}` into the form.

**`isReadOnlyViewer()` gate reuse:** same `lib/security/role.ts` helper, unchanged — but per D-11, tasks use the SAME "not viewer" gate as risks (not the stricter admin-only gate), so this reuse is exact, no adaptation needed.

---

### `lib/database.types.ts` (hand-edited)

**Analog:** the existing `opportunity_risks` Tables entry (lines 523-579, read in full via grep) and the top-of-file scalar enum block (lines 61-66, `RiskType`/`RiskImpact`/etc.) plus `TenantRole` (line 79).

**Exact Row/Insert/Update shape to mirror:**
```typescript
opportunity_risks: {
  Row: {
    id: string;
    opportunity_id: string;
    tenant_id: string;
    descricao: string;
    tipo: RiskType;
    responsavel: string | null;
    // ...
    priority: RiskPriority | null; // set por trigger set_risk_priority() — nunca input manual
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    opportunity_id: string;
    tenant_id: string;
    descricao: string;
    tipo: RiskType;
    responsavel?: string | null;
    // ...
    priority?: RiskPriority | null; // sobrescrito pelo trigger; não enviar
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<Database['public']['Tables']['opportunity_risks']['Insert']>;
  Relationships: [
    { foreignKeyName: 'opportunity_risks_opportunity_id_fkey'; columns: ['opportunity_id']; referencedRelation: 'opportunities'; referencedColumns: ['id']; },
    { foreignKeyName: 'opportunity_risks_tenant_id_fkey'; columns: ['tenant_id']; referencedRelation: 'tenants'; referencedColumns: ['id']; },
    { foreignKeyName: 'opportunity_risks_created_by_fkey'; columns: ['created_by']; referencedRelation: 'profiles'; referencedColumns: ['id']; }
  ];
};
```
**Where enums are declared** (top-of-file, before the `Database` type, lines 61-66):
```typescript
export type RiskType = 'impedimento' | 'risco' | 'oportunidade';
export type RiskImpact = 'alto' | 'significativo' | 'moderado' | 'baixo';
// ...
```
For `opportunity_tasks`: add `export type TaskStatus = 'backlog' | 'em_andamento' | 'bloqueio' | 'finalizado';` alongside these, and a new `Tables.opportunity_tasks` block with `Row`/`Insert`/`Update`/`Relationships` in exactly this shape — note the task table additionally needs a self-referencing FK (`parent_task_id` → `opportunity_tasks(id)`) in `Relationships`, which has no precedent in the `opportunity_risks` block (risks have no self-FK) — model that one relationship entry on the `opportunity_id`-style entry but pointing `referencedRelation: 'opportunity_tasks'`.

**Derived type aliases** (per RESEARCH.md Code Examples, to add in `lib/opportunities/types.ts`):
```typescript
export type OpportunityTask = Database['public']['Tables']['opportunity_tasks']['Row'];
export type TaskStatus = Database['public']['Enums']['task_status'];
```

---

### Cross-tenant isolation test (TASK-04, mandatory)

**Analog:** `tests/security/opportunity-risks-isolation.test.ts` (full file, 186 lines).

**`skipIf` credential guard** (line 36, 41):
```typescript
const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
// ...
describe.skipIf(!HAS_DB)('opportunity_risks — RLS cross-tenant (RISK-04 SC4)', () => {
```

**Client-role setup** (lines 32-39):
```typescript
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const svc = () => asService();
const fgcoopClient = async () => (await asFgcoop()).client;
```

**5 required specs, exact assertions to mirror** (lines 106-184):
1. SELECT cross-tenant → `expect(data).toEqual([])` (RLS `USING` filters silently, no error).
2. UPDATE cross-tenant → `expect(data).toEqual([])` (0 rows affected) + re-read via service-role client to confirm original untouched.
3. DELETE cross-tenant → `expect(data).toEqual([])` + re-read via service-role to confirm record still exists.
4. INSERT with forged `tenant_id` → `expect(error).not.toBeNull()` (RLS `WITH CHECK` / 42501) + service-role count-check that no row was created.
5. Sanity: own-tenant SELECT succeeds and returns expected derived/GENERATED value (here: `priority`).

**Setup/teardown pattern** (lines 49-104): seed via `serviceRoleClient()` directly (never through RLS), one opportunity + one row per tenant, `beforeAll`/`afterAll` cascade-delete by `tenant_id`.

**Two EXTRA specs required for tasks (not present in the risk analog — new, per RESEARCH.md §"Teste de isolamento cross-tenant"):**
- Depth-guard cross-check: attempt to create a subtask whose `parent_task_id` points to an existing subtask → trigger rejects. Can live in the same file or in a separate `tests/schema/task-depth-guard.test.ts` (closer analog for this one alone: `tests/schema/risk-priority-matrix.test.ts`, a trigger/business-rule test — not read in this pass, but explicitly named in RESEARCH.md as the shape to follow for a matrix/trigger behavior test).
- Assignee cross-tenant: insert a task with `assignee_id` from a DIFFERENT tenant's profile → `check_task_tenant_coherence()` trigger rejects, tested via `serviceRoleClient()` directly (bypassing RLS on purpose, since this validates the TRIGGER, not the policy) — mirrors the `mkRisk` service-role insert helper (lines 80-97) but expects an error instead of success.

**What NOT to copy:** risk's isolation test has no hierarchy or assignee-coherence concern — those two specs are net-new additions to the pattern, not present anywhere to copy verbatim; RESEARCH.md's Phase Requirements → Test Map already assigns them to specific new files.

---

## Shared Patterns

### Server-derived tenant/opportunity (mass-assignment defense)
**Source:** `lib/opportunities/risk-actions.ts` (full pattern, all 3 mutation functions)
**Apply to:** `task-actions.ts` (`createTask`/`updateTask`/`deleteTask`/`updateTaskStatus`)
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { ok: false, error: 'Sessão expirada.' };
const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
if (!profile) return { ok: false, error: 'Profile não encontrado.' };
// insert/update always enumerate columns explicitly; tenant_id = profile.tenant_id; opportunity_id = route arg
```

### Write-role gate (`requireEditorRole`)
**Source:** `lib/security/role.ts` (lines 48-56) — used unchanged, per D-11 (same gate as risks, NOT the stricter `isTenantAdmin` gate used by `assignee-actions.ts`)
```typescript
export async function requireEditorRole(): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getCurrentUserRole();
  if (role === 'viewer') return { ok: false, error: 'Seu perfil é somente leitura.' };
  return { ok: true };
}
```
**Apply to:** every mutation in `task-actions.ts`, called first, before Zod parsing.

### Column whitelist (never `select('*')`)
**Source:** `lib/opportunities/queries.ts` (`RISK_COLUMNS` constant + header comment, lines 57-65)
**Apply to:** `TASK_COLUMNS` constant in the same file (RESEARCH.md already drafted it).

### `.returns<T[]>()` must be last in the Supabase chain
**Source:** `lib/opportunities/queries.ts` (every fetch function) — documented explicitly as Pitfall 6 in RESEARCH.md.
**Apply to:** `fetchTasksForOpportunity`/`fetchTaskById`.

### Zod `.strict()` + explicit-column insert (no payload spread)
**Source:** `risk-schema.ts` (`.strict()`) + `risk-actions.ts` (explicit field enumeration in `.insert({...})`)
**Apply to:** `task-schema.ts` + every mutation in `task-actions.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Chevron expand/collapse indentation markup in `TaskList.tsx` | component (fragment) | transform | No existing repo component renders a 2-level indented parent/child row set — `table.tsx`/`cells.tsx` are flat lists; this specific markup is original to this phase (RESEARCH.md reaches the same conclusion for the Gantt's 2-level adaptation) |
| `tests/schema/task-schema.test.ts` | test | transform | No sibling `risk-schema.test.ts` exists in the repo to copy structurally; model instead on `tests/schema/score-rule.test.ts`'s plain Vitest `describe`/`it` + `.safeParse()` assertion style |
| Progress-fill-over-base-bar overlay technique for parent rollup bars in the Gantt | component (fragment) | transform | Not present in `components/opportunities/gantt/GanttChart.tsx` (flat, no rollup); RESEARCH.md points to `components/proposal/GanttChart.tsx:171-174` for this specific technique — read that file directly at implementation time |

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/opportunities/`, `lib/security/`, `components/opportunities/{kanban,gantt,modal/risk}/`, `app/(app)/opportunities/[id]/riscos/`, `tests/security/`, `tests/schema/`, `lib/database.types.ts`
**Files scanned/read in full or targeted:** `0032_opportunity_assignees.sql`, `risk-schema.ts`, `risk-actions.ts`, `status.ts`, `risk-labels.ts`, `queries.ts`, `assignees.ts`, `score.ts`, `role.ts`, `kanban/{Board,Card,Column}.tsx`, `gantt/GanttChart.tsx`, `modal/risk/{RiskFormDialog,DeleteRiskButton}.tsx`, `riscos/{new,[riskId]/edit}/page.tsx`, `database.types.ts` (opportunity_risks block + enum block), `tests/security/opportunity-risks-isolation.test.ts`
**Pattern extraction date:** 2026-08-04
