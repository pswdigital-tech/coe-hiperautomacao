// =============================================================================
// opportunity_tasks — guarda de 2 níveis de hierarquia — Phase 16 / Plan 16-03
// (TASK-02, D-01, Pitfall 1 de 16-RESEARCH.md)
// =============================================================================
// Prova que o trigger `opportunity_tasks_depth_guard` / `check_task_depth()`
// (migration 0037) impede um 3º nível de hierarquia, nos dois sentidos:
//   (a) INSERT de uma subtarefa cujo `parent_task_id` já é uma subtarefa;
//   (b) UPDATE de re-parentamento — dar um `parent_task_id` a uma tarefa que
//       JÁ tem filhas (ela "rebaixaria" para subtarefa e as filhas virariam
//       netas, criando o 3º nível pela porta dos fundos — Pitfall 1).
//
// Os inserts/updates são feitos via `serviceRoleClient()` DE PROPÓSITO: o alvo
// aqui é o TRIGGER, não a policy de RLS — um trigger que só valesse para
// usuários comuns (e não para service-role/backend) não seria garantia real.
// A prova de RLS cross-tenant fica em `opportunity-tasks-isolation.test.ts`.
//
// Skip behavior: pulado quando `NEXT_PUBLIC_SUPABASE_URL` está vazio (modo
// unit-only) — nunca falha por falta de credencial.
// Pré-requisito: migrations 0001..0037 aplicadas num projeto Supabase Cloud
// DE TESTE (nunca produção) + seed dos tenants via seedTestTenants().
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { FGCOOP_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!HAS_DB)('opportunity_tasks — guarda de 2 níveis (TASK-02/D-01)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let oppId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();

    // Baseline limpo — cascade remove opportunity_tasks via FK on delete cascade.
    await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);

    const { data, error } = await sb
      .from('opportunities')
      .insert({
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'depth-guard-test',
        area: 'TI',
        processo: 'processo depth-guard',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`setup falhou (opportunity): ${error?.message}`);
    oppId = data.id;
  });

  afterAll(async () => {
    if (sb) {
      await sb.from('opportunities').delete().eq('tenant_id', FGCOOP_TEST_ID);
    }
  });

  it('1. cria tarefa raiz (sem pai) com sucesso e parent_task_id nulo', async () => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'raiz 1',
      })
      .select('id, parent_task_id')
      .single();
    expect(error).toBeNull();
    expect(data?.parent_task_id).toBeNull();
  });

  it('2. cria subtarefa apontando para a raiz com sucesso', async () => {
    const { data: raiz, error: raizErr } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'raiz 2' })
      .select('id')
      .single();
    expect(raizErr).toBeNull();
    if (!raiz) throw new Error('setup falhou: raiz 2');

    const { data: sub, error: subErr } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'subtarefa de raiz 2',
        parent_task_id: raiz.id,
      })
      .select('id, parent_task_id')
      .single();
    expect(subErr).toBeNull();
    expect(sub?.parent_task_id).toBe(raiz.id);
  });

  it('3. rejeita 3º nível: subtarefa de uma subtarefa (INSERT) — nenhuma linha criada', async () => {
    const { data: raiz } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'raiz 3' })
      .select('id')
      .single();
    if (!raiz) throw new Error('setup falhou: raiz 3');

    const { data: sub } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'subtarefa de raiz 3',
        parent_task_id: raiz.id,
      })
      .select('id')
      .single();
    if (!sub) throw new Error('setup falhou: subtarefa de raiz 3');

    const { data: netinha, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'tentativa de 3º nível',
        parent_task_id: sub.id,
      })
      .select('id');
    expect(error).not.toBeNull();
    expect(netinha).toBeNull();

    const { count } = await sb
      .from('opportunity_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('title', 'tentativa de 3º nível');
    expect(count).toBe(0);
  });

  it('4. rejeita re-parentamento (UPDATE) de tarefa que já tem filhas (Pitfall 1)', async () => {
    const { data: raizComFilha } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'raiz com filha' })
      .select('id')
      .single();
    if (!raizComFilha) throw new Error('setup falhou: raiz com filha');

    await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'filha da raiz com filha',
        parent_task_id: raizComFilha.id,
      })
      .select('id')
      .single();

    const { data: outraRaiz } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'outra raiz destino' })
      .select('id')
      .single();
    if (!outraRaiz) throw new Error('setup falhou: outra raiz destino');

    const { error } = await sb
      .from('opportunity_tasks')
      .update({ parent_task_id: outraRaiz.id })
      .eq('id', raizComFilha.id)
      .select('id');
    expect(error).not.toBeNull();

    const { data: releitura, error: readErr } = await sb
      .from('opportunity_tasks')
      .select('parent_task_id')
      .eq('id', raizComFilha.id)
      .single();
    expect(readErr).toBeNull();
    expect(releitura?.parent_task_id).toBeNull();
  });

  it('5. permite re-parentamento legítimo: mover subtarefa de uma raiz para outra raiz', async () => {
    const { data: raizOrigem } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'raiz origem' })
      .select('id')
      .single();
    const { data: raizDestino } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'raiz destino' })
      .select('id')
      .single();
    if (!raizOrigem || !raizDestino) throw new Error('setup falhou: raízes de re-parentamento');

    const { data: sub } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: FGCOOP_TEST_ID,
        title: 'subtarefa movível',
        parent_task_id: raizOrigem.id,
      })
      .select('id')
      .single();
    if (!sub) throw new Error('setup falhou: subtarefa movível');

    const { data: movida, error } = await sb
      .from('opportunity_tasks')
      .update({ parent_task_id: raizDestino.id })
      .eq('id', sub.id)
      .select('parent_task_id')
      .single();
    expect(error).toBeNull();
    expect(movida?.parent_task_id).toBe(raizDestino.id);
  });

  it('6. rejeita auto-referência: parent_task_id apontando para o próprio id', async () => {
    const { data: tarefa } = await sb
      .from('opportunity_tasks')
      .insert({ opportunity_id: oppId, tenant_id: FGCOOP_TEST_ID, title: 'auto-referência' })
      .select('id')
      .single();
    if (!tarefa) throw new Error('setup falhou: auto-referência');

    const { error } = await sb
      .from('opportunity_tasks')
      .update({ parent_task_id: tarefa.id })
      .eq('id', tarefa.id)
      .select('id');
    expect(error).not.toBeNull();
  });
});
