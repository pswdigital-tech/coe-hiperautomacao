// =============================================================================
// rpaTier — thresholds do badge "RPA Fit" (D-05 / D-16) — Wave 0 (Plan 13-01)
// =============================================================================
// Spec PURO (sem DB) que trava os tiers do rpa_score (0–6) → rótulo + ícone,
// espelhando o contrato visual `_giba_wsi-dashboard.html:520-525`:
//   6 ⭐ "RPA Ideal (6/6)"   5 ⭐ "RPA Ideal (5/6)"   (>=5 → RPA Ideal, ⭐)
//   4 ✓  "RPA+n8n (4/6)"     3 ✓  "RPA+n8n (3/6)"     (>=3 → RPA+n8n, ✓)
//   2    "n8n (2/6)"         0    "n8n (0/6)"          (else  → n8n, sem ícone)
//
// PODE estar RED até o Plan 13-02 exportar rpaTier de @/lib/opportunities/cells.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { rpaTier } from '@/lib/opportunities/cells';

describe('rpaTier — tiers do RPA Fit (D-05/D-16, _giba:520-525)', () => {
  it('6 → RPA Ideal (6/6) ⭐', () => {
    expect(rpaTier(6).label).toBe('RPA Ideal (6/6)');
    expect(rpaTier(6).icon).toBe('⭐');
  });

  it('5 → RPA Ideal (5/6)', () => {
    expect(rpaTier(5).label).toBe('RPA Ideal (5/6)');
    expect(rpaTier(5).icon).toBe('⭐');
  });

  it('4 → RPA+n8n (4/6) ✓', () => {
    expect(rpaTier(4).label).toBe('RPA+n8n (4/6)');
    expect(rpaTier(4).icon).toBe('✓');
  });

  it('3 → RPA+n8n (3/6)', () => {
    expect(rpaTier(3).label).toBe('RPA+n8n (3/6)');
    expect(rpaTier(3).icon).toBe('✓');
  });

  it('2 → n8n (2/6) sem ícone', () => {
    expect(rpaTier(2).label).toBe('n8n (2/6)');
    expect(rpaTier(2).icon).toBe('');
  });

  it('0 → n8n (0/6) sem ícone', () => {
    expect(rpaTier(0).label).toBe('n8n (0/6)');
    expect(rpaTier(0).icon).toBe('');
  });
});
