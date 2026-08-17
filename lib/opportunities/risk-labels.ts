// =============================================================================
// risk-labels.ts — camada de labels de `opportunity_risks` (Phase 12, D-07)
// -----------------------------------------------------------------------------
// Módulo único reusado por tabela (RiscoTab/RiskTable) e formulário (RiskForm) —
// mapeia enums minúsculos do DB (fonte da verdade: risk-schema.ts / migration
// 0011) para PT Title-Case da UI. Centralizar evita divergência entre telas.
//
// Badges espelham `_giba_wsi-dashboard.html:1186-1195`:
//   tipo: impedimento 🚧 / oportunidade 💡 / risco ⚠️
//   prioridade: critica/alta/media/baixa → cores distinguíveis
// (shadcn NÃO está instalado — compor com primitivos Tailwind, como os overlays
// hand-rolled do repo.)
// =============================================================================

import type {
  RiskType,
  RiskImpact,
  RiskProbability,
  RiskStatus,
  RiskPriority,
} from './types';

// ─── Labels enum (DB, minúsculo) → PT Title-Case (UI) ────────────────────────

export const TIPO_LABEL: Record<RiskType, string> = {
  impedimento: 'Impedimento',
  risco: 'Risco',
  oportunidade: 'Oportunidade',
} as const;

export const IMPACTO_LABEL: Record<RiskImpact, string> = {
  alto: 'Alto',
  significativo: 'Significativo',
  moderado: 'Moderado',
  baixo: 'Baixo',
} as const;

export const PROBABILIDADE_LABEL: Record<RiskProbability, string> = {
  provavel: 'Provável',
  possivel: 'Possível',
  improvavel: 'Improvável',
  remota: 'Remota',
} as const;

// Status exibe o prefixo "Risco" como no mockup (_giba:1240).
export const STATUS_LABEL: Record<RiskStatus, string> = {
  novo: 'Risco Novo',
  gerenciado: 'Risco Gerenciado',
  mitigado: 'Risco Mitigado',
  ocorrido: 'Risco Ocorrido',
} as const;

export const PRIORITY_LABEL: Record<RiskPriority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
} as const;

// ─── Badges (_giba:1186-1195) ────────────────────────────────────────────────

/** Emoji por tipo de risco (_giba:1191-1194). */
export const TIPO_BADGE_EMOJI: Record<RiskType, string> = {
  impedimento: '🚧',
  risco: '⚠️',
  oportunidade: '💡',
} as const;

/**
 * Classes Tailwind por prioridade — distinguíveis por cor (D Discrição estilo).
 * critica vermelho / alta laranja / media âmbar / baixa verde-slate.
 * Composição hand-rolled (shadcn ausente no repo).
 */
export const PRIORITY_BADGE_CLASS: Record<RiskPriority, string> = {
  critica:
    'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
  alta:
    'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700',
  media:
    'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
  baixa:
    'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
} as const;

/**
 * Label de prioridade resiliente a `null`. A coluna `priority` é GENERATED pelo
 * trigger `set_risk_priority()` (before insert OR update) → na prática nunca é
 * null após persistir, mas o tipo Row a declara `RiskPriority | null`. Em vez de
 * propagar o branch por toda a UI, centralizamos o fallback aqui: null exibe "—".
 */
export function priorityLabel(p: RiskPriority | null): string {
  return p ? PRIORITY_LABEL[p] : '—';
}

/** Classe de badge de prioridade resiliente a `null` (ver priorityLabel). */
export function priorityBadgeClass(p: RiskPriority | null): string {
  return p
    ? PRIORITY_BADGE_CLASS[p]
    : 'bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600';
}

// ─── Sugestões de Responsável (D-08) — hints, não dropdown fixo ───────────────
// Tenant-agnóstico: texto livre com sugestões via <datalist>. Não hardcodar
// valores de um tenant específico como obrigatórios.
export const RESPONSAVEL_SUGGESTIONS = ['PSW', 'UnidaSul'] as const;
