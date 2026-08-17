'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OpportunityTask } from '@/lib/opportunities/types';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import { TaskForm } from './TaskForm';

type Props = {
  opportunityId: string;
  /** Array PLANO já em memória (props da TarefasPage) — resolve `initial`/pai para edit e subtarefa. */
  tasks: OpportunityTask[];
  assignableProfiles: AssignableProfile[];
};

/**
 * Dialog empilhado de tarefa (soft-path, UI-SPEC §Routes), modelado em
 * RiskFormDialog.tsx: overlay `z-[60]`, ESC/click-outside fecham, decide
 * criar vs editar pelo parâmetro `?tarefa`. `?tarefa=new&parent=<id>` abre em
 * modo de criação de SUBTAREFA (resolve o título/id da pai a partir do array
 * `tasks` já carregado — nenhuma query nova).
 *
 * Desvio obrigatório em relação ao analog (UI-SPEC "Dialog close behavior"):
 * `RiskFormDialog.close()` faz `router.replace(pathname)`, descartando TODOS
 * os parâmetros — aqui isso apagaria `?view=` e devolveria o usuário para a
 * Lista sem ele pedir. `close()` reconstrói a querystring a partir de
 * `URLSearchParams`, removendo APENAS `tarefa`/`parent` e preservando `view`
 * (e qualquer outro parâmetro futuro) automaticamente.
 */
export function TaskFormDialog({ opportunityId, tasks, assignableProfiles }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tarefa = searchParams.get('tarefa');
  const parentParam = searchParams.get('parent');
  const isOpen = tarefa !== null && tarefa !== '';

  function close() {
    // Reconstrói a query preservando `view` (e qualquer outro parâmetro
    // futuro) — remove só `tarefa`/`parent`. Ver desvio no cabeçalho acima.
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete('tarefa');
    qs.delete('parent');
    const next = qs.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }

  // ESC fecha (apenas quando aberto).
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const mode: 'create' | 'edit' = tarefa === 'new' ? 'create' : 'edit';
  const initial = mode === 'edit' ? tasks.find((t) => t.id === tarefa) : undefined;

  // ?tarefa=<id> mas a tarefa não está mais no array (ex: removida em outro
  // lugar) → o dialog se fecha sozinho.
  if (mode === 'edit' && !initial) {
    return null;
  }

  // Pai: em criação de subtarefa vem de `?parent=<id>`; em edição, a própria
  // tarefa já carrega `parent_task_id`. Nunca editável (D-01).
  const parentId = mode === 'create' ? parentParam : initial?.parent_task_id;
  const parent = parentId ? tasks.find((t) => t.id === parentId) : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto p-4"
    >
      <div className="relative my-8 w-full max-w-lg bg-wh rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-bg border-b border-bdr px-5 py-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-pri">
            {mode === 'create'
              ? parent
                ? '➕ Nova Subtarefa'
                : '+ Nova Tarefa'
              : '✏️ Editar Tarefa'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-sm font-bold flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <TaskForm
            opportunityId={opportunityId}
            assignableProfiles={assignableProfiles}
            parentTitle={parent?.title}
            parentTaskId={parent?.id}
            mode={mode}
            taskId={mode === 'edit' ? initial!.id : undefined}
            initial={mode === 'edit' ? initial : undefined}
            onDone={close}
          />
        </div>
      </div>
    </div>
  );
}
