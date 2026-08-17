// =============================================================================
// staff-access-origins.test.ts — testes de unidade da lógica pura de
// lib/staff-admin/origins.ts (Phase 18, Plan 04, GRANT-07/08/09)
// -----------------------------------------------------------------------------
// Sem banco, sem browser — mesmo precedente de tests/opportunities/kpis.test.ts.
// Escrito ANTES da implementação (RED); só depois lib/staff-admin/origins.ts é
// criado (GREEN).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildStaffAccessOrigins,
  countOpportunitiesLostOnRevoke,
  formatRevokeImpact,
  isOrphanGrant,
  type StaffTenantGrant,
  type StaffAssignmentInput,
} from '@/lib/staff-admin/origins';

const grantFGCoop: StaffTenantGrant = {
  id: 'grant-1',
  tenantId: 'tenant-fgcoop',
  tenantName: 'FGCoop',
  tenantSlug: 'fgcoop',
  grantedAt: '2026-08-01T00:00:00Z',
};

const grantAcme: StaffTenantGrant = {
  id: 'grant-2',
  tenantId: 'tenant-acme',
  tenantName: 'Acme',
  tenantSlug: 'acme',
  grantedAt: '2026-08-02T00:00:00Z',
};

const assignmentInFGCoop: StaffAssignmentInput = {
  opportunityId: 'opp-1',
  tenantId: 'tenant-fgcoop',
  label: 'Oportunidade #042',
};

const assignmentInOutroTenant: StaffAssignmentInput = {
  opportunityId: 'opp-2',
  tenantId: 'tenant-outro',
  label: 'Oportunidade #099',
};

describe('buildStaffAccessOrigins — as duas origens separadas (D-F)', () => {
  it('pessoa sem concessão e sem atribuição devolve os dois blocos vazios (nunca undefined)', () => {
    const result = buildStaffAccessOrigins([], []);
    expect(result.grants).toEqual([]);
    expect(result.assignments).toEqual([]);
    expect(result.redundantCount).toBe(0);
  });

  it('pessoa só com concessão devolve o primeiro bloco preenchido e o segundo vazio', () => {
    const result = buildStaffAccessOrigins([grantFGCoop], []);
    expect(result.grants).toEqual([grantFGCoop]);
    expect(result.assignments).toEqual([]);
    expect(result.redundantCount).toBe(0);
  });

  it('pessoa só com atribuição devolve o primeiro bloco vazio e o segundo preenchido', () => {
    const result = buildStaffAccessOrigins([], [assignmentInOutroTenant]);
    expect(result.grants).toEqual([]);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].redundant).toBe(false);
    expect(result.redundantCount).toBe(0);
  });

  it('marca como redundante a atribuição cujo tenant já está entre os concedidos', () => {
    const result = buildStaffAccessOrigins(
      [grantFGCoop],
      [assignmentInFGCoop, assignmentInOutroTenant]
    );
    expect(result.assignments).toHaveLength(2);
    const fg = result.assignments.find((a) => a.opportunityId === 'opp-1');
    const outro = result.assignments.find((a) => a.opportunityId === 'opp-2');
    expect(fg?.redundant).toBe(true);
    expect(outro?.redundant).toBe(false);
    expect(result.redundantCount).toBe(1);
  });

  it('sem nenhuma atribuição redundante, redundantCount é zero (consumidor sabe omitir o parêntese)', () => {
    const result = buildStaffAccessOrigins([grantAcme], [assignmentInOutroTenant]);
    expect(result.redundantCount).toBe(0);
  });

  it('nunca soma concessões com atribuições num número agregado', () => {
    const result = buildStaffAccessOrigins([grantFGCoop, grantAcme], [assignmentInFGCoop]);
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('totalAccess');
    expect(result.grants).toHaveLength(2);
    expect(result.assignments).toHaveLength(1);
  });
});

describe('countOpportunitiesLostOnRevoke — impacto da revogação (D-G)', () => {
  it('zero quando o tenant não tem oportunidade nenhuma visível', () => {
    expect(countOpportunitiesLostOnRevoke([], [])).toBe(0);
    expect(countOpportunitiesLostOnRevoke([], ['opp-1'])).toBe(0);
  });

  it('zero quando todas as oportunidades visíveis já são atribuídas nominalmente', () => {
    expect(countOpportunitiesLostOnRevoke(['opp-1', 'opp-2'], ['opp-1', 'opp-2'])).toBe(2 - 2);
    expect(countOpportunitiesLostOnRevoke(['opp-1', 'opp-2'], ['opp-1', 'opp-2'])).toBe(0);
  });

  it('é diferença de CONJUNTOS, não subtração de contagens — id duplicado não infla o resultado', () => {
    // 3 ids visíveis (com repetição), 1 atribuído -> perde os 2 distintos restantes, nunca 3-1=2 por acaso certo mas por contagem errada
    const visible = ['opp-1', 'opp-1', 'opp-2', 'opp-3'];
    const assigned = ['opp-1'];
    expect(countOpportunitiesLostOnRevoke(visible, assigned)).toBe(2);
  });

  it('conta a diferença exata quando parte é atribuída e parte não', () => {
    expect(countOpportunitiesLostOnRevoke(['opp-1', 'opp-2', 'opp-3'], ['opp-1'])).toBe(2);
  });
});

describe('formatRevokeImpact — concordância singular/plural/zero (D-G)', () => {
  it('zero: usa "nenhuma oportunidade" e verbo no singular', () => {
    const text = formatRevokeImpact('Bruno Lima', 'FGCoop', 0);
    expect(text).toContain('nenhuma oportunidade');
    expect(text).toContain('não está atribuída a ela diretamente');
    expect(text).not.toMatch(/\b0\s+oportunidade/);
  });

  it('singular: "1 oportunidade" com verbo no singular', () => {
    const text = formatRevokeImpact('Bruno Lima', 'FGCoop', 1);
    expect(text).toContain('1 oportunidade');
    expect(text).not.toContain('1 oportunidades');
    expect(text).toContain('não está atribuída a ela diretamente');
  });

  it('plural: "N oportunidades" com verbo no plural', () => {
    const text = formatRevokeImpact('Bruno Lima', 'FGCoop', 5);
    expect(text).toContain('5 oportunidades');
    expect(text).toContain('não estão atribuídas a ela diretamente');
  });

  it('sempre menciona a empresa e que atribuições individuais continuam valendo', () => {
    const text = formatRevokeImpact('Bruno Lima', 'FGCoop', 3);
    expect(text).toContain('FGCoop');
    expect(text).toContain('Atribuições individuais continuam valendo.');
  });
});

describe('isOrphanGrant — concessão órfã (D-S)', () => {
  it('devolve true quando o papel atual da pessoa não é mais psw_staff', () => {
    expect(isOrphanGrant('member')).toBe(true);
    expect(isOrphanGrant('tenant_admin')).toBe(true);
    expect(isOrphanGrant(null)).toBe(true);
  });

  it('devolve false quando o papel atual ainda é psw_staff', () => {
    expect(isOrphanGrant('psw_staff')).toBe(false);
  });
});
