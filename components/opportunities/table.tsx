'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import type { Opportunity } from '@/lib/opportunities/types';
import {
  StatusBadge,
  ComplexityBadge,
  ScoreDisplay,
  SeqIdDisplay,
  FteCell,
} from './cells';
import { getInitials } from '@/lib/opportunities/utils';
import {
  buildQuery,
  isManualSort,
  parseFilters,
  type SortKey,
} from '@/lib/opportunities/filters';
import {
  reorderOpportunities,
  setOpportunityPriorityTag,
} from '@/lib/opportunities/priority-actions';
import {
  PRIORITY_META,
  PRIORITY_OPTIONS,
} from '@/lib/opportunities/priority-labels';
import type { ManualPriority } from '@/lib/opportunities/types';
import {
  assigneeInitials,
  assigneeName,
  type Assignee,
} from '@/lib/opportunities/assignee-types';

// Data de registro (created_at) — formata a partir do ISO por slicing, sem
// `new Date()`/locale, para não divergir entre SSR e hidratação (timezone).
function fmtDataRegistro(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

type Props = {
  opportunities: Opportunity[];
  /** Assignees por opportunity_id (0032) — buscados em uma query só na page. */
  assigneesByOpportunity: Record<string, Assignee[]>;
  /** Mapa tenant_id → nome (Phase 17, Plan 17-07) — alimenta a coluna
   *  "Empresa". Vazio por padrão: nenhuma mudança de comportamento para os
   *  demais papéis. */
  companyById?: Record<string, string>;
  /** Exibe a coluna "Empresa" — flag calculada no servidor a partir do papel
   *  do usuário. Este componente NÃO decide por papel; só lê a flag. */
  showCompany?: boolean;
  /** RBAC (v0.3) — `viewer` não rearranja a ordem de prioridade (0049). O
   *  handle de arrasto some inteiro; a coluna de ordem continua visível. */
  readOnly?: boolean;
};

type SortableColumn = {
  asc: SortKey;
  desc: SortKey;
  /** Direção do PRIMEIRO clique. Default `desc` (score/FTE: "maior primeiro"
   *  é o que se quer ver). A coluna de ordem manual (0049) inverte isso —
   *  entrar nela pelo fim da fila não ajuda ninguém, e só a direção crescente
   *  permite arrastar. */
  first?: 'asc' | 'desc';
};

const SORTABLE_COLS: Record<string, SortableColumn> = {
  // 0049 — a coluna "#" da ordem manual. Clicar nela é o caminho mais curto
  // para entrar no modo arrastável (o dropdown da toolbar é o outro).
  ordem: { asc: 'manual_asc', desc: 'manual_desc', first: 'asc' },
  // 0050 — a TAG manual. Separada de `score`: são duas colunas na tabela,
  // ordenáveis independentemente.
  prioridade: { asc: 'tag_asc', desc: 'tag_desc', first: 'asc' },
  id: { asc: 'seq_asc', desc: 'seq_desc' },
  nome: { asc: 'nome_asc', desc: 'nome_desc' },
  area: { asc: 'area_asc', desc: 'area_asc' },
  processo: { asc: 'processo_asc', desc: 'processo_asc' },
  status: { asc: 'status_asc', desc: 'status_asc' },
  score: { asc: 'score_asc', desc: 'score_desc' },
  fte: { asc: 'fte_asc', desc: 'fte_desc' },
};

export function OpportunityTable({
  opportunities,
  assigneesByOpportunity,
  companyById = {},
  showCompany = false,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const filters = parseFilters(params);
  const currentSort: SortKey = filters.sort ?? 'score_desc';

  // ===========================================================================
  // Ordem manual de prioridade (0049)
  // ===========================================================================
  // Arrastar só faz sentido quando a lista JÁ está na ordem manual crescente —
  // em qualquer outra ordenação a posição solta pelo usuário seria desfeita no
  // próximo render pela regra de ordenação vigente. Fora do modo manual o
  // handle não é renderizado.
  const canReorder = isManualSort(currentSort) && !readOnly;

  // Cópia local só para o arrasto otimista — o servidor continua sendo a fonte
  // da verdade. Mesma técnica de ressincronização durante o render usada pelo
  // Kanban (Board.tsx): quando a lista do servidor muda (filtro, revalidate),
  // a cópia é descartada em vez de continuar mostrando a ordem velha.
  const [rows, setRows] = useState(opportunities);
  const [syncedFrom, setSyncedFrom] = useState(opportunities);
  if (syncedFrom !== opportunities) {
    setSyncedFrom(opportunities);
    setRows(opportunities);
  }
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // 5px antes de virar arrasto — preserva o clique que navega para a
    // oportunidade (mesma constante do Kanban).
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = rows.findIndex((o) => o.id === active.id);
    const to = rows.findIndex((o) => o.id === over.id);
    if (from < 0 || to < 0) return;

    const prev = rows;
    const next = arrayMove(rows, from, to);
    setRows(next);
    setReorderError(null);

    startTransition(async () => {
      const result = await reorderOpportunities(next.map((o) => o.id));
      if (!result.ok) {
        setRows(prev); // rollback
        setReorderError(result.error);
      }
    });
  }

  function toggleSort(colKey: keyof typeof SORTABLE_COLS) {
    const col = SORTABLE_COLS[colKey];
    let next: SortKey;
    if (currentSort === col.desc) next = col.asc;
    else if (currentSort === col.asc) next = col.desc;
    else next = col.first === 'asc' ? col.asc : col.desc; // primeira vez
    if (currentSort === col.asc && col.asc === col.desc) next = col.asc; // colunas sem reverso

    const sp = new URLSearchParams(params.toString());
    const qs = buildQuery({ ...filters, sort: next }, sp);
    router.replace(qs ? `/opportunities?${qs}` : '/opportunities');
  }

  function arrowFor(colKey: keyof typeof SORTABLE_COLS): string {
    const col = SORTABLE_COLS[colKey];
    if (currentSort === col.asc) return ' ↑';
    if (currentSort === col.desc && col.asc !== col.desc) return ' ↓';
    if (currentSort === col.desc) return ' ↑';
    return '';
  }

  function isActive(colKey: keyof typeof SORTABLE_COLS): boolean {
    const col = SORTABLE_COLS[colKey];
    return currentSort === col.asc || currentSort === col.desc;
  }

  if (opportunities.length === 0) {
    return (
      <div className="bg-wh border border-bdr rounded-xl p-12 text-center text-mut">
        Nenhuma oportunidade encontrada com esses filtros.
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
          prioridade. A ordem vale para a empresa inteira e é salva na hora.
        </p>
      )}
      <div className="bg-wh border border-bdr rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        {/* DndContext/SortableContext existem SEMPRE (hooks não podem ser
            condicionais, e `useSortable` exige o provider acima); quem decide
            se arrasta é o `disabled` de cada linha. */}
        <DndContext
          id="opportunities-table-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
        <table className="w-full border-collapse">
          <thead>
            {/* Gradiente diagonal — mockup _giba_wsi-dashboard.html:48 (thead) */}
            <tr className="bg-gradient-to-br from-pril to-pri text-white">
              <ThSort
                active={isActive('ordem')}
                onClick={() => toggleSort('ordem')}
              >
                #{arrowFor('ordem')}
              </ThSort>
              <ThSort
                active={isActive('id')}
                onClick={() => toggleSort('id')}
              >
                ID{arrowFor('id')}
              </ThSort>
              {/* Coluna "Empresa" (Phase 17, Plan 17-07) — flag calculada no
                  servidor a partir do papel do usuário. Logo após o ID:
                  "de quem é esta demanda" é a primeira pergunta de uma
                  listagem unificada cross-tenant. NÃO entra em
                  SORTABLE_COLS — ordenar por empresa exigiria ordenação no
                  servidor por uma coluna que a query não traz, e nenhum
                  critério da fase pede isso. */}
              {showCompany && <Th>Empresa</Th>}
              <ThSort
                active={isActive('nome')}
                onClick={() => toggleSort('nome')}
              >
                Solicitante{arrowFor('nome')}
              </ThSort>
              <ThSort
                active={isActive('area')}
                onClick={() => toggleSort('area')}
              >
                Área / Subárea{arrowFor('area')}
              </ThSort>
              <ThSort
                active={isActive('processo')}
                onClick={() => toggleSort('processo')}
              >
                Processo / Oportunidade{arrowFor('processo')}
              </ThSort>
              <ThSort
                active={isActive('fte')}
                onClick={() => toggleSort('fte')}
              >
                FTE/mês{arrowFor('fte')}
              </ThSort>
              <ThSort
                active={isActive('status')}
                onClick={() => toggleSort('status')}
              >
                Status{arrowFor('status')}
              </ThSort>
              <Th>Freq.</Th>
              <Th>Pessoas</Th>
              <Th>Complex.</Th>
              <ThSort
                active={isActive('score')}
                onClick={() => toggleSort('score')}
              >
                Score{arrowFor('score')}
              </ThSort>
              <ThSort
                active={isActive('prioridade')}
                onClick={() => toggleSort('prioridade')}
              >
                Prioridade{arrowFor('prioridade')}
              </ThSort>
              <Th>Atribuído a</Th>
              <Th>Data de Registro</Th>
            </tr>
          </thead>
          <tbody>
            <SortableContext
              items={rows.map((o) => o.id)}
              strategy={verticalListSortingStrategy}
            >
            {rows.map((o, index) => (
              <SortableRow
                key={o.id}
                id={o.id}
                position={index + 1}
                draggable={canReorder}
                onOpen={() => router.push(`/opportunities/${o.id}`)}
              >
                <Td>
                  <SeqIdDisplay seqId={o.seq_id} />
                </Td>
                {showCompany && (
                  <Td>
                    <span className="text-[12px] font-medium">
                      {companyById[o.tenant_id] ?? '—'}
                    </span>
                  </Td>
                )}
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-pri text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(o.solicitante)}
                    </div>
                    <div className="font-semibold text-[12px] leading-tight">
                      {o.solicitante}
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="text-[12px] font-medium">{o.area}</div>
                  {o.subarea && (
                    <div className="text-[10px] text-mut">{o.subarea}</div>
                  )}
                </Td>
                <Td>
                  <div
                    className="text-[12px] max-w-[280px] truncate"
                    title={o.processo}
                  >
                    {o.processo}
                  </div>
                </Td>
                <Td>
                  <FteCell fte={o.fte_horas} />
                </Td>
                <Td>
                  <StatusBadge status={o.status} />
                </Td>
                <Td>
                  <span className="text-[11px] text-mut">
                    {o.frequencia ?? '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-[11px] text-mut">
                    {o.num_pessoas ?? '—'}
                  </span>
                </Td>
                <Td>
                  <ComplexityBadge value={o.complexidade} />
                </Td>
                <Td>
                  <ScoreDisplay score={o.score} />
                </Td>
                <Td>
                  <PriorityTagCell
                    opportunityId={o.id}
                    value={o.priority_tag}
                    readOnly={readOnly}
                    onError={setReorderError}
                  />
                </Td>
                <Td>
                  <AssigneeStack assignees={assigneesByOpportunity[o.id] ?? []} />
                </Td>
                <Td>
                  <span className="text-[11px] text-mut whitespace-nowrap">
                    {fmtDataRegistro(o.created_at)}
                  </span>
                </Td>
              </SortableRow>
            ))}
            </SortableContext>
          </tbody>
        </table>
        </DndContext>
      </div>
      </div>
    </div>
  );
}

/**
 * Célula da tag de prioridade manual (0050). Editável direto na lista — é onde
 * a priorização acontece; abrir a oportunidade só para classificar seria um
 * round-trip por linha. `viewer` vê o badge sem o controle.
 *
 * Update otimista com rollback, mesmo contrato do arrasto. O `stopPropagation`
 * é obrigatório: a `<tr>` inteira navega no clique, e sem ele abrir o select
 * levaria o usuário para a página da oportunidade.
 */
function PriorityTagCell({
  opportunityId,
  value,
  readOnly,
  onError,
}: {
  opportunityId: string;
  value: ManualPriority | null;
  readOnly: boolean;
  onError: (msg: string | null) => void;
}) {
  const [tag, setTag] = useState<ManualPriority | null>(value);
  const [syncedFrom, setSyncedFrom] = useState(value);
  if (syncedFrom !== value) {
    setSyncedFrom(value);
    setTag(value);
  }
  const [, startTransition] = useTransition();

  if (readOnly) {
    return tag ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
        style={{ background: PRIORITY_META[tag].bg, color: PRIORITY_META[tag].color }}
      >
        <span aria-hidden="true">{PRIORITY_META[tag].icon}</span>
        <span>{PRIORITY_META[tag].label}</span>
      </span>
    ) : (
      <span className="text-[11px] text-mut">—</span>
    );
  }

  function onChange(raw: string) {
    const next = (raw || null) as ManualPriority | null;
    const prev = tag;
    setTag(next);
    onError(null);

    startTransition(async () => {
      const result = await setOpportunityPriorityTag(opportunityId, next);
      if (!result.ok) {
        setTag(prev); // rollback
        onError(result.error);
      }
    });
  }

  return (
    <select
      value={tag ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Prioridade definida manualmente"
      className="text-[11px] font-bold border border-bdr rounded-full px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-pri"
      style={
        tag
          ? { background: PRIORITY_META[tag].bg, color: PRIORITY_META[tag].color }
          : undefined
      }
    >
      <option value="">—</option>
      {PRIORITY_OPTIONS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.icon} {p.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Linha arrastável (0049). A primeira célula é a da ordem: mostra a posição
 * (1..N na tela) e, quando `draggable`, o handle. O handle é o ÚNICO ponto de
 * arrasto — o resto da linha continua sendo um clique que navega, que é o
 * comportamento que a lista sempre teve.
 *
 * `useSortable` é chamado incondicionalmente (regra dos hooks) e desligado por
 * `disabled` fora do modo manual.
 */
function SortableRow({
  id,
  position,
  draggable,
  onOpen,
  children,
}: {
  id: string;
  position: number;
  draggable: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
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
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onOpen}
      className="border-b border-bdr last:border-b-0 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
    >
      <td className="px-2.5 py-2 align-middle whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {draggable && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              // O handle vive dentro de uma linha clicável: sem isto, soltar o
              // card dispara o onClick da <tr> e a página navega no fim de
              // todo arrasto.
              onClick={(e) => e.stopPropagation()}
              title="Arrastar para reordenar a prioridade"
              aria-label={`Reordenar — posição atual ${position}`}
              className="text-mut hover:text-txt cursor-grab active:cursor-grabbing leading-none px-0.5 focus:outline-none focus:ring-2 focus:ring-pri rounded"
              style={{ touchAction: 'none' }}
            >
              ⠿
            </button>
          )}
          <span className="text-[11px] font-bold text-mut tabular-nums">
            {position}
          </span>
        </div>
      </td>
      {children}
    </tr>
  );
}

/**
 * Avatares empilhados das pessoas atribuídas. Acima de 3, condensa em "+N"
 * para a linha não estourar — os nomes completos ficam no `title`.
 */
function AssigneeStack({ assignees }: { assignees: Assignee[] }) {
  if (assignees.length === 0) {
    return <span className="text-[11px] text-mut">—</span>;
  }

  const shown = assignees.slice(0, 3);
  const rest = assignees.length - shown.length;
  const allNames = assignees.map(assigneeName).join(', ');

  return (
    <div className="flex items-center -space-x-1.5" title={allNames}>
      {shown.map((a) => (
        <span
          key={a.profileId}
          className="w-6 h-6 rounded-full bg-pri text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-wh"
        >
          {assigneeInitials(a)}
        </span>
      ))}
      {rest > 0 && (
        <span className="w-6 h-6 rounded-full bg-bg text-mut text-[9px] font-bold flex items-center justify-center ring-2 ring-wh">
          +{rest}
        </span>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2.5 py-2 text-left text-[10px] uppercase tracking-wider font-bold whitespace-nowrap">
      {children}
    </th>
  );
}

function ThSort({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-0 py-0">
      <button
        type="button"
        onClick={onClick}
        className={
          'w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-wider font-bold whitespace-nowrap hover:bg-pril ' +
          (active ? 'bg-pril' : '')
        }
      >
        {children}
      </button>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2.5 py-2 align-middle">{children}</td>;
}
