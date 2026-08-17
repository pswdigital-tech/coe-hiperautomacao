// =============================================================================
// opportunity_score — fórmula de 5 fatores — Phase 9 / Plan 09-03 (SCORE-01)
// =============================================================================
// Spec PURO (sem DB) que trava a fórmula de score da migration 0011 contra
// `_giba_wsi-dashboard.html:483-490` (função `calcScore`). Replica os pesos E os
// fallbacks LITERALMENTE — qualquer divergência quebra o build.
//
// Este spec é também o SEED da paridade SCORE-04 (Phase 10 o reusa comparando o
// preview do cliente com a função SQL `opportunity_score()` do backend).
//
// Pesos (_giba:483-490):
//   ef={baixo:20,medio:14,alto:8}|14   ← INVERTIDO (2026-08-14): menos esforço pontua mais
//   cx={baixo:20,medio:13,alto:6}|13   ← INVERTIDO: menos complexo pontua mais
//   tm={diario:20,semanal:16,quinzenal:12,mensal:8,anual:2}|16
//   ob={1:4,2:8,3:12,4:16,5:20}|12     (objetivo*4)
//   ft={muito_baixo:4,baixo:8,medio:12,alto:16,muito_alto:20}|12
//   score = soma (0–100)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  calcPriorityScore,
  beneficiosSubscore,
  criteriosSubscore,
} from '@/lib/opportunities/score';

export interface Prioridade {
  esforco?: string;
  complexidade?: string;
  tempo?: string;
  objetivo?: number;
  fte?: string;
}

/** Replica LITERAL de calcScore (_giba:483-490), com os mesmos fallbacks. */
export function calcScore(p: Prioridade): number {
  const ef: Record<string, number> = { baixo: 20, medio: 14, alto: 8 };
  const cx: Record<string, number> = { baixo: 20, medio: 13, alto: 6 };
  const tm: Record<string, number> = { diario: 20, semanal: 16, quinzenal: 12, mensal: 8, anual: 2 };
  const ob: Record<number, number> = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 };
  const ft: Record<string, number> = { muito_baixo: 4, baixo: 8, medio: 12, alto: 16, muito_alto: 20 };
  return (
    (ef[p.esforco as string] ?? 14) +
    (cx[p.complexidade as string] ?? 13) +
    (tm[p.tempo as string] ?? 16) +
    (ob[p.objetivo as number] ?? 12) +
    (ft[p.fte as string] ?? 12)
  );
}

/** priority_level conforme SCORE-02 (alta>=70 / media 40–69 / baixa<40). */
export function priorityLevel(score: number): 'alta' | 'media' | 'baixa' {
  return score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baixa';
}

describe('opportunity_score — fórmula 5 fatores (_giba:483-490)', () => {
  it('caso máximo: (baixo,baixo,diario,5,muito_alto) === 100 — esforço BAIXO é o que vale 20 (invertido 2026-08-14)', () => {
    // ef baixo=20 + cx baixo=20 + tm diario=20 + ob 5=20 + ft muito_alto=20 = 100
    expect(calcScore({ esforco: 'baixo', complexidade: 'baixo', tempo: 'diario', objetivo: 5, fte: 'muito_alto' })).toBe(100);
  });

  it('ATENÇÃO: (alto,baixo,diario,5,muito_alto) === 88, NÃO 100 (esforço alto vale só 8, menor pontuação)', () => {
    // ef alto=8 + cx baixo=20 + tm diario=20 + ob 5=20 + ft muito_alto=20 = 88
    expect(calcScore({ esforco: 'alto', complexidade: 'baixo', tempo: 'diario', objetivo: 5, fte: 'muito_alto' })).toBe(88);
  });

  it('caso mínimo: (alto,alto,anual,1,muito_baixo) === 24 — todos os fatores no piso', () => {
    // ef alto=8 + cx alto=6 + tm anual=2 + ob 1=4 + ft muito_baixo=4 = 24
    expect(calcScore({ esforco: 'alto', complexidade: 'alto', tempo: 'anual', objetivo: 1, fte: 'muito_baixo' })).toBe(24);
  });

  it('caso intermediário: (medio,medio,mensal,3,medio) === 59', () => {
    // 14 + 13 + 8 + 12 + 12 = 59
    expect(calcScore({ esforco: 'medio', complexidade: 'medio', tempo: 'mensal', objetivo: 3, fte: 'medio' })).toBe(59);
  });

  it('valores ausentes/inválidos exercitam TODOS os fallbacks (14+13+16+12+12 = 67)', () => {
    expect(calcScore({})).toBe(67);
    expect(calcScore({ esforco: 'xxx', complexidade: 'yyy', tempo: 'zzz', objetivo: 99, fte: 'www' })).toBe(67);
  });

  it('priority_level: 100→alta, 59→media, 36→baixa', () => {
    expect(priorityLevel(100)).toBe('alta');
    expect(priorityLevel(70)).toBe('alta');
    expect(priorityLevel(69)).toBe('media');
    expect(priorityLevel(59)).toBe('media');
    expect(priorityLevel(40)).toBe('media');
    expect(priorityLevel(39)).toBe('baixa');
    expect(priorityLevel(36)).toBe('baixa');
  });
});

// =============================================================================
// SCORE v0.4 — blend 50/30/20 (Fatores + Benefícios + Critérios)
// Trava a fórmula de calcPriorityScore e sub-scores (espelho de opportunity_score
// 0027; sub-scores arredondados ANTES do blend → paridade client ≡ SQL).
// =============================================================================
const CRIT_ALL_FAV = {
  causaReclamacoes: 'sim',
  totalmenteManual: 'sim',
  regrasClaras: 'sim',
  decisaoHumana: 'nao', // favorável = nao (invertido)
  padronizacaoDocs: 'sim',
  validacaoDados: 'sim',
  schedulable: 'sim',
  temDocumentacao: 'sim',
};
const BEN_ALL_5 = {
  reducaoTempo: 5,
  eliminacaoErros: 5,
  produtividade: 5,
  qualidadeDados: 5,
  reducaoCustos: 5,
  reducaoRetrabalho: 5,
  compliance: 5,
  objetivosEstrategicos: 5,
};

describe('score v0.4 — sub-scores', () => {
  it('beneficios: todos 5 → 100; ausentes → null; parcial arredonda', () => {
    expect(beneficiosSubscore(BEN_ALL_5)).toBe(100);
    expect(beneficiosSubscore(null)).toBeNull();
    expect(beneficiosSubscore({})).toBeNull();
    // sum=3, n=2 → 25*(3-2)/2 = 12.5 → round = 13 (half-up, igual round numeric)
    expect(beneficiosSubscore({ reducaoTempo: 1, produtividade: 2 })).toBe(13);
    // sum=8, n=2 → 25*6/2 = 75
    expect(beneficiosSubscore({ reducaoTempo: 5, produtividade: 3 })).toBe(75);
  });

  it('criterios: todos favoráveis → 100; null → null; todos parcial → 50', () => {
    expect(criteriosSubscore(CRIT_ALL_FAV)).toBe(100);
    expect(criteriosSubscore(null)).toBeNull();
    const allParcial = Object.fromEntries(
      Object.keys(CRIT_ALL_FAV).map((k) => [k, 'parcial']),
    );
    expect(criteriosSubscore(allParcial)).toBe(50); // 8*0.5=4 → 12.5*4=50
    // decisaoHumana invertido: 'sim' é desfavorável (0)
    expect(
      criteriosSubscore({ ...CRIT_ALL_FAV, decisaoHumana: 'sim' }),
    ).toBe(88); // sumFav = 7 → 12.5*7 = 87.5 → round = 88
  });
});

describe('score v0.4 — blend ponderado 50/30/20', () => {
  const MAX_FAT = { esforco: 'baixo', complexidade: 'baixo', tempo: 'diario', objetivo: 5, fte: 'muito_alto' }; // 100

  it('todos os blocos no máximo → 100', () => {
    expect(
      calcPriorityScore({ prioridade: MAX_FAT, beneficios: BEN_ALL_5, criterios: CRIT_ALL_FAV }),
    ).toBe(100);
  });

  it('sem benefícios nem critérios → cai no score de Fatores', () => {
    // Fatores(medio,medio,mensal,3,medio)=59; den=5 → 59
    expect(
      calcPriorityScore({ prioridade: { esforco: 'medio', complexidade: 'medio', tempo: 'mensal', objetivo: 3, fte: 'medio' } }),
    ).toBe(59);
  });

  it('três blocos presentes: (59, 75, 50) → 62', () => {
    // num = 5*59 + 3*75 + 2*50 = 295+225+100 = 620; den = 10 → 62
    expect(
      calcPriorityScore({
        prioridade: { esforco: 'medio', complexidade: 'medio', tempo: 'mensal', objetivo: 3, fte: 'medio' },
        beneficios: { reducaoTempo: 5, produtividade: 3 }, // sBen=75
        criterios: {
          causaReclamacoes: 'sim', totalmenteManual: 'parcial', regrasClaras: 'sim',
          decisaoHumana: 'sim', padronizacaoDocs: 'nao', validacaoDados: 'sim',
          schedulable: 'parcial', temDocumentacao: 'nao',
        }, // sumFav = 1+0.5+1+0+0+1+0.5+0 = 4 → sCrit=50
      }),
    ).toBe(62);
  });

  it('só benefícios (critérios ausente) renormaliza o denominador', () => {
    // Fatores({})=67; sBen=100; den = 5+3 = 8 → (335+300)/8 = 79.375 → 79
    expect(
      calcPriorityScore({ prioridade: {}, beneficios: BEN_ALL_5 }),
    ).toBe(79);
  });
});
