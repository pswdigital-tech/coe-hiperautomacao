// =============================================================================
// opportunity_documents / opportunity_notes / opportunity_history — isolamento
// RLS cross-tenant (v0.3 / migration 0018)
// =============================================================================
// Espelha opportunity-risks-isolation.test.ts: RLS exercitada via JWT do
// usuário (nunca service-role, exceto setup/teardown/assertions de "persiste").
// As 3 tabelas novas compartilham o mesmo padrão de policy (0018), então os 3
// grupos de specs seguem a mesma forma condensada.
//
// opportunity_history é append-only (sem policy de update/delete, 0018) — só
// cobre SELECT cross-tenant + INSERT com tenant_id forjado (update/delete nem
// têm policy pra testar).
//
// Skip behavior: pulado inteiro sem NEXT_PUBLIC_SUPABASE_URL (modo unit-only).
// Pré-requisito: migrations 0001..0018 aplicadas + seed dos dois tenants.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const svc = () => asService();
const fgcoopClient = async () => (await asFgcoop()).client;

describe.skipIf(!HAS_DB)('v0.3 — documentos/anotações/histórico RLS cross-tenant', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let fgcoopOppId: string;
  let acmeOppId: string;
  let acmeDocId: string;
  let acmeNoteId: string;
  let acmeHistId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();
    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    const mkOpp = async (tenantId: string, who: string) => {
      const { data, error } = await sb
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          source: 'persona',
          solicitante: who,
          area: 'TI',
          processo: `${who} process v03`,
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`setup falhou (opp ${who}): ${error?.message}`);
      return data.id as string;
    };
    fgcoopOppId = await mkOpp(FGCOOP_TEST_ID, 'FGCoop');
    acmeOppId = await mkOpp(ACME_TEST_ID, 'Acme');

    const { data: doc, error: docErr } = await sb
      .from('opportunity_documents')
      .insert({
        opportunity_id: acmeOppId,
        tenant_id: ACME_TEST_ID,
        kind: 'link',
        nome: 'doc do Acme',
        url: 'https://example.com/acme',
      })
      .select('id')
      .single();
    if (docErr || !doc) throw new Error(`setup falhou (doc): ${docErr?.message}`);
    acmeDocId = doc.id;

    const { data: note, error: noteErr } = await sb
      .from('opportunity_notes')
      .insert({ opportunity_id: acmeOppId, tenant_id: ACME_TEST_ID, texto: 'nota do Acme' })
      .select('id')
      .single();
    if (noteErr || !note) throw new Error(`setup falhou (note): ${noteErr?.message}`);
    acmeNoteId = note.id;

    const { data: hist, error: histErr } = await sb
      .from('opportunity_history')
      .insert({ opportunity_id: acmeOppId, tenant_id: ACME_TEST_ID, resumo: 'histórico do Acme' })
      .select('id')
      .single();
    if (histErr || !hist) throw new Error(`setup falhou (history): ${histErr?.message}`);
    acmeHistId = hist.id;
  });

  afterAll(async () => {
    if (sb) {
      await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    }
  });

  describe('opportunity_documents', () => {
    it('SELECT cross-tenant: FGCoop não vê documento do Acme', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunity_documents').select('id').eq('id', acmeDocId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('DELETE cross-tenant: FGCoop não remove documento do Acme (0 linhas)', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunity_documents').delete().eq('id', acmeDocId).select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: still } = await svc().from('opportunity_documents').select('id').eq('id', acmeDocId).single();
      expect(still?.id).toBe(acmeDocId);
    });

    it('INSERT com tenant_id forjado é rejeitado pela RLS', async () => {
      const client = await fgcoopClient();
      const { error } = await client
        .from('opportunity_documents')
        .insert({
          opportunity_id: acmeOppId,
          tenant_id: ACME_TEST_ID,
          kind: 'link',
          nome: 'attacker doc',
          url: 'https://attacker.example',
        })
        .select('id');
      expect(error).not.toBeNull();
    });
  });

  describe('opportunity_notes', () => {
    it('SELECT cross-tenant: FGCoop não vê anotação do Acme', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunity_notes').select('id').eq('id', acmeNoteId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('DELETE cross-tenant: FGCoop não remove anotação do Acme (0 linhas)', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunity_notes').delete().eq('id', acmeNoteId).select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: still } = await svc().from('opportunity_notes').select('id').eq('id', acmeNoteId).single();
      expect(still?.id).toBe(acmeNoteId);
    });

    it('INSERT com tenant_id forjado é rejeitado pela RLS', async () => {
      const client = await fgcoopClient();
      const { error } = await client
        .from('opportunity_notes')
        .insert({ opportunity_id: acmeOppId, tenant_id: ACME_TEST_ID, texto: 'attacker note' })
        .select('id');
      expect(error).not.toBeNull();
    });
  });

  describe('opportunity_history (append-only)', () => {
    it('SELECT cross-tenant: FGCoop não vê histórico do Acme', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunity_history').select('id').eq('id', acmeHistId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('INSERT com tenant_id forjado é rejeitado pela RLS', async () => {
      const client = await fgcoopClient();
      const { error } = await client
        .from('opportunity_history')
        .insert({ opportunity_id: acmeOppId, tenant_id: ACME_TEST_ID, resumo: 'attacker history' })
        .select('id');
      expect(error).not.toBeNull();
    });

    it('sanity: FGCoop consegue gravar e ler histórico do próprio tenant', async () => {
      const client = await fgcoopClient();
      const { data: inserted, error: insErr } = await client
        .from('opportunity_history')
        .insert({ opportunity_id: fgcoopOppId, tenant_id: FGCOOP_TEST_ID, resumo: 'histórico do FGCoop' })
        .select('id')
        .single();
      expect(insErr).toBeNull();
      expect(inserted?.id).toBeTruthy();
    });
  });
});
