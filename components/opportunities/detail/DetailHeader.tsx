'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Opportunity } from '@/lib/opportunities/types';
import type { Assignee, AssignableProfile } from '@/lib/opportunities/assignee-types';
import { getInitials, scoreColor } from '@/lib/opportunities/utils';
import { StatusSelector } from '@/components/opportunities/modal/StatusSelector';
import { DeleteButton } from '@/components/opportunities/modal/DeleteButton';
import { AiEnrichmentBadge } from '@/components/opportunities/modal/AiEnrichmentBadge';
import { getLastListUrl } from '@/lib/opportunities/filters-storage';
import { AssigneesStack } from './AssigneesStack';

type Props = {
  opportunity: Opportunity;
  /** Empresa dona — sinalização "por que estou vendo isto" para o staff PSW (Phase 17). */
  companyName?: string | null;
  // ── Fluxo global de edição (D-12), dirigido por OpportunityDetail ──────────
  editMode: boolean;
  pending: boolean;
  submitError: string | null;
  /** Derivados AO VIVO (read-only, D-15) — usados só em modo edição. */
  liveScore: number;
  livePriority: 'alta' | 'media' | 'baixa';
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  // ── Responsáveis (0032) ───────────────────────────────────────────────────
  assignees: Assignee[];
  assignableProfiles: AssignableProfile[];
  canAssign: boolean;
};

const PRIORITY_LABEL: Record<'alta' | 'media' | 'baixa', string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/**
 * Header do detalhe (v0.5) — card branco com breadcrumb, identidade, status,
 * anel de score, pilha de responsáveis e ações. Substitui o `ModalHeader` em
 * gradiente azul: o detalhe deixou de ser um modal sobre a lista e virou uma
 * página de trabalho, onde uma faixa colorida de 140px competia com o conteúdo
 * (o Plano de Atividades) por atenção. O `ModalHeader` continua no disco e
 * segue servindo qualquer superfície que ainda o monte.
 *
 * Continua dirigindo UM fluxo global de Editar/Salvar/Cancelar (D-12); o anel
 * recalcula ao vivo em edição e mostra o valor DB-authoritative em leitura.
 */
export function DetailHeader({
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
  assignees,
  assignableProfiles,
  canAssign,
}: Props) {
  const [managing, setManaging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Breadcrumb "Oportunidades" volta pra ONDE a pessoa estava (view + filtros),
  // não pra lista crua — lido do sessionStorage só depois do mount (evita
  // mismatch de hidratação; servidor não tem acesso a isso).
  const [listHref, setListHref] = useState('/opportunities');
  useEffect(() => {
    const stored = getLastListUrl();
    if (stored) setListHref(stored);
  }, []);

  // Clique fora fecha o menu "⋮" (mesma mecânica de click-outside dos diálogos).
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const label = `#${String(o.seq_id).padStart(4, '0')} · ${o.solicitante}`;
  const subtitle =
    o.source === 'persona'
      ? `${o.subarea ?? ''} · ${o.area}`.replace(/^ · /, '').replace(/ · $/, '')
      : o.processo;

  const displayScore = editMode ? liveScore : o.score;
  const displayPriority = editMode ? livePriority : o.priority_level;

  return (
    <div className="bg-wh border border-bdr rounded-2xl shadow-sm px-5 py-4">
      {/* Breadcrumb — o "← Voltar para a lista" virou trilha, que também diz
          onde a pessoa está, não só de onde veio. */}
      <nav
        aria-label="Trilha de navegação"
        className="flex items-center gap-1.5 text-[11px] mb-3"
      >
        <Link href={listHref} className="font-semibold text-pri hover:text-pril">
          Oportunidades
        </Link>
        <span className="text-mut" aria-hidden="true">
          ›
        </span>
        <span className="text-mut truncate">{label}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Identidade */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-pri text-white flex items-center justify-center font-black text-[15px] flex-shrink-0">
            {getInitials(o.solicitante)}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-[18px] text-txt truncate">{label}</h1>
            <div className="text-[12px] text-mut truncate mt-0.5">{subtitle}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-mut">
                🏢 {o.area}
                {o.subarea && o.subarea !== o.area ? ` · ${o.subarea}` : ''}
              </span>
              {companyName && (
                <span
                  className="px-2 py-0.5 rounded-full bg-bg border border-bdr text-txt text-[11px] font-bold"
                  title="Empresa dona desta oportunidade"
                >
                  🏢 {companyName}
                </span>
              )}
              <AiEnrichmentBadge
                status={o.ai_enrichment_status}
                error={o.ai_enrichment_error}
              />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-mut">
            Status da oportunidade
          </span>
          <StatusSelector
            opportunityId={o.id}
            currentStatus={o.status}
            readOnly={readOnly}
            variant="light"
          />
        </div>

        {/* Score */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-mut">
            Score
          </span>
          <ScoreRing
            score={displayScore}
            title={
              displayPriority
                ? `Prioridade: ${PRIORITY_LABEL[displayPriority]}`
                : undefined
            }
          />
        </div>

        {/* Responsáveis */}
        <AssigneesStack
          opportunityId={o.id}
          assignees={assignees}
          options={assignableProfiles}
          canAssign={canAssign}
          editing={managing}
          onEditingChange={setManaging}
        />

        {/* Ações */}
        <div className="flex items-center gap-2 ml-auto">
          {readOnly && (
            <span
              className="px-2.5 py-1 rounded-full bg-bg border border-bdr text-txt text-[11px] font-bold"
              title="Perfil somente leitura"
            >
              👁️ Somente leitura
            </span>
          )}

          {!readOnly &&
            (!editMode ? (
              <button
                type="button"
                onClick={onEdit}
                className="px-3 py-2 rounded-lg border border-bdr bg-wh text-txt text-[12px] font-bold hover:bg-bg inline-flex items-center gap-1.5 transition-colors"
              >
                ✏️ Editar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={pending}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Salvando...' : '💾 Salvar'}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  className="px-3 py-2 rounded-lg border border-bdr bg-wh text-txt text-[12px] font-bold hover:bg-bg disabled:opacity-50 transition-colors"
                >
                  ✕ Cancelar
                </button>
              </>
            ))}

          {canAssign && (
            <button
              type="button"
              onClick={() => setManaging((v) => !v)}
              aria-expanded={managing}
              className="px-3 py-2 rounded-lg bg-pri hover:bg-pril text-white text-[12px] font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              ⚙️ Gerenciar
            </button>
          )}

          {!readOnly && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Mais ações"
                className="w-9 h-9 rounded-lg border border-bdr bg-wh text-txt hover:bg-bg transition-colors"
              >
                ⋮
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute z-30 right-0 top-full mt-2 w-48 bg-wh border border-bdr rounded-xl shadow-lg p-1"
                >
                  <Link
                    href={`/opportunities/${o.id}/tarefas`}
                    role="menuitem"
                    className="block px-3 py-2 rounded-lg text-[12px] font-semibold text-txt hover:bg-bg"
                  >
                    🗂️ Plano em tela cheia
                  </Link>
                  <DeleteButton
                    opportunityId={o.id}
                    label={label}
                    triggerClassName="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editMode && submitError && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[12px] text-red-700 dark:text-red-300">
          {submitError}
        </div>
      )}
    </div>
  );
}

/**
 * Anel de score — arco SVG proporcional a 0–100, na mesma escala de cor de
 * `scoreColor` (≥70 verde / ≥40 amarelo / <40 vermelho). Puramente visual: o
 * score NUNCA é input nem é persistido (docs/PROJETO.md §3).
 */
function ScoreRing({ score, title }: { score: number; title?: string }) {
  const size = 58;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-bdr"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[17px] font-black" style={{ color }}>
          {score}
        </span>
        <span className="text-[9px] text-mut">/100</span>
      </div>
    </div>
  );
}
