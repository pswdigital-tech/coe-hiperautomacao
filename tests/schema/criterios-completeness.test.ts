// =============================================================================
// criterios-completeness — guarda de defesa em profundidade no opportunityInputSchema
// =============================================================================
// Espelha o CHECK `opportunities_criterios_chk` (0011): criterios é null/ausente
// OU traz as 8 chaves. Um `criterios` parcial deve ser recusado pelo Zod com
// fieldError limpo, ANTES do INSERT estourar a constraint do banco.
// Decisão de produto (2026-06-05): exigir os 8 critérios (sem parcial).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { opportunityInputSchema } from '@/lib/opportunities/schema';

const BASE = {
  source: 'formulario' as const,
  solicitante: 'Fulano',
  area: 'TI',
  processo: 'Conciliação bancária mensal',
};

const ALL8 = {
  causaReclamacoes: 'sim',
  totalmenteManual: 'sim',
  regrasClaras: 'sim',
  decisaoHumana: 'nao',
  padronizacaoDocs: 'sim',
  validacaoDados: 'sim',
  schedulable: 'sim',
  temDocumentacao: 'sim',
} as const;

describe('opportunityInputSchema — completude de criterios', () => {
  it('sem criterios (ausente) → válido (personas/legado)', () => {
    expect(opportunityInputSchema.safeParse(BASE).success).toBe(true);
  });

  it('criterios parcial → inválido (não vaza pro CHECK do banco)', () => {
    const r = opportunityInputSchema.safeParse({
      ...BASE,
      criterios: { causaReclamacoes: 'sim', regrasClaras: 'nao' },
    });
    expect(r.success).toBe(false);
  });

  it('criterios com as 8 chaves → válido', () => {
    const r = opportunityInputSchema.safeParse({ ...BASE, criterios: ALL8 });
    expect(r.success).toBe(true);
  });
});
