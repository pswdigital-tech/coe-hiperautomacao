// =============================================================================
// Mass Assignment defense — note-schema / document-schema (v0.3) — testes unit
// =============================================================================
// Cobre a 1ª linha de defesa das novas actions (note-actions.ts/
// document-actions.ts): campos server-derived (tenant_id/opportunity_id/id/
// created_by/created_at, e no caso de documento: kind/storage_path/size_bytes/
// tipo) precisam ser rejeitados pelo .strict() antes de chegar no insert.
// 100% unit — não bate em DB (mesmo padrão de risk-mass-assignment.test.ts).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { noteInputSchema } from '@/lib/opportunities/note-schema';
import { documentLinkInputSchema } from '@/lib/opportunities/document-schema';
import { criticidadeEnum, statusEnum } from '@/lib/opportunities/schema';

describe('Mass Assignment defense — noteInputSchema (v0.3)', () => {
  const VALID_NOTE = { texto: 'Aguardando aprovação do gestor da área.' };

  const forgedFields = ['id', 'tenant_id', 'opportunity_id', 'created_by', 'created_at'];
  for (const field of forgedFields) {
    it(`rejeita payload de anotação com '${field}' extra`, () => {
      const malicious = { ...VALID_NOTE, [field]: 'attacker-value' };
      expect(noteInputSchema.safeParse(malicious).success).toBe(false);
    });
  }

  it('rejeita texto vazio', () => {
    expect(noteInputSchema.safeParse({ texto: '' }).success).toBe(false);
  });

  it('rejeita texto acima de 4000 chars', () => {
    expect(noteInputSchema.safeParse({ texto: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('aceita payload mínimo válido', () => {
    expect(noteInputSchema.safeParse(VALID_NOTE).success).toBe(true);
  });
});

describe('Mass Assignment defense — documentLinkInputSchema (v0.3)', () => {
  const VALID_LINK = { nome: 'Manual técnico', url: 'https://example.com/manual.pdf' };

  const forgedFields = [
    'id',
    'tenant_id',
    'opportunity_id',
    'kind',
    'storage_path',
    'tipo',
    'size_bytes',
    'created_by',
    'created_at',
  ];
  for (const field of forgedFields) {
    it(`rejeita payload de link com '${field}' extra`, () => {
      const malicious = { ...VALID_LINK, [field]: 'attacker-value' };
      expect(documentLinkInputSchema.safeParse(malicious).success).toBe(false);
    });
  }

  it('rejeita URL sem protocolo http(s)', () => {
    expect(documentLinkInputSchema.safeParse({ nome: 'x', url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejeita URL vazia', () => {
    expect(documentLinkInputSchema.safeParse({ nome: 'x', url: '' }).success).toBe(false);
  });

  it('aceita payload mínimo válido (nome opcional)', () => {
    expect(documentLinkInputSchema.safeParse({ url: 'https://example.com' }).success).toBe(true);
  });
});

describe('statusEnum (v0.3) — 11 valores', () => {
  const expected = [
    'novo',
    'em_analise',
    'planejamento',
    'backlog',
    'desenvolvimento',
    'homologacao',
    'producao',
    'concluido',
    'gestao',
    'manutencao',
    'descontinuado',
  ];

  it('aceita exatamente os 11 status esperados', () => {
    for (const s of expected) {
      expect(statusEnum.safeParse(s).success, `status '${s}' deveria ser válido`).toBe(true);
    }
  });

  it('rejeita status fora do domínio', () => {
    expect(statusEnum.safeParse('arquivado').success).toBe(false);
  });
});

describe('criticidadeEnum (v0.3)', () => {
  it('aceita baixa/media/alta/critica', () => {
    for (const c of ['baixa', 'media', 'alta', 'critica']) {
      expect(criticidadeEnum.safeParse(c).success).toBe(true);
    }
  });

  it('rejeita Title-Case (domínio é minúsculo)', () => {
    expect(criticidadeEnum.safeParse('Alta').success).toBe(false);
  });
});
