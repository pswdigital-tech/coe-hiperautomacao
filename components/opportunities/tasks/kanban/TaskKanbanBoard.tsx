'use client';

import { useState, useTransition } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { OpportunityTask, TaskStatus } from '@/lib/opportunities/types';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import { updateTaskStatus } from '@/lib/opportunities/task-actions';
import { TASK_STATUS_ORDER } from '@/lib/opportunities/task-labels';
import { groupTasksByParent } from '@/lib/opportunities/task-rollup';
import { decideStatusChange, decideBlockReason } from './decide-drop';
import { TaskKanbanColumn } from './TaskKanbanColumn';
import { BlockedReasonDialog } from './BlockedReasonDialog';

type Props = {
  tasks: OpportunityTask[];
  /** Candidatos a responsável do tenant — reusado de D-08, sem query nova (ficha do card). */
  assignableProfiles: AssignableProfile[];
  /** RBAC (D-11) — viewer vê o quadro mas não arrasta nem troca status. */
  readOnly?: boolean;
};

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Quadro Kanban das tarefas de UMA oportunidade — 4 colunas FIXAS na ordem
 * travada (`TASK_STATUS_ORDER`, D-03), nunca parametrizadas por prop. Clona
 * `kanban/Board.tsx` (sensor de ponteiro, ressincronização por prop, banner
 * de erro) em tudo que não seja o caminho do drop, que ramifica pela função
 * pura de decisão (`decide-drop.ts`, RESEARCH Pattern 5):
 *
 * - destino igual ao status atual ou fora de qualquer coluna → nada a fazer.
 * - destino diferente de `bloqueio` → aplica otimista + persiste, com
 *   reversão em caso de erro (igual ao analog).
 * - destino `bloqueio` → NÃO mexe no estado local; guarda a tarefa pendente
 *   e abre `BlockedReasonDialog`. Confirmar aplica com o motivo; cancelar só
 *   limpa o estado pendente — nunca houve mutação para desfazer.
 *
 * O mesmo `requestStatusChange` atende tanto o `onDragEnd` do dnd-kit quanto
 * o controle de status por teclado exposto em cada `TaskKanbanCard`.
 */
export function TaskKanbanBoard({ tasks, assignableProfiles, readOnly = false }: Props) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [error, setError] = useState<string | null>(null);
  const [pendingBlock, setPendingBlock] = useState<{ taskId: string } | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Ressincroniza quando a prop muda (mesma técnica de kanban/Board.tsx) — o
  // servidor continua sendo a fonte da verdade; o estado local existe só
  // para o drag/otimista.
  const [syncedFrom, setSyncedFrom] = useState(tasks);
  if (syncedFrom !== tasks) {
    setSyncedFrom(tasks);
    setLocalTasks(tasks);
  }

  // Movimento só inicia após 5px de drag — preserva o clique no seletor de
  // status/link, mesma constraint do Kanban de oportunidades.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // IDs (T001/T001.1) e legendas de hierarquia calculados sobre o array
  // COMPLETO (não por coluna) — mesma numeração estável da Lista
  // (groupTasksByParent é o mesmo helper, TASK-11/16-04), independente de em
  // qual coluna cada card está.
  const { roots, childrenByParent } = groupTasksByParent(localTasks);
  const idLabelById = new Map<string, string>();
  const hierarchyCaptionById = new Map<string, string | null>();

  roots.forEach((root, i) => {
    const rootLabel = `T${pad3(i + 1)}`;
    idLabelById.set(root.id, rootLabel);
    const children = childrenByParent.get(root.id) ?? [];
    hierarchyCaptionById.set(
      root.id,
      children.length > 0 ? `🧩 ${children.length} subtarefa(s)` : null
    );
    children.forEach((child, j) => {
      idLabelById.set(child.id, `${rootLabel}.${j + 1}`);
      hierarchyCaptionById.set(child.id, `↳ subtarefa de ${root.title}`);
    });
  });

  const assigneeById = new Map(assignableProfiles.map((p) => [p.id, p]));

  function applyStatusChange(taskId: string, status: TaskStatus, blockedReason: string | null) {
    const prev = localTasks;
    setLocalTasks(
      localTasks.map((t) => (t.id === taskId ? { ...t, status, blocked_reason: blockedReason } : t))
    );
    setError(null);
    setMovingTaskId(taskId);

    startTransition(async () => {
      const result = await updateTaskStatus(taskId, status, blockedReason);
      setMovingTaskId(null);
      if (!result.ok) {
        setLocalTasks(prev); // rollback
        setError(result.error);
      }
    });
  }

  /** Caminho único de decisão — chamado pelo drop (dnd-kit) E pelo controle de status por teclado do card. */
  function requestStatusChange(taskId: string, targetStatus: TaskStatus | undefined) {
    if (readOnly) return;
    const task = localTasks.find((t) => t.id === taskId);
    if (!task) return;

    const decision = decideStatusChange(task.status, targetStatus);
    if (decision.kind === 'noop') return;

    if (decision.kind === 'ask-reason') {
      // NÃO muda `localTasks` ainda — o card "volta sozinho" (dnd-kit
      // restaura o transform ao soltar); cancelar não precisa de rollback
      // porque nada foi mutado (Pattern 5 do RESEARCH).
      setPendingBlock({ taskId });
      return;
    }

    applyStatusChange(taskId, decision.status, decision.blockedReason);
  }

  function onDragEnd(event: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = event;
    const taskId = String(active.id);
    const targetStatus = over?.data.current?.status as TaskStatus | undefined;
    requestStatusChange(taskId, targetStatus);
  }

  function onConfirmBlock(reasonText: string) {
    if (!pendingBlock) return;
    const decision = decideBlockReason(reasonText);
    if (decision.kind === 'noop') return; // motivo vazio/só espaços — recusado, diálogo continua aberto
    applyStatusChange(pendingBlock.taskId, 'bloqueio', decision.blockedReason);
    setPendingBlock(null);
  }

  function onCancelBlock() {
    // Nada a desfazer — `localTasks` nunca mudou (Pattern 5 do RESEARCH).
    setPendingBlock(null);
  }

  return (
    <>
      {error && (
        <div className="mb-3 text-[11px] text-red-700 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <DndContext id="task-kanban-dnd" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max items-start">
            {TASK_STATUS_ORDER.map((status) => (
              <TaskKanbanColumn
                key={status}
                status={status}
                tasks={localTasks.filter((t) => t.status === status)}
                idLabelById={idLabelById}
                hierarchyCaptionById={hierarchyCaptionById}
                assigneeById={assigneeById}
                readOnly={readOnly}
                movingTaskId={movingTaskId}
                onStatusChangeRequest={requestStatusChange}
              />
            ))}
          </div>
        </div>
      </DndContext>

      <BlockedReasonDialog open={pendingBlock !== null} onConfirm={onConfirmBlock} onCancel={onCancelBlock} />
    </>
  );
}
