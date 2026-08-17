// =============================================================================
// isPlatformAdmin() — predicado puro (v0.3-admin, 0020/0021)
// =============================================================================
// Roda sempre, sem depender de .env.test — a contraparte com banco real
// (platform-admin-cross-tenant.test.ts) prova que a RLS aditiva concorda com
// este predicado; aqui só travamos a lógica de decisão em si.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { isPlatformAdmin } from '@/lib/security/role';

describe('isPlatformAdmin', () => {
  it('true quando role = platform_admin', () => {
    expect(isPlatformAdmin({ role: 'platform_admin' })).toBe(true);
  });

  it.each(['member', 'tenant_admin', 'viewer'] as const)(
    'false quando role = %s',
    (role) => {
      expect(isPlatformAdmin({ role })).toBe(false);
    },
  );

  it('false quando profile é null (sem sessão)', () => {
    expect(isPlatformAdmin(null)).toBe(false);
  });
});
