// lib/opportunities/rpa.ts
// Mirror EXATO da coluna GENERATED opportunities.rpa_score
// (supabase/migrations/0011_schema_evolution_v02.sql:127-136).
// Usado para recompute read-only ao vivo na edição do modal (D-15) e nas badges
// RPA Fit (D-05/D-16). criterios null/incompleto → null (igual ao DB).
// causaReclamacoes e temDocumentacao NÃO contam.
export function deriveRpaScore(
  criterios: Record<string, string> | null | undefined,
): number | null {
  if (criterios == null) return null;
  const v = (k: string) => criterios[k];
  return (
    (v('totalmenteManual') === 'sim' || v('totalmenteManual') === 'parcial' ? 1 : 0) +
    (v('regrasClaras') === 'sim' ? 1 : 0) +
    (v('decisaoHumana') === 'nao' ? 1 : 0) +
    (v('padronizacaoDocs') === 'sim' ? 1 : 0) +
    (v('validacaoDados') === 'sim' ? 1 : 0) +
    (v('schedulable') === 'sim' ? 1 : 0)
  );
}
