// =============================================================================
// opportunity_tasks — autorização de escrita por papel — Phase 16 / Plan 16-03
// (D-11 — verificação não-negociável 5 de 16-VALIDATION.md)
// =============================================================================
// Prova que o gate de escrita de `opportunity_tasks` (migration 0037) é
// "qualquer papel EXCETO viewer" — o MESMO gate real de `opportunity_risks`
// pós-0011/0015/0021 — e explicitamente NÃO o gate admin-only de
// `opportunity_assignees` (0032, `current_user_role() = 'tenant_admin'`). Sem
// isso o Kanban esvazia, porque quem executa a tarefa não conseguiria mover o
// próprio card.
//
// Espelha `viewer-role-write-block.test.ts`: promove temporariamente o
// usuário de teste FGCoop a `viewer`, exercita os três verbos de escrita,
// confirma que o SELECT continua livre, e REVERTE a role no `afterAll`
// (o usuário FGCoop é compartilhado por toda a suíte — sem a reversão as
// demais suítes passam a rodar como `viewer` e quebram de forma difícil de
// diagnosticar).
//
// Bloco A (papel `member`, o padrão do usuário semeado): INSERT/UPDATE/DELETE
// na própria oportunidade → sucesso — é a metade que importa do D-11.
// Bloco B (papel `viewer`): SELECT continua livre; INSERT/UPDATE/DELETE são
// bloqueados, confirmado por releitura/contagem via service-role. A promoção
// a `viewer` roda no `beforeAll` do describe aninhado de Bloco B — fixture,
// não spec própria — mantendo o total em 7 `it(`: 3 escritas de member + 1
// leitura de viewer + 3 escritas bloqueadas de viewer.
//
// Skip behavior: pulado quando `NEXT_PUBLIC_SUPABASE_URL` está vazio.
// Pré-requisito: migrations 0001..0037 aplicadas num projeto Supabase Cloud
// DE TESTE (nunca produção) + seed do tenant FGCoop via seedTestTenants().
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!HAS_DB)('opportunity_tasks — gate de escrita: viewer bloqueado, member liberado (D-11)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let fgcoopUserId: string;
  let oppId: string;
  let baselineTaskId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seeded = await seedTestTenants();
    fgcoopUserId = seeded.fgcoopUserId;

    await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);

    const { data: opp, error: oppErr } = await sb
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'viewer-write-test-baseline',
        area: 'TI',
        processo: 'processo baseline viewer-write',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id')
      .single();
    if (oppErr || !opp) throw new Error(`setup falhou (opportunity): ${oppErr?.message}`);
    oppId = opp.id;

    const { data: task, error: taskErr } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'tarefa baseline' })
      .select('id')
      .single();
    if (taskErr || !task) throw new Error(`setup falhou (task baseline): ${taskErr?.message}`);
    baselineTaskId = task.id;

    // Garante que o usuário de teste começa como 'member' (papel padrão).
    const { error: roleErr } = await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
    if (roleErr) throw new Error(`não foi possível normalizar role de baseline: ${roleErr.message}`);
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

  // ---------------------------------------------------------------------------
  // Bloco A — papel `member` (padrão): escrita liberada
  // ---------------------------------------------------------------------------

  it('A1. member: INSERT de tarefa na própria oportunidade → sucesso', async () => {
    const { client } = await asFgcoop();
    const { data, error } = await client
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'criada por member' })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it('A2. member: UPDATE do title da tarefa baseline → sucesso', async () => {
    const { client } = await asFgcoop();
    const { data, error } = await client
      .from('opportunity_tasks')
      .update({ title: 'atualizada por member' })
      .eq('id', baselineTaskId)
      .select('id, title')
      .single();
    expect(error).toBeNull();
    expect(data?.title).toBe('atualizada por member');
  });

  it('A3. member: DELETE de uma tarefa própria → sucesso', async () => {
    const { data: descartavel, error: setupErr } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'descartável por member' })
      .select('id')
      .single();
    expect(setupErr).toBeNull();
    if (!descartavel) throw new Error('setup falhou: tarefa descartável');

    const { client } = await asFgcoop();
    const { data, error } = await client.from('opportunity_tasks').delete().eq('id', descartavel.id).select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Bloco B — papel `viewer`: escrita bloqueada, leitura livre
  // ---------------------------------------------------------------------------

  describe('papel viewer', () => {
    beforeAll(async () => {
      const { error } = await sb.from('profiles').update({ role: 'viewer' }).eq('id', fgcoopUserId);
      if (error) throw new Error(`não foi possível promover a viewer: ${error.message}`);
    });

    it('B1. viewer: SELECT da tarefa baseline continua funcionando', async () => {
      const { client } = await asFgcoop();
      const { data, error } = await client.from('opportunity_tasks').select('id').eq('id', baselineTaskId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('B2. viewer: INSERT é bloqueado (nenhuma linha criada)', async () => {
      const { client } = await asFgcoop();
      const { error } = await client
        .from('opportunity_tasks')
        .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'tentativa de insert por viewer' })
        .select('id');
      expect(error).not.toBeNull();

      const { count } = await sb
        .from('opportunity_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('title', 'tentativa de insert por viewer');
      expect(count).toBe(0);
    });

    it('B3. viewer: UPDATE é bloqueado (0 linhas afetadas, original intacto)', async () => {
      const { client } = await asFgcoop();
      const { data, error } = await client
        .from('opportunity_tasks')
        .update({ title: 'HIJACKED-VIEWER' })
        .eq('id', baselineTaskId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: original } = await asService()
        .from('opportunity_tasks')
        .select('title')
        .eq('id', baselineTaskId)
        .single();
      expect(original?.title).toBe('atualizada por member');
    });

    it('B4. viewer: DELETE é bloqueado (0 linhas afetadas, registro persiste)', async () => {
      const { client } = await asFgcoop();
      const { data, error } = await client.from('opportunity_tasks').delete().eq('id', baselineTaskId).select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: still } = await asService().from('opportunity_tasks').select('id').eq('id', baselineTaskId).single();
      expect(still?.id).toBe(baselineTaskId);
    });
  });
});
