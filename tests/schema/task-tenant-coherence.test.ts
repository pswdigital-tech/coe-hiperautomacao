// =============================================================================
// opportunity_tasks — coerência de tenant do responsável — Phase 16 / Plan 16-03
// (TASK-03, D-04)
// =============================================================================
// Prova que o trigger `opportunity_tasks_tenant_guard` /
// `check_task_tenant_coherence()` (migration 0037) — clone de
// `check_assignee_tenant()` (0032) — impede:
//   1. `assignee_id` de um profile de OUTRO tenant;
//   2. `tenant_id` da tarefa divergente do `tenant_id` da oportunidade
//      referenciada;
//   3. `parent_task_id` apontando para uma tarefa de OUTRA oportunidade.
//
// Os inserts/updates são feitos via `serviceRoleClient()` DE PROPÓSITO: o alvo
// é o TRIGGER (que roda inclusive para service-role/backend), não a policy de
// RLS. A prova de RLS cross-tenant fica em `opportunity-tasks-isolation.test.ts`.
//
// Skip behavior: pulado quando `NEXT_PUBLIC_SUPABASE_URL` está vazio.
// Pré-requisito: migrations 0001..0037 aplicadas num projeto Supabase Cloud
// DE TESTE (nunca produção) + seed dos tenants via seedTestTenants().
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!HAS_DB)('opportunity_tasks — coerência de tenant (TASK-03/D-04)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let fgcoopUserId: string;
  let acmeUserId: string;
  let fgcoopOppId: string;
  let acmeOppId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seeded = await seedTestTenants();
    fgcoopUserId = seeded.fgcoopUserId;
    acmeUserId = seeded.acmeUserId;

    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    const mkOpp = async (tenantId: string, who: string) => {
      const { data, error } = await sb
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          source: 'persona',
          solicitante: who,
          area: 'TI',
          processo: `${who} tenant-coherence`,
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
  });

  afterAll(async () => {
    if (sb) {
      await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    }
  });

  it('1. assignee_id do profile do MESMO tenant → sucesso (caminho feliz)', async () => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'tarefa com responsável do próprio tenant',
        assignee_id: fgcoopUserId,
      })
      .select('id, assignee_id')
      .single();
    expect(error).toBeNull();
    expect(data?.assignee_id).toBe(fgcoopUserId);
  });

  it('2. assignee_id de profile de OUTRO tenant → erro, nenhuma linha criada (D-04)', async () => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'tentativa de responsável de outro tenant',
        assignee_id: acmeUserId,
      })
      .select('id');
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { count } = await sb
      .from('opportunity_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('title', 'tentativa de responsável de outro tenant');
    expect(count).toBe(0);
  });

  it('3. tenant_id da tarefa divergente do tenant_id da oportunidade → erro', async () => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: ACME_TEST_ID, // ← divergente da oportunidade (FGCoop)
        title: 'tenant divergente',
      })
      .select('id');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('4. parent_task_id apontando para tarefa de OUTRA oportunidade → erro', async () => {
    const { data: paiAcme, error: paiErr } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: acmeOppId,
        tenant_id: ACME_TEST_ID,
        title: 'raiz da oportunidade Acme',
      })
      .select('id')
      .single();
    expect(paiErr).toBeNull();
    if (!paiAcme) throw new Error('setup falhou: raiz Acme');

    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'subtarefa cruzando oportunidade',
        parent_task_id: paiAcme.id,
      })
      .select('id');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('5. UPDATE trocando assignee_id para profile de outro tenant → erro, valor antigo persiste', async () => {
    const { data: tarefa, error: setupErr } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'tarefa para update de assignee',
        assignee_id: fgcoopUserId,
      })
      .select('id')
      .single();
    expect(setupErr).toBeNull();
    if (!tarefa) throw new Error('setup falhou: tarefa update assignee');

    const { error } = await sb
      .from('opportunity_tasks')
      .update({ assignee_id: acmeUserId })
      .eq('id', tarefa.id)
      .select('id');
    expect(error).not.toBeNull();

    const { data: releitura, error: readErr } = await sb
      .from('opportunity_tasks')
      .select('assignee_id')
      .eq('id', tarefa.id)
      .single();
    expect(readErr).toBeNull();
    expect(releitura?.assignee_id).toBe(fgcoopUserId);
  });

  it('6. assignee_id nulo → sucesso (responsável é opcional)', async () => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: fgcoopOppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'tarefa sem responsável',
        assignee_id: null,
      })
      .select('id, assignee_id')
      .single();
    expect(error).toBeNull();
    expect(data?.assignee_id).toBeNull();
  });
});
