'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Opportunity, OpportunityStatus } from '@/lib/opportunities/types';
import { updateOpportunityStatus } from '@/lib/opportunities/actions';
import { reorderOpportunities } from '@/lib/opportunities/priority-actions';
import { isManualSort, parseFilters } from '@/lib/opportunities/filters';
import { STATUS_ORDER, STATUS_META } from '@/lib/opportunities/status';
import { KanbanColumn } from './Column';

type Props = {
  opportunities: Opportunity[];
  /** RBAC (v0.3) — viewer não arrasta cards nem edita nada. */
  readOnly?: boolean;
};

// 11 colunas (fonte única: lib/opportunities/status.ts) — mesma ordem exibida
// no seletor de status do header do modal.
const COLUMNS = STATUS_ORDER.map((status) => ({
  status,
  label: STATUS_META[status].label,
  icon: STATUS_META[status].icon,
  color: STATUS_META[status].color,
}));

export function KanbanBoard({ opportunities, readOnly = false }: Props) {
  const [opps, setOpps] = useState(opportunities);
  const [error, setError] = useState<string | null>(null);

  // O estado local existe só para o drag otimista — o servidor continua sendo a
  // fonte da verdade. Quando a lista muda (filtro da toolbar, revalidate após o
  // drag), ressincroniza durante o render em vez de manter a cópia velha.
  const [syncedFrom, setSyncedFrom] = useState(opportunities);
  if (syncedFrom !== opportunities) {
    setSyncedFrom(opportunities);
    setOpps(opportunities);
  }

  const [, startTransition] = useTransition();

  // Movimento só inicia após 5px de drag — preserva click pra navegação
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 0049 — reordenação vertical dentro da coluna. Mesma regra da Lista e dos
  // Cards: só no modo de ordenação manual, senão a posição solta pelo usuário
  // seria desfeita no próximo render pela ordenação vigente.
  const params = useSearchParams();
  const canReorder = isManualSort(parseFilters(params).sort) && !readOnly;

  /**
   * Rearranja a coluna e persiste a ordem. `opps` é a lista PLANA de todas as
   * colunas; reordenamos só o recorte da coluna e reprojetamos o resultado nas
   * posições que ele já ocupava — assim o payload enviado ao servidor é a
   * lista visível inteira, na ordem correta, sem misturar as outras colunas.
   */
  function reorderWithinColumn(
    status: OpportunityStatus,
    activeId: string,
    overId: string
  ) {
    const column = opps.filter((o) => o.status === status);
    const from = column.findIndex((o) => o.id === activeId);
    const to = column.findIndex((o) => o.id === overId);
    if (from < 0 || to < 0) return;

    const reordered = arrayMove(column, from, to);
    const queue = [...reordered];
    const prev = opps;
    const next = opps.map((o) => (o.status === status ? queue.shift()! : o));

    setOpps(next);
    setError(null);

    startTransition(async () => {
      const result = await reorderOpportunities(next.map((o) => o.id));
      if (!result.ok) {
        setOpps(prev); // rollback
        setError(result.error);
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const oppId = String(active.id);
    const targetStatus = over.data.current?.status as
      | OpportunityStatus
      | undefined;
    if (!targetStatus) return;

    const opp = opps.find((o) => o.id === oppId);
    if (!opp) return;

    // Soltou sobre outro card da MESMA coluna = reordenar, não mover.
    if (opp.status === targetStatus) {
      if (canReorder && over.id !== active.id) {
        reorderWithinColumn(targetStatus, oppId, String(over.id));
      }
      return;
    }

    // Optimistic update
    const prev = opps;
    const next = opps.map((o) =>
      o.id === oppId ? { ...o, status: targetStatus } : o
    );
    setOpps(next);
    setError(null);

    startTransition(async () => {
      const result = await updateOpportunityStatus(oppId, targetStatus);
      if (!result.ok) {
        setOpps(prev); // rollback
        setError(result.error);
      }
    });
  }

  return (
    <>
      {canReorder && (
        <p className="mb-2 text-[11px] text-mut">
          Arraste na vertical para montar a ordem de prioridade dentro da
          coluna; arraste para outra coluna para mudar o status.
        </p>
      )}
      {error && (
        <div className="mb-3 text-[11px] text-red-700 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <DndContext id="opportunities-kanban-dnd" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max items-start">
            {COLUMNS.map((col) => {
              const items = opps.filter((o) => o.status === col.status);
              return (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  icon={col.icon}
                  color={col.color}
                  opportunities={items}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </div>
      </DndContext>
    </>
  );
}
