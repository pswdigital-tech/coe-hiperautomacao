'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import type { Opportunity } from '@/lib/opportunities/types';
import { SourceBadge, RpaFitBadge } from '@/components/opportunities/cells';
import { scoreColor } from '@/lib/opportunities/utils';
import { PRIORITY_META } from '@/lib/opportunities/priority-labels';

type Props = {
  opportunity: Opportunity;
  readOnly?: boolean;
};

export function KanbanCard({ opportunity: o, readOnly = false }: Props) {
  const router = useRouter();
  // 0049 — era `useDraggable`. Virou `useSortable` para o card ser também um
  // ALVO de drop: soltar sobre outro card da mesma coluna passa a reordenar a
  // prioridade, enquanto soltar sobre outra coluna continua mudando o status
  // (o `data.status` é o que o Board usa para distinguir os dois casos).
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: o.id,
    data: { status: o.status },
    disabled: readOnly,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: readOnly ? 'pointer' : isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };
  const isCritica = o.criticidade === 'critica';

  // Click sem drag → navega; com drag → ignora (@dnd-kit suprime via activation constraint do sensor)
  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isDragging) {
      router.push(`/opportunities/${o.id}`);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : listeners)}
      {...attributes}
      onClick={onClick}
      className="bg-wh border border-bdr rounded-lg p-2.5 hover:border-pril hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[10px] font-extrabold text-pri tracking-wider">
          #{String(o.seq_id).padStart(4, '0')}
        </span>
        {/* Tag manual (0050) — só quando classificada. */}
        {o.priority_tag && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap"
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
        {isCritica && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"
            title="Criticidade: Crítica"
          />
        )}
      </div>
      <div className="text-[11px] font-semibold leading-snug line-clamp-2 mb-1.5">
        {o.processo}
      </div>
      <div className="text-[10px] text-mut truncate mb-2">{o.solicitante}</div>
      <div className="flex items-center gap-1 flex-wrap mb-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-mut">
          ⏱️ {Math.round(o.fte_horas ?? 0)}h/mês
        </span>
        <RpaFitBadge score={o.rpa_score} />
      </div>
      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <SourceBadge source={o.source} />
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: scoreColor(o.score) }}
          />
          <span
            className="text-[11px] font-extrabold tabular-nums"
            style={{ color: scoreColor(o.score) }}
          >
            {o.score}
          </span>
        </div>
      </div>
    </div>
  );
}
