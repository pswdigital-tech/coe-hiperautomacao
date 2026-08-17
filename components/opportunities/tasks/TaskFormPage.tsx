'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import type { OpportunityTask } from '@/lib/opportunities/types';
import { TaskForm } from './TaskForm';

type Props = {
  opportunityId: string;
  assignableProfiles: AssignableProfile[];
  parentTitle?: string;
  parentTaskId?: string;
  /** 'create' (default) ou 'edit' — deep-link fullscreen de edição (16-05). */
  mode?: 'create' | 'edit';
  /** Obrigatório quando mode === 'edit'. */
  taskId?: string;
  /** Valores atuais da tarefa quando mode === 'edit'. */
  initial?: OpportunityTask;
};

/**
 * Layout de PÁGINA (não overlay) que envolve o TaskForm — usado pelas rotas
 * fullscreen de criação/subtarefa/edição (deep-link fallback do soft-path,
 * UI-SPEC §Routes). Espelha RiskFormPage.tsx, mas o link de voltar aponta
 * para a Lista de tarefas (`/opportunities/${id}/tarefas`), não para o
 * detalhe da oportunidade — a volta natural de um formulário de tarefa é a
 * lista.
 *
 * `mode`/`taskId`/`initial` não estavam no `files_modified` original do
 * plano 16-05, mas a rota de edição (`[taskId]/edit/page.tsx`) precisa
 * renderizar este wrapper "em modo de edição com os valores atuais" — sem
 * essas props o wrapper não tem como repassar o modo/valores ao `TaskForm`
 * (deviation Rule 3 — bloqueio de tarefa sem esta extensão).
 */
export function TaskFormPage({
  opportunityId,
  assignableProfiles,
  parentTitle,
  parentTaskId,
  mode = 'create',
  taskId,
  initial,
}: Props) {
  const router = useRouter();

  function onDone() {
    router.push(`/opportunities/${opportunityId}/tarefas`);
  }

  const heading =
    mode === 'edit' ? '✏️ Editar Tarefa' : parentTitle ? '➕ Nova Subtarefa' : '+ Nova Tarefa';

  return (
    <div className="px-6 py-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-3">
          <Link
            href={`/opportunities/${opportunityId}/tarefas`}
            className="text-[11px] font-semibold text-pri hover:text-pril inline-flex items-center gap-1"
          >
            ← Voltar
          </Link>
        </div>
        <div className="bg-wh rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-bg border-b border-bdr px-5 py-3">
            <h1 className="text-[14px] font-bold text-pri">{heading}</h1>
          </div>
          <div className="px-5 py-4">
            <TaskForm
              opportunityId={opportunityId}
              assignableProfiles={assignableProfiles}
              parentTitle={parentTitle}
              parentTaskId={parentTaskId}
              mode={mode}
              taskId={taskId}
              initial={initial}
              onDone={onDone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
