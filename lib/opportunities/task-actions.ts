'use server';

// =============================================================================
// task-actions.ts — server actions de `opportunity_tasks` (Phase 16, TASK-04/
// TASK-05/TASK-06)
// -----------------------------------------------------------------------------
// Modela `risk-actions.ts`. Camadas de defesa mass-assignment (T-16-02):
//   1. `taskInputSchema.strict()` rejeita id/tenant_id/opportunity_id/created_by
//      no input (parse falha com `unrecognized_keys`).
//   2. insert/update enumeram colunas explicitamente — sem spread cego de
//      `data`. `tenant_id` vem do escopo de escrita RESOLVIDO NO SERVIDOR
//      (Phase 17, D-11, `resolveWriteTenantId()`) — para papéis de cliente é
//      o tenant do profile; para `psw_staff` (multi-tenant por atribuição) é
//      o tenant da OPORTUNIDADE-ALVO, nunca o do profile.
//      `opportunity_id` vem do argumento de rota (não do payload).
//   3. `requireEditorRole()` barra role='viewer' antes de qualquer escrita
//      (D-11 — mesmo gate de `opportunity_risks`, NÃO o gate admin-only de
//      `assignee-actions.ts`). A RLS (0037) já bloqueia; falhar aqui devolve
//      mensagem pt-BR em vez do 42501 cru do Postgres.
//   4. `blocked_reason` é SEMPRE escrito explicitamente (Pitfall 4) — valor
//      validado quando `status === 'bloqueio'`, `null` em qualquer outro
//      status. `normalizeTaskStatusUpdate` (em `task-status.ts` — módulo puro,
//      pois este arquivo é `'use server'` e só pode exportar async) é a fonte ÚNICA dessa
//      regra — `createTask`, `updateTask` e `updateTaskStatus` consomem a
//      mesma função em vez de reimplementar a lógica de limpeza cada uma à
//      sua maneira (16-05).
//   5. `updateTask`/`deleteTask` NUNCA atualizam `parent_task_id` — a UI não
//      re-parenta (D-01); o trigger de profundidade (0037) recusaria de
//      qualquer forma.
//   6. Mensagens de erro devolvidas ao cliente são SEMPRE pt-BR genéricas —
//      nunca interpolam `error.message` do driver do banco (T-16-13,
//      Information Disclosure). Deviation em relação ao analog
//      `risk-actions.ts` (que interpola `error.message`), aplicada aqui e
//      retroativamente a `createTask` para fechar o mesmo threat nas quatro
//      mutações deste módulo.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { taskInputSchema } from './task-schema';
import { describeValidationError } from './validation-errors';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { normalizeTaskStatusUpdate } from './task-status';
import type { TaskStatus } from './types';

export type TaskActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type MutationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// =============================================================================
// createTask — insere nova tarefa (raiz ou subtarefa) após validação Zod
// =============================================================================
export async function createTask(
  opportunityId: string,
  input: unknown
): Promise<TaskActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;

  const normalized = normalizeTaskStatusUpdate(data.status, data.blocked_reason);
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      fieldErrors: { blocked_reason: [normalized.error] },
    };
  }

  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. Sem isso, um psw_staff criando tarefa numa oportunidade
  // atribuída de outro tenant carimbaria `tenant_id` da PSW na linha (o
  // trigger `check_task_tenant_coherence()`, 0037/0041, rejeitaria com erro
  // cru do banco em vez desta mensagem pt-BR clara).
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { data: inserted, error } = await supabase
    .from('opportunity_tasks')
    .insert({
      opportunity_id: opportunityId, // server-derived (do arg da rota, não do payload)
      tenant_id: tenantId, // server-derived — da oportunidade quando psw_staff
      parent_task_id: data.parent_task_id || null,
      title: data.title,
      description: data.description || null,
      status: normalized.status,
      priority: data.priority, // 0049 — Zod já aplicou o default 'media'
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      assignee_id: data.assignee_id || null,
      blocked_reason: normalized.blocked_reason, // sempre explícito (Pitfall 4)
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: 'Erro ao criar tarefa.' };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/tarefas`);
  return { ok: true, id: inserted.id };
}

// =============================================================================
// updateTask — atualiza os campos de uma tarefa/subtarefa existente
// -----------------------------------------------------------------------------
// NUNCA envia `parent_task_id` — a UI não re-parenta (D-01); o trigger de
// profundidade (0037) recusaria de qualquer forma. Escopo por identificador
// E por `tenant_id` do profile lido no servidor, defesa em profundidade sobre
// a RLS (USING + WITH CHECK).
// =============================================================================
export async function updateTask(
  taskId: string,
  opportunityId: string,
  input: unknown
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;

  const normalized = normalizeTaskStatusUpdate(data.status, data.blocked_reason);
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      fieldErrors: { blocked_reason: [normalized.error] },
    };
  }

  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = tarefa/oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { error } = await supabase
    .from('opportunity_tasks')
    .update({
      title: data.title,
      description: data.description || null,
      status: normalized.status,
      priority: data.priority, // 0049
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      assignee_id: data.assignee_id || null,
      blocked_reason: normalized.blocked_reason, // sempre explícito (Pitfall 4)
      // parent_task_id NÃO enviado — D-01, a UI nunca re-parenta.
      // priority_order TAMBÉM não — quem escreve a ordem é
      // `reorderTasks`/`set_task_priority_order` (0049); mandá-la daqui
      // apagaria a posição da tarefa a cada edição de título.
    })
    .eq('id', taskId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: 'Erro ao atualizar tarefa.' };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/tarefas`);
  return { ok: true };
}

// =============================================================================
// deleteTask — remove uma tarefa/subtarefa
// -----------------------------------------------------------------------------
// Sem lógica de cascata: `parent_task_id` tem `on delete cascade` na 0037 —
// apagar a pai apaga as filhas no banco. A confirmação explícita exigida por
// TASK-06 é responsabilidade da UI (DeleteTaskButton).
// =============================================================================
export async function deleteTask(
  taskId: string,
  opportunityId: string
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = tarefa/oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { error } = await supabase
    .from('opportunity_tasks')
    .delete()
    .eq('id', taskId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: 'Erro ao excluir tarefa.' };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/tarefas`);
  return { ok: true };
}

// =============================================================================
// updateTaskStatus — mutação de campo único que o Kanban (16-06) chama no
// drop de um card. `opportunityId` não é parâmetro (contrato exato que o
// Kanban consome) — por isso, diferente das demais mutações deste arquivo,
// esta lê a tarefa primeiro (SELECT autenticado, filtrado por RLS) só para
// descobrir a QUAL oportunidade ela pertence, e só então resolve o escopo de
// escrita (Phase 17, D-11) — não dá para chamar `resolveWriteTenantId()`
// antes de saber o `opportunity_id`. O `opportunity_id` final ainda é lido de
// volta do UPDATE (via `.select()`) para revalidar as rotas certas.
// =============================================================================
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  blockedReason: string | null
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const normalized = normalizeTaskStatusUpdate(status, blockedReason);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  const supabase = await createClient();

  // Leitura autenticada (RLS já escopa por tenant/atribuição) só para saber a
  // qual oportunidade a tarefa pertence — insumo obrigatório de
  // resolveWriteTenantId(). Tarefa invisível/inexistente aqui já é o mesmo
  // "fora do escopo" que a mutação abaixo recusaria de qualquer forma.
  const { data: task } = await supabase
    .from('opportunity_tasks')
    .select('opportunity_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: 'Tarefa não encontrada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, task.opportunity_id);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { data: updated, error } = await supabase
    .from('opportunity_tasks')
    .update({
      status: normalized.status,
      blocked_reason: normalized.blocked_reason, // sempre explícito (Pitfall 4)
    })
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .select('opportunity_id')
    .single();

  if (error || !updated) {
    return { ok: false, error: 'Erro ao atualizar status da tarefa.' };
  }

  revalidatePath(`/opportunities/${updated.opportunity_id}`);
  revalidatePath(`/opportunities/${updated.opportunity_id}/tarefas`);
  return { ok: true };
}
