// =============================================================================
// Mass Assignment defense — risk-actions (Phase 12, RISK-01/03) — testes unit
// =============================================================================
// Cobre a camada de validação que `lib/opportunities/risk-actions.ts` usa
// (`riskInputSchema.strict()`) antes de qualquer escrita em `opportunity_risks`:
//
//  T-12-01: opportunity_id/tenant_id/id no payload são rejeitados (server-derived).
//  T-12-02: `priority` no payload é rejeitado (.strict()); trigger é a autoridade.
//  + sanity: payload limpo passa; status default 'novo'.
//
// Teste 100% unit — não bate em DB (as actions create/update/delete exigem
// auth + Supabase real → integração skipIf, fora deste arquivo). Importa apenas
// o schema Zod, que é a 1ª linha de defesa mass-assignment das actions.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { riskInputSchema } from '@/lib/opportunities/risk-schema';

// Payload mínimo válido de risco — base para mutar e testar rejeições.
const VALID_RISK = {
  descricao: 'Dependência externa pode atrasar o go-live',
  tipo: 'risco' as const,
  responsavel: 'PSW',
  impacto: 'alto' as const,
  probabilidade: 'possivel' as const,
  status: 'novo' as const,
  resposta: 'Acompanhar fornecedor semanalmente',
  descricao_impacto: 'Atraso de cronograma',
};

describe('Mass Assignment defense — risk-actions (Phase 12)', () => {
  describe('T-12-01/02: .strict() rejeita campos server-derived/trigger-set', () => {
    const forgedFields = [
      'priority', // T-12-02 — trigger set_risk_priority() é a autoridade
      'tenant_id',
      'opportunity_id',
      'id',
      'created_by',
      'created_at',
      'updated_at',
    ];

    for (const field of forgedFields) {
      it(`rejeita payload de risco com '${field}' extra`, () => {
        const malicious = { ...VALID_RISK, [field]: 'attacker-value' };
        const r = riskInputSchema.safeParse(malicious);
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

    it('rejeita priority + tenant_id forjados de uma vez', () => {
      const malicious = {
        ...VALID_RISK,
        priority: 'critica',
        tenant_id: 'attacker',
      };
      const r = riskInputSchema.safeParse(malicious);
      expect(r.success).toBe(false);
    });
  });

  describe('Length limits (DoS protection)', () => {
    it('rejeita descricao com 2001 chars', () => {
      const bad = { ...VALID_RISK, descricao: 'x'.repeat(2001) };
      expect(riskInputSchema.safeParse(bad).success).toBe(false);
    });

    it('aceita descricao com 2000 chars exatos', () => {
      const ok = { ...VALID_RISK, descricao: 'x'.repeat(2000) };
      expect(riskInputSchema.safeParse(ok).success).toBe(true);
    });

    it('rejeita descricao vazia (obrigatória)', () => {
      const bad = { ...VALID_RISK, descricao: '' };
      expect(riskInputSchema.safeParse(bad).success).toBe(false);
    });
  });

  describe('Enums minúsculos (D-07)', () => {
    it('rejeita tipo Title-Case', () => {
      const bad = { ...VALID_RISK, tipo: 'Risco' };
      expect(riskInputSchema.safeParse(bad).success).toBe(false);
    });

    it('rejeita impacto inválido', () => {
      const bad = { ...VALID_RISK, impacto: 'critico' };
      expect(riskInputSchema.safeParse(bad).success).toBe(false);
    });
  });

  describe('Sanity: payload limpo passa', () => {
    it('aceita o payload mínimo válido', () => {
      const r = riskInputSchema.safeParse(VALID_RISK);
      expect(r.success).toBe(true);
    });

    it('aplica status default "novo" quando omitido', () => {
      const { status: _omit, ...withoutStatus } = VALID_RISK;
      const r = riskInputSchema.safeParse(withoutStatus);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.status).toBe('novo');
    });
  });
});
