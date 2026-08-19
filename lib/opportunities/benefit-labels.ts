// =============================================================================
// benefit-labels.ts — as 8 dimensões de benefício (coluna jsonb `beneficios`,
// 0011), em ordem canônica de exibição.
//
// Fonte ÚNICA: antes esta lista existia copiada em `BeneficiosTab` e em
// `overview.ts` (para o top 3 da Visão Geral). Duas cópias de um vocabulário
// divergem no primeiro rótulo reescrito — foi o que já aconteceu com a fórmula
// do score na v0.1.
// =============================================================================

export type BenefitKey =
  | 'reducaoTempo'
  | 'eliminacaoErros'
  | 'produtividade'
  | 'qualidadeDados'
  | 'reducaoCustos'
  | 'reducaoRetrabalho'
  | 'compliance'
  | 'objetivosEstrategicos';

export const BENEFIT_LABELS: Record<BenefitKey, string> = {
  reducaoTempo: 'Redução de Tempo',
  eliminacaoErros: 'Eliminação de Erros',
  produtividade: 'Aumento de Produtividade',
  qualidadeDados: 'Qualidade de Dados',
  reducaoCustos: 'Redução de Custos',
  reducaoRetrabalho: 'Redução de Retrabalho',
  compliance: 'Compliance & Regulatório',
  objetivosEstrategicos: 'Objetivos Estratégicos',
};

export const BENEFIT_KEYS = Object.keys(BENEFIT_LABELS) as BenefitKey[];

/** Cor da barra pela nota: ≥4 verde · ≥3 azul · resto âmbar. */
export function benefitColor(v: number): string {
  return v >= 4 ? '#22c55e' : v >= 3 ? '#3b82f6' : '#f59e0b';
}

/**
 * As 8 dimensões pontuadas, ORDENADAS da maior nota para a menor.
 * A ordenação é o que dispensa um bloco separado de "Top 3": as três
 * primeiras linhas já são o top 3, sem repetir a informação duas vezes na
 * mesma tela.
 */
export function scoredBenefits(
  beneficios: unknown
): { key: BenefitKey; label: string; value: number }[] {
  if (!beneficios || typeof beneficios !== 'object') return [];
  const src = beneficios as Record<string, unknown>;

  return BENEFIT_KEYS.map((key) => ({
    key,
    label: BENEFIT_LABELS[key],
    value: Number(src[key]),
  }))
    .filter((b) => Number.isFinite(b.value) && b.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt'));
}

/** Média das dimensões pontuadas, uma casa decimal. `null` se nenhuma. */
export function benefitsAverage(beneficios: unknown): number | null {
  const rows = scoredBenefits(beneficios);
  if (rows.length === 0) return null;
  return Math.round((rows.reduce((a, r) => a + r.value, 0) / rows.length) * 10) / 10;
}
