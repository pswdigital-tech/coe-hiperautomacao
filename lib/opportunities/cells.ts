// lib/opportunities/cells.ts
// =============================================================================
// Helpers PUROS de apresentação de células de oportunidade (sem JSX/React).
// Wave 0 (Plan 13-01) cria este módulo como alvo do contrato de `rpaTier`
// definido em tests/opportunities/rpa-badge.test.ts. A IMPLEMENTAÇÃO de
// `rpaTier` é entregue pelo Plan 13-02 (badges "RPA Fit", _giba:520-525).
// Mantido sem React para ser importável em specs puros de vitest.
// =============================================================================

export type RpaTier = {
  /** Rótulo do badge, ex.: 'RPA Ideal (6/6)'. */
  label: string;
  /** Ícone do tier: '⭐' (>=5), '✓' (>=3), '' (else). */
  icon: string;
};

/**
 * rpaTier — mapeia rpa_score (0–6) → tier de "RPA Fit" (rótulo + ícone),
 * espelhando o contrato visual `_giba_wsi-dashboard.html:520-525` (D-05/D-16):
 *   score >= 5 → 'RPA Ideal (N/6)'  ícone '⭐'
 *   score >= 3 → 'RPA+n8n (N/6)'    ícone '✓'
 *   else       → 'n8n (N/6)'        ícone ''
 *
 * Função PURA — o Plan 13-02 a consome para renderizar o badge na coluna
 * "RPA Fit" da tabela. O valor `score` vem do `rpa_score` GENERATED (read-only),
 * ou do recompute ao vivo via `deriveRpaScore` (lib/opportunities/rpa.ts).
 */
export function rpaTier(score: number): RpaTier {
  if (score >= 5) return { label: `RPA Ideal (${score}/6)`, icon: '⭐' };
  if (score >= 3) return { label: `RPA+n8n (${score}/6)`, icon: '✓' };
  return { label: `n8n (${score}/6)`, icon: '' };
}
