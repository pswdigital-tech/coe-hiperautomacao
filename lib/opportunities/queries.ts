import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type {
  Opportunity,
  OpportunityKpis,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityDocument,
  OpportunityNote,
  OpportunityHistoryEntry,
  OpportunityTask,
} from './types';
import type { OpportunityFilters } from './filters';
import { SEGMENTO_STATUSES, STATUS_ALL } from './status';
import {
  fetchOpportunityIdsForAssignee,
  fetchOpportunityIdsForCargo,
} from './assignees';

export type { OpportunityPhase };

/**
 * Whitelist de colunas — substitui `select('*')` para evitar vazamento
 * de colunas adicionadas em migrations futuras (defesa em profundidade,
 * HARDEN-E-06). Mantém paridade com a view `opportunities_with_score`
 * (todas as colunas da tabela `opportunities` + `score` + `priority_level`).
 *
 * Se uma nova coluna for adicionada à tabela `opportunities`, decidir
 * EXPLICITAMENTE se ela deve aparecer aqui — se for sensível, não incluir.
 */
const OPPORTUNITY_COLUMNS =
  'id, tenant_id, seq_id, source, request_type, ' +
  'solicitante, email, area, subarea, processo, ' +
  'frequencia, volume_medio, tempo_execucao, num_pessoas, ' +
  // 0055 — `ferramentas` (array) é a seleção real; `ferramenta` fica pelos
  // consumidores legados (mix do relatório) e é derivada no banco.
  'ferramenta, ferramentas, escopo_automacao, beneficios_esperados, ' +
  'esforco, complexidade, tempo, objetivo, ' +
  // 0061 — texto do objetivo do projeto (Visão Geral). Decisão explícita
  // (HARDEN-E-06): conteúdo editorial, nada sensível.
  'objetivo_projeto, ' +
  // 0062 — campos da seção Solução. Decisão explícita (HARDEN-E-06):
  // conteúdo editorial do projeto, nada sensível.
  'fora_escopo, criterios_aceite, ' +
  'status, responsavel, notas, observacao, risco, ' +
  // v0.2 (0011) — incluídos por decisão explícita (HARDEN-E-06): consumidos por
  // P11/P12/P13/P14; nenhum sensível. rpa_score é GENERATED (leitura).
  'fte_horas, fonte, tipo_processo, beneficio_qualitativo, ' +
  'criterios, beneficios, fte, rpa_score, ' +
  'persona_extras, formulario_extras, ' +
  'ai_enrichment_status, ai_enrichment_error, ai_enriched_at, ' +
  // v0.3 (0017) — incluídos por decisão explícita (HARDEN-E-06): nenhum sensível.
  'criticidade, azure_boards_codigo, linguagem, execucao, usuarios_servico, ' +
  'execucoes_mes, data_conclusao, data_abertura_coe, data_fechamento_coe, ' +
  'created_by, created_at, updated_at, ' +
  // 0049 — ordem manual de prioridade. Decisão explícita (HARDEN-E-06): não é
  // sensível, e a lista precisa do valor para renderizar o número da ordem.
  'priority_order, ' +
  // 0050 — tag de prioridade manual. Decisão explícita (HARDEN-E-06): input
  // humano, nada sensível. Convive com `priority_level` (derivado do score).
  'priority_tag, ' +
  'score, priority_level';

/**
 * Whitelist para `opportunity_phases` — mesma motivação de HARDEN-E-06.
 */
const PHASE_COLUMNS =
  'id, opportunity_id, tenant_id, phase_key, ' +
  'started_at, finished_at, planned_start_at, planned_end_at, created_at, updated_at';

/**
 * Whitelist para `opportunity_risks` (0011) — mesma motivação de HARDEN-E-06
 * (sem `select('*')`). `priority` é trigger-set (set_risk_priority(), matriz
 * impacto×probabilidade) — leitura apenas, nunca input. Nenhuma coluna sensível.
 */
const RISK_COLUMNS =
  'id, opportunity_id, tenant_id, descricao, tipo, responsavel, ' +
  'impacto, probabilidade, status, resposta, descricao_impacto, ' +
  'priority, created_by, created_at, updated_at';

/**
 * Whitelist para `opportunity_tasks` (0037, Phase 16) — mesma motivação de
 * HARDEN-E-06 (sem `select('*')`). 14 colunas da migration; sem span/percentual
 * agregado (D-02 — rollup é sempre calculado em runtime, nunca lido daqui).
 */
const TASK_COLUMNS =
  'id, opportunity_id, tenant_id, parent_task_id, title, description, status, ' +
  // 0049 — tag de prioridade (input manual) + ordem manual. Nenhuma das duas é
  // derivada: continuam valendo o D-02 e a regra do score.
  'priority, priority_order, ' +
  'start_date, due_date, assignee_id, blocked_reason, created_by, created_at, updated_at';

/** Whitelist para `opportunity_documents` (v0.3, 0018). */
const DOCUMENT_COLUMNS =
  'id, opportunity_id, tenant_id, kind, nome, url, storage_path, tipo, ' +
  'size_bytes, created_by, created_at';

/** Whitelist para `opportunity_notes` (v0.3, 0018). */
const NOTE_COLUMNS =
  'id, opportunity_id, tenant_id, texto, created_by, created_at';

/** Whitelist para `opportunity_history` (v0.3, 0018) — append-only. */
const HISTORY_COLUMNS =
  'id, opportunity_id, tenant_id, resumo, comentario, changed_by, created_at';

/**
 * Busca todas as oportunidades visíveis pro tenant do usuário logado.
 * RLS filtra automaticamente — backend não precisa passar tenant_id.
 *
 * Aceita `filters` opcional pra busca/dropdown/sort vindos da toolbar.
 */
export async function fetchOpportunities(
  filters: OpportunityFilters = {}
): Promise<Opportunity[]> {
  const supabase = await createClient();
  let q = supabase.from('opportunities_with_score').select(OPPORTUNITY_COLUMNS);

  // Seletor de empresa (platform_admin) — tenant_id já resolvido pela page a
  // partir do slug em `?empresa=`. RLS aditiva (0021) permite platform_admin
  // ler qualquer tenant; para os demais roles isto é no-op (a RLS já os
  // restringe ao próprio tenant de qualquer forma).
  if (filters.tenant) q = q.eq('tenant_id', filters.tenant);

  // Soft-hide (0030): `visivel = false` some da listagem sem ser deletada. A
  // flag só é alterada via SQL — não há UI. Não é controle de acesso (isso é
  // RLS/tenant_id), é curadoria de listagem.
  q = q.eq('visivel', true);

  // Filtro "Membro" (0032): resolve os ids atribuídos ao profile e restringe a
  // lista. Nenhuma atribuição = nenhum resultado (não é o mesmo que "sem
  // filtro"), por isso o early return.
  if (filters.assignee) {
    const assigned = await fetchOpportunityIdsForAssignee(filters.assignee);
    if (assigned.length === 0) return [];
    q = q.in('id', assigned);
  }

  // Filtro "Cargo" (0031+0032): oportunidades com alguém daquele cargo. Mesma
  // semântica do filtro de membro — sem nenhuma, resultado vazio.
  if (filters.cargo) {
    const assigned = await fetchOpportunityIdsForCargo(filters.cargo);
    if (assigned.length === 0) return [];
    q = q.in('id', assigned);
  }

  if (filters.source) q = q.eq('source', filters.source);
  if (filters.area) q = q.eq('area', filters.area);
  // 0055 — o filtro passou a ser "contém a ferramenta X": uma oportunidade
  // com {rpa, sap} tem que aparecer tanto no filtro de RPA quanto no de SAP.
  if (filters.ferramenta) q = q.contains('ferramentas', [filters.ferramenta]);
  if (filters.priority) q = q.eq('priority_level', filters.priority);
  // 0050 — filtro pela tag MANUAL, independente do filtro por faixa de score
  // acima. `sem` recorta as ainda não classificadas.
  if (filters.priorityTag === 'sem') q = q.is('priority_tag', null);
  else if (filters.priorityTag) q = q.eq('priority_tag', filters.priorityTag);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.requestType) q = q.eq('request_type', filters.requestType);
  if (filters.segmento && filters.segmento !== 'todos') {
    q = q.in('status', SEGMENTO_STATUSES[filters.segmento]);
  }

  // Range de data de criação. `dateFrom` inclusivo (>= 00:00 do dia). `dateTo`
  // inclusivo cobrindo o dia inteiro: comparamos `< dia seguinte` para não
  // depender do horário/timezone do timestamptz (created_at).
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
  if (filters.dateTo) {
    const end = new Date(`${filters.dateTo}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt('created_at', end.toISOString().slice(0, 10));
  }

  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim().replace(/[%]/g, '\\%');
    q = q.or(
      `solicitante.ilike.%${term}%,processo.ilike.%${term}%,area.ilike.%${term}%`
    );
  }

  const sort = filters.sort ?? 'score_desc';
  switch (sort) {
    // 0049 — ordem manual montada pela pessoa. `nullsFirst: false` põe no fim
    // quem nunca foi posicionado (oportunidade recém-chegada não fura a fila);
    // `seq_id` desempata para a ordem ser estável entre renders.
    case 'manual_asc':
      q = q
        .order('priority_order', { ascending: true, nullsFirst: false })
        .order('seq_id', { ascending: true });
      break;
    // `nullsFirst: false` também aqui: quem nunca foi posicionado fica no fim
    // nas DUAS direções — a lista invertida não deve começar pelos sem ordem.
    case 'manual_desc':
      q = q
        .order('priority_order', { ascending: false, nullsFirst: false })
        .order('seq_id', { ascending: true });
      break;
    // 0050 — pela TAG manual. A ordem de declaração do enum `manual_priority`
    // é alta→media→baixa, então `ascending: true` já é "altas primeiro"; as
    // não classificadas (null) vão para o fim nas duas direções, e a ordem
    // manual desempata dentro de cada tag (duas "alta" ficam na fila que a
    // pessoa montou, em vez de saírem por seq_id).
    case 'tag_asc':
      q = q
        .order('priority_tag', { ascending: true, nullsFirst: false })
        .order('priority_order', { ascending: true, nullsFirst: false })
        .order('seq_id', { ascending: true });
      break;
    case 'tag_desc':
      q = q
        .order('priority_tag', { ascending: false, nullsFirst: false })
        .order('priority_order', { ascending: true, nullsFirst: false })
        .order('seq_id', { ascending: true });
      break;
    case 'score_asc':
      q = q.order('score', { ascending: true }).order('seq_id', { ascending: true });
      break;
    case 'fte_desc':
      q = q.order('fte_horas', { ascending: false, nullsFirst: false });
      break;
    case 'fte_asc':
      q = q.order('fte_horas', { ascending: true, nullsFirst: false });
      break;
    case 'seq_asc':
      q = q.order('seq_id', { ascending: true });
      break;
    case 'seq_desc':
      q = q.order('seq_id', { ascending: false });
      break;
    case 'nome_asc':
      q = q.order('solicitante', { ascending: true });
      break;
    case 'nome_desc':
      q = q.order('solicitante', { ascending: false });
      break;
    case 'area_asc':
      q = q.order('area', { ascending: true });
      break;
    case 'processo_asc':
      q = q.order('processo', { ascending: true });
      break;
    case 'status_asc':
      q = q.order('status', { ascending: true });
      break;
    case 'score_desc':
    default:
      q = q.order('score', { ascending: false }).order('seq_id', { ascending: true });
  }

  const { data, error } = await q.returns<Opportunity[]>();

  if (error) {
    throw new Error(`Erro ao buscar oportunidades: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Retorna lista DISTINCT de áreas para popular dropdown de filtro.
 *
 * `tenantId` (Phase 17, mesmo padrão de `fetchOpportunities`/`filters.tenant`)
 * — sem ele, staff PSW/platform_admin (RLS cross-tenant, 0021) via áreas de
 * TODAS as empresas misturadas no dropdown, mesmo com uma empresa específica
 * selecionada. Passar o tenant resolvido pela page recorta certo; para os
 * demais papéis é no-op (a RLS já os restringe ao próprio tenant).
 */
export async function fetchAreas(tenantId?: string): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase
    .from('opportunities')
    .select('area')
    // 0030 — não oferecer no filtro uma área que só existe em item oculto
    // (selecioná-la devolveria zero resultados).
    .eq('visivel', true);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q.order('area', { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar áreas: ${error.message}`);
  }

  const unique = new Set((data ?? []).map((r) => r.area).filter(Boolean));
  return Array.from(unique);
}

/**
 * Busca uma oportunidade por id. RLS filtra implicitamente.
 * Retorna null se não existir / não autorizado.
 */
export async function fetchOpportunityById(
  id: string
): Promise<Opportunity | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunities_with_score')
    .select(OPPORTUNITY_COLUMNS)
    .eq('id', id)
    .eq('visivel', true) // 0030 — oculta também no acesso direto por URL
    .maybeSingle()
    .returns<Opportunity>();

  if (error) {
    throw new Error(`Erro ao buscar oportunidade: ${error.message}`);
  }

  return data;
}

/**
 * Busca o histórico de fases de uma oportunidade.
 * RLS protege por tenant — não precisa passar tenant_id.
 */
export async function fetchPhasesForOpportunity(
  opportunityId: string
): Promise<OpportunityPhase[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_phases')
    .select(PHASE_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('started_at', { ascending: true })
    .returns<OpportunityPhase[]>();

  if (error) {
    throw new Error(`Erro ao buscar fases: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fases de VÁRIAS oportunidades (view Gantt). Uma query só via `in(...)`.
 * Retorna vazio se `ids` vazio (evita `in.()` inválido). RLS filtra por tenant.
 */
export async function fetchPhasesForOpportunities(
  ids: string[]
): Promise<OpportunityPhase[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_phases')
    .select(PHASE_COLUMNS)
    .in('opportunity_id', ids)
    .order('started_at', { ascending: true })
    .returns<OpportunityPhase[]>();

  if (error) {
    throw new Error(`Erro ao buscar fases: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Busca os riscos estruturados de uma oportunidade (`opportunity_risks`, 0011).
 * RLS protege por tenant — não precisa passar tenant_id.
 *
 * Ordenação: `created_at asc` no DB. O rank semântico de severidade
 * (`critica > alta > media > baixa`) NÃO é dado por `.order('priority')` —
 * ordenar pelo enum é alfabético (`alta, baixa, critica, media`), não por
 * severidade (Pitfall 6 da RESEARCH). Se a UI precisar ordenar por prioridade,
 * o Plan 12-02 aplica o rank no client.
 *
 * @param opportunityId id da oportunidade dona dos riscos.
 */
export async function fetchRisksForOpportunity(
  opportunityId: string
): Promise<OpportunityRisk[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .returns<OpportunityRisk[]>();

  if (error) {
    throw new Error(`Erro ao buscar riscos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Riscos de VÁRIAS oportunidades (view Relatório — painel de riscos agregado).
 * Uma query só via `in(...)`. Retorna vazio se `ids` vazio (evita `in.()`
 * inválido). RLS filtra por tenant. `priority` é trigger-set — leitura apenas.
 */
export async function fetchRisksForOpportunities(
  ids: string[]
): Promise<OpportunityRisk[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .in('opportunity_id', ids)
    .order('created_at', { ascending: true })
    .returns<OpportunityRisk[]>();

  if (error) {
    throw new Error(`Erro ao buscar riscos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Busca um risco por id (usado pela rota fullscreen de edição no Plan 12-02).
 * RLS filtra implicitamente. Retorna null se não existir / não autorizado.
 */
export async function fetchRiskById(
  riskId: string
): Promise<OpportunityRisk | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .eq('id', riskId)
    .maybeSingle()
    .returns<OpportunityRisk>();

  if (error) {
    throw new Error(`Erro ao buscar risco: ${error.message}`);
  }

  return data;
}

/**
 * Busca as tarefas (raiz + subtarefas) de uma oportunidade (`opportunity_tasks`,
 * 0037, Phase 16). RLS protege por tenant — não precisa passar tenant_id.
 *
 * Ordenação (0049): `priority_order asc` com `nulls last`, desempatado por
 * `created_at asc`. Enquanto ninguém arrastou nada, TODO `priority_order` é
 * null e o resultado é byte-a-byte o de antes (`created_at asc`) — a
 * numeração T001/T002 da UI-SPEC não muda em nenhuma oportunidade existente.
 * Depois do primeiro arrasto a ordem manual manda, e o rótulo passa a segui-la
 * (é o comportamento pedido: o número reflete a fila que a pessoa montou).
 * A ordenação por TAG de prioridade (alta→baixa) é aplicada no cliente, em
 * `sortTasks` — depende do agrupamento pai/filha, que só existe lá.
 */
export async function fetchTasksForOpportunity(
  opportunityId: string
): Promise<OpportunityTask[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_tasks')
    .select(TASK_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('priority_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .returns<OpportunityTask[]>();

  if (error) {
    throw new Error(`Erro ao buscar tarefas: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Versão em lote de `fetchTasksForOpportunity` — tarefas de VÁRIAS
 * oportunidades numa única query (Gantt do portfólio, que precisa expandir as
 * tarefas/subtarefas de cada linha sem N+1). MESMA ordenação da versão
 * single-id, para que a numeração T001/T001.1 seja idêntica à da Lista/Gantt
 * de uma oportunidade. RLS protege por tenant.
 */
export async function fetchTasksForOpportunities(
  ids: string[]
): Promise<OpportunityTask[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_tasks')
    .select(TASK_COLUMNS)
    .in('opportunity_id', ids)
    .order('priority_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .returns<OpportunityTask[]>();

  if (error) {
    throw new Error(`Erro ao buscar tarefas: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Busca uma tarefa por id (usado pelas rotas fullscreen de subtarefa/edição dos
 * planos seguintes). RLS filtra implicitamente — `null` no not-found E no
 * cross-tenant (IDOR, T-16-07): a rota converte em `notFound()`, nunca em erro
 * que revele existência.
 */
export async function fetchTaskById(
  taskId: string
): Promise<OpportunityTask | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .maybeSingle()
    .returns<OpportunityTask>();

  if (error) {
    throw new Error(`Erro ao buscar tarefa: ${error.message}`);
  }

  return data;
}

/**
 * Busca os documentos anexados a uma oportunidade (`opportunity_documents`, 0018).
 * RLS protege por tenant. Ordenados do mais recente pro mais antigo.
 */
export async function fetchDocumentsForOpportunity(
  opportunityId: string
): Promise<OpportunityDocument[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .returns<OpportunityDocument[]>();

  if (error) {
    throw new Error(`Erro ao buscar documentos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Busca as anotações de uma oportunidade (`opportunity_notes`, 0018).
 * RLS protege por tenant. Ordenadas do mais recente pro mais antigo.
 */
export async function fetchNotesForOpportunity(
  opportunityId: string
): Promise<OpportunityNote[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_notes')
    .select(NOTE_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .returns<OpportunityNote[]>();

  if (error) {
    throw new Error(`Erro ao buscar anotações: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Busca o histórico de alterações de uma oportunidade (`opportunity_history`,
 * 0018) — auditoria automática, append-only. RLS protege por tenant.
 * Ordenado do mais recente pro mais antigo (mesmo padrão da referência COPA).
 */
export async function fetchHistoryForOpportunity(
  opportunityId: string
): Promise<OpportunityHistoryEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('opportunity_history')
    .select(HISTORY_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .returns<OpportunityHistoryEntry[]>();

  if (error) {
    throw new Error(`Erro ao buscar histórico: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Calcula os KPIs a partir do array — opera em memória.
 */
export function computeKpis(opps: Opportunity[]): OpportunityKpis {
  // D-02: só os 3 status exibidos na KPI bar do mockup (_giba:296-305).
  // Status intermediários (em_analise/planejamento/...) são ignorados aqui.
  const byStatus = { novo: 0, producao: 0, concluido: 0 };
  const byPriority = { alta: 0, media: 0, baixa: 0 };
  // Esteira analítica: toda chave de status inicia em 0 (garante cards mesmo vazios).
  const byStage = Object.fromEntries(
    STATUS_ALL.map((s) => [s, 0]),
  ) as OpportunityKpis['byStage'];

  let totalScore = 0;
  let scoreCount = 0;
  let fteTotal = 0; // soma de fte_horas (null → 0) — KPI D-03/VIEW-01
  let emAnalise = 0; // card "Em Análise" da lista (v0.3)

  for (const o of opps) {
    fteTotal += o.fte_horas ?? 0;

    byStage[o.status]++;

    if (o.status === 'novo') byStatus.novo++;
    else if (o.status === 'producao') byStatus.producao++;
    else if (o.status === 'concluido') byStatus.concluido++;
    else if (o.status === 'em_analise') emAnalise++;

    if (o.priority_level === 'alta') byPriority.alta++;
    else if (o.priority_level === 'media') byPriority.media++;
    else if (o.priority_level === 'baixa') byPriority.baixa++;

    if (typeof o.score === 'number') {
      totalScore += o.score;
      scoreCount++;
    }
  }

  return {
    total: opps.length,
    emAnalise,
    scoreMedio: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    fteTotal: Math.round(fteTotal),
    byPriority,
    byStatus,
    byStage,
  };
}
