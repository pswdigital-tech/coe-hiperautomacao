// =============================================================================
// events/schema — validação do formulário de evento (0066)
// =============================================================================
// Spec PURO (sem DB). Espelha os CHECKs da tabela e a regra `.strict()`:
// `tenant_id`/`is_default`/`status` nunca entram pelo formulário.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { eventInputSchema } from '@/lib/events/schema';

const valid = {
  name: 'Workshop Financeiro',
  slug: '',
  description: '',
  starts_at: '2026-09-15',
  ends_at: '',
};

describe('eventInputSchema', () => {
  it('aceita o mínimo: nome + data inicial', () => {
    const r = eventInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('recusa nome curto e longo (CHECK events_name_len)', () => {
    expect(eventInputSchema.safeParse({ ...valid, name: 'a' }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('recusa slug fora do formato do CHECK, aceita vazio (derivado do nome)', () => {
    expect(eventInputSchema.safeParse({ ...valid, slug: 'Com Espaço' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, slug: 'ok-2026' }).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...valid, slug: '' }).success).toBe(true);
  });

  it('recusa data final anterior à inicial (CHECK events_ends_after_starts)', () => {
    const r = eventInputSchema.safeParse({ ...valid, ends_at: '2026-09-01' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.ends_at?.[0]).toMatch(/anterior/);
    }
    expect(
      eventInputSchema.safeParse({ ...valid, ends_at: '2026-09-15' }).success,
    ).toBe(true);
  });

  it('recusa data inválida', () => {
    expect(eventInputSchema.safeParse({ ...valid, starts_at: '2026-13-40' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, starts_at: '15/09/2026' }).success).toBe(false);
  });

  it('é strict: tenant_id, is_default e status não entram pelo formulário', () => {
    expect(
      eventInputSchema.safeParse({ ...valid, tenant_id: 'x' }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...valid, is_default: true }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...valid, status: 'closed' }).success,
    ).toBe(false);
  });
});
