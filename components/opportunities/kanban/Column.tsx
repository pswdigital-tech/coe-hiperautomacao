'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Opportunity, OpportunityStatus } from '@/lib/opportunities/types';
import { KanbanCard } from './Card';

type Props = {
  status: OpportunityStatus;
  label: string;
  icon: string;
  color: string;
  opportunities: Opportunity[];
  readOnly?: boolean;
};

export function KanbanColumn({
  status,
  label,
  icon,
  color,
  opportunities,
  readOnly = false,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { status },
  });

  // Σ FTE/mês da coluna (D-16 / _giba:704,734). null-safe.
  const fteSum = Math.round(
    opportunities.reduce((s, o) => s + (o.fte_horas ?? 0), 0),
  );

  return (
    <div className="bg-bg border border-bdr rounded-xl w-[220px] flex-shrink-0 flex flex-col overflow-hidden">
      <div
        className="px-3 py-2 flex items-center justify-between border-b border-bdr"
        style={{ background: `${color}15` }}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-bold flex items-center gap-1.5">
            <span>{icon}</span>
            <span style={{ color }}>{label}</span>
          </div>
          <div className="text-[10px] text-mut mt-0.5">⏱️ {fteSum}h FTE/mês</div>
        </div>
        <div
          className="rounded-full px-2 text-[10px] font-bold"
          style={{ background: color, color: '#fff' }}
        >
          {opportunities.length}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={
          'p-2 flex flex-col gap-2 min-h-[80px] max-h-[72vh] overflow-y-auto flex-1 transition-colors ' +
          (isOver ? 'bg-blue-100/50 dark:bg-blue-900/60' : '')
        }
      >
        {/* 0049 — SortableContext por coluna: os cards são rearranjáveis
            verticalmente entre si (ordem de prioridade), além de continuarem
            arrastáveis para outra coluna (mudança de status). */}
        <SortableContext
          items={opportunities.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          {opportunities.length === 0 ? (
            <div className="text-[10px] text-mut text-center py-4 italic">
              Nenhuma
            </div>
          ) : (
            opportunities.map((o) => (
              <KanbanCard key={o.id} opportunity={o} readOnly={readOnly} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
