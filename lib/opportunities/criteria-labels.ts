// =============================================================================
// criteria-labels.ts — os 8 critérios de automação (coluna jsonb `criterios`,
// 0011), em ordem canônica de exibição.
//
// Fonte ÚNICA. Antes esta lista existia copiada em `CriteriosStep` (wizard) e
// em `ProcessoAtualTab` (detalhe) — e as duas JÁ tinham divergido: "Totalmente
// Manual" num lado, "Totalmente manual" no outro. É literalmente o que o
// cabeçalho de `benefit-labels.ts` previu que aconteceria, e o motivo de o SDD
// (que também imprime estes rótulos) não virar a terceira cópia.
//
// A ordem desta lista é a ordem de exibição em toda superfície: wizard, ficha
// e PDF. Não reordenar sem querer reordenar nos três lugares.
// =============================================================================

export type CriterioKey =
  | 'causaReclamacoes'
  | 'totalmenteManual'
  | 'regrasClaras'
  | 'decisaoHumana'
  | 'padronizacaoDocs'
  | 'validacaoDados'
  | 'schedulable'
  | 'temDocumentacao';

export type CriterioValor = 'sim' | 'nao' | 'parcial';

export type CriterioDef = {
  key: CriterioKey;
  label: string;
  /**
   * A resposta que FAVORECE a automação. Explícito em vez de escondido num if
   * porque `decisaoHumana` é INVERTIDO: é favorável quando a resposta é "não"
   * (sem decisão humana frequente, mais automatizável). Enquanto isso vivia só
   * num comentário, quem lia a tela não tinha como saber por que um "Não"
   * aparecia em verde. Mesma inversão em `score.ts` e em `rpa.ts`.
   */
  favoravelQuando: 'sim' | 'nao';
};

export const CRITERIOS: CriterioDef[] = [
  { key: 'causaReclamacoes', label: 'Causa reclamações quando falha', favoravelQuando: 'sim' },
  { key: 'totalmenteManual', label: 'Totalmente manual', favoravelQuando: 'sim' },
  { key: 'regrasClaras', label: 'Processo baseado em regras claras', favoravelQuando: 'sim' },
  { key: 'decisaoHumana', label: 'Necessidade de decisão humana frequente', favoravelQuando: 'nao' },
  { key: 'padronizacaoDocs', label: 'Padronização em documentos (PDFs, formulários)', favoravelQuando: 'sim' },
  { key: 'validacaoDados', label: 'Validação ou conferência de dados simples', favoravelQuando: 'sim' },
  { key: 'schedulable', label: 'Pode ser programado para horários específicos', favoravelQuando: 'sim' },
  { key: 'temDocumentacao', label: 'Possui documentação do processo', favoravelQuando: 'sim' },
];

export const CRITERIO_KEYS = CRITERIOS.map((c) => c.key);

export const CRITERIO_VALOR_LABEL: Record<CriterioValor, string> = {
  sim: 'Sim',
  nao: 'Não',
  parcial: 'Parcial',
};

/** Lê um critério do jsonb, devolvendo null quando ausente ou fora do domínio. */
export function criterioValor(
  criterios: unknown,
  key: CriterioKey
): CriterioValor | null {
  if (!criterios || typeof criterios !== 'object') return null;
  const v = (criterios as Record<string, unknown>)[key];
  return v === 'sim' || v === 'nao' || v === 'parcial' ? v : null;
}

/** O critério pesa a favor da automação? `parcial` e ausente não contam. */
export function isFavoravel(def: CriterioDef, valor: CriterioValor | null): boolean {
  return valor != null && valor === def.favoravelQuando;
}

/** Quantos dos 8 critérios respondidos são favoráveis. */
export function countFavoraveis(criterios: unknown): number {
  return CRITERIOS.filter((def) => isFavoravel(def, criterioValor(criterios, def.key)))
    .length;
}
