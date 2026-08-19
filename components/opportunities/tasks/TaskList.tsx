'use client';

import { Fragment, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OpportunityTask } from '@/lib/opportunities/types';
import { TASK_STATUS_META, TASK_PRIORITY_META } from '@/lib/opportunities/task-labels';
import { assigneeName, type AssignableProfile } from '@/lib/opportunities/assignee-types';
import { computeTaskRollup, groupTasksByParent } from '@/lib/opportunities/task-rollup';
import { sortSiblings, type TaskOrderMode } from '@/lib/opportunities/task-order';
import { reorderTasks } from '@/lib/opportunities/priority-actions';
import { DeleteTaskButton } from './DeleteTaskButton';

type Props = {
  opportunityId: string;
  tasks: OpportunityTask[];
  /** Candidatos a responsável do tenant — reusado de D-08, sem query nova de nomes. */
  assignableProfiles: AssignableProfile[];
  /** `viewer` não edita/exclui/cria subtarefa — a coluna de Ações some inteira (D-11). */
  readOnly?: boolean;
};

// Data de input HTML (YYYY-MM-DD) → dd/mm/aa, sem `new Date()`/locale, para não
// divergir entre SSR e hidratação (mesma técnica de `fmtDataRegistro`).
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function PriorityBadge({ priority }: { priority: OpportunityTask['priority'] }) {
  const meta = TASK_PRIORITY_META[priority];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}
      title={`Prioridade: ${meta.label}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: OpportunityTask['status'] }) {
  const meta = TASK_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}
    >
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * View Lista das tarefas de uma oportunidade, hierarquia de 2 níveis (D-01):
 * tarefas raiz + subtarefas indentadas abaixo, expandir/comprimir por tarefa
 * (TASK-07, estado local — D-13, independente do Gantt). A tarefa-pai com
 * subtarefas exibe o span agregado e o badge de conclusão vindos de
 * `computeTaskRollup`, calculados em runtime (TASK-11/D-02, nunca
 * persistidos). `groupTasksByParent` é o mesmo helper que o Gantt (16-07)
 * reusa, para que numeração (T001/T001.1) e ordem das linhas sejam idênticas
 * nas duas views. Analog: RiskTable.tsx (rótulo sequencial por índice) +
 * table.tsx (convenção geral de markup).
 */
export function TaskList({
  opportunityId,
  tasks,
  assignableProfiles,
  readOnly = false,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Grid de concluídas nasce fechado — ele existe justamente para tirar da
  // frente o que já foi feito; o cabeçalho com a contagem fica sempre visível
  // para que nunca pareça que a tarefa sumiu.
  const [showCompleted, setShowCompleted] = useState(false);
  // Homologação (0060) nasce ABERTO, ao contrário do de concluídas: é trabalho
  // VIVO, esperando alguém validar. Fechado por padrão, o grid viraria o lugar
  // onde a tarefa some — que é exatamente o problema que a coluna nova veio
  // resolver. Sai do grid principal só para não se misturar com o que ainda
  // está sendo feito.
  const [showHomologacao, setShowHomologacao] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ===========================================================================
  // Ordenação e arrasto (0049)
  // ===========================================================================
  // Dois modos, como na lista de oportunidades: a ordem que a pessoa MONTA
  // (arrastável) e a ordem derivada da TAG de prioridade (alta → baixa, só
  // leitura). Estado local em vez de query string: diferente da lista de
  // oportunidades, aqui a ordenação não vai ao servidor — a página já trouxe
  // todas as tarefas da oportunidade, e o modo é um recorte de leitura de
  // quem está olhando, não um filtro compartilhável.
  const [orderMode, setOrderMode] = useState<TaskOrderMode>('manual');
  const canReorder = orderMode === 'manual' && !readOnly;

  // Cópia local para o arrasto otimista + ressincronização durante o render
  // quando o servidor devolve uma lista nova (mesma técnica do Kanban).
  const [rows, setRows] = useState(tasks);
  const [syncedFrom, setSyncedFrom] = useState(tasks);
  if (syncedFrom !== tasks) {
    setSyncedFrom(tasks);
    setRows(tasks);
  }
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grouped = groupTasksByParent(rows);
  const allRoots = sortSiblings(grouped.roots, orderMode);
  const childrenByParent = grouped.childrenByParent;
  const nameById = new Map(assignableProfiles.map((p) => [p.id, assigneeName(p)]));

  // ===========================================================================
  // Busca e paginação (v0.5) — recorte de LEITURA, estado local
  // ===========================================================================
  // Mesma decisão do modo de ordenação acima: a página já trouxe TODAS as
  // tarefas desta oportunidade, então filtrar e paginar em memória evita uma
  // ida ao servidor por tecla digitada. Nada disso vai para a URL — é o
  // recorte de quem está olhando, não um filtro compartilhável.
  //
  // A busca casa título OU responsável, e é hierárquica: uma tarefa-pai fica
  // visível quando ela mesma OU qualquer subtarefa sua casa — esconder a pai
  // faria a subtarefa encontrada sumir junto (ela só é renderizada dentro da
  // pai). A numeração T001/T001.1, porém, continua vindo da lista COMPLETA:
  // se "T005" virasse "T001" ao filtrar, o identificador deixaria de servir
  // para conversar sobre a tarefa.
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const needle = query.trim().toLowerCase();
  function matches(t: OpportunityTask): boolean {
    if (!needle) return true;
    const who = t.assignee_id ? (nameById.get(t.assignee_id) ?? '') : '';
    return (
      t.title.toLowerCase().includes(needle) || who.toLowerCase().includes(needle)
    );
  }

  const rootIndexById = new Map(allRoots.map((t, i) => [t.id, i]));

  // ===========================================================================
  // Em execução × homologação × concluídas — três grids (v0.5; 3º em 0060)
  // ===========================================================================
  // Uma tarefa RAIZ finalizada sai do grid principal e desce para o grid de
  // concluídas: o Plano de Atividades é sobre o que ainda falta fazer, e tarefa
  // pronta só polui a leitura do que está em jogo. É recorte de EXIBIÇÃO e nada
  // mais — a numeração continua vindo de `allRoots` (T005 não vira T003 ao ser
  // concluída, senão o identificador deixaria de servir para conversar sobre a
  // tarefa) e nada é gravado.
  //
  // 0060 abre o MESMO recorte para `homologacao`, num grid próprio ANTES do de
  // concluídas. Elas não são "pendentes" no mesmo sentido das demais — a bola
  // não está mais com quem executa, e sim com quem valida —, mas também não
  // estão prontas. Deixá-las no grid principal fazia o time olhar todo dia para
  // um trabalho que não depende dele; empurrá-las para o grid de concluídas
  // seria pior ainda, porque some com o que ainda pode voltar.
  //
  // Só o status da RAIZ move a linha: subtarefa finalizada continua dentro da
  // sua pai, porque a pai é que representa o trabalho no plano — o quanto dela
  // já saiu continua legível no badge "x/y concluídas".
  const activeRoots = allRoots.filter(
    (r) => r.status !== 'finalizado' && r.status !== 'homologacao'
  );
  const homologacaoRoots = allRoots.filter((r) => r.status === 'homologacao');
  const completedRoots = allRoots.filter((r) => r.status === 'finalizado');

  function rootMatches(r: OpportunityTask): boolean {
    return matches(r) || (childrenByParent.get(r.id) ?? []).some(matches);
  }

  const filteredRoots = !needle ? activeRoots : activeRoots.filter(rootMatches);
  // A busca varre os TRÊS grids — procurar uma tarefa e não achá-la porque ela
  // saiu do grid principal seria pior que a poluição que a separação resolve.
  const filteredHomologacao = !needle
    ? homologacaoRoots
    : homologacaoRoots.filter(rootMatches);
  const filteredCompleted = !needle
    ? completedRoots
    : completedRoots.filter(rootMatches);

  // O filtro pode encurtar a lista abaixo da página corrente — clampa em vez
  // de mostrar uma página vazia.
  const totalPages = Math.max(1, Math.ceil(filteredRoots.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const roots = filteredRoots.slice(pageStart, pageStart + pageSize);

  // Arrastar só faz sentido sobre a lista inteira: com busca ativa a ordem
  // exibida não é a ordem real, e soltar gravaria uma sequência inventada.
  const dragEnabled = canReorder && !needle;

  /**
   * Rearranja UM grupo de irmãos e persiste só esse grupo. Uma tarefa nunca
   * troca de pai por arrasto (D-01 — a hierarquia é fixa): soltar uma raiz
   * sobre uma subtarefa (ou vice-versa) é ignorado, em vez de re-parentar.
   */
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const dragged = rows.find((t) => t.id === active.id);
    const target = rows.find((t) => t.id === over.id);
    if (!dragged || !target) return;
    if (dragged.parent_task_id !== target.parent_task_id) return; // grupos diferentes

    const siblings = rows.filter(
      (t) => t.parent_task_id === dragged.parent_task_id
    );
    const from = siblings.findIndex((t) => t.id === dragged.id);
    const to = siblings.findIndex((t) => t.id === target.id);
    if (from < 0 || to < 0) return;

    const reordered = arrayMove(siblings, from, to);

    // Reprojeta a nova ordem do grupo de volta na lista plana, mantendo as
    // posições ocupadas por ele — assim as raízes não "sobem" por cima das
    // subtarefas e o agrupamento seguinte enxerga exatamente o mesmo arranjo
    // que a função SQL vai gravar.
    const queue = [...reordered];
    const prev = rows;
    const next = rows.map((t) =>
      t.parent_task_id === dragged.parent_task_id ? queue.shift()! : t
    );

    setRows(next);
    setReorderError(null);

    startTransition(async () => {
      const result = await reorderTasks(
        opportunityId,
        reordered.map((t) => t.id)
      );
      if (!result.ok) {
        setRows(prev); // rollback
        setReorderError(result.error);
      }
    });
  }

  // Constrói o href de um soft-path (`?tarefa=...`) preservando os demais
  // parâmetros correntes (em especial `?view=`) — mesma regra de fechamento
  // do TaskFormDialog (UI-SPEC "Dialog close behavior").
  function hrefFor(params: Record<string, string>): string {
    const qs = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) qs.set(key, value);
    return `${pathname}?${qs.toString()}`;
  }

  function toggleExpanded(taskId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  /**
   * Uma tarefa raiz + suas subtarefas (quando expandida), como linhas de
   * tabela. Os TRÊS grids — em execução, em homologação e concluídas —
   * renderizam por aqui: cópias da linha divergiriam no primeiro ajuste de
   * coluna.
   *
   * `Row` decide se a linha é arrastável. Os grids de homologação e de
   * concluídas vivem FORA do `DndContext` (reordenar o que já saiu da mão do
   * time não muda nada no plano), então usam a linha simples — e por isso o
   * `SortableContext` das subtarefas também
   * é condicional: fora de um DndContext ele não teria a quem falar.
   */
  function renderRootRows(
    root: OpportunityTask,
    Row: React.ComponentType<TaskRowProps>,
    draggable: boolean
  ) {
    // Numeração da lista COMPLETA — estável sob busca, paginação e conclusão.
    const rootTid = `T${pad3((rootIndexById.get(root.id) ?? 0) + 1)}`;
    const children = sortSiblings(childrenByParent.get(root.id) ?? [], orderMode);
    const hasChildren = children.length > 0;
    const rollup = hasChildren ? computeTaskRollup(children) : null;
    const expanded = expandedIds.has(root.id);
    const assigneeLabel = root.assignee_id
      ? (nameById.get(root.assignee_id) ?? '—')
      : '—';

    const childRows = children.map((child, j) => {
      const childTid = `${rootTid}.${j + 1}`;
      const childAssigneeLabel = child.assignee_id
        ? (nameById.get(child.assignee_id) ?? '—')
        : '—';
      return (
        <Row
          key={child.id}
          id={child.id}
          draggable={draggable}
          label={`subtarefa ${childTid}`}
          className="border-b border-bdr/60 align-top bg-bg/40"
        >
          <td className="px-2 py-2" aria-hidden="true" />
          <td className="px-2 py-2 text-[11px] font-semibold text-pri whitespace-nowrap">
            {childTid}
          </td>
          <td className="px-2 py-2 text-[12px] text-txt max-w-[220px]">
            <span className="block truncate font-medium pl-8" title={child.title}>
              {child.title}
            </span>
          </td>
          <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
            {childAssigneeLabel}
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <StatusBadge status={child.status} />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <PriorityBadge priority={child.priority} />
          </td>
          <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
            {fmtDate(child.start_date)} → {fmtDate(child.due_date)}
          </td>
          <td className="px-2 py-2 text-[11px] text-mut whitespace-nowrap">—</td>
          {!readOnly && (
            <td className="px-2 py-2 whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <Link
                  href={hrefFor({ tarefa: child.id })}
                  title="Editar subtarefa"
                  className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded px-2 py-1 text-[10px]"
                >
                  ✏️
                </Link>
                <DeleteTaskButton
                  taskId={child.id}
                  opportunityId={opportunityId}
                  label={childTid}
                  taskTitle={child.title}
                  childCount={0}
                />
              </div>
            </td>
          )}
        </Row>
      );
    });

    return (
      <Fragment key={root.id}>
        <Row
          id={root.id}
          draggable={draggable}
          label={`tarefa ${rootTid}`}
          className="border-b border-bdr/60 align-top"
        >
          <td className="px-2 py-2">
            {hasChildren && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? `Comprimir subtarefas de ${root.title}`
                    : `Expandir subtarefas de ${root.title}`
                }
                title={
                  expanded
                    ? 'Comprimir subtarefas'
                    : `Expandir ${children.length} ${children.length === 1 ? 'subtarefa' : 'subtarefas'}`
                }
                onClick={() => toggleExpanded(root.id)}
                className={`inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-lg border text-[11px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-pri ${
                  expanded
                    ? 'bg-pri text-white border-pri'
                    : 'bg-bg text-pri border-bdr hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block transition-transform leading-none ${expanded ? 'rotate-90' : ''}`}
                >
                  ▶
                </span>
                <span className="leading-none tabular-nums">{children.length}</span>
              </button>
            )}
          </td>
          <td className="px-2 py-2 text-[11px] font-semibold text-pri whitespace-nowrap">
            {rootTid}
          </td>
          <td className="px-2 py-2 text-[12px] text-txt max-w-[220px]">
            <span className="block truncate font-bold" title={root.title}>
              {root.title}
            </span>
          </td>
          <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
            {assigneeLabel}
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <StatusBadge status={root.status} />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <PriorityBadge priority={root.priority} />
          </td>
          <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
            {hasChildren ? (
              <span title="Datas agregadas das subtarefas">
                <span className="text-mut mr-1">Σ</span>
                {fmtDate(rollup!.spanStart)} → {fmtDate(rollup!.spanDue)}
              </span>
            ) : (
              <>
                {fmtDate(root.start_date)} → {fmtDate(root.due_date)}
              </>
            )}
          </td>
          <td className="px-2 py-2 text-[11px] whitespace-nowrap">
            {hasChildren ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-txt">
                {rollup!.completedChildren}/{rollup!.totalChildren} concluídas
              </span>
            ) : (
              <span className="text-mut">—</span>
            )}
          </td>
          {!readOnly && (
            <td className="px-2 py-2 whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <Link
                  href={hrefFor({ tarefa: root.id })}
                  title="Editar tarefa"
                  className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded px-2 py-1 text-[10px]"
                >
                  ✏️
                </Link>
                <Link
                  href={hrefFor({ tarefa: 'new', parent: root.id })}
                  title="Adicionar subtarefa"
                  className="bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded px-2 py-1 text-[10px] whitespace-nowrap"
                >
                  + Subtarefa
                </Link>
                <DeleteTaskButton
                  taskId={root.id}
                  opportunityId={opportunityId}
                  label={rootTid}
                  taskTitle={root.title}
                  childCount={children.length}
                />
              </div>
            </td>
          )}
        </Row>

        {expanded &&
          (draggable ? (
            <SortableContext
              items={children.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {childRows}
            </SortableContext>
          ) : (
            childRows
          ))}
      </Fragment>
    );
  }

  if (allRoots.length === 0) {
    return (
      <div className="bg-wh border border-bdr rounded-xl p-12 text-center">
        <h2 className="text-[14px] font-bold text-txt mb-2">
          Nenhuma tarefa cadastrada
        </h2>
        <p className="text-[12px] text-mut mb-4">
          Crie a primeira tarefa desta oportunidade para começar a planejar a
          execução.
        </p>
        {!readOnly && (
          <Link
            href={hrefFor({ tarefa: 'new' })}
            className="inline-block px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg"
          >
            + Nova Tarefa
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Controle de ordenação (0049) — "Ordem manual" é o único modo em que
          o handle de arrasto aparece; "Prioridade" é leitura, derivada da tag. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Buscar tarefa ou responsável</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar tarefa ou responsável..."
            className="w-64 max-w-full pl-8 pr-3 py-1.5 rounded-lg border border-bdr bg-wh text-txt text-[12px] placeholder:text-mut focus:outline-none focus:ring-2 focus:ring-pri"
          />
          <span
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-mut"
          >
            🔍
          </span>
        </label>

        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
          Ordenar por
        </span>
        <div className="flex items-center gap-1 bg-bg border border-bdr rounded-lg p-0.5">
          {(
            [
              { mode: 'manual' as const, label: '✋ Ordem manual' },
              { mode: 'prioridade' as const, label: '🔺 Prioridade' },
            ]
          ).map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setOrderMode(opt.mode)}
              aria-pressed={orderMode === opt.mode}
              className={
                'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ' +
                (orderMode === opt.mode
                  ? 'bg-wh text-txt shadow-sm'
                  : 'text-mut hover:text-txt')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        {dragEnabled && (
          <span className="text-[11px] text-mut">
            Arraste pelo <span aria-hidden="true">⠿</span> — tarefas entre
            tarefas, subtarefas dentro da sua tarefa.
          </span>
        )}
        {canReorder && needle && (
          <span className="text-[11px] text-mut">
            Limpe a busca para reordenar arrastando.
          </span>
        )}
      </div>

      {reorderError && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800 rounded-lg px-3 py-2">
          {reorderError}
        </div>
      )}

      {/* ---------------------------------------------------------------
          Grid 1 — o plano de verdade: só o que ainda está com o time.
          --------------------------------------------------------------- */}
      <div className="bg-wh border border-bdr rounded-xl overflow-hidden shadow-sm">
        {roots.length > 0 && (
          <div className="overflow-x-auto">
            <DndContext
              id="task-list-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <table className="w-full text-left border-collapse">
                <TaskTableHead readOnly={readOnly} />
                <tbody>
                  <SortableContext
                    items={roots.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {roots.map((root) =>
                      renderRootRows(root, SortableTaskRow, dragEnabled)
                    )}
                  </SortableContext>
                </tbody>
              </table>
            </DndContext>
          </div>
        )}

        {filteredRoots.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] text-mut">
              {needle ? (
                <>
                  Nenhuma tarefa pendente encontrada para{' '}
                  <strong>“{query.trim()}”</strong>.
                </>
              ) : homologacaoRoots.length > 0 ? (
                <>
                  Nenhuma tarefa pendente — o que ainda não fechou está em
                  homologação, logo abaixo. 🧪
                </>
              ) : (
                <>Nenhuma tarefa pendente — tudo o que existe aqui já foi concluído. 🎉</>
              )}
            </p>
          </div>
        )}

      {/* Rodapé de paginação — some quando tudo cabe na primeira página. */}
      {filteredRoots.length > 0 && (
        <div className="border-t border-bdr px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-mut">
            Mostrando {pageStart + 1} a {pageStart + roots.length} de{' '}
            {filteredRoots.length}{' '}
            {filteredRoots.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
          </span>

          {totalPages > 1 && (
            <nav aria-label="Paginação de tarefas" className="flex items-center gap-1">
              <PageButton
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                label="Página anterior"
              >
                ‹
              </PageButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <PageButton
                  key={n}
                  active={n === currentPage}
                  onClick={() => setPage(n)}
                  label={`Página ${n}`}
                >
                  {n}
                </PageButton>
              ))}
              <PageButton
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                label="Próxima página"
              >
                ›
              </PageButton>
            </nav>
          )}

          <label className="text-[11px] text-mut inline-flex items-center gap-1.5">
            <span className="sr-only">Tarefas por página</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-bdr bg-wh text-txt text-[11px] focus:outline-none focus:ring-2 focus:ring-pri"
            >
              {[12, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} por página
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      </div>

      {/* ---------------------------------------------------------------
          Grid 2 — em homologação: feito, aguardando validação.
          Mesma forma do grid de concluídas (mesmo cabeçalho de colunas, mesma
          `renderRootRows`, mesma ausência de arrasto — reordenar o que está na
          mão de outra pessoa não muda a fila do time). Só a cor e o estado
          inicial mudam: nasce ABERTO, porque isto ainda é trabalho vivo.
          --------------------------------------------------------------- */}
      {homologacaoRoots.length > 0 && (
        <div className="bg-wh border border-bdr rounded-xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setShowHomologacao((v) => !v)}
            aria-expanded={showHomologacao}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-bg transition-colors focus:outline-none focus:ring-2 focus:ring-pri"
          >
            <span
              aria-hidden="true"
              className={`inline-block text-[11px] text-mut transition-transform ${
                showHomologacao ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="text-[13px] font-bold text-txt">
              <span aria-hidden="true">🧪</span> Tarefas em homologação
            </span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 text-[10px] font-bold tabular-nums">
              {homologacaoRoots.length}
            </span>
            <span className="ml-auto text-[11px] text-mut">
              {showHomologacao ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showHomologacao && (
            <div className="border-t border-bdr">
              {filteredHomologacao.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <TaskTableHead readOnly={readOnly} />
                    <tbody>
                      {filteredHomologacao.map((root) =>
                        renderRootRows(root, PlainTaskRow, false)
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-[12px] text-mut">
                  Nenhuma tarefa em homologação encontrada para{' '}
                  <strong>“{query.trim()}”</strong>.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------
          Grid 3 — as concluídas, fora do caminho.
          Mesmas colunas e mesma numeração do grid de cima (é a mesma
          `renderRootRows`), sem arrasto: reordenar o que já terminou não
          muda nada no plano. Nasce fechado; o cabeçalho com a contagem
          fica sempre visível para que nunca pareça que a tarefa sumiu.
          --------------------------------------------------------------- */}
      {completedRoots.length > 0 && (
        <div className="bg-wh border border-bdr rounded-xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            aria-expanded={showCompleted}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-bg transition-colors focus:outline-none focus:ring-2 focus:ring-pri"
          >
            <span
              aria-hidden="true"
              className={`inline-block text-[11px] text-mut transition-transform ${
                showCompleted ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="text-[13px] font-bold text-txt">
              <span aria-hidden="true">✅</span> Tarefas concluídas
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold tabular-nums">
              {completedRoots.length}
            </span>
            <span className="ml-auto text-[11px] text-mut">
              {showCompleted ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showCompleted && (
            <div className="border-t border-bdr">
              {filteredCompleted.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <TaskTableHead readOnly={readOnly} />
                    <tbody>
                      {filteredCompleted.map((root) =>
                        renderRootRows(root, PlainTaskRow, false)
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-[12px] text-mut">
                  Nenhuma tarefa concluída encontrada para{' '}
                  <strong>“{query.trim()}”</strong>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageButton({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={
        'min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
        (active
          ? 'bg-pri text-white'
          : 'border border-bdr bg-wh text-txt hover:bg-bg')
      }
    >
      {children}
    </button>
  );
}

/**
 * Cabeçalho das colunas — um só, compartilhado pelos três grids (em execução,
 * em homologação e concluídas): todos mostram exatamente as mesmas colunas, e
 * cópias divergiriam no primeiro ajuste.
 */
function TaskTableHead({ readOnly }: { readOnly: boolean }) {
  return (
    <thead>
      <tr className="border-b border-bdr">
        <th className="px-2 py-2 w-8" aria-hidden="true" />
        <th className="px-2 py-2 w-16" aria-hidden="true" />
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          ID
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          Título
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          Responsável
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          Status
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          Prioridade
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          Início → Fim
        </th>
        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
          % Concluído
        </th>
        {!readOnly && (
          <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
            Ações
          </th>
        )}
      </tr>
    </thead>
  );
}

type TaskRowProps = {
  id: string;
  draggable: boolean;
  /** Nome da linha para o leitor de tela — ex: "tarefa T001". */
  label: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Linha do grid de concluídas — a mesma estrutura de células, sem `useSortable`
 * e sem handle. Existe como componente separado (em vez de um `draggable=false`
 * no sortable) porque este grid vive FORA do `DndContext`: chamar o hook ali
 * seria pedir contexto a quem não tem.
 */
function PlainTaskRow({ className, children }: TaskRowProps) {
  return (
    <tr className={className}>
      <td className="px-2 py-2 align-middle" aria-hidden="true" />
      {children}
    </tr>
  );
}

/**
 * Linha de tarefa/subtarefa arrastável (0049). A primeira célula é o handle —
 * o único ponto de arrasto, para não competir com os links de editar/excluir
 * que vivem na mesma linha.
 *
 * `useSortable` é chamado incondicionalmente (regra dos hooks) e desligado por
 * `disabled` quando a lista está no modo "Prioridade" ou o usuário é `viewer`.
 */
function SortableTaskRow({
  id,
  draggable,
  label,
  className,
  children,
}: TaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !draggable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={className}>
      <td className="px-2 py-2 align-middle">
        {draggable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            title="Arrastar para reordenar"
            aria-label={`Reordenar ${label}`}
            className="text-mut hover:text-txt cursor-grab active:cursor-grabbing leading-none px-0.5 focus:outline-none focus:ring-2 focus:ring-pri rounded"
            style={{ touchAction: 'none' }}
          >
            ⠿
          </button>
        )}
      </td>
      {children}
    </tr>
  );
}
