'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Opportunity } from '@/lib/opportunities/types';
import {
  SourceBadge,
  StatusBadge,
  ToolBadges,
  SeqIdDisplay,
} from './cells';
import { getInitials, scoreColor } from '@/lib/opportunities/utils';
import { isManualSort, parseFilters } from '@/lib/opportunities/filters';
import { PRIORITY_META } from '@/lib/opportunities/priority-labels';
import { reorderOpportunities } from '@/lib/opportunities/priority-actions';

type Props = {
  opportunities: Opportunity[];
  /** RBAC — `viewer` não rearranja a ordem de prioridade (0049). */
  readOnly?: boolean;
};

/**
 * View de Cards. Desde a 0049 é um componente de cliente: no modo de ordenação
 * manual os cards são rearranjáveis por arrasto, com a MESMA regra da Lista e
 * do Kanban — arrastar só é possível quando a lista já está na ordem manual
 * crescente (`isManualSort`), senão a posição solta seria desfeita no próximo
 * render pela ordenação vigente.
 */
export function OpportunityCards({ opportunities, readOnly = false }: Props) {
  const params = useSearchParams();
  const filters = parseFilters(params);
  const canReorder = isManualSort(filters.sort) && !readOnly;

  // Cópia local para o arrasto otimista, ressincronizada durante o render
  // quando o servidor devolve uma lista nova (mesma técnica do Kanban).
  const [cards, setCards] = useState(opportunities);
  const [syncedFrom, setSyncedFrom] = useState(opportunities);
  if (syncedFrom !== opportunities) {
    setSyncedFrom(opportunities);
    setCards(opportunities);
  }
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = cards.findIndex((o) => o.id === active.id);
    const to = cards.findIndex((o) => o.id === over.id);
    if (from < 0 || to < 0) return;

    const prev = cards;
    const next = arrayMove(cards, from, to);
    setCards(next);
    setReorderError(null);

    startTransition(async () => {
      const result = await reorderOpportunities(next.map((o) => o.id));
      if (!result.ok) {
        setCards(prev); // rollback
        setReorderError(result.error);
      }
    });
  }

  if (opportunities.length === 0) {
    return (
      <div className="bg-wh border border-bdr rounded-xl p-12 text-center text-mut">
        Nenhuma oportunidade encontrada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {reorderError && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800 rounded-lg px-3 py-2">
          {reorderError}
        </div>
      )}
      {canReorder && (
        <p className="text-[11px] text-mut">
          Arraste pelo <span aria-hidden="true">⠿</span> para montar a ordem de
          prioridade.
        </p>
      )}
      <DndContext
        id="opportunities-cards-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={cards.map((o) => o.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {cards.map((o, index) => (
              <SortableCard
                key={o.id}
                opportunity={o}
                position={index + 1}
                draggable={canReorder}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/**
 * Um card. O handle (⠿) é o único ponto de arrasto — o card inteiro continua
 * sendo um `Link` para a oportunidade, comportamento que a view sempre teve.
 */
function SortableCard({
  opportunity: o,
  position,
  draggable,
}: {
  opportunity: Opportunity;
  position: number;
  draggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: o.id, disabled: !draggable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {draggable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          title="Arrastar para reordenar a prioridade"
          aria-label={`Reordenar — posição atual ${position}`}
          className="absolute top-2 right-2 z-10 text-mut hover:text-txt cursor-grab active:cursor-grabbing leading-none px-1 py-0.5 rounded bg-wh/80 focus:outline-none focus:ring-2 focus:ring-pri"
          style={{ touchAction: 'none' }}
        >
          ⠿
        </button>
      )}
      <Link
        href={`/opportunities/${o.id}`}
        className="bg-wh border border-bdr rounded-xl p-3.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col gap-2 h-full"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-pri text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
              {getInitials(o.solicitante)}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold leading-tight truncate">
                {o.solicitante}
              </div>
              <div className="text-[10px] text-mut truncate">
                {o.subarea ?? o.area}
              </div>
            </div>
          </div>
          <SourceBadge source={o.source} />
        </div>

        <div className="text-[10px] text-pri font-semibold truncate">
          🏢 {o.area}
        </div>

        <div className="text-[11px] leading-snug line-clamp-3 text-txt flex-1">
          {o.processo}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-bdr mt-1">
          <div className="flex items-center gap-1.5">
            <SeqIdDisplay seqId={o.seq_id} />
            {o.criticidade === 'critica' && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"
                title="Criticidade: Crítica"
              />
            )}
            <ToolBadges tools={o.ferramentas} />
          </div>
          <div
            className="w-9 h-9 rounded-full border-[3px] flex flex-col items-center justify-center flex-shrink-0"
            style={{ borderColor: `${scoreColor(o.score)}99` }}
          >
            <div
              className="text-[12px] font-black leading-none"
              style={{ color: scoreColor(o.score) }}
            >
              {o.score}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={o.status} />
          {/* Tag manual (0050) — só aparece quando alguém classificou. */}
          {o.priority_tag && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
              style={{
                background: PRIORITY_META[o.priority_tag].bg,
                color: PRIORITY_META[o.priority_tag].color,
              }}
              title={`Prioridade: ${PRIORITY_META[o.priority_tag].label}`}
            >
              <span aria-hidden="true">{PRIORITY_META[o.priority_tag].icon}</span>
              <span>{PRIORITY_META[o.priority_tag].label}</span>
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
