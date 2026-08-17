// =============================================================================
// Tenant isolation (Bloco A do hardening) — testes RLS + IDOR cross-tenant
// =============================================================================
// Cobre os requisitos HARDEN-A-01..05 do 07.5-VALIDATION.md:
//
//  HARDEN-A-01: tenant A logado NÃO faz SELECT em registro de tenant B
//               (RLS USING filtra silenciosamente → data === []).
//  HARDEN-A-02: tenant A logado NÃO faz UPDATE em registro de tenant B
//               (0 rows affected, RLS USING filtra; dado original intacto).
//  HARDEN-A-03: tenant A logado NÃO faz DELETE em registro de tenant B
//               (0 rows affected; registro persiste verificado via service role).
//  HARDEN-A-04: tenant A logado NÃO faz INSERT com tenant_id de B
//               (RLS WITH CHECK rejeita → error não-nulo).
//  HARDEN-A-05: mesma cobertura para opportunity_phases e profiles
//               (profiles é select-only — RLS scope-down por tenant).
//
// Extra: spec de integração com Plan 03 (Bloco B) — opportunityInputSchema
// `.strict()` rejeita payload com tenant_id forjado, confirmando defesa em
// profundidade na camada de Zod ANTES do RLS na camada de DB.
//
// Estratégia: bate em Supabase real via authedClient (JWT do usuário) — RLS
// só é exercitada com JWT, NUNCA com service-role. service-role é usado
// apenas em beforeAll/afterAll para setup/teardown e assertions de "registro
// continua existindo" pós-tentativa de DELETE/UPDATE.
//
// Skip behavior: a suite TODA é pulada quando `NEXT_PUBLIC_SUPABASE_URL` está
// vazio (modo unit-only do globalSetup). Para rodar, popular `.env.test` com
// credenciais do projeto Supabase Cloud DE TESTE — NUNCA produção. A defesa
// do globalSetup já aborta se a URL apontar para fora de localhost /
// *-test.supabase.co.
//
// Pré-requisito: schema base (0001_init.sql) com RLS habilitada nas 3 tabelas
// e seed dos dois tenants (FGCOOP_TEST_ID, ACME_TEST_ID) via seedTestTenants.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asAcme, asService } from '../helpers/auth-as';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  seedTestTenants,
} from '../setup/seed-test-tenants';
import { opportunityInputSchema } from '@/lib/opportunities/schema';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// `describe.skipIf` (Vitest 0.34+) pula os `it` blocks da suite quando o
// predicado é true. O corpo do describe AINDA executa (Vitest precisa
// registrar os testes para reportar como skipped), então toda inicialização
// que dependa de env DEVE acontecer dentro de `beforeAll` (lazy). Manter
// `serviceRoleClient()` no top-level do describe quebraria com
// "NEXT_PUBLIC_SUPABASE_URL ausente" mesmo no modo skip. Padrão estabelecido
// em Plan 02 (atomicity.test.ts).
describe.skipIf(!HAS_DB)('Tenant isolation (Bloco A) — RLS + IDOR', () => {
  type SbClient = ReturnType<typeof serviceRoleClient>;
  let sb: SbClient;

  // IDs de registros conhecidos — populados no beforeAll, consumidos por
  // todos os specs. Manter `let` (não const) para que a atribuição em
  // beforeAll funcione e a inferência seja preservada.
  let fgcoopOppId: string;
  let acmeOppId: string;
  let fgcoopPhaseId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    // Defensivo — globalSetup já roda, mas idempotente.
    await seedTestTenants();

    // Limpa baseline de oportunidades nos dois tenants. Cascade lida com
    // opportunity_phases. NÃO toca em tenant_sequences (atomicity test
    // gerencia seu próprio reset; aqui não importa o seq_id absoluto).
    await sb
      .from('opportunities')
      .delete()
      .in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    // Cria 1 oportunidade em cada tenant — IDs determinísticos via insert
    // returning. seq_id é gerenciado pelo trigger; não precisamos especificar.
    const { data: fgcoopOpp, error: errFg } = await sb
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'FGCoop User',
        area: 'TI',
        processo: 'fgcoop process',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id')
      .single();
    if (errFg || !fgcoopOpp) {
      throw new Error(`setup falhou (fgcoop opp): ${errFg?.message}`);
    }
    fgcoopOppId = fgcoopOpp.id;

    const { data: acmeOpp, error: errAc } = await sb
      .from('opportunities')
      .insert({
        tenant_id: ACME_TEST_ID,
        source: 'persona',
        solicitante: 'Acme User',
        area: 'TI',
        processo: 'acme process',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id')
      .single();
    if (errAc || !acmeOpp) {
      throw new Error(`setup falhou (acme opp): ${errAc?.message}`);
    }
    acmeOppId = acmeOpp.id;

    // Cria UMA phase row para o opportunity do fgcoop — alvo dos specs do
    // Grupo 2 (opportunity_phases cross-tenant).
    const { data: phase, error: errPh } = await sb
      .from('opportunity_phases')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        phase_key: 'em_analise',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (errPh || !phase) {
      throw new Error(`setup falhou (fgcoop phase): ${errPh?.message}`);
    }
    fgcoopPhaseId = phase.id;
  });

  afterAll(async () => {
    // Cleanup — outros specs reusam estes tenants. cascade em
    // opportunity_phases via FK.
    if (sb) {
      await sb
        .from('opportunities')
        .delete()
        .in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    }
  });

  // ===========================================================================
  // Grupo 1: opportunities — cross-tenant SELECT / UPDATE / DELETE / INSERT
  // ===========================================================================
  describe('opportunities — cross-tenant', () => {
    it('HARDEN-A-01: tenant Acme NÃO faz SELECT em opportunity do FGCoop', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunities')
        .select('id, solicitante')
        .eq('id', fgcoopOppId);
      expect(error).toBeNull();
      // RLS USING filtra silenciosamente — 0 rows, não erro.
      expect(data).toEqual([]);
    });

    it('HARDEN-A-02: tenant Acme tentando UPDATE em opportunity do FGCoop afeta 0 linhas', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunities')
        .update({ solicitante: 'HIJACKED' })
        .eq('id', fgcoopOppId)
        .select('id, solicitante');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Defesa em profundidade — confirma via service-role que o registro
      // original do FGCoop continua intacto (não foi tampered).
      const { data: original, error: readErr } = await asService()
        .from('opportunities')
        .select('solicitante')
        .eq('id', fgcoopOppId)
        .single();
      expect(readErr).toBeNull();
      expect(original?.solicitante).toBe('FGCoop User');
    });

    it('HARDEN-A-03: tenant Acme tentando DELETE opportunity do FGCoop afeta 0 linhas', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunities')
        .delete()
        .eq('id', fgcoopOppId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Confirma via service-role que o registro AINDA existe.
      const { data: still, error: readErr } = await asService()
        .from('opportunities')
        .select('id')
        .eq('id', fgcoopOppId)
        .single();
      expect(readErr).toBeNull();
      expect(still?.id).toBe(fgcoopOppId);
    });

    it('HARDEN-A-04: tenant Acme NÃO faz INSERT com tenant_id de FGCoop (RLS WITH CHECK rejeita)', async () => {
      const { client } = await asAcme();
      const { error } = await client
        .from('opportunities')
        .insert({
          tenant_id: FGCOOP_TEST_ID, // ← forjando tenant de outro
          source: 'persona',
          solicitante: 'attacker',
          area: 'TI',
          processo: 'attack',
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('id');
      // RLS WITH CHECK em INSERT levanta erro (não silencia como SELECT/UPDATE
      // USING). Em supabase-js 2.x: error.code === '42501' (insufficient
      // privilege) ou message contendo "row-level security". NÃO asserir texto
      // específico — versões do Postgres mudam mensagem.
      expect(error).not.toBeNull();

      // Confirma que nenhuma row vazou — count via service-role.
      const { count, error: countErr } = await asService()
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', FGCOOP_TEST_ID)
        .eq('solicitante', 'attacker');
      expect(countErr).toBeNull();
      expect(count).toBe(0);
    });

    it('sanity check: tenant FGCoop FAZ SELECT em sua própria opportunity', async () => {
      const { client } = await asFgcoop();
      const { data, error } = await client
        .from('opportunities')
        .select('id, solicitante')
        .eq('id', fgcoopOppId)
        .single();
      expect(error).toBeNull();
      expect(data?.solicitante).toBe('FGCoop User');
    });
  });

  // ===========================================================================
  // Grupo 2: opportunity_phases — cross-tenant SELECT / UPDATE / DELETE / INSERT
  // ===========================================================================
  describe('opportunity_phases — cross-tenant', () => {
    it('HARDEN-A-05a: Acme NÃO faz SELECT em phase de FGCoop', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunity_phases')
        .select('id, phase_key')
        .eq('id', fgcoopPhaseId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('HARDEN-A-05b: Acme NÃO faz UPDATE em phase de FGCoop', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunity_phases')
        .update({ finished_at: new Date().toISOString() })
        .eq('id', fgcoopPhaseId)
        .select('id, finished_at');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Confirma via service-role que finished_at AINDA é null.
      const { data: original, error: readErr } = await asService()
        .from('opportunity_phases')
        .select('finished_at')
        .eq('id', fgcoopPhaseId)
        .single();
      expect(readErr).toBeNull();
      expect(original?.finished_at).toBeNull();
    });

    it('HARDEN-A-05c: Acme NÃO faz DELETE em phase de FGCoop', async () => {
      const { client } = await asAcme();
      const { data, error } = await client
        .from('opportunity_phases')
        .delete()
        .eq('id', fgcoopPhaseId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Confirma via service-role que a phase AINDA existe.
      const { data: still, error: readErr } = await asService()
        .from('opportunity_phases')
        .select('id')
        .eq('id', fgcoopPhaseId)
        .single();
      expect(readErr).toBeNull();
      expect(still?.id).toBe(fgcoopPhaseId);
    });

    it('HARDEN-A-05d: Acme NÃO faz INSERT em opportunity_phases com tenant_id de FGCoop (RLS WITH CHECK rejeita)', async () => {
      const { client } = await asAcme();
      const { error } = await client
        .from('opportunity_phases')
        .insert({
          // FK precisa existir — apontamos para o opportunity do FGCoop,
          // simulando um attacker que descobriu o UUID via canal lateral.
          // O RLS WITH CHECK em opportunity_phases_insert filtra por
          // tenant_id = current_tenant_id() (que é o Acme) → rejeita.
          opportunity_id: fgcoopOppId,
          tenant_id: FGCOOP_TEST_ID, // ← forjado
          phase_key: 'em_analise',
          started_at: new Date().toISOString(),
        })
        .select('id');
      expect(error).not.toBeNull();
    });
  });

  // ===========================================================================
  // Grupo 3: profiles — cross-tenant SELECT
  //
  // Policy em 0001_init.sql:
  //   - profiles_select_same_tenant (SELECT, USING tenant_id = current_tenant_id())
  //   - profiles_update_self (UPDATE, USING id = auth.uid() ...)
  //
  // Não há INSERT/DELETE policies (profiles é criada pelo trigger
  // handle_new_user, e usuários nunca podem deletar profiles diretamente).
  // Logo, cobrimos apenas SELECT cross-tenant + sanity check.
  // ===========================================================================
  describe('profiles — cross-tenant', () => {
    it('HARDEN-A-05e: Acme só vê profiles do próprio tenant (não vaza profiles de FGCoop)', async () => {
      const { client, tenantId: acmeTid } = await asAcme();
      const { data, error } = await client
        .from('profiles')
        .select('id, tenant_id');
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // Todas as rows visíveis devem pertencer ao próprio tenant — nenhum
      // profile do FGCoop pode vazar.
      for (const row of data ?? []) {
        expect(row.tenant_id).toBe(acmeTid);
      }
      // Sanity — ao menos a própria row do usuário Acme deve estar visível.
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    });

    it('sanity check: FGCoop só vê profiles do próprio tenant', async () => {
      const { client, tenantId } = await asFgcoop();
      const { data, error } = await client
        .from('profiles')
        .select('id, tenant_id');
      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect(row.tenant_id).toBe(tenantId);
      }
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Grupo 4: Integração com Plan 03 (Bloco B) — schema rejeita tenant_id forjado
  //
  // Defesa em profundidade: o RLS WITH CHECK do DB é a linha FINAL, mas o
  // `opportunityInputSchema.strict()` do Plan 03 deve rejeitar tenant_id no
  // payload ANTES de chegar no DB. Spec puro (não toca em Supabase) — sempre
  // executa, mesmo em modo unit-only via skipIf=false aqui... mas como está
  // dentro do describe.skipIf, só roda quando HAS_DB. Trade-off aceitável:
  // mass-assignment.test.ts já cobre este path em unit-only mode (HARDEN-B-01).
  // Aqui é apenas um cross-check garantindo que a defesa Zod + RLS estão
  // alinhadas sobre o mesmo vetor T-07.5-A-04.
  // ===========================================================================
  describe('schema integration — mass-assignment defense vs RLS WITH CHECK', () => {
    it('opportunityInputSchema rejeita payload com tenant_id forjado (defesa em profundidade sobre RLS)', () => {
      const malicious = {
        source: 'persona' as const,
        tenant_id: ACME_TEST_ID, // ← campo server-derived forjado
        solicitante: 'attacker',
        area: 'TI',
        processo: 'attack',
        esforco: 'medio' as const,
        complexidade: 'medio' as const,
        tempo: 'mensal' as const,
        objetivo: 3,
      };
      const r = opportunityInputSchema.safeParse(malicious);
      expect(r.success).toBe(false);
      if (!r.success) {
        // Deve ser unrecognized_keys (Zod 4.x) ou similar — ao menos uma
        // issue mencionando `tenant_id`. Asserção tolerante (não exige
        // estrutura interna específica do Zod).
        const stringified = JSON.stringify(r.error.issues);
        expect(stringified.includes('tenant_id')).toBe(true);
      }
    });
  });
});
