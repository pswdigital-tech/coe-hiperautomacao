// =============================================================================
// validation-errors.test.ts — describeValidationError() (lib/opportunities/
// validation-errors.ts) troca o "Dados inválidos." genérico por uma mensagem
// que nomeia o campo (via fieldLabel(), lib/audit/labels.ts) e o motivo.
// Reproduz o caso real (2026-08-14): colar ~1600 caracteres num item do
// Escopo do Projeto (escopo_automacao, limite 200/item) devolvia só "Dados
// inválidos.", sem dizer qual campo nem por quê.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { describeValidationError } from '@/lib/opportunities/validation-errors';
import { opportunityInputSchema } from '@/lib/opportunities/schema';

describe('describeValidationError', () => {
  it('nomeia o campo e a mensagem quando há exatamente 1 erro', () => {
    const msg = describeValidationError({
      formErrors: [],
      fieldErrors: { escopo_automacao: ['Item excede 200 caracteres'] },
    });
    expect(msg).toBe('Escopo da automação: Item excede 200 caracteres');
  });

  it('sinaliza quantos OUTROS campos também têm erro', () => {
    const msg = describeValidationError({
      formErrors: [],
      fieldErrors: {
        escopo_automacao: ['Item excede 200 caracteres'],
        area: ['Área obrigatória'],
      },
    });
    expect(msg).toBe(
      'Escopo da automação: Item excede 200 caracteres (+1 outro campo com erro)'
    );
  });

  it('prioriza formErrors (erro de .refine/.superRefine no nível do objeto)', () => {
    const msg = describeValidationError({
      formErrors: ['Responda todos os 8 critérios de RPA Fit antes de salvar.'],
      fieldErrors: { area: ['Área obrigatória'] },
    });
    expect(msg).toBe('Responda todos os 8 critérios de RPA Fit antes de salvar.');
  });

  it('cai no fallback genérico quando não há nenhum erro (não deveria acontecer, mas não quebra)', () => {
    expect(describeValidationError({ formErrors: [], fieldErrors: {} })).toBe(
      'Dados inválidos.'
    );
  });

  it('usa humanize() como fallback para uma chave sem rótulo mapeado', () => {
    const msg = describeValidationError({
      formErrors: [],
      fieldErrors: { campo_novo_sem_label: ['Erro qualquer'] },
    });
    expect(msg).toBe('Campo novo sem label: Erro qualquer');
  });

  it('reproduz o caso real: item de escopo_automacao acima de 200 chars via o schema de verdade', () => {
    const longText = 'x'.repeat(1600);
    const parsed = opportunityInputSchema.safeParse({
      source: 'formulario',
      solicitante: 'Fulano de Tal',
      area: 'TI',
      processo: 'Processo de teste',
      escopo_automacao: [longText],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = describeValidationError(parsed.error.flatten());
      expect(msg).toBe('Escopo da automação: Item excede 200 caracteres');
    }
  });
});
