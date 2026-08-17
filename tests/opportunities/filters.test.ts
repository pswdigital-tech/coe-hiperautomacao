// =============================================================================
// filters — sort keys de FTE (VIEW-03) — Wave 0 (Plan 13-01)
// =============================================================================
// Spec PURO (sem DB) que trava a existência das chaves de ordenação por FTE.
// O Plan 13-02 adiciona 'fte_asc'/'fte_desc' ao SortKey, SORT_VALUES,
// SORT_LABELS e à ordenação real (coluna FTE da tabela, _giba).
//
// PODE estar RED até o Plan 13-02 incluir as chaves de FTE — é o contrato Wave 0.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { SORT_VALUES, SORT_LABELS, parseFilters } from '@/lib/opportunities/filters';

describe('filters — sort por FTE (VIEW-03)', () => {
  it('SORT_VALUES inclui fte_asc e fte_desc', () => {
    expect((SORT_VALUES as readonly string[])).toContain('fte_asc');
    expect((SORT_VALUES as readonly string[])).toContain('fte_desc');
  });

  it('SORT_LABELS["fte_desc"] é uma string não-vazia', () => {
    const label = (SORT_LABELS as Record<string, string>)['fte_desc'];
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('parseFilters valida ?sort=fte_desc', () => {
    expect(parseFilters(new URLSearchParams('sort=fte_desc')).sort).toBe('fte_desc');
  });
});
