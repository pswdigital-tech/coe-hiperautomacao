// =============================================================================
// RBAC — profiles.role='viewer' é somente-leitura de verdade (v0.3 / 0014+0015)
// =============================================================================
// Prova que a RLS (não só a UI) bloqueia escrita para viewer: promove o
// usuário de teste FGCoop a 'viewer' temporariamente, tenta INSERT/UPDATE/
// DELETE em opportunities (mesma policy pattern cobre opportunity_phases/
// opportunity_risks/opportunity_documents/opportunity_notes/opportunity_history
// — não repete os 6 aqui, 1 tabela representativa é suficiente pra provar que
// current_user_role() funciona), confirma SELECT continua livre, e reverte a
// role no afterAll (o usuário FGCoop é compartilhado por toda a suite).
//
// Skip behavior: pulado sem NEXT_PUBLIC_SUPABASE_URL.
// Pré-requisito: migrations 0001..0015 aplicadas + seed do tenant FGCoop.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!HAS_DB)('RBAC — role=viewer bloqueado por RLS (v0.3)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let fgcoopUserId: string;
  let existingOppId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seeded = await seedTestTenants();
    fgcoopUserId = seeded.fgcoopUserId;

    await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);
    const { data, error } = await sb
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'viewer-test-baseline',
        area: 'TI',
        processo: 'processo baseline',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`setup falhou: ${error?.message}`);
    existingOppId = data.id;

    // Promove o usuário FGCoop de teste a 'viewer' — precisa de 0014 aplicada
    // (enum tenant_role ganhou o valor 'viewer').
    const { error: roleErr } = await sb
      .from('profiles')
      .update({ role: 'viewer' })
      .eq('id', fgcoopUserId);
    if (roleErr) throw new Error(`não foi possível promover a viewer: ${roleErr.message}`);
  });

  afterAll(async () => {
    if (sb && fgcoopUserId) {
      // Reverte — o usuário FGCoop é reusado por toda a suite de testes.
      await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
    }
    if (sb) {
      await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);
    }
  });

  it('SELECT continua livre pra viewer', async () => {
    const { client } = await asFgcoop();
    const { data, error } = await client.from('opportunities').select('id').eq('id', existingOppId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('INSERT é bloqueado pela RLS pra viewer', async () => {
    const { client } = await asFgcoop();
    const { error } = await client
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'viewer attacker',
        area: 'TI',
        processo: 'tentativa de insert por viewer',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id');
    expect(error).not.toBeNull();
  });

  it('UPDATE é bloqueado pela RLS pra viewer (0 linhas, original intacto)', async () => {
    const { client } = await asFgcoop();
    const { data, error } = await client
      .from('opportunities')
      .update({ processo: 'HIJACKED' })
      .eq('id', existingOppId)
      .select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: original } = await asService().from('opportunities').select('processo').eq('id', existingOppId).single();
    expect(original?.processo).toBe('processo baseline');
  });

  it('DELETE é bloqueado pela RLS pra viewer (0 linhas, registro persiste)', async () => {
    const { client } = await asFgcoop();
    const { data, error } = await client.from('opportunities').delete().eq('id', existingOppId).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: still } = await asService().from('opportunities').select('id').eq('id', existingOppId).single();
    expect(still?.id).toBe(existingOppId);
  });
});
