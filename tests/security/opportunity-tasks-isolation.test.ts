// =============================================================================
// opportunity_tasks — isolamento RLS cross-tenant — Phase 16 / Plan 16-03
// (TASK-04, critério de sucesso 1 do ROADMAP)
// =============================================================================
// Prova que `opportunity_tasks` (migration 0037) está isolada por tenant: o
// tenant A NÃO enxerga, NÃO altera e NÃO remove tarefas do tenant B; e um
// INSERT com `tenant_id` forjado é rejeitado. Espelha
// `opportunity-risks-isolation.test.ts` linha a linha na estrutura.
//
// Regra metodológica do espelho — NÃO afrouxar: a RLS é exercitada por
// CLIENTE AUTENTICADO com JWT (`asFgcoop()`), nunca por service-role. O
// service-role só aparece no `beforeAll`/`afterAll` (semear e limpar) e nas
// releituras que provam "o registro do outro tenant continua intacto".
//
// Specs:
//   1. SELECT cross-tenant → data === [] (RLS USING filtra em silêncio).
//   2. UPDATE cross-tenant → 0 rows; original intacto (via service-role).
//   3. DELETE cross-tenant → 0 rows; registro persiste (via service-role).
//   4. INSERT com tenant_id forjado → error não-nulo (RLS WITH CHECK rejeita).
//   5. (sanity) SELECT da própria tarefa → 1 linha com os valores esperados.
//   6. cascade da oportunidade → apagar a oportunidade remove suas tarefas
//      (on delete cascade de opportunity_id) — específica desta fase, sem
//      analog em opportunity-risks-isolation.test.ts.
//
// Skip behavior: pulado quando `NEXT_PUBLIC_SUPABASE_URL` está vazio.
// Pré-requisito: migrations 0001..0037 aplicadas num projeto Supabase Cloud
// DE TESTE (nunca produção) + seed dos dois tenants via seedTestTenants().
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const svc = () => asService();
const fgcoopClient = async () => (await asFgcoop()).client;

describe.skipIf(!HAS_DB)('opportunity_tasks — RLS cross-tenant (TASK-04)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;

  let fgcoopOppId: string;
  let acmeOppId: string;
  let fgcoopTaskId: string;
  let acmeTaskId: string;

  const mkOpp = async (tenantId: string, who: string) => {
    const { data, error } = await sb
      .from('opportunities')
      .insert({
        tenant_id: tenantId,
        source: 'persona',
        solicitante: who,
        area: 'TI',
        processo: `${who} tasks-isolation`,
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

  const mkTask = async (tenantId: string, oppId: string, title: string) => {
    const { data, error } = await sb
      .from('opportunity_tasks')
      .insert({
        opportunity_id: oppId,
        tenant_id: tenantId,
        title,
        status: 'backlog',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`setup falhou (task ${title}): ${error?.message}`);
    return data.id as string;
  };

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();

    // Baseline limpo — cascade remove opportunity_tasks via FK on delete cascade.
    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    fgcoopOppId = await mkOpp(FGCOOP_TEST_ID, 'FGCoop');
    acmeOppId = await mkOpp(ACME_TEST_ID, 'Acme');

    fgcoopTaskId = await mkTask(FGCOOP_TEST_ID, fgcoopOppId, 'tarefa do FGCoop');
    acmeTaskId = await mkTask(ACME_TEST_ID, acmeOppId, 'tarefa do Acme');
  });

  afterAll(async () => {
    if (sb) {
      await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    }
  });

  it('1. SELECT cross-tenant: FGCoop NÃO vê tarefa do Acme (data === [])', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client.from('opportunity_tasks').select('id, title').eq('id', acmeTaskId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('2. UPDATE cross-tenant: FGCoop tentando alterar tarefa do Acme afeta 0 linhas', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client
      .from('opportunity_tasks')
      .update({ title: 'HIJACKED' })
      .eq('id', acmeTaskId)
      .select('id, title');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: original, error: readErr } = await svc()
      .from('opportunity_tasks')
      .select('title')
      .eq('id', acmeTaskId)
      .single();
    expect(readErr).toBeNull();
    expect(original?.title).toBe('tarefa do Acme');
  });

  it('3. DELETE cross-tenant: FGCoop tentando deletar tarefa do Acme afeta 0 linhas', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client.from('opportunity_tasks').delete().eq('id', acmeTaskId).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: still, error: readErr } = await svc()
      .from('opportunity_tasks')
      .select('id')
      .eq('id', acmeTaskId)
      .single();
    expect(readErr).toBeNull();
    expect(still?.id).toBe(acmeTaskId);
  });

  it('4. INSERT com tenant_id forjado: FGCoop não cria tarefa como Acme (RLS WITH CHECK rejeita)', async () => {
    const client = await fgcoopClient();
    const { error } = await client
      .from('opportunity_tasks')
      .insert({
        opportunity_id: acmeOppId,
        tenant_id: ACME_TEST_ID, // ← forjado
        title: 'attacker task',
      })
      .select('id');
    // RLS WITH CHECK em INSERT levanta erro (42501 / "row-level security").
    // Não asserir texto específico — versões do Postgres mudam a mensagem.
    expect(error).not.toBeNull();

    const { count, error: countErr } = await svc()
      .from('opportunity_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ACME_TEST_ID)
      .eq('title', 'attacker task');
    expect(countErr).toBeNull();
    expect(count).toBe(0);
  });

  it('5. sanity: FGCoop FAZ SELECT na sua própria tarefa (1 linha)', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client
      .from('opportunity_tasks')
      .select('id, title, status')
      .eq('id', fgcoopTaskId)
      .single();
    expect(error).toBeNull();
    expect(data?.title).toBe('tarefa do FGCoop');
    expect(data?.status).toBe('backlog');
  });

  it('6. cascade: apagar a oportunidade remove as tarefas dela (on delete cascade)', async () => {
    const cascadeOppId = await mkOpp(FGCOOP_TEST_ID, 'FGCoop-cascade');
    const cascadeTaskId = await mkTask(FGCOOP_TEST_ID, cascadeOppId, 'tarefa a cascatear');

    const { error: delErr } = await sb.from('opportunities').delete().eq('id', cascadeOppId);
    expect(delErr).toBeNull();

    const { data: still, error: readErr } = await sb
      .from('opportunity_tasks')
      .select('id')
      .eq('id', cascadeTaskId);
    expect(readErr).toBeNull();
    expect(still).toEqual([]);
  });
});
