// =============================================================================
// resolveWriteTenantId / writesCrossTenant — escopo de escrita por oportunidade
// =============================================================================
// POR QUE ESTA SUÍTE EXISTE: `resolveWriteTenantId()` é o ponto único de onde
// sai o `tenant_id` de TODA escrita ligada a uma oportunidade (nota, risco,
// documento, tarefa, fase e o `.eq()` defensivo de `updateOpportunity`) e não
// tinha nenhum teste — a lacuna do `platform_admin` (2026-08-13) passou por
// ali sem nada quebrar. Os dois sintomas que ela produzia:
//
//   • tabelas filhas: a linha nascia com o tenant da PSW e o trigger
//     `check_child_tenant_coherence()` (0043) devolvia erro cru do banco na
//     cara do usuário;
//   • `updateOpportunity`: o mesmo valor vira `.eq('tenant_id', …)`, casa ZERO
//     LINHAS, o Supabase devolve `error: null` e a UI diz "salvo" sem ter
//     salvo — o sucesso silencioso que a Phase 17 existiu para matar.
//
// Diferente de `resolve-admin-tenant.test.ts`, esta suíte NÃO precisa de
// `.env.test`: o ramo que consulta o banco lê uma única linha de
// `opportunities`, então um stub de client cobre o contrato inteiro (quem
// prova a RLS de verdade são as suítes `*-isolation.test.ts`). O que se afirma
// aqui é a REGRA DE ROTEAMENTO — de qual fonte sai o tenant para cada papel —
// e ela é 100% código nosso.
// =============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Última oportunidade "lida" pelo stub e o tenant que ela devolve. `null`
// simula oportunidade inexistente OU invisível pela RLS — os dois casos
// colapsam no mesmo retorno, de propósito.
const state = vi.hoisted(() => ({
  tenantIdDaOportunidade: null as string | null,
  selectCount: 0,
  lastOpportunityId: null as string | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table !== 'opportunities') throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => {
          state.selectCount += 1;
          return {
            eq: (_col: string, value: string) => {
              state.lastOpportunityId = value;
              return {
                maybeSingle: async () => ({
                  data: state.tenantIdDaOportunidade
                    ? { tenant_id: state.tenantIdDaOportunidade }
                    : null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  }),
}));

import {
  resolveWriteTenantId,
  writesCrossTenant,
  type CurrentProfile,
} from '@/lib/security/role';

const TENANT_PSW = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_CLIENTE = '11111111-1111-1111-1111-111111111111';
const OPP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function profileFixture(role: CurrentProfile['role'], tenantId: string): CurrentProfile {
  return {
    id: 'fixture-profile-id',
    email: 'fixture@test.local',
    fullName: null,
    role,
    tenantId,
    tenantName: null,
    tenantSlug: null,
  };
}

beforeEach(() => {
  state.tenantIdDaOportunidade = null;
  state.selectCount = 0;
  state.lastOpportunityId = null;
});

describe('writesCrossTenant', () => {
  it.each(['psw_staff', 'platform_admin'] as const)(
    'role=%s → true (tenant de lotação é o da PSW, nunca o do dado escrito)',
    (role) => {
      expect(writesCrossTenant(profileFixture(role, TENANT_PSW))).toBe(true);
    }
  );

  it.each(['member', 'viewer', 'tenant_admin'] as const)(
    'role=%s → false (papel de cliente: o tenant dele É o tenant do dado)',
    (role) => {
      expect(writesCrossTenant(profileFixture(role, TENANT_CLIENTE))).toBe(false);
    }
  );

  it('profile nulo → false', () => {
    expect(writesCrossTenant(null)).toBe(false);
  });
});

describe('resolveWriteTenantId — papéis de cliente (ramo SEM ida ao banco)', () => {
  it.each(['member', 'viewer', 'tenant_admin'] as const)(
    'role=%s devolve profile.tenantId sem consultar o banco (D-J, zero regressão)',
    async (role) => {
      const profile = profileFixture(role, TENANT_CLIENTE);
      expect(await resolveWriteTenantId(profile, OPP_ID)).toBe(TENANT_CLIENTE);
      expect(state.selectCount).toBe(0);
    }
  );
});

describe('resolveWriteTenantId — papéis da PSW (ramo que lê a oportunidade)', () => {
  it.each(['psw_staff', 'platform_admin'] as const)(
    'role=%s devolve o tenant da OPORTUNIDADE, não o do profile',
    async (role) => {
      state.tenantIdDaOportunidade = TENANT_CLIENTE;
      const profile = profileFixture(role, TENANT_PSW);

      const resolved = await resolveWriteTenantId(profile, OPP_ID);

      expect(resolved).toBe(TENANT_CLIENTE);
      expect(resolved).not.toBe(profile.tenantId);
      expect(state.selectCount).toBe(1);
      expect(state.lastOpportunityId).toBe(OPP_ID);
    }
  );

  it.each(['psw_staff', 'platform_admin'] as const)(
    'role=%s com oportunidade inexistente/fora de escopo → null (o call site recusa ANTES de mutar)',
    async (role) => {
      state.tenantIdDaOportunidade = null;
      expect(await resolveWriteTenantId(profileFixture(role, TENANT_PSW), OPP_ID)).toBeNull();
    }
  );
});
