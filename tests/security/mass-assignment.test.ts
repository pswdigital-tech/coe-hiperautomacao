// =============================================================================
// Mass Assignment defense (Bloco B do hardening) — testes unit
// =============================================================================
// Cobre os requisitos HARD-B-01..04 do 07.5-VALIDATION.md:
//
//  HARD-B-01: .strict() rejeita campos server-derived (tenant_id, created_by,
//             seq_id, id, created_at, updated_at) com `unrecognized_keys`.
//  HARD-B-02: `processo` > 2000 chars rejeitado.
//  HARD-B-03: arrays `escopo_automacao` / `beneficios_esperados` > 20 itens
//             rejeitados.
//  HARD-B-04: item de array > 200 chars rejeitado.
//
// + variant safety (formulario_extras só em source=formulario; vice-versa).
//
// Teste 100% unit — não bate em DB. Importa apenas o schema Zod.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { opportunityInputSchema } from '@/lib/opportunities/schema';

// Payload mínimo válido — base para mutar e testar rejeições.
// Espelha o shape exigido pelo `baseSchema` + variant `source: 'persona'`.
const VALID_PERSONA = {
  source: 'persona' as const,
  solicitante: 'Alice Tester',
  email: '',
  area: 'TI',
  subarea: '',
  processo: 'Automatizar X',
  frequencia: '',
  volume_medio: '',
  tempo_execucao: '',
  num_pessoas: '',
  ferramenta: null,
  escopo_automacao: [] as string[],
  beneficios_esperados: [] as string[],
  esforco: 'medio' as const,
  complexidade: 'medio' as const,
  tempo: 'mensal' as const,
  objetivo: 3,
  status: 'novo' as const,
  responsavel: '',
  notas: '',
};

describe('Mass Assignment defense (Bloco B)', () => {
  describe('HARD-B-01: .strict() rejeita campos server-derived', () => {
    const forgedFields = [
      'tenant_id',
      'created_by',
      'seq_id',
      'id',
      'created_at',
      'updated_at',
    ];

    for (const field of forgedFields) {
      it(`rejeita payload com '${field}' extra`, () => {
        const malicious = { ...VALID_PERSONA, [field]: 'attacker-value' };
        const r = opportunityInputSchema.safeParse(malicious);
        expect(r.success).toBe(false);
        if (!r.success) {
          const hasUnrecognized = r.error.issues.some(
            (i) =>
              i.code === 'unrecognized_keys' &&
              Array.isArray((i as { keys?: string[] }).keys) &&
              (i as { keys: string[] }).keys.includes(field),
          );
          expect(hasUnrecognized).toBe(true);
        }
      });
    }

    it('rejeita múltiplos campos forjados de uma vez', () => {
      const malicious = {
        ...VALID_PERSONA,
        tenant_id: 'a',
        created_by: 'b',
        seq_id: 999,
        id: 'c',
      };
      const r = opportunityInputSchema.safeParse(malicious);
      expect(r.success).toBe(false);
    });
  });

  describe('HARD-B-02: length limit em `processo`', () => {
    it('aceita processo com 2000 chars exatos', () => {
      const ok = { ...VALID_PERSONA, processo: 'x'.repeat(2000) };
      const r = opportunityInputSchema.safeParse(ok);
      expect(r.success).toBe(true);
    });

    it('rejeita processo com 2001 chars', () => {
      const bad = { ...VALID_PERSONA, processo: 'x'.repeat(2001) };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) => i.path.includes('processo')),
        ).toBe(true);
      }
    });
  });

  describe('HARD-B-03: array length limit (max 20 itens)', () => {
    it('aceita escopo_automacao com 20 itens', () => {
      const ok = { ...VALID_PERSONA, escopo_automacao: Array(20).fill('item') };
      const r = opportunityInputSchema.safeParse(ok);
      expect(r.success).toBe(true);
    });

    it('rejeita escopo_automacao com 21 itens', () => {
      const bad = { ...VALID_PERSONA, escopo_automacao: Array(21).fill('item') };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });

    it('rejeita beneficios_esperados com 100 itens (DoS protection)', () => {
      const bad = {
        ...VALID_PERSONA,
        beneficios_esperados: Array(100).fill('b'),
      };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });
  });

  describe('HARD-B-04: item de array > 200 chars rejeitado', () => {
    it('rejeita item de 201 chars em escopo_automacao', () => {
      const bad = { ...VALID_PERSONA, escopo_automacao: ['x'.repeat(201)] };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });

    it('aceita item de 200 chars exatos', () => {
      const ok = { ...VALID_PERSONA, escopo_automacao: ['x'.repeat(200)] };
      const r = opportunityInputSchema.safeParse(ok);
      expect(r.success).toBe(true);
    });

    it('rejeita item de 201 chars em beneficios_esperados', () => {
      const bad = {
        ...VALID_PERSONA,
        beneficios_esperados: ['y'.repeat(201)],
      };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });
  });

  describe('Variant safety: discriminatedUnion + .strict()', () => {
    it('rejeita formulario_extras em payload source=persona', () => {
      const bad = {
        ...VALID_PERSONA,
        formulario_extras: { tipo_processo: 'x' },
      };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });

    it('rejeita persona_extras em payload source=formulario', () => {
      const bad = {
        ...VALID_PERSONA,
        source: 'formulario' as const,
        persona_extras: { cargo: 'x' },
      };
      const r = opportunityInputSchema.safeParse(bad);
      expect(r.success).toBe(false);
    });
  });

  describe('Sanity: payload limpo passa', () => {
    it('aceita o payload mínimo válido', () => {
      const r = opportunityInputSchema.safeParse(VALID_PERSONA);
      expect(r.success).toBe(true);
    });
  });
});
