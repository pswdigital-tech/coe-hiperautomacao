// =============================================================================
// psw_tenant_admins — concessão de admin cross-tenant a `psw_staff` (Phase 18)
// =============================================================================
// Esta suíte prova GRANT-01, GRANT-02, GRANT-03, GRANT-06, GRANT-08 e GRANT-10:
// um `psw_staff` pode receber, de N em N tenants, o poder de `tenant_admin`
// SEM perder as atribuições que já tinha em outras empresas (Phase 17) — e,
// enquanto não tiver concessão em nenhum tenant, o comportamento dele
// permanece byte-idêntico ao da `0044` (só o atribuído, nada a mais).
//
// ESTADO NESTA WAVE (Plan 18-03): as migrations `0045` (Plan 18-02, TRACER) e
// `0046` (este plano — propagação às 7 tabelas filhas + `profiles`) estão
// AMBAS aplicadas e verificadas estruturalmente em produção (ver
// `18-02-MIGRATION-HANDOFF.md` e `18-03-MIGRATION-HANDOFF.md`). O modo de
// prova da fase é `prova-por-sql-no-handoff` (revertido no Plan 18-02):
// `.env.test` NÃO existe e NÃO deve ser criado enquanto a colisão de UUID
// entre fixtures de teste e o tenant real FGCoop não for resolvida — logo
// `describe.skipIf(!HAS_DB)` PULA esta suíte inteira neste ambiente, e ela
// sai `0` sem executar nenhuma asserção. Isso NÃO é lido como "verde": os
// specs abaixo (incluindo `c4`, escrito neste plano) ficam registrados em
// SKIP até um ambiente de teste dedicado existir — a rede de regressão fica
// pronta, a prova de runtime desta wave é a verificação numerada do handoff.
//
// REGRA INEGOCIÁVEL (herdada de `psw-staff-isolation.test.ts:26-29`): nenhum
// spec pode concluir sucesso de uma escrita apenas por `error === null` — é
// obrigatório reler a linha via `serviceRoleClient()` e comparar o valor
// observado. Ver c5.
//
// Skip behavior: pulado inteiro sem `NEXT_PUBLIC_SUPABASE_URL` (modo
// unit-only) — nesse caso a suíte sai 0 sem executar nenhuma asserção, e isso
// NÃO pode ser lido como "verde". Ver Task 1 / SUMMARY deste plano.
//
// Arquivo NOVO — não editar `tests/security/psw-staff-isolation.test.ts`. Ele
// é a prova viva de GRANT-02 e afirma no nível de topo que `asPswStaff()`
// enxerga exatamente [X, Z]; uma linha de concessão que sobreviva a um
// `afterAll` quebraria aquele arquivo. Por isso esta suíte usa prefixo de
// UUID próprio (`bbbb0000-…`) e um `afterAll` incondicional que apaga
// primeiro qualquer linha de `psw_tenant_admins` do profile do staff — é a
// linha mais importante deste arquivo, porque `singleFork` +
// `sequence.concurrent: false` fazem um vazamento contaminar toda suíte
// posterior.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asPswStaff } from '../helpers/auth-as';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  PSW_STAFF_TEST_EMAIL,
  TEST_PASSWORD,
  seedTestTenants,
} from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Prefixo de UUID PRÓPRIO desta suíte — não reusar `1111…`/`2222…`/`3333…`
// (tenants de teste), `aaaa0000…` (oportunidades da suíte 17) nem
// `eeee0000…` (tenant de controle da suíte 17).
const OPP_A_NAO_ATRIBUIDA = 'bbbb0000-0000-0000-0000-000000000001'; // FGCoop, SEM atribuição — era invisível no baseline
const OPP_B_ATRIBUIDA = 'bbbb0000-0000-0000-0000-000000000002'; // Acme, ATRIBUÍDA ao staff (Phase 17, preservada)
const OPP_C_CONTROLE = 'bbbb0000-0000-0000-0000-000000000003'; // tenant terceiro — sem concessão, sem atribuição

// Tenant terceiro (nem FGCoop nem Acme), usado só como negativo decisivo (c3):
// nenhuma concessão nem atribuição existe nele em ponto algum desta suíte.
const CONTROL_TENANT_ID = 'cccc0000-0000-0000-0000-000000000001';

// Mesmo e-mail/padrão de `psw-staff-isolation.test.ts` — reusa o
// `platform_admin` de teste já existente em vez de criar um segundo. Não é o
// segundo usuário `psw_staff` proibido pelo plano: é um papel diferente,
// necessário só para preencher `granted_by`.
const PLATFORM_ADMIN_TEST_EMAIL = 'platform-admin@test.local';

// Perfil dentro do tenant de CONTROLE (não confundir com o `platform_admin`
// de teste acima) — necessário só para popular `opportunity_assignees` de C
// sem violar `check_assignee_tenant()` (0040): o vínculo exige um profile do
// MESMO tenant da oportunidade, ou `psw_staff` — e o staff de teste não pode
// ficar atribuído a C sob risco de contaminar `c3`/`c4-negativo` (ambos
// exigem que ele não tenha NENHUM vínculo, nem concessão, com o tenant de
// controle).
const CONTROL_PROFILE_TEST_EMAIL = 'controle-grant-child-test@test.local';

// Ids do grupo (d) — Plan 18-05, migration 0047 (as 11 policies vivas de
// tenant_admin pela fonte única `is_tenant_admin_of()`). Mesmo prefixo
// `bbbb0000-…` desta suíte, faixa própria para não colidir com nada acima.
const INVITE_PENDING_A = 'bbbb0000-0000-0000-0000-000000000010'; // FGCoop, pendente
const INVITE_USED_A = 'bbbb0000-0000-0000-0000-000000000011'; // FGCoop, já usado
const INVITE_PENDING_CONTROL = 'bbbb0000-0000-0000-0000-000000000012'; // tenant de controle, pendente

// As 7 tabelas filhas cobertas pela propagação desta migration (0046) — usado
// tanto pela fixture quanto pelos specs `c4-*`, para não deixar o nome de
// nenhuma tabela hardcoded em dois lugares divergentes.
const CHILD_TABLES = [
  'opportunity_phases',
  'opportunity_risks',
  'opportunity_notes',
  'opportunity_documents',
  'opportunity_history',
  'opportunity_tasks',
  'opportunity_assignees',
] as const;

describe.skipIf(!HAS_DB)('psw_tenant_admins — concessão de admin cross-tenant (0045+)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let pswStaffUserId: string;
  let fgcoopUserId: string;
  let adminUserId: string;
  let controlProfileId: string;
  let notesRowIdA: string;
  let historyRowIdA: string;
  // Baseline SEM concessão das 7 filhas de A — medido em `a1b`, reconferido
  // em `c4-baseline` após a revogação (mesma disciplina de `baselineIds`).
  let childBaselineCounts: Record<(typeof CHILD_TABLES)[number], number> = {} as Record<
    (typeof CHILD_TABLES)[number],
    number
  >;

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seed = await seedTestTenants();
    pswStaffUserId = seed.pswStaffUserId;
    fgcoopUserId = seed.fgcoopUserId;

    // Limpeza defensiva (idempotência caso um `afterAll` anterior não tenha
    // rodado). Ordem: filhas antes do pai.
    await sb
      .from('opportunity_assignees')
      .delete()
      .in('opportunity_id', [OPP_A_NAO_ATRIBUIDA, OPP_B_ATRIBUIDA, OPP_C_CONTROLE]);
    await sb.from('opportunities').delete().in('id', [OPP_A_NAO_ATRIBUIDA, OPP_B_ATRIBUIDA, OPP_C_CONTROLE]);

    // Tenant terceiro (controle) — upsert, idempotente entre runs.
    const { error: controlTenantErr } = await sb.from('tenants').upsert(
      {
        id: CONTROL_TENANT_ID,
        slug: 'controle-grant-test',
        name: 'Controle Grant Test',
        status: 'active',
      },
      { onConflict: 'id' },
    );
    if (controlTenantErr) throw new Error(`upsert tenant de controle falhou: ${controlTenantErr.message}`);

    const baseFields = {
      source: 'persona' as const,
      solicitante: 'psw-staff-admin-grant fixture',
      area: 'TI',
      esforco: 'medio' as const,
      complexidade: 'medio' as const,
      tempo: 'mensal' as const,
      objetivo: 3,
      visivel: true,
    };

    // Nunca informar seq_id (trigger), score/priority_level (view) nem
    // rpa_score (GENERATED) — docs/PROJETO.md §3.
    const { error: insertErr } = await sb.from('opportunities').insert([
      {
        id: OPP_A_NAO_ATRIBUIDA,
        tenant_id: FGCOOP_TEST_ID,
        processo: 'A — FGCoop, SEM atribuição ao staff (o positivo decisivo de c1)',
        ...baseFields,
      },
      {
        id: OPP_B_ATRIBUIDA,
        tenant_id: ACME_TEST_ID,
        processo: 'B — Acme, ATRIBUÍDA ao staff (a atribuição da Phase 17 que não pode se perder)',
        ...baseFields,
      },
      {
        id: OPP_C_CONTROLE,
        tenant_id: CONTROL_TENANT_ID,
        processo: 'C — tenant de controle, sem concessão nem atribuição (o negativo decisivo de c3)',
        ...baseFields,
      },
    ]);
    if (insertErr) throw new Error(`setup falhou (opportunities da fixture): ${insertErr.message}`);

    // Atribuição real do staff em B (Acme) — o cenário de GRANT-03 é a MESMA
    // pessoa com concessão em A (FGCoop) e atribuição em B (Acme); por isso
    // nenhuma atribuição é criada em A nem em C.
    const { error: assignBErr } = await sb.from('opportunity_assignees').insert({
      opportunity_id: OPP_B_ATRIBUIDA,
      profile_id: pswStaffUserId,
      tenant_id: ACME_TEST_ID,
    });
    if (assignBErr) throw new Error(`setup falhou (atribuição de B): ${assignBErr.message}`);

    // `platform_admin` de teste — cria (idempotente) e promove, mesma forma
    // de `psw-staff-isolation.test.ts`. Só existe para preencher
    // `granted_by`; nenhuma asserção desta suíte depende do e-mail dele.
    const { data: list } = await sb.auth.admin.listUsers();
    const existingAdmin = list?.users.find((u) => u.email === PLATFORM_ADMIN_TEST_EMAIL);
    if (existingAdmin) {
      adminUserId = existingAdmin.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: PLATFORM_ADMIN_TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        app_metadata: { tenant_id: FGCOOP_TEST_ID },
        user_metadata: { full_name: 'Platform Admin Test', tenant_id: FGCOOP_TEST_ID },
      });
      if (error || !data.user) throw new Error(`createUser falhou (platform admin): ${error?.message}`);
      adminUserId = data.user.id;
    }
    const { error: promoteAdminErr } = await sb
      .from('profiles')
      .update({ role: 'platform_admin' })
      .eq('id', adminUserId);
    if (promoteAdminErr) throw new Error(`promote platform_admin falhou: ${promoteAdminErr.message}`);

    // Perfil dentro do tenant de controle (idempotente) — ver o comentário
    // acima de CONTROL_PROFILE_TEST_EMAIL.
    const { data: controlProfileList } = await sb.auth.admin.listUsers();
    const existingControlProfile = controlProfileList?.users.find((u) => u.email === CONTROL_PROFILE_TEST_EMAIL);
    if (existingControlProfile) {
      controlProfileId = existingControlProfile.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: CONTROL_PROFILE_TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        app_metadata: { tenant_id: CONTROL_TENANT_ID },
        user_metadata: { full_name: 'Controle Grant Child Test', tenant_id: CONTROL_TENANT_ID },
      });
      if (error || !data.user) throw new Error(`createUser falhou (perfil de controle): ${error?.message}`);
      controlProfileId = data.user.id;
    }

    // ---------------------------------------------------------------------
    // Fixture das 7 tabelas filhas (Plan 18-03, spec c4) — uma linha sob A
    // (FGCoop, NÃO atribuída ao staff — o positivo decisivo de c4-positivo) e
    // uma sob C (tenant de controle, sem concessão nem atribuição — o
    // negativo decisivo de c4-negativo). Nenhuma linha filha é criada sob B
    // (Acme): a propagação por ATRIBUIÇÃO já é coberta desde a Phase 17
    // (psw-staff-isolation.test.ts) e não é o que este plano prova. Todo
    // insert respeita docs/PROJETO.md §3 e o guard de coerência da 0043/0040
    // (tenant_id da linha = tenant_id da oportunidade, sempre).
    // ---------------------------------------------------------------------
    const { error: phasesErr } = await sb.from('opportunity_phases').insert([
      { opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, phase_key: 'planejamento' },
      { opportunity_id: OPP_C_CONTROLE, tenant_id: CONTROL_TENANT_ID, phase_key: 'planejamento' },
    ]);
    if (phasesErr) throw new Error(`setup falhou (opportunity_phases da fixture c4): ${phasesErr.message}`);

    const { error: risksErr } = await sb.from('opportunity_risks').insert([
      {
        opportunity_id: OPP_A_NAO_ATRIBUIDA,
        tenant_id: FGCOOP_TEST_ID,
        descricao: 'risco fixture c4 — A',
        tipo: 'risco',
        impacto: 'moderado',
        probabilidade: 'possivel',
      },
      {
        opportunity_id: OPP_C_CONTROLE,
        tenant_id: CONTROL_TENANT_ID,
        descricao: 'risco fixture c4 — C',
        tipo: 'risco',
        impacto: 'moderado',
        probabilidade: 'possivel',
      },
    ]);
    if (risksErr) throw new Error(`setup falhou (opportunity_risks da fixture c4): ${risksErr.message}`);

    const { error: tasksErr } = await sb.from('opportunity_tasks').insert([
      { opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, title: 'tarefa fixture c4 — A', status: 'backlog' },
      { opportunity_id: OPP_C_CONTROLE, tenant_id: CONTROL_TENANT_ID, title: 'tarefa fixture c4 — C', status: 'backlog' },
    ]);
    if (tasksErr) throw new Error(`setup falhou (opportunity_tasks da fixture c4): ${tasksErr.message}`);

    // Notas — captura o id da linha de A (usado por c9, negação de UPDATE).
    const { data: notesData, error: notesErr } = await sb
      .from('opportunity_notes')
      .insert([
        { opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, texto: 'nota fixture c4 — A' },
        { opportunity_id: OPP_C_CONTROLE, tenant_id: CONTROL_TENANT_ID, texto: 'nota fixture c4 — C' },
      ])
      .select('id, opportunity_id');
    if (notesErr) throw new Error(`setup falhou (opportunity_notes da fixture c4): ${notesErr.message}`);
    notesRowIdA = (notesData ?? []).find((r) => r.opportunity_id === OPP_A_NAO_ATRIBUIDA)?.id ?? '';
    if (!notesRowIdA) throw new Error('setup falhou: nao encontrou o id da nota fixture de A');

    const { error: documentsErr } = await sb.from('opportunity_documents').insert([
      {
        opportunity_id: OPP_A_NAO_ATRIBUIDA,
        tenant_id: FGCOOP_TEST_ID,
        kind: 'link',
        nome: 'documento fixture c4 — A',
        url: 'https://example.test/c4-a',
      },
      {
        opportunity_id: OPP_C_CONTROLE,
        tenant_id: CONTROL_TENANT_ID,
        kind: 'link',
        nome: 'documento fixture c4 — C',
        url: 'https://example.test/c4-c',
      },
    ]);
    if (documentsErr) throw new Error(`setup falhou (opportunity_documents da fixture c4): ${documentsErr.message}`);

    // Histórico — captura o id da linha de A (usado por c9, negação de
    // UPDATE e de DELETE).
    const { data: historyData, error: historyErr } = await sb
      .from('opportunity_history')
      .insert([
        { opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, resumo: 'historico fixture c4 — A' },
        { opportunity_id: OPP_C_CONTROLE, tenant_id: CONTROL_TENANT_ID, resumo: 'historico fixture c4 — C' },
      ])
      .select('id, opportunity_id');
    if (historyErr) throw new Error(`setup falhou (opportunity_history da fixture c4): ${historyErr.message}`);
    historyRowIdA = (historyData ?? []).find((r) => r.opportunity_id === OPP_A_NAO_ATRIBUIDA)?.id ?? '';
    if (!historyRowIdA) throw new Error('setup falhou: nao encontrou o id do historico fixture de A');

    // Atribuições — A recebe o profile do FGCoop (mesmo tenant da
    // oportunidade — vínculo legítimo, não exercita nenhum caso especial de
    // check_assignee_tenant); C recebe o profile de controle criado acima
    // (mesmo tenant de C, pelo mesmo motivo). NENHUM dos dois é o staff — a
    // atribuição dele continua restrita a B (OPP_B_ATRIBUIDA).
    const { error: assigneesFixtureErr } = await sb.from('opportunity_assignees').insert([
      { opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, profile_id: fgcoopUserId },
      { opportunity_id: OPP_C_CONTROLE, tenant_id: CONTROL_TENANT_ID, profile_id: controlProfileId },
    ]);
    if (assigneesFixtureErr) {
      throw new Error(`setup falhou (opportunity_assignees da fixture c4): ${assigneesFixtureErr.message}`);
    }
  });

  // LINHA MAIS IMPORTANTE DO ARQUIVO — incondicional, sem `if` sobre estado
  // de teste anterior. Sob `singleFork`, uma linha de concessão vazada
  // contamina toda suíte posterior, inclusive `psw-staff-isolation.test.ts`
  // (que este plano não pode tocar).
  afterAll(async () => {
    if (!sb) return;
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);

    await sb
      .from('opportunity_assignees')
      .delete()
      .in('opportunity_id', [OPP_A_NAO_ATRIBUIDA, OPP_B_ATRIBUIDA, OPP_C_CONTROLE]);
    // Apagar as 3 oportunidades dispara `on delete cascade` para as tabelas
    // filhas — nenhuma fica órfã (FKs verificadas nas migrations de origem).
    await sb.from('opportunities').delete().in('id', [OPP_A_NAO_ATRIBUIDA, OPP_B_ATRIBUIDA, OPP_C_CONTROLE]);
    // NÃO apagar o tenant de controle nem auth.users — idempotência da
    // próxima run, mesmo padrão de FGCOOP_TEST_ID/ACME_TEST_ID/PSW_TEST_ID.
  });

  // ---------------------------------------------------------------------
  // Grupo (a) — baseline SEM concessão (GRANT-02/GRANT-08, SC-4)
  // ---------------------------------------------------------------------
  let baselineIds: string[] = [];

  it('a1) sem concessão, o conjunto visível é medido em runtime e guardado como baseline', async () => {
    const { client } = await asPswStaff();
    const { data, error } = await client.from('opportunities').select('id');
    expect(error).toBeNull();
    baselineIds = (data ?? []).map((r) => r.id).sort();

    // Negativo decisivo herdado da 0044: a oportunidade NÃO atribuída do
    // tenant A não pode estar no conjunto visível sem concessão.
    expect(baselineIds).not.toContain(OPP_A_NAO_ATRIBUIDA);
    // A atribuída em B continua lá (Phase 17, intocada por esta fase).
    expect(baselineIds).toContain(OPP_B_ATRIBUIDA);
  });

  it('a1b) sem concessão, as 7 tabelas filhas de A também são invisíveis (baseline dos filhos, GRANT-02)', async () => {
    const { client } = await asPswStaff();
    for (const table of CHILD_TABLES) {
      const { data, error } = await client.from(table).select('id').eq('opportunity_id', OPP_A_NAO_ATRIBUIDA);
      expect(error).toBeNull();
      childBaselineCounts[table] = (data ?? []).length;
    }
    // Negativo decisivo: a fixture criada no beforeAll existe de verdade no
    // banco (dado real, não hipotético) sob cada uma das 7 tabelas — mas sem
    // concessão nem atribuição, a RLS a esconde inteiramente do staff.
    for (const table of CHILD_TABLES) {
      expect(childBaselineCounts[table]).toBe(0);
    }
  });

  // ---------------------------------------------------------------------
  // Grupo (b) — não-regressão de `member`/`tenant_admin` (GRANT-10/SC-12)
  // ---------------------------------------------------------------------
  let memberBaseline = -1;

  it('b1) baseline de member do FGCoop, ANTES de existir concessão', async () => {
    const { client } = await asFgcoop(); // role 'member'
    const { count } = await client.from('opportunities').select('id', { count: 'exact', head: true });
    memberBaseline = count ?? -1;
    expect(memberBaseline).toBeGreaterThan(0); // testemunha viva
  });

  describe('com concessão no tenant A (FGCoop)', () => {
    beforeAll(async () => {
      const { error } = await sb.from('psw_tenant_admins').insert({
        profile_id: pswStaffUserId,
        tenant_id: FGCOOP_TEST_ID,
        granted_by: adminUserId,
      });
      if (error) throw new Error(`setup falhou (concessão): ${error.message}`);
    });

    afterAll(async () => {
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    it('b2) com a concessão ATIVA, a contagem do member do FGCoop não se move', async () => {
      const { client } = await asFgcoop();
      const { count } = await client.from('opportunities').select('id', { count: 'exact', head: true });
      expect(count).toBe(memberBaseline);
    });

    describe('tenant_admin do FGCoop — não-regressão (0029/0041 preservadas)', () => {
      // Promove o usuário FGCoop compartilhado a `tenant_admin` só durante
      // este describe — mesmo padrão de `psw-staff-isolation.test.ts:1031`.
      const createdInviteIds: string[] = [];

      beforeAll(async () => {
        const { error } = await sb.from('profiles').update({ role: 'tenant_admin' }).eq('id', fgcoopUserId);
        if (error) throw new Error(`não foi possível promover FGCoop a tenant_admin: ${error.message}`);
      });

      afterAll(async () => {
        if (sb && fgcoopUserId) {
          await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
        }
        if (sb && createdInviteIds.length > 0) {
          await sb.from('invited_emails').delete().in('id', createdInviteIds);
        }
      });

      it('b3) tenant_admin do FGCoop CONTINUA sem conseguir convidar psw_staff (detector da regressão da 0029)', async () => {
        const { client } = await asFgcoop();
        const { error } = await client.from('invited_emails').insert({
          email: 'tentativa-psw-staff-grant-18@test.local',
          tenant_id: FGCOOP_TEST_ID,
          role: 'psw_staff',
        });
        expect(error).not.toBeNull();
      });

      it('b4) tenant_admin do FGCoop CONTINUA convidando papéis legítimos do próprio tenant', async () => {
        const { client } = await asFgcoop();
        const { data, error } = await client
          .from('invited_emails')
          .insert({ email: 'convite-legitimo-grant-18@test.local', tenant_id: FGCOOP_TEST_ID, role: 'member' })
          .select('id')
          .single();
        expect(error).toBeNull();
        expect(data?.id).toBeTruthy();
        if (data?.id) createdInviteIds.push(data.id);
      });

      it('b5) tenant_admin do FGCoop CONTINUA sem ver invited_emails do Acme', async () => {
        const { client } = await asFgcoop();
        const { data, error } = await client.from('invited_emails').select('id').eq('tenant_id', ACME_TEST_ID);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
    });

    // ---------------------------------------------------------------------
    // Grupo (c) — com concessão ativa no FGCoop (GRANT-03/GRANT-06, SC-5)
    // ---------------------------------------------------------------------

    it('c1) POSITIVO DECISIVO — staff-admin passa a ver a oportunidade de A que NÃO lhe foi atribuída', async () => {
      const { client } = await asPswStaff();
      const { data, error } = await client.from('opportunities').select('id').eq('id', OPP_A_NAO_ATRIBUIDA);
      expect(error).toBeNull();
      expect(data).toHaveLength(1); // era [] no baseline (a1) — a diferença É a fase
    });

    it('c2) não perde de vista a oportunidade atribuída em OUTRA empresa (Acme)', async () => {
      const { client } = await asPswStaff();
      const { data, error } = await client.from('opportunities').select('id, tenant_id').eq('id', OPP_B_ATRIBUIDA);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('c3) NEGATIVO DECISIVO — nada do tenant de controle, onde não há concessão nem atribuição', async () => {
      const { client } = await asPswStaff();
      const { data, error } = await client.from('opportunities').select('id').eq('tenant_id', CONTROL_TENANT_ID);
      expect(error).toBeNull();
      expect(data).toEqual([]); // o "tenant A não vê tenant B" do docs/PROJETO.md
    });

    // Propagação da concessão às 7 tabelas filhas (Plan 18-03 / migration
    // 0046) — parametrizado sobre a lista LITERAL das 7 tabelas para que
    // nenhuma dependa de amostragem e a falha aponte a tabela exata (mesmo
    // padrão de `psw-staff-isolation.test.ts` → `it.each(CHILD_TABLES)`).
    it.each(CHILD_TABLES)(
      'c4-positivo) %s propaga a concessão — staff-admin vê a linha de A (oportunidade NÃO atribuída)',
      async (table) => {
        const { client } = await asPswStaff();
        const { data, error } = await client.from(table).select('id').eq('opportunity_id', OPP_A_NAO_ATRIBUIDA);
        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThan(0); // era 0 em a1b — a diferença É a propagação
      },
    );

    it.each(CHILD_TABLES)(
      'c4-negativo) %s — nada do tenant de controle, onde não há concessão nem atribuição',
      async (table) => {
        const { client } = await asPswStaff();
        const { data, error } = await client.from(table).select('id').eq('opportunity_id', OPP_C_CONTROLE);
        expect(error).toBeNull();
        expect(data).toEqual([]); // a fixture de C existe de verdade no banco — a RLS a esconde
      },
    );

    it('c5) escreve em A com releitura por service-role — não é sucesso silencioso', async () => {
      const { client } = await asPswStaff();
      const novoValor = `observacao staff-admin ${Date.now()}`;
      const { error } = await client.from('opportunities').update({ observacao: novoValor }).eq('id', OPP_A_NAO_ATRIBUIDA);
      expect(error).toBeNull();

      const { data, error: readErr } = await sb
        .from('opportunities')
        .select('observacao')
        .eq('id', OPP_A_NAO_ATRIBUIDA)
        .single();
      expect(readErr).toBeNull();
      expect(data?.observacao).toBe(novoValor); // ← a releitura obrigatória, nunca `error === null` sozinho
    });

    it('c6) D-B — o staff-admin NÃO consegue conceder a ninguém, nem a si (erro explícito no INSERT)', async () => {
      const { client } = await asPswStaff();
      const { error } = await client
        .from('psw_tenant_admins')
        .insert({ profile_id: pswStaffUserId, tenant_id: ACME_TEST_ID });
      expect(error).not.toBeNull(); // RLS, não UI
    });

    it('c7) D-B — o staff-admin NÃO consegue revogar (delete casa zero linhas em silêncio)', async () => {
      const { client } = await asPswStaff();
      const { data } = await client.from('psw_tenant_admins').delete().eq('tenant_id', FGCOOP_TEST_ID).select('id');
      expect(data ?? []).toEqual([]);

      const { count } = await sb
        .from('psw_tenant_admins')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', pswStaffUserId);
      expect(count).toBe(1); // a linha continua lá — o delete não afetou nada
    });

    it('c8) escreve (INSERT) numa filha de A com releitura por service-role — não é sucesso silencioso', async () => {
      const { client } = await asPswStaff();
      const texto = `nota staff-admin c8 ${Date.now()}`;
      const { data: inserted, error } = await client
        .from('opportunity_notes')
        .insert({ opportunity_id: OPP_A_NAO_ATRIBUIDA, tenant_id: FGCOOP_TEST_ID, texto })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect(inserted?.id).toBeTruthy();

      const { data: reread, error: readErr } = await sb
        .from('opportunity_notes')
        .select('texto')
        .eq('id', inserted?.id ?? '')
        .single();
      expect(readErr).toBeNull();
      expect(reread?.texto).toBe(texto); // ← a releitura obrigatória, nunca `error === null` sozinho
    });

    it('c9) opportunity_history não ganha UPDATE nem DELETE; opportunity_notes não ganha UPDATE — paridade de verbos é asserção, não confiança na migration', async () => {
      const { client } = await asPswStaff();

      // As três tentativas abaixo negam por FALTA DE GRANT de tabela (0018:
      // opportunity_history só tem `grant select, insert`; opportunity_notes
      // só tem `grant select, insert, delete` — nenhuma das duas tem update,
      // e história não tem delete). Isso é um erro de PRIVILÉGIO — anterior
      // à própria RLS —, diferente do "using" retornando zero linhas em
      // silêncio (esse padrão, já exercitado em c7, se aplica quando a
      // tabela TEM o grant do verbo mas a RLS filtra a linha). As três,
      // portanto, são explicit-error — afirmado abaixo, não presumido.
      const { error: updateHistoryErr } = await client
        .from('opportunity_history')
        .update({ resumo: 'tentativa update c9' })
        .eq('id', historyRowIdA);
      expect(updateHistoryErr).not.toBeNull();

      const { error: deleteHistoryErr } = await client.from('opportunity_history').delete().eq('id', historyRowIdA);
      expect(deleteHistoryErr).not.toBeNull();

      const { error: updateNotesErr } = await client
        .from('opportunity_notes')
        .update({ texto: 'tentativa update c9' })
        .eq('id', notesRowIdA);
      expect(updateNotesErr).not.toBeNull();

      // Releitura por service-role: nenhuma das duas linhas foi alterada nem
      // apagada — confirma que os três erros acima não são falso-negativo de
      // rede, e sim a negação de verbo de fato acontecendo.
      const { data: historyStill, error: historyReadErr } = await sb
        .from('opportunity_history')
        .select('resumo')
        .eq('id', historyRowIdA)
        .single();
      expect(historyReadErr).toBeNull();
      expect(historyStill?.resumo).toBe('historico fixture c4 — A');

      const { data: notesStill, error: notesReadErr } = await sb
        .from('opportunity_notes')
        .select('texto')
        .eq('id', notesRowIdA)
        .single();
      expect(notesReadErr).toBeNull();
      expect(notesStill?.texto).toBe('nota fixture c4 — A');
    });

    // -------------------------------------------------------------------
    // Grupo (d) — Plan 18-05 / migration 0047: as 11 policies vivas de
    // `tenant_admin` pela fonte única `is_tenant_admin_of()`. Poderes em A
    // (GRANT-04), negação em B (a mesma bateria, nas duas formas de negação:
    // erro explícito para INSERT, zero linhas silenciosas para
    // SELECT/UPDATE/DELETE — usando `using`), e não-regressão do
    // `tenant_admin` de cliente depois do swap (GRANT-10/SC-12).
    // -------------------------------------------------------------------
    describe('grupo (d) — convites/branding/log herdados de tenant_admin pelo staff-admin (0047)', () => {
      const inviteIdsToCleanup: string[] = [];
      let originalBranding: { brand_color: string | null; logo_path: string | null } | null = null;

      beforeAll(async () => {
        const { data: brandingData, error: brandingErr } = await sb
          .from('tenants')
          .select('brand_color, logo_path')
          .eq('id', FGCOOP_TEST_ID)
          .single();
        if (brandingErr) throw new Error(`setup falhou (branding original de A): ${brandingErr.message}`);
        originalBranding = brandingData;

        const { error: pendingErr } = await sb.from('invited_emails').insert({
          id: INVITE_PENDING_A,
          email: 'convite-pendente-grupo-d@test.local',
          tenant_id: FGCOOP_TEST_ID,
          role: 'member',
        });
        if (pendingErr) throw new Error(`setup falhou (convite pendente A, grupo d): ${pendingErr.message}`);

        const { error: usedErr } = await sb.from('invited_emails').insert({
          id: INVITE_USED_A,
          email: 'convite-usado-grupo-d@test.local',
          tenant_id: FGCOOP_TEST_ID,
          role: 'member',
          used_at: new Date().toISOString(),
        });
        if (usedErr) throw new Error(`setup falhou (convite já usado A, grupo d): ${usedErr.message}`);

        const { error: controlInviteErr } = await sb.from('invited_emails').insert({
          id: INVITE_PENDING_CONTROL,
          email: 'convite-pendente-grupo-d-controle@test.local',
          tenant_id: CONTROL_TENANT_ID,
          role: 'member',
        });
        if (controlInviteErr) {
          throw new Error(`setup falhou (convite pendente do tenant de controle, grupo d): ${controlInviteErr.message}`);
        }
      });

      afterAll(async () => {
        if (!sb) return;
        await sb
          .from('invited_emails')
          .delete()
          .in('id', [INVITE_PENDING_A, INVITE_USED_A, INVITE_PENDING_CONTROL, ...inviteIdsToCleanup]);
        if (originalBranding) {
          await sb
            .from('tenants')
            .update({ brand_color: originalBranding.brand_color, logo_path: originalBranding.logo_path })
            .eq('id', FGCOOP_TEST_ID);
        }
      });

      it('d1) staff-admin lê a allowlist de convites de A', async () => {
        const { client } = await asPswStaff();
        const { data, error } = await client.from('invited_emails').select('id').eq('tenant_id', FGCOOP_TEST_ID);
        expect(error).toBeNull();
        const ids = (data ?? []).map((r) => r.id);
        expect(ids).toContain(INVITE_PENDING_A);
        expect(ids).toContain(INVITE_USED_A);
      });

      it('d2) staff-admin insere convite legítimo em A, com releitura por service-role', async () => {
        const { client } = await asPswStaff();
        const email = `convite-legitimo-staffadmin-grupo-d-${Date.now()}@test.local`;
        const { data, error } = await client
          .from('invited_emails')
          .insert({ email, tenant_id: FGCOOP_TEST_ID, role: 'member', invited_by: pswStaffUserId })
          .select('id')
          .single();
        expect(error).toBeNull();
        expect(data?.id).toBeTruthy();
        if (data?.id) inviteIdsToCleanup.push(data.id);

        const { data: reread, error: readErr } = await sb
          .from('invited_emails')
          .select('email')
          .eq('id', data?.id ?? '')
          .single();
        expect(readErr).toBeNull();
        expect(reread?.email).toBe(email); // ← a releitura obrigatória, nunca `error === null` sozinho
      });

      it('d3) staff-admin recebe erro ao tentar convidar alguém com papel não convidável (psw_staff) em A — não cunha um staff PSW', async () => {
        const { client } = await asPswStaff();
        const { error } = await client.from('invited_emails').insert({
          email: `tentativa-psw-staff-grupo-d-${Date.now()}@test.local`,
          tenant_id: FGCOOP_TEST_ID,
          role: 'psw_staff',
          invited_by: pswStaffUserId,
        });
        expect(error).not.toBeNull();
      });

      it('d4) staff-admin remove convite PENDENTE de A, e NÃO remove convite já USADO (zero linhas, não erro)', async () => {
        const { client } = await asPswStaff();

        const { data: deletedPending, error: deletePendingErr } = await client
          .from('invited_emails')
          .delete()
          .eq('id', INVITE_PENDING_A)
          .select('id');
        expect(deletePendingErr).toBeNull();
        expect(deletedPending).toHaveLength(1);

        const { data: rereadPending } = await sb.from('invited_emails').select('id').eq('id', INVITE_PENDING_A);
        expect(rereadPending ?? []).toEqual([]); // releitura confirma a remoção

        const { data: deletedUsed, error: deleteUsedErr } = await client
          .from('invited_emails')
          .delete()
          .eq('id', INVITE_USED_A)
          .select('id');
        expect(deleteUsedErr).toBeNull(); // nega pelo `using` (used_at is null), não por erro explícito
        expect(deletedUsed ?? []).toEqual([]);

        const { data: rereadUsed } = await sb.from('invited_emails').select('id').eq('id', INVITE_USED_A);
        expect(rereadUsed).toHaveLength(1); // a linha continua lá — o delete não afetou nada
      });

      it('d5) staff-admin atualiza o branding (tenants) de A, com releitura por service-role', async () => {
        const { client } = await asPswStaff();
        const novaCor = `#${Date.now().toString(16).padStart(6, '0').slice(-6)}`;
        const { error } = await client.from('tenants').update({ brand_color: novaCor }).eq('id', FGCOOP_TEST_ID);
        expect(error).toBeNull();

        const { data, error: readErr } = await sb
          .from('tenants')
          .select('brand_color')
          .eq('id', FGCOOP_TEST_ID)
          .single();
        expect(readErr).toBeNull();
        expect(data?.brand_color).toBe(novaCor); // ← a releitura obrigatória, nunca `error === null` sozinho
      });

      it('d6) staff-admin lê o log de auditoria de A e obtém linhas', async () => {
        const { client } = await asPswStaff();
        const { data, error } = await client.from('audit_log').select('id').eq('tenant_id', FGCOOP_TEST_ID).limit(1);
        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThan(0);
      });

      describe('d7) NEGATIVO — as mesmas operações no tenant de controle, onde não há concessão', () => {
        it('d7a) SELECT invited_emails do tenant de controle — zero linhas (nega pelo `using`, não por erro)', async () => {
          const { client } = await asPswStaff();
          const { data, error } = await client.from('invited_emails').select('id').eq('tenant_id', CONTROL_TENANT_ID);
          expect(error).toBeNull();
          expect(data).toEqual([]);
        });

        it('d7b) INSERT convite legítimo no tenant de controle — erro explícito (`with check` falha)', async () => {
          const { client } = await asPswStaff();
          const { error } = await client.from('invited_emails').insert({
            email: `tentativa-insert-controle-grupo-d-${Date.now()}@test.local`,
            tenant_id: CONTROL_TENANT_ID,
            role: 'member',
          });
          expect(error).not.toBeNull();
        });

        it('d7c) INSERT convite com papel não convidável no tenant de controle — erro explícito', async () => {
          const { client } = await asPswStaff();
          const { error } = await client.from('invited_emails').insert({
            email: `tentativa-insert-controle-psw-staff-grupo-d-${Date.now()}@test.local`,
            tenant_id: CONTROL_TENANT_ID,
            role: 'psw_staff',
          });
          expect(error).not.toBeNull();
        });

        it('d7d) DELETE convite pendente do tenant de controle — zero linhas (nega pelo `using`, não por erro)', async () => {
          const { client } = await asPswStaff();
          const { data, error } = await client
            .from('invited_emails')
            .delete()
            .eq('id', INVITE_PENDING_CONTROL)
            .select('id');
          expect(error).toBeNull();
          expect(data ?? []).toEqual([]);

          const { data: stillThere } = await sb.from('invited_emails').select('id').eq('id', INVITE_PENDING_CONTROL);
          expect(stillThere).toHaveLength(1); // a linha continua lá
        });

        it('d7e) UPDATE do tenant de controle (branding) — zero linhas (nega pelo `using`, não por erro)', async () => {
          const { client } = await asPswStaff();
          const { data, error } = await client
            .from('tenants')
            .update({ brand_color: '#abcdef' })
            .eq('id', CONTROL_TENANT_ID)
            .select('id');
          expect(error).toBeNull();
          expect(data ?? []).toEqual([]);
        });

        it('d7f) SELECT audit_log do tenant de controle — zero linhas (nega pelo `using`, não por erro)', async () => {
          const { client } = await asPswStaff();
          const { data, error } = await client.from('audit_log').select('id').eq('tenant_id', CONTROL_TENANT_ID);
          expect(error).toBeNull();
          expect(data).toEqual([]);
        });
      });

      describe('d8) NÃO-REGRESSÃO — tenant_admin de cliente continua exatamente como estava, depois do swap da 0047', () => {
        it('d8a) baseline b1/b2 reconfirmado — member do FGCoop ainda vê exatamente `memberBaseline` oportunidades', async () => {
          const { client } = await asFgcoop();
          const { count } = await client.from('opportunities').select('id', { count: 'exact', head: true });
          expect(count).toBe(memberBaseline);
        });

        describe('tenant_admin do FGCoop repromovido, para reafirmar b3/b4/b5 depois do swap', () => {
          const reconfirmedInviteIds: string[] = [];

          beforeAll(async () => {
            const { error } = await sb.from('profiles').update({ role: 'tenant_admin' }).eq('id', fgcoopUserId);
            if (error) throw new Error(`não foi possível repromover FGCoop a tenant_admin (d8): ${error.message}`);
          });

          afterAll(async () => {
            if (sb && fgcoopUserId) {
              await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
            }
            if (sb && reconfirmedInviteIds.length > 0) {
              await sb.from('invited_emails').delete().in('id', reconfirmedInviteIds);
            }
          });

          it('d8b) reafirma b3 — tenant_admin do FGCoop CONTINUA sem conseguir convidar psw_staff', async () => {
            const { client } = await asFgcoop();
            const { error } = await client.from('invited_emails').insert({
              email: `reconfirma-b3-grupo-d-${Date.now()}@test.local`,
              tenant_id: FGCOOP_TEST_ID,
              role: 'psw_staff',
            });
            expect(error).not.toBeNull();
          });

          it('d8c) reafirma b4 — tenant_admin do FGCoop CONTINUA convidando papéis legítimos do próprio tenant', async () => {
            const { client } = await asFgcoop();
            const { data, error } = await client
              .from('invited_emails')
              .insert({ email: `reconfirma-b4-grupo-d-${Date.now()}@test.local`, tenant_id: FGCOOP_TEST_ID, role: 'member' })
              .select('id')
              .single();
            expect(error).toBeNull();
            expect(data?.id).toBeTruthy();
            if (data?.id) reconfirmedInviteIds.push(data.id);
          });

          it('d8d) reafirma b5 — tenant_admin do FGCoop CONTINUA sem ver invited_emails do Acme', async () => {
            const { client } = await asFgcoop();
            const { data, error } = await client.from('invited_emails').select('id').eq('tenant_id', ACME_TEST_ID);
            expect(error).toBeNull();
            expect(data).toEqual([]);
          });
        });
      });
    });
  });

  it('a2) após revogar (afterAll do describe de concessão), o conjunto visível volta EXATAMENTE ao baseline', async () => {
    const { client } = await asPswStaff();
    const { data, error } = await client.from('opportunities').select('id');
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id).sort()).toEqual(baselineIds);
  });

  it('c4-baseline) após revogar, as 7 tabelas filhas de A voltam EXATAMENTE ao baseline medido em a1b', async () => {
    const { client } = await asPswStaff();
    for (const table of CHILD_TABLES) {
      const { data, error } = await client.from(table).select('id').eq('opportunity_id', OPP_A_NAO_ATRIBUIDA);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(childBaselineCounts[table]);
    }
  });
});

// =============================================================================
// c4 (Plan 18-03, migration 0046): especificado — `c4-positivo`/`c4-negativo`
// (parametrizados sobre CHILD_TABLES), `c4-baseline`, `c8` (escrita com
// releitura) e `c9` (paridade de verbos em history/notes) substituíram o spec
// pendente original.
//
// d1-d8 (Plan 18-05, migration 0047): as 11 policies vivas de `tenant_admin`
// pela fonte única `is_tenant_admin_of()`. Poderes do staff-admin em A
// (convites/branding/log — GRANT-04), negação em B nas DUAS formas corretas
// (erro explícito no INSERT, zero linhas silenciosas no SELECT/UPDATE/DELETE
// via `using`), e a não-regressão do `tenant_admin` de cliente reconferida
// DEPOIS do swap (b1/b2/b3/b4/b5 reafirmados em d8 — é aqui que a regressão
// da policy morta da 0029 apareceria, se tivesse acontecido).
//
// Toda a suíte permanece em SKIP neste ambiente (`.env.test` não existe — ver
// o cabeçalho do arquivo); a prova de runtime da 0047 é a verificação
// numerada de `18-05-MIGRATION-HANDOFF.md` (parcialmente executada — ver
// `18-05-SUMMARY.md`), não esta suíte.
// =============================================================================
