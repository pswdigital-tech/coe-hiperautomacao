// =============================================================================
// opportunity_risks.priority — matriz impacto×probabilidade — Phase 9 / Plan 09-03
// =============================================================================
// Spec PURO (sem DB) que trava a matriz de prioridade da coluna GENERATED
// `opportunity_risks.priority` (migration 0011 §9) contra
// `_giba_wsi-dashboard.html:1180-1185` (RISK_PRIO_MATRIX). Testa AS 16 células.
//
//                  provavel    possivel    improvavel   remota
//   alto           critica     critica     alta         alta
//   significativo  critica     alta        media        media
//   moderado       alta        media       media        baixa
//   baixo          alta        media       baixa        baixa
// =============================================================================
import { describe, it, expect } from 'vitest';

type Impacto = 'alto' | 'significativo' | 'moderado' | 'baixo';
type Probabilidade = 'provavel' | 'possivel' | 'improvavel' | 'remota';
type Prioridade = 'critica' | 'alta' | 'media' | 'baixa';

/** Replica EXATA do CASE da coluna GENERATED priority (0011 §9). */
export function calcRiskPrio(impacto: Impacto, probabilidade: Probabilidade): Prioridade {
  if (impacto === 'alto') return probabilidade === 'provavel' || probabilidade === 'possivel' ? 'critica' : 'alta';
  if (impacto === 'significativo') {
    if (probabilidade === 'provavel') return 'critica';
    if (probabilidade === 'possivel') return 'alta';
    return 'media';
  }
  if (impacto === 'moderado') {
    if (probabilidade === 'provavel') return 'alta';
    if (probabilidade === 'possivel' || probabilidade === 'improvavel') return 'media';
    return 'baixa';
  }
  // baixo
  if (probabilidade === 'provavel') return 'alta';
  if (probabilidade === 'possivel') return 'media';
  return 'baixa';
}

// As 16 células, montadas a partir da matriz _giba:1180-1185.
const MATRIX: Array<[Impacto, Probabilidade, Prioridade]> = [
  ['alto', 'provavel', 'critica'],
  ['alto', 'possivel', 'critica'],
  ['alto', 'improvavel', 'alta'],
  ['alto', 'remota', 'alta'],
  ['significativo', 'provavel', 'critica'],
  ['significativo', 'possivel', 'alta'],
  ['significativo', 'improvavel', 'media'],
  ['significativo', 'remota', 'media'],
  ['moderado', 'provavel', 'alta'],
  ['moderado', 'possivel', 'media'],
  ['moderado', 'improvavel', 'media'],
  ['moderado', 'remota', 'baixa'],
  ['baixo', 'provavel', 'alta'],
  ['baixo', 'possivel', 'media'],
  ['baixo', 'improvavel', 'baixa'],
  ['baixo', 'remota', 'baixa'],
];

describe('opportunity_risks.priority — matriz 4x4 (_giba:1180-1185)', () => {
  it('cobre exatamente as 16 combinações', () => {
    expect(MATRIX).toHaveLength(16);
  });

  it.each(MATRIX)('impacto=%s × probabilidade=%s → %s', (impacto, probabilidade, esperado) => {
    expect(calcRiskPrio(impacto, probabilidade)).toBe(esperado);
  });
});
