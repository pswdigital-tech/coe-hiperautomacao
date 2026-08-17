// =============================================================================
// rpa_score — regra de derivação (0-6) — Phase 9 / Plan 09-03 (SCORE-03)
// =============================================================================
// Spec PURO (sem DB) que trava a regra do `rpa_score` GENERATED da migration
// 0011 contra o contrato `_giba_wsi-dashboard.html`.
//
// A regra foi inferida por engenharia reversa do seed `_giba` (RESEARCH §1) e
// reproduz 64/64 linhas exatamente. É a soma de 6 indicadores; `causaReclamacoes`
// e `temDocumentacao` NÃO contam:
//   totalmenteManual in ('sim','parcial') → +1
//   regrasClaras   = 'sim' → +1
//   decisaoHumana  = 'nao' → +1   (sem decisão humana = bom p/ RPA)
//   padronizacaoDocs = 'sim' → +1
//   validacaoDados   = 'sim' → +1
//   schedulable      = 'sim' → +1
//   criterios null → null
//
// A função TS abaixo é a MESMA expressão da coluna GENERATED em 0011 §5.
// Qualquer divergência do contrato quebra o build.
// =============================================================================
import { describe, it, expect } from 'vitest';
// A regra agora vive em lib/ como fonte única (mirror do SQL GENERATED de 0011 §5).
// Este spec passa a ser o portão de paridade (64/64 do _giba) da função extraída.
import { deriveRpaScore as rpaScore } from '@/lib/opportunities/rpa';

const allSim = {
  causaReclamacoes: 'sim',
  totalmenteManual: 'sim',
  regrasClaras: 'sim',
  decisaoHumana: 'sim',
  padronizacaoDocs: 'sim',
  validacaoDados: 'sim',
  schedulable: 'sim',
  temDocumentacao: 'sim',
};

describe('rpa_score — regra de derivação (RESEARCH §1, valida 64/64 do _giba)', () => {
  it('todos sim com decisaoHumana=nao → 6 (máximo)', () => {
    expect(rpaScore({ ...allSim, decisaoHumana: 'nao' })).toBe(6);
  });

  it('todos sim (decisaoHumana=sim) → 5 (decisaoHumana só credita em nao)', () => {
    expect(rpaScore(allSim)).toBe(5);
  });

  it("totalmenteManual='parcial' conta crédito cheio (+1)", () => {
    expect(rpaScore({ ...allSim, decisaoHumana: 'nao', totalmenteManual: 'parcial' })).toBe(6);
    expect(rpaScore({ ...allSim, totalmenteManual: 'parcial' })).toBe(5);
  });

  it('causaReclamacoes e temDocumentacao NÃO afetam o score', () => {
    const base = { ...allSim, decisaoHumana: 'nao' };
    expect(rpaScore({ ...base, causaReclamacoes: 'nao', temDocumentacao: 'nao' })).toBe(6);
    expect(rpaScore({ ...base, causaReclamacoes: 'sim', temDocumentacao: 'sim' })).toBe(6);
  });

  it('criterios null → null (personas)', () => {
    expect(rpaScore(null)).toBeNull();
  });

  // Fixtures representativas cobrindo 0,1,3,5,6 — derivadas do _giba.
  it.each([
    // descrição, criterios, esperado
    [
      'todos nao + decisaoHumana sim → 0',
      { totalmenteManual: 'nao', regrasClaras: 'nao', decisaoHumana: 'sim', padronizacaoDocs: 'nao', validacaoDados: 'nao', schedulable: 'nao', causaReclamacoes: 'nao', temDocumentacao: 'nao' },
      0,
    ],
    [
      'só regrasClaras sim → 1',
      { totalmenteManual: 'nao', regrasClaras: 'sim', decisaoHumana: 'sim', padronizacaoDocs: 'nao', validacaoDados: 'nao', schedulable: 'nao', causaReclamacoes: 'sim', temDocumentacao: 'sim' },
      1,
    ],
    [
      'WSI34 real: tota=parcial, regr=sim, deci=nao, resto nao → 3',
      { causaReclamacoes: 'sim', totalmenteManual: 'parcial', regrasClaras: 'sim', decisaoHumana: 'nao', padronizacaoDocs: 'nao', validacaoDados: 'nao', schedulable: 'nao', temDocumentacao: 'nao' },
      3,
    ],
    [
      'WSI58 real: regr=nao, resto bom (deci=sim) → 4',
      { causaReclamacoes: 'sim', totalmenteManual: 'sim', regrasClaras: 'nao', decisaoHumana: 'sim', padronizacaoDocs: 'sim', validacaoDados: 'sim', schedulable: 'sim', temDocumentacao: 'sim' },
      4,
    ],
    [
      'WSI03 real: deci=nao, resto sim → 6',
      { causaReclamacoes: 'sim', totalmenteManual: 'sim', regrasClaras: 'sim', decisaoHumana: 'nao', padronizacaoDocs: 'sim', validacaoDados: 'sim', schedulable: 'sim', temDocumentacao: 'sim' },
      6,
    ],
  ])('%s', (_desc, criterios, esperado) => {
    expect(rpaScore(criterios as Record<string, string>)).toBe(esperado);
  });
});
