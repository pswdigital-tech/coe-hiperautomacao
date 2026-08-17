import type { AiEnrichmentStatus } from '@/lib/opportunities/types';

type Props = {
  status: AiEnrichmentStatus | null | undefined;
  error?: string | null;
};

/**
 * Phase 7.6 — Badge visual do estado de enriquecimento por IA.
 *
 * Implementa o requisito AI-UI-01 (badge visível no modal de detalhe) e
 * mitiga o threat T-07.6-F-01 (admin nunca vê falha → row fica com defaults
 * piores que IA → score errado).
 *
 * Renderização condicional:
 *   - 'pending'  → 'Enriquecendo…' (visual sutil, raro porque é rápido ~3-8s)
 *   - 'failed'   → 'Falha — preencher manualmente' (chama atenção; title
 *                  attribute carrega o erro técnico para admin investigar)
 *   - 'enriched' → null (silêncio total — IA fez o trabalho; admin vê os
 *                  campos já populados nas tabs Automação/Score etc.)
 *   - null/undefined → null (defensivo — dados antigos pré-migration 0010
 *                  ou consumer que esqueceu de tipar o status)
 *
 * Server component (sem 'use client') — render puro condicional, sem hooks.
 * Seguro de usar tanto em Server quanto em Client Component.
 *
 * Usado em ModalHeader (components/opportunities/modal/Header.tsx) próximo
 * ao StatusSelector.
 */
export function AiEnrichmentBadge({ status, error }: Props) {
  if (!status || status === 'enriched') {
    return null;
  }

  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
        title="A IA está analisando esta oportunidade. Aguarde alguns segundos e atualize a página."
      >
        <span
          className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"
          aria-hidden
        />
        Enriquecendo…
      </span>
    );
  }

  // status === 'failed'
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
      title={error ?? 'Falha técnica não documentada'}
    >
      <span aria-hidden>⚠</span>
      Falha — preencher manualmente
    </span>
  );
}
