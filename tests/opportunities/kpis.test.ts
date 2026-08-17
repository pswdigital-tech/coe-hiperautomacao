// =============================================================================
// computeKpis — contrato da NOVA shape (D-03 / VIEW-01) — Wave 0 (Plan 13-01)
// =============================================================================
// Spec PURO (sem DB) que trava a shape que `computeKpis` deve passar a retornar
// após o reshape do Plan 13-02:
//   { total, scoreMedio, fteTotal, byPriority{alta,media,baixa},
//     byStatus{novo,producao,concluido} }
// Drops legados: personas, formularios, byTool (não fazem mais parte da KPI bar).
//   - fteTotal = Math.round(Σ fte_horas) com `?? 0` para linhas null.
//
// PODE estar RED até o Plan 13-02 reescrever computeKpis — é o contrato Wave 0.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeKpis } from '@/lib/opportunities/queries';

// Fixture mínima: só os campos que computeKpis lê. `as any` para brevidade.
const opps = [
  { score: 100, priority_level: 'alta', status: 'novo', fte_horas: 40 },
  { score: 60, priority_level: 'media', status: 'producao', fte_horas: 12.4 },
  { score: 30, priority_level: 'baixa', status: 'concluido', fte_horas: null },
  { score: 80, priority_level: 'alta', status: 'novo', fte_horas: 7.6 },
] as any[];

describe('computeKpis — nova shape (D-03 / VIEW-01)', () => {
  const result = computeKpis(opps);

  it('fteTotal = Math.round(Σ fte_horas) com null tratado como 0', () => {
    // 40 + 12.4 + 0 + 7.6 = 60
    expect(result.fteTotal).toBe(Math.round(40 + 12.4 + 0 + 7.6));
    expect(result.fteTotal).toBe(60);
  });

  it('byStatus tem exatamente as chaves novo/producao/concluido', () => {
    expect(Object.keys(result.byStatus).sort()).toEqual([
      'concluido',
      'novo',
      'producao',
    ]);
  });

  it('não expõe mais personas/formularios/byTool', () => {
    expect('personas' in result).toBe(false);
    expect('formularios' in result).toBe(false);
    expect('byTool' in result).toBe(false);
  });

  it('byPriority mantém alta/media/baixa', () => {
    expect(result.byPriority.alta).toBe(2);
    expect(result.byPriority.media).toBe(1);
    expect(result.byPriority.baixa).toBe(1);
  });

  it('scoreMedio = média arredondada dos scores', () => {
    expect(result.scoreMedio).toBe(Math.round((100 + 60 + 30 + 80) / 4));
  });
});
