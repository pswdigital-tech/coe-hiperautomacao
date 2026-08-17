'use client';

import type { Opportunity } from '@/lib/opportunities/types';
import { getInitials, scoreColor } from '@/lib/opportunities/utils';
import { StatusSelector } from './StatusSelector';
import { DeleteButton } from './DeleteButton';
import { AiEnrichmentBadge } from './AiEnrichmentBadge';

type Props = {
  opportunity: Opportunity;
  /**
   * Empresa dona desta oportunidade — sinalização de "por que estou vendo
   * isto" para o staff PSW (Phase 17). `null`/ausente para os demais papéis:
   * o markup não muda.
   */
  companyName?: string | null;
  // ── Edição global do modal (Phase 13, D-12) ───────────────────────────────
  editMode: boolean;
  pending: boolean;
  submitError: string | null;
  // Derivados ao vivo (read-only — D-15). Em modo edição o círculo mostra estes;
  // em leitura mostra o.score / o.priority_level DB-authoritative.
  liveScore: number;
  livePriority: 'alta' | 'media' | 'baixa';
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** RBAC (v0.3) — viewer não edita/exclui/troca status. */
  readOnly?: boolean;
};

const PRIORITY_LABEL: Record<'alta' | 'media' | 'baixa', string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/**
 * Header do detail (modal e fullscreen): gradient azul + avatar + nome + status
 * dropdown + score circle. Phase 13 (D-12): dirige UM fluxo global de
 * Editar/Salvar/Cancelar. O score circle recalcula AO VIVO em modo edição
 * (read-only, D-15) e mostra o valor DB-authoritative em modo leitura.
 */
export function ModalHeader({
  opportunity: o,
  companyName = null,
  editMode,
  pending,
  submitError,
  liveScore,
  livePriority,
  onEdit,
  onSave,
  onCancel,
  readOnly = false,
}: Props) {
  const role =
    o.source === 'persona'
      ? `${o.subarea ?? ''} · ${o.area}`.replace(/^ · /, '').replace(/ · $/, '')
      : o.processo;

  // Em edição: score derivado ao vivo (read-only). Em leitura: total DB-authoritative.
  const displayScore = editMode ? liveScore : o.score;
  const displayPriority = editMode ? livePriority : o.priority_level;
  const color = scoreColor(displayScore);

  return (
    <div className="bg-gradient-to-br from-pri to-pril text-white px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center font-black text-[15px] flex-shrink-0">
            {getInitials(o.solicitante)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-base truncate">
              #{String(o.seq_id).padStart(4, '0')} · {o.solicitante}
            </div>
            <div className="text-xs opacity-85 truncate mt-0.5">{role}</div>
            <div className="text-[11px] opacity-70 truncate mt-0.5">
              🏢 {o.area}
              {o.subarea && o.subarea !== o.area ? ` · ${o.subarea}` : ''}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusSelector
                opportunityId={o.id}
                currentStatus={o.status}
                readOnly={readOnly}
              />
              <AiEnrichmentBadge
                status={o.ai_enrichment_status}
                error={o.ai_enrichment_error}
              />
              {companyName && (
                <span
                  className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold inline-flex items-center gap-1"
                  title="Empresa dona desta oportunidade"
                >
                  🏢 {companyName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {readOnly && (
            <span
              className="px-2.5 py-1 rounded-full bg-acc/90 text-white text-[11px] font-bold inline-flex items-center gap-1"
              title="Perfil somente leitura"
            >
              👁️ Somente leitura
            </span>
          )}
          {/* D-12: UM único fluxo global Editar ↔ Salvar/Cancelar (in-modal).
              (O EditButton p/ rota /edit foi removido — edição é só in-modal.)
              RBAC (v0.3): viewer nunca vê nenhum destes botões. */}
          {!readOnly &&
            (!editMode ? (
              <button
                type="button"
                onClick={onEdit}
                title="Editar oportunidade"
                className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/35 text-white text-[11px] font-bold border border-white/30 inline-flex items-center gap-1"
              >
                ✏️ Editar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={pending}
                  title="Salvar alterações"
                  className="px-2.5 py-1 rounded-full bg-acc hover:opacity-90 text-white text-[11px] font-bold border border-white/30 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {pending ? 'Salvando...' : '💾 Salvar'}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  title="Cancelar edição"
                  className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/35 text-white text-[11px] font-bold border border-white/30 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  ✕ Cancelar
                </button>
              </>
            ))}
          {!readOnly && (
            <DeleteButton
              opportunityId={o.id}
              label={`#${String(o.seq_id).padStart(4, '0')} · ${o.solicitante}`}
            />
          )}
          <div
            className="w-14 h-14 rounded-full border-[3px] flex flex-col items-center justify-center bg-white/10"
            style={{ borderColor: `${color}99` }}
            title={
              displayPriority
                ? `Prioridade: ${PRIORITY_LABEL[displayPriority]}`
                : undefined
            }
          >
            <div className="text-lg font-black leading-none" style={{ color }}>
              {displayScore}
            </div>
            <div className="text-[8px] opacity-75 uppercase tracking-wide">
              score
            </div>
          </div>
        </div>
      </div>

      {/* Erro de submit (pt-BR) — só em edição (D-12). */}
      {editMode && submitError && (
        <div className="mt-2 px-3 py-1.5 rounded-lg bg-red-900/40 border border-red-300/40 text-[11px] text-red-50">
          {submitError}
        </div>
      )}
    </div>
  );
}
