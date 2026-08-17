// =============================================================================
// deriveFteBucket — fonte única horas → bucket FTE — Phase 11 / Plan 11-01
// =============================================================================
// Spec PURO (sem DB) que trava as faixas horas→bucket (D-02) contra o `ftOpts`
// do mockup (`_giba_wsi-dashboard.html:1565`). Limites inferiores INCLUSIVOS,
// superiores EXCLUSIVOS:
//   <10            → muito_baixo
//   >=10  & <40    → baixo
//   >=40  & <100   → medio
//   >=100 & <200   → alto
//   >=200          → muito_alto
// Entrada não-finita/negativa → 0 → muito_baixo (sem throw).
//
// O bucket é derivado, nunca digitado pelo usuário (D-01) — esta fn é a fonte
// única consumida pela UI (display/preview) E pelo submit (persistência).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { deriveFteBucket } from '@/lib/opportunities/fte';

describe('deriveFteBucket — faixas horas → bucket (D-02)', () => {
  it('muito_baixo: < 10h', () => {
    expect(deriveFteBucket(0)).toBe('muito_baixo');
    expect(deriveFteBucket(9)).toBe('muito_baixo');
  });

  it('baixo: 10h (borda inferior) até < 40h', () => {
    expect(deriveFteBucket(10)).toBe('baixo');
    expect(deriveFteBucket(39)).toBe('baixo');
  });

  it('medio: 40h (borda inferior) até < 100h', () => {
    expect(deriveFteBucket(40)).toBe('medio');
    expect(deriveFteBucket(99)).toBe('medio');
  });

  it('alto: 100h (borda inferior) até < 200h', () => {
    expect(deriveFteBucket(100)).toBe('alto');
    expect(deriveFteBucket(199)).toBe('alto');
  });

  it('muito_alto: >= 200h', () => {
    expect(deriveFteBucket(200)).toBe('muito_alto');
    expect(deriveFteBucket(500)).toBe('muito_alto');
  });

  it('degenerado: negativo → muito_baixo (sem throw)', () => {
    expect(deriveFteBucket(-5)).toBe('muito_baixo');
  });

  it('degenerado: NaN → muito_baixo (sem throw)', () => {
    expect(deriveFteBucket(Number.NaN)).toBe('muito_baixo');
  });
});
