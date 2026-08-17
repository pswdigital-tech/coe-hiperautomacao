// =============================================================================
// SCORE-04 — Prova de paridade cliente/servidor da fórmula de score (Phase 10)
// =============================================================================
// Dois níveis de prova:
//   1) PURO (sempre roda): o módulo cliente `lib/opportunities/score.ts` bate
//      número-a-número com os casos canônicos travados em score-rule.test.ts.
//   2) SQL `skipIf` (roda contra o Supabase Cloud quando NEXT_PUBLIC_SUPABASE_URL
//      está setado): compara o calcScore do cliente, linha-a-linha, com a função
//      SQL real `opportunity_score()` (migration 0011) — prova viva, não só
//      replicação da tabela de pesos. Em modo unit-only, pula limpo (exit 0).
//
// O módulo é IMPORTADO (não copiado) — é exatamente o ponto da paridade.
// =============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { calcScore, priorityLevel } from '@/lib/opportunities/score';
import { serviceRoleClient } from '../setup/supabase-test-client';

// Conjunto representativo: [esforco, complexidade, tempo, objetivo, fte, esperado]
// Esforço é INVERTIDO (2026-08-14): esforço baixo é o que vale 20 (menos esforço,
// mais prioridade). Inclui a ARMADILHA (alto,baixo,diario,5,muito_alto)=88.
const CASES: Array<[string, string, string, number, string, number]> = [
  ['baixo', 'baixo', 'diario', 5, 'muito_alto', 100], // máximo
  ['alto', 'baixo', 'diario', 5, 'muito_alto', 88], // ARMADILHA (não 100)
  ['medio', 'medio', 'mensal', 3, 'medio', 59], // intermediário
  ['alto', 'alto', 'anual', 1, 'muito_baixo', 24], // mínimo (todos os fatores no piso)
  ['medio', 'medio', 'semanal', 3, 'medio', 67], // valores válidos somando 67 (14+13+16+12+12)
];

describe('SCORE-04 — paridade pura (calcScore cliente vs casos canônicos)', () => {
  it('caso máximo: (baixo,baixo,diario,5,muito_alto) === 100', () => {
    expect(calcScore({ esforco: 'baixo', complexidade: 'baixo', tempo: 'diario', objetivo: 5, fte: 'muito_alto' })).toBe(100);
  });

  it('ARMADILHA: (alto,baixo,diario,5,muito_alto) === 88 (NÃO 100)', () => {
    expect(calcScore({ esforco: 'alto', complexidade: 'baixo', tempo: 'diario', objetivo: 5, fte: 'muito_alto' })).toBe(88);
  });

  it('caso mínimo: (alto,alto,anual,1,muito_baixo) === 24', () => {
    expect(calcScore({ esforco: 'alto', complexidade: 'alto', tempo: 'anual', objetivo: 1, fte: 'muito_baixo' })).toBe(24);
  });

  it('caso intermediário: (medio,medio,mensal,3,medio) === 59', () => {
    expect(calcScore({ esforco: 'medio', complexidade: 'medio', tempo: 'mensal', objetivo: 3, fte: 'medio' })).toBe(59);
  });

  it('todos os fallbacks: calcScore({}) === 67 e inválidos === 67', () => {
    expect(calcScore({})).toBe(67);
    expect(calcScore({ esforco: 'xxx', complexidade: 'yyy', tempo: 'zzz', objetivo: 99, fte: 'www' })).toBe(67);
  });

  it('priority_level: 100→alta, 70→alta, 69→media, 40→media, 39→baixa, 36→baixa', () => {
    expect(priorityLevel(100)).toBe('alta');
    expect(priorityLevel(70)).toBe('alta');
    expect(priorityLevel(69)).toBe('media');
    expect(priorityLevel(40)).toBe('media');
    expect(priorityLevel(39)).toBe('baixa');
    expect(priorityLevel(36)).toBe('baixa');
  });
});

// -----------------------------------------------------------------------------
// Nível 2 — paridade VIVA contra opportunity_score() SQL (Supabase Cloud)
// -----------------------------------------------------------------------------
const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!HAS_DB)('SCORE-04 — paridade viva (calcScore vs opportunity_score() SQL)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;

  beforeAll(() => {
    sb = serviceRoleClient();
  });

  it.each(CASES)(
    'opportunity_score(%s,%s,%s,%i,%s) === %i === calcScore',
    async (esforco, complexidade, tempo, objetivo, fte, esperado) => {
      const client = calcScore({ esforco, complexidade, tempo, objetivo, fte });
      const { data: sqlScore, error } = await sb.rpc('opportunity_score', {
        p_esforco: esforco as never,
        p_complexidade: complexidade as never,
        p_tempo: tempo as never,
        p_objetivo: objetivo,
        p_fte: fte as never,
      });
      expect(error).toBeNull();
      // cliente === esperado === SQL (linha-a-linha)
      expect(client).toBe(esperado);
      expect(sqlScore).toBe(client);
    },
  );
});
