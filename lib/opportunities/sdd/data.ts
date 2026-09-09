import 'server-only';

// =============================================================================
// sdd/data.ts — o pacote de dados do Documento de Desenho da Solução
// -----------------------------------------------------------------------------
// Uma função só, `buildSddData`, que junta tudo o que o PDF imprime. Existe
// separada do template (`document.tsx`) e da action (`actions.ts`) por um
// motivo prático: o template não deve saber de Supabase, e a action não deve
// saber de layout. No meio fica este arquivo, que é o único que conhece as
// duas pontas.
//
// TUDO É RELIDO DO SERVIDOR. A action recebe só o `opportunityId` do cliente;
// nada do conteúdo do documento vem do navegador. Um payload de cliente aqui
// seria a maneira mais direta de imprimir dados de outra empresa num PDF
// entregue ao cliente errado — a RLS protege a leitura, mas só se a leitura
// de fato acontecer no servidor.
//
// O QUE ESTE ARQUIVO NÃO FAZ: não decide se pode gerar (é gate de action) nem
// numera a versão (é a action, que precisa da corrida com o índice único da
// 0065). Aqui é leitura pura.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  fetchOpportunityById,
  fetchPhasesForOpportunity,
  fetchRisksForOpportunity,
  fetchTasksForOpportunity,
} from '../queries';
import { fetchTenantBranding } from '@/lib/branding/queries';
import { listAutomationTools } from '../tools-actions';
import type { AutomationToolOption } from '../tools';
import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityTask,
} from '../types';

/** Tipo do documento gerado. Espelha o CHECK `opportunity_documents_gerado_chk` (0065). */
export const SDD_GERADO_TIPO = 'sdd';

export type SddData = {
  opportunity: Opportunity;
  phases: OpportunityPhase[];
  risks: OpportunityRisk[];
  tasks: OpportunityTask[];
  /** Nome da empresa dona — impresso na capa. */
  tenantName: string | null;
  /** Cor da marca (0033), usada nos títulos. Cai no azul institucional se null. */
  brandColor: string | null;
  /** Quem clicou em gerar. Vai na capa, no bloco de controle de versão. */
  geradoPor: string;
  /** ISO da geração. Carimbado pela action, não por `new Date()` no template. */
  geradoEm: string;
  /** Número da versão desta emissão (1..N). Resolvido pela action. */
  versao: number;
  /**
   * Catálogo de ferramentas do tenant, para `toolLabel` imprimir "RPA" e "n8n"
   * em vez de "Rpa" e "N8n". Sem ele o fallback do seed ainda acerta as cinco
   * ferramentas-base, mas erra qualquer ferramenta que a empresa cadastrou.
   */
  toolCatalog: AutomationToolOption[];
};

/**
 * Lê tudo o que o SDD imprime, para UMA oportunidade.
 *
 * Devolve `null` quando a oportunidade não existe OU quando a RLS a esconde de
 * quem chamou — os dois casos são indistinguíveis daqui de propósito, e é o
 * comportamento correto: quem não pode ver não deve saber que existe.
 */
export async function buildSddData(
  opportunityId: string,
  meta: { geradoPor: string; geradoEm: string; versao: number }
): Promise<SddData | null> {
  const opportunity = await fetchOpportunityById(opportunityId);
  if (!opportunity) return null;

  const [phases, risks, tasks, branding, tenantName, toolCatalog] = await Promise.all([
    fetchPhasesForOpportunity(opportunityId),
    fetchRisksForOpportunity(opportunityId),
    fetchTasksForOpportunity(opportunityId),
    fetchTenantBranding(opportunity.tenant_id),
    fetchTenantName(opportunity.tenant_id),
    listAutomationTools(),
  ]);

  return {
    opportunity,
    phases,
    risks,
    tasks,
    tenantName,
    brandColor: branding.brandColor,
    toolCatalog,
    ...meta,
  };
}

/**
 * Nome da empresa dona da oportunidade. Direto, e não via
 * `fetchTenantsByIds`, porque aqui interessa UM tenant e o custo de um erro é
 * só a capa sair sem o nome — por isso não lança: identidade visual e rótulo
 * não valem derrubar a geração de um documento inteiro.
 */
async function fetchTenantName(tenantId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data) return null;
  return data.name;
}

// =============================================================================
// Estado do SDD no detalhe — alimenta os TRÊS estados do botão (passo 4)
// =============================================================================

export type SddState = {
  /** A versão mais recente já emitida, ou null se nunca foi gerado. */
  latest: {
    documentId: string;
    versao: number;
    nome: string;
    storagePath: string;
    geradoEm: string;
  } | null;
  /**
   * `true` quando algum dado-fonte do documento mudou DEPOIS da última
   * emissão. É o que transforma "Gerar novamente" de botão que a pessoa
   * precisa lembrar de apertar em aviso que aparece sozinho.
   */
  desatualizado: boolean;
  /** Quando a fonte mudou pela última vez (ISO). Null se nunca gerado. */
  dadosAlteradosEm: string | null;
};

/**
 * Resolve o estado do SDD de uma oportunidade.
 *
 * A DETECÇÃO DE DESATUALIZADO compara o `created_at` da última versão com o
 * `updated_at` mais recente das TRÊS fontes que o documento imprime:
 * `opportunities`, `opportunity_risks` e `opportunity_phases`. Olhar só a
 * oportunidade cobriria a maior parte do conteúdo e deixaria passar
 * exatamente as duas seções que mais mudam depois da primeira emissão —
 * riscos e cronograma.
 *
 * `opportunity_tasks` fica FORA da conta de propósito: tarefa muda de status
 * várias vezes por dia, e o documento só imprime as próximas entregas. Incluí-la
 * deixaria o aviso permanentemente aceso, e um aviso sempre aceso não é aviso.
 */
export async function fetchSddState(opportunityId: string): Promise<SddState> {
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from('opportunity_documents')
    .select('id, nome, storage_path, gerado_versao, created_at')
    .eq('opportunity_id', opportunityId)
    .eq('gerado_tipo', SDD_GERADO_TIPO)
    .order('gerado_versao', { ascending: false })
    .limit(1);

  const row = docs?.[0];
  if (!row || row.storage_path == null || row.gerado_versao == null) {
    return { latest: null, desatualizado: false, dadosAlteradosEm: null };
  }

  const latest = {
    documentId: row.id,
    versao: row.gerado_versao,
    nome: row.nome,
    storagePath: row.storage_path,
    geradoEm: row.created_at,
  };

  const alteradoEm = await latestSourceChange(opportunityId);
  return {
    latest,
    desatualizado: alteradoEm != null && alteradoEm > latest.geradoEm,
    dadosAlteradosEm: alteradoEm,
  };
}

/** O `updated_at` mais recente entre oportunidade, riscos e fases. */
async function latestSourceChange(opportunityId: string): Promise<string | null> {
  const supabase = await createClient();

  const [opp, risks, phases] = await Promise.all([
    supabase
      .from('opportunities')
      .select('updated_at')
      .eq('id', opportunityId)
      .maybeSingle(),
    supabase
      .from('opportunity_risks')
      .select('updated_at')
      .eq('opportunity_id', opportunityId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('opportunity_phases')
      .select('updated_at')
      .eq('opportunity_id', opportunityId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  const candidatos = [
    opp.data?.updated_at,
    risks.data?.[0]?.updated_at,
    phases.data?.[0]?.updated_at,
  ].filter((v): v is string => typeof v === 'string');

  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (a > b ? a : b));
}
