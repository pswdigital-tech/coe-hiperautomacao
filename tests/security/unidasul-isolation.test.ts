// =============================================================================
// Unidasul isolation (SC3) — tenant Acme NÃO enxerga as opps da Unidasul
// =============================================================================
// Cobre o Success Criterion SC3 da Phase 15 (seed do Workshop I) e o
// não-negociável docs/PROJETO.md §1 (isolamento multi-tenant é existencial):
//
//   Um usuário autenticado de OUTRO tenant (Acme) não pode ler nenhuma das
//   oportunidades da Unidasul — RLS USING filtra silenciosamente → data === [].
//
// Threat coberto: T-15-01 (Information Disclosure cross-tenant das 64 Unidasul).
//
// Estratégia (espelha tenant-isolation.test.ts):
//   • Bate em Supabase real via authedClient (JWT do usuário Acme) — RLS só é
//     exercitada com JWT, NUNCA com service-role.
//   • service-role é usado apenas em beforeAll/afterAll para semear/limpar a opp
//     de teste da Unidasul e para assertions de "registro continua existindo"
//     (sanity, evita falso-negativo).
//   • A opp da Unidasul é semeada INLINE (não acopla seed-test-tenants.ts):
//     upsert do tenant Unidasul (mesmo UUID/slug da migration 0013) + delete por
//     tenant_id + insert de UMA opp mínima válida. Não precisa criar admin user
//     de teste — o cross-tenant é exercido por asAcme (tenant ≠ Unidasul).
//
// Skip behavior: a suite TODA é pulada quando `NEXT_PUBLIC_SUPABASE_URL` está
// vazio (modo unit-only do globalSetup) — exit 0. Para rodar de fato, popular
// `.env.test` com credenciais do projeto Supabase Cloud DE TESTE (NUNCA produção),
// com as migrations 0001..0013 aplicadas. Padrão skipIf + lazy-init do Plan 02.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asAcme, asService } from '../helpers/auth-as';
import { seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Mesmo literal UUID do tenant Unidasul da migration 0013
// (supabase/migrations/0013_seed_unidasul_opportunities.sql). Manter em sincronia.
const UNIDASUL_TENANT_ID = '55551da5-0000-0000-0000-000000000001';

describe.skipIf(!HAS_DB)(
  'Unidasul isolation (SC3) — tenant Acme não vê opps da Unidasul',
  () => {
    type SbClient = ReturnType<typeof serviceRoleClient>;
    let sb: SbClient;
    let unidasulOppId: string;

    beforeAll(async () => {
      sb = serviceRoleClient();
      // Garante os tenants de teste (Acme inclusive) — idempotente.
      await seedTestTenants();

      // Garante o tenant Unidasul (mesmo UUID/slug da 0013). A migration de seed
      // pode não estar aplicada no DB de teste; este upsert torna o spec
      // auto-suficiente para exercitar o RLS de opportunities.
      const { error: tErr } = await sb.from('tenants').upsert(
        {
          id: UNIDASUL_TENANT_ID,
          slug: 'unidasul',
          name: 'Unidasul',
          status: 'active',
        },
        { onConflict: 'id' },
      );
      if (tErr) throw new Error(`upsert tenant Unidasul falhou: ${tErr.message}`);

      // Limpa baseline da opp de teste e cria UMA opp sob a Unidasul.
      // Campos mínimos válidos — o objetivo é provar RLS, não os 64.
      await sb.from('opportunities').delete().eq('tenant_id', UNIDASUL_TENANT_ID);

      const { data: opp, error: oErr } = await sb
        .from('opportunities')
        .insert({
          tenant_id: UNIDASUL_TENANT_ID,
          source: 'formulario',
          solicitante: 'Unidasul Seed User',
          area: 'Controladoria',
          processo: 'unidasul isolation probe',
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('id')
        .single();
      if (oErr || !opp) {
        throw new Error(`setup falhou (unidasul opp): ${oErr?.message}`);
      }
      unidasulOppId = opp.id;
    });

    afterAll(async () => {
      if (sb) {
        await sb
          .from('opportunities')
          .delete()
          .eq('tenant_id', UNIDASUL_TENANT_ID);
      }
    });

    it('SC3-a: tenant Acme NÃO faz SELECT na opp da Unidasul (RLS filtra → [])', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunities')
        .select('id')
        .eq('id', unidasulOppId);
      expect(error).toBeNull();
      // RLS USING filtra silenciosamente — 0 rows, não erro.
      expect(data).toEqual([]);
    });

    it('sanity (service-role): a opp da Unidasul EXISTE (não é falso-negativo)', async () => {
      const { data: still, error } = await asService()
        .from('opportunities')
        .select('id')
        .eq('id', unidasulOppId)
        .single();
      expect(error).toBeNull();
      expect(still?.id).toBe(unidasulOppId);
    });

    it('SC3-b: tenant Acme conta ZERO opps do tenant Unidasul', async () => {
      const { client } = await asAcme();
      const { count, error } = await client
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', UNIDASUL_TENANT_ID);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
  },
);
