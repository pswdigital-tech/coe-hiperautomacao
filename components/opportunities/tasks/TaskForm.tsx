'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTask, updateTask } from '@/lib/opportunities/task-actions';
import type { TaskInput } from '@/lib/opportunities/task-schema';
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_META,
  TASK_PRIORITY_ORDER,
  TASK_PRIORITY_META,
} from '@/lib/opportunities/task-labels';
import { assigneeName, type AssignableProfile } from '@/lib/opportunities/assignee-types';
import type {
  OpportunityTask,
  TaskStatus,
  TaskPriority,
} from '@/lib/opportunities/types';
import { DescriptionImageField } from '../DescriptionImageField';

type Props = {
  opportunityId: string;
  /** Candidatos a responsável — sempre do tenant da OPORTUNIDADE (D-08/TASK-03). */
  assignableProfiles: AssignableProfile[];
  /** Título da tarefa pai — presente só ao criar/editar subtarefa. */
  parentTitle?: string;
  /** Id da tarefa pai — nunca editável na UI (D-01 não re-parenta). */
  parentTaskId?: string;
  /** Chamado após salvar com sucesso (fechar dialog / navegar de volta). */
  onDone?: () => void;
  /** 'create' (default) ou 'edit' — 16-05 acrescenta o modo de edição. */
  mode?: 'create' | 'edit';
  /** Obrigatório quando mode === 'edit'. */
  taskId?: string;
  /** Valores atuais da tarefa quando mode === 'edit'. */
  initial?: OpportunityTask;
};

/**
 * Formulário de tarefa/subtarefa (create + edit, TASK-03/TASK-05/TASK-06),
 * modelado em RiskForm.tsx. Reusa verbatim as constantes de classe
 * `inputCls`/`labelCls` daquele arquivo — Tailwind escrito à mão, nenhum
 * componente de biblioteca de UI é introduzido (D-09).
 *
 * Em modo de edição os campos chegam preenchidos a partir de `initial`
 * (incluindo `blocked_reason` quando o status atual é `bloqueio`) e o envio
 * chama `updateTask` em vez de `createTask`. A legenda "Subtarefa de: ..."
 * (via `parentTitle`) é somente leitura nos dois modos — nunca existe um
 * controle de seleção de pai (D-01).
 *
 * Submissão: payload SEM tenant_id/opportunity_id/created_by (server-derived,
 * T-16-02). Em sucesso navega para a Lista de tarefas e chama router.refresh().
 */
export function TaskForm({
  opportunityId,
  assignableProfiles,
  parentTitle,
  parentTaskId,
  onDone,
  mode = 'create',
  taskId,
  initial,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assignee_id ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'backlog');
  // 0049 — 'media' é o mesmo default da coluna e do Zod: nasce no meio, não
  // no topo (senão toda tarefa nova seria "alta" e a tag perderia o sentido).
  const [priority, setPriority] = useState<TaskPriority>(
    initial?.priority ?? 'media'
  );
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '');
  const [blockedReason, setBlockedReason] = useState(
    initial?.status === 'bloqueio' ? (initial?.blocked_reason ?? '') : ''
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    // payload SEM tenant_id/opportunity_id/created_by (server-derived).
    const payload: TaskInput = {
      title,
      description,
      status,
      priority,
      start_date: startDate,
      due_date: dueDate,
      assignee_id: assigneeId,
      blocked_reason: blockedReason,
      ...(parentTaskId ? { parent_task_id: parentTaskId } : {}),
    };

    startTransition(async () => {
      const result =
        mode === 'edit' && taskId
          ? await updateTask(taskId, opportunityId, payload)
          : await createTask(opportunityId, payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      // Quando `onDone` existe (modo diálogo) QUEM fecha é ele — via
      // `router.replace` sem `?tarefa=`. Um `router.push` aqui competiria com
      // esse replace no mesmo tick e o diálogo ficava preso aberto depois de
      // salvar. Sem `onDone` (rotas fullscreen `/tarefas/new` e
      // `/tarefas/[taskId]/edit`) é este push que devolve o usuário à Lista.
      if (onDone) {
        onDone();
      } else {
        router.push(`/opportunities/${opportunityId}/tarefas`);
      }
      router.refresh();
    });
  }

  function fieldError(name: string): string | null {
    const e = errors[name];
    return e && e.length > 0 ? e[0] : null;
  }

  const inputCls =
    'w-full text-[12px] border border-bdr rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pri';
  const labelCls =
    'text-[10px] font-bold uppercase tracking-wider text-mut mb-1 block';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {parentTitle && (
        <p className="text-[11px] text-mut italic">
          Subtarefa de: <span className="font-semibold text-txt">{parentTitle}</span>
        </p>
      )}

      <div>
        <label className={labelCls} htmlFor="tf-title">
          Título *
        </label>
        <input
          id="tf-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Mapear processo atual"
          className={inputCls}
        />
        {fieldError('title') && (
          <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
            {fieldError('title')}
          </p>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor="tf-desc">
          Descrição
        </label>
        <DescriptionImageField
          id="tf-desc"
          opportunityId={opportunityId}
          value={description}
          onChange={setDescription}
          rows={3}
          className={`${inputCls} resize-y`}
        />
        {fieldError('description') && (
          <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
            {fieldError('description')}
          </p>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor="tf-assignee">
          Responsável
        </label>
        {assignableProfiles.length === 0 ? (
          <p className="text-[12px] text-mut">
            Ninguém desta empresa tem conta ainda — convide pessoas em Equipe.
          </p>
        ) : (
          <select
            id="tf-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={inputCls}
          >
            <option value="">— Sem responsável —</option>
            {assignableProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {assigneeName(p)}
              </option>
            ))}
          </select>
        )}
        {fieldError('assignee_id') && (
          <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
            {fieldError('assignee_id')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="tf-status">
            Status
          </label>
          <select
            id="tf-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className={inputCls}
          >
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_META[s].icon} {TASK_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="tf-priority">
            Prioridade
          </label>
          <select
            id="tf-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={inputCls}
          >
            {TASK_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_META[p].icon} {TASK_PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="tf-start">
            Data de início
          </label>
          <input
            id="tf-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="tf-due">
            Data de fim
          </label>
          <input
            id="tf-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {status === 'bloqueio' && (
        <div>
          <label className={labelCls} htmlFor="tf-blocked">
            Motivo do bloqueio
          </label>
          <textarea
            id="tf-blocked"
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            rows={2}
            className={`${inputCls} resize-y`}
          />
          {fieldError('blocked_reason') && (
            <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
              {fieldError('blocked_reason')}
            </p>
          )}
        </div>
      )}

      {formError && (
        <div className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {formError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDone?.()}
          disabled={pending}
          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50"
        >
          {pending ? 'Salvando...' : '💾 Salvar'}
        </button>
      </div>
    </form>
  );
}
