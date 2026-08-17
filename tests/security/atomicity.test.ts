// =============================================================================
// seq_id atomicity (Bloco C do hardening) — testes de integração
// =============================================================================
// Cobre os requisitos HARDEN-C-01..03 do 07.5-VALIDATION.md:
//
//  HARDEN-C-01: 50× inserts paralelos no mesmo tenant geram seq_id único
//               (1..50, sem gaps).
//  HARDEN-C-02: Dois tenants distintos têm sequences independentes (cada
//               um 1..N) — `next_seq_id` por-tenant não interfere cross.
//  HARDEN-C-03: seq_id no payload do cliente é IGNORADO; trigger sobrescreve.
//
// Estratégia: bate em Supabase real via service-role client. NUNCA mock —
// é a função PL/pgSQL + trigger que estamos validando.
//
// Skip behavior: a suite TODA é pulada quando `NEXT_PUBLIC_SUPABASE_URL` está
// vazio (modo unit-only do globalSetup). Para rodar, popule `.env.test` com
// credenciais do Supabase de TESTE — NUNCA produção. A defesa do globalSetup
// já aborta se a URL apontar para fora de localhost / *-test.supabase.co.
//
// Pré-requisito: migration 0006_seq_id_atomic.sql aplicada no DB. Sem isso,
// os inserts ainda funcionam (trigger antigo permanece), mas HARDEN-C-01 e
// HARDEN-C-03 falham (race + cliente forja seq_id).
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  seedTestTenants,
} from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// `tenant_sequences` foi criada em 0006_seq_id_atomic.sql. `lib/database.types.ts`
// ainda NÃO conhece a tabela (gen:types depende do schema do Cloud ser
// atualizado), então usamos um helper untyped só para acessá-la. Quando o
// usuário rodar `npm run gen:types` depois de aplicar a migration, este escape
// hatch ainda funciona (cast é compatível com o supertype tipado).
type UntypedTable = {
  upsert: (
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) => Promise<{ error: unknown }>;
};
function tenantSequencesTable(
  client: ReturnType<typeof serviceRoleClient>,
): UntypedTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from('tenant_sequences') as UntypedTable;
}

// `describe.skipIf` (Vitest 0.34+) pula os `it` blocks da suite quando o
// predicado é true. O corpo do describe AINDA executa (Vitest precisa
// registrar os testes para reportar como skipped), então toda inicialização
// que dependa de env DEVE acontecer dentro de `beforeAll` (lazy). Manter
// `serviceRoleClient()` no top-level do describe quebraria com
// "NEXT_PUBLIC_SUPABASE_URL ausente" mesmo no modo skip.
describe.skipIf(!HAS_DB)('seq_id atomicity (Bloco C)', () => {
  type SbClient = ReturnType<typeof serviceRoleClient>;
  let sb: SbClient;

  beforeAll(async () => {
    sb = serviceRoleClient();
    // Defensivo — globalSetup já roda, mas idempotente.
    await seedTestTenants();
    // Baseline: zera estado dos dois tenants para que os asserts de 1..N
    // sejam previsíveis. `tenant_sequences.last_seq` NÃO decai com delete em
    // opportunities — precisa reset explícito.
    await sb
      .from('opportunities')
      .delete()
      .in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    await tenantSequencesTable(sb).upsert(
      [
        { tenant_id: FGCOOP_TEST_ID, last_seq: 0 },
        { tenant_id: ACME_TEST_ID, last_seq: 0 },
      ],
      { onConflict: 'tenant_id' },
    );
  });

  afterAll(async () => {
    // Cleanup — outros specs reusam estes tenants. Não toca em
    // tenant_sequences (deixa last_seq elevado, mas próximos testes resetam).
    await sb
      .from('opportunities')
      .delete()
      .in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
  });

  it('HARDEN-C-01: 50 inserts paralelos no mesmo tenant geram seq_ids únicos e contínuos', async () => {
    const N = 50;
    const inserts = Array.from({ length: N }, (_, i) =>
      sb
        .from('opportunities')
        .insert({
          tenant_id: FGCOOP_TEST_ID,
          source: 'persona',
          solicitante: `race-${i}`,
          area: 'TI',
          processo: `atomicity test ${i}`,
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('seq_id')
        .single(),
    );
    const results = await Promise.all(inserts);

    // Todos os inserts devem ter sucesso
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(typeof r.data?.seq_id).toBe('number');
    }

    const seqIds = results
      .map((r) => r.data!.seq_id)
      .sort((a, b) => a - b);

    // Unicidade — defesa contra race condition (HARDEN-C-01)
    expect(new Set(seqIds).size).toBe(N);

    // Contínuos 1..N — sem gaps (tenant_sequences foi resetada no beforeAll)
    for (let i = 0; i < N; i++) {
      expect(seqIds[i]).toBe(i + 1);
    }
  });

  it('HARDEN-C-03: seq_id enviado no payload do cliente é ignorado pelo trigger', async () => {
    // Reset baseline para este caso isolado — N=1 esperado.
    await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);
    await tenantSequencesTable(sb).upsert(
      { tenant_id: FGCOOP_TEST_ID, last_seq: 0 },
      { onConflict: 'tenant_id' },
    );

    const FORGED = 999999;
    const { data, error } = await sb
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        // Cliente tenta forjar — trigger DEVE sobrescrever. O type da coluna
        // não aceita seq_id no Insert (definido como gerado pelo trigger),
        // então fazemos cast — simula cliente malicioso enviando bytes raw.
        seq_id: FORGED,
        source: 'persona',
        solicitante: 'forger',
        area: 'TI',
        processo: 'forge attempt',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select('seq_id')
      .single();

    expect(error).toBeNull();
    // Trigger SEMPRE sobrescreve — esperamos 1 (primeiro seq após reset).
    expect(data?.seq_id).toBe(1);
    expect(data?.seq_id).not.toBe(FORGED);
  });

  it('HARDEN-C-02: dois tenants distintos têm sequences independentes', async () => {
    // Reset baseline para cenário cross-tenant.
    await sb
      .from('opportunities')
      .delete()
      .in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    await tenantSequencesTable(sb).upsert(
      [
        { tenant_id: FGCOOP_TEST_ID, last_seq: 0 },
        { tenant_id: ACME_TEST_ID, last_seq: 0 },
      ],
      { onConflict: 'tenant_id' },
    );

    const N = 10;
    // Intercala inserts entre os dois tenants para forçar contenção mista.
    // Se next_seq_id por tenant tiver bug de isolamento (ex: lock global),
    // os seq_ids ficariam embaralhados; aqui esperamos 1..N em CADA tenant.
    const interleaved = Array.from({ length: N * 2 }, (_, i) => {
      const tenantId = i % 2 === 0 ? FGCOOP_TEST_ID : ACME_TEST_ID;
      return sb
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          source: 'persona',
          solicitante: `iso-${i}`,
          area: 'TI',
          processo: `iso ${i}`,
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('seq_id, tenant_id')
        .single();
    });
    const results = await Promise.all(interleaved);

    const byTenant = new Map<string, number[]>();
    for (const r of results) {
      expect(r.error).toBeNull();
      const t = r.data!.tenant_id as string;
      const arr = byTenant.get(t) ?? [];
      arr.push(r.data!.seq_id as number);
      byTenant.set(t, arr);
    }

    // Cada tenant viu N inserts e gerou 1..N independente
    expect(byTenant.size).toBe(2);
    for (const [, seqs] of byTenant) {
      const sorted = [...seqs].sort((a, b) => a - b);
      expect(sorted.length).toBe(N);
      expect(new Set(sorted).size).toBe(N);
      for (let i = 0; i < N; i++) {
        expect(sorted[i]).toBe(i + 1);
      }
    }
  });
});
