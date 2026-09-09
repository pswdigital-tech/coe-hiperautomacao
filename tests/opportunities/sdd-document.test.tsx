// =============================================================================
// sdd-document.test.tsx — o template do SDD RENDERIZA de verdade
//
// Por que um teste que só olha bytes vale a pena: `next build` compila o
// template mas nunca o EXECUTA, e quase tudo que quebra num PDF quebra em
// tempo de layout — estilo que o @react-pdf não entende, `Text` faltando em
// volta de uma string, valor nulo chegando onde o layout esperava número.
// Sem esta spec, a primeira execução do template acontece no clique de uma
// pessoa gerando um documento para cliente.
//
// O caso do MÍNIMO é o mais importante dos três: uma oportunidade recém
// registrada tem quase tudo nulo, e é exatamente nela que alguém vai clicar
// em "Gerar SDD" primeiro.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { SddDocument } from '@/lib/opportunities/sdd/document';
import type { SddData } from '@/lib/opportunities/sdd/data';
import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityTask,
} from '@/lib/opportunities/types';

const PDF_MAGIC = '%PDF-';

/** Oportunidade com o mínimo absoluto — o estado de "acabou de ser registrada". */
function minimalOpportunity(): Opportunity {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    seq_id: 42,
    source: 'formulario',
    request_type: 'nova_oportunidade',
    parent_opportunity_id: null,
    solicitante: 'Fulano de Tal',
    email: null,
    area: 'Financeiro',
    subarea: null,
    processo: 'Conciliação bancária',
    frequencia: null,
    volume_medio: null,
    tempo_execucao: null,
    num_pessoas: null,
    ferramenta: null,
    ferramentas: [],
    escopo_automacao: [],
    beneficios_esperados: [],
    esforco: null,
    complexidade: null,
    tempo: null,
    objetivo: null,
    objetivo_projeto: null,
    fora_escopo: [],
    criterios_aceite: [],
    premissas: [],
    restricoes: [],
    status: 'novo',
    responsavel: null,
    notas: null,
    observacao: null,
    risco: null,
    visivel: true,
    priority_order: null,
    priority_tag: null,
    fte_horas: null,
    fonte: null,
    tipo_processo: [],
    beneficio_qualitativo: null,
    criterios: null,
    beneficios: null,
    fte: null,
    rpa_score: null,
    ai_enrichment_status: 'pending',
    ai_enrichment_error: null,
    ai_enriched_at: null,
    persona_extras: null,
    formulario_extras: null,
    criticidade: null,
    azure_boards_codigo: null,
    linguagem: null,
    execucao: null,
    usuarios_servico: null,
    execucoes_mes: null,
    data_conclusao: null,
    data_abertura_coe: null,
    data_fechamento_coe: null,
    created_by: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    score: 0,
    priority_level: 'baixa',
  } as Opportunity;
}

/** A mesma oportunidade, agora com todas as seções preenchidas. */
function fullOpportunity(): Opportunity {
  return {
    ...minimalOpportunity(),
    subarea: 'Contas a pagar',
    email: 'fulano@empresa.com.br',
    objetivo_projeto:
      'Eliminar a conciliação manual de extratos, hoje feita por duas pessoas todo dia útil.',
    frequencia: 'Diária',
    volume_medio: '300 lançamentos',
    tempo_execucao: '2h',
    num_pessoas: '2',
    execucoes_mes: 22,
    criticidade: 'alta',
    ferramentas: ['rpa', 'n8n'],
    escopo_automacao: ['Baixar extrato do portal', 'Conciliar com o ERP'],
    fora_escopo: ['Integração com o sistema legado de crédito'],
    criterios_aceite: ['Conciliação concluída em até 10 minutos'],
    premissas: ['Acesso ao portal do banco liberado até 01/09'],
    restricoes: ['Execução apenas fora do horário comercial'],
    beneficios_esperados: ['Redução de 80% no tempo de fechamento'],
    beneficio_qualitativo: 'Time deixa de fazer hora extra no fechamento do mês.',
    fte_horas: 44,
    fte: 'alto',
    esforco: 'medio',
    complexidade: 'medio',
    tempo: 'diario',
    objetivo: 4,
    rpa_score: 5,
    score: 78,
    priority_level: 'alta',
    status: 'desenvolvimento',
    data_abertura_coe: '2026-07-15',
    criterios: {
      causaReclamacoes: 'sim',
      totalmenteManual: 'sim',
      regrasClaras: 'sim',
      decisaoHumana: 'nao',
      padronizacaoDocs: 'parcial',
      validacaoDados: 'sim',
      schedulable: 'sim',
      temDocumentacao: 'nao',
    },
    beneficios: {
      reducaoTempo: 5,
      eliminacaoErros: 4,
      produtividade: 5,
      qualidadeDados: 3,
      reducaoCustos: 4,
      reducaoRetrabalho: 4,
      compliance: 2,
      objetivosEstrategicos: 3,
    },
    formulario_extras: {
      gatilho: 'horario',
      formato_entrada: 'misto',
      dados_sensiveis: 'sim',
      sistemas: 'Portal do Banco, ERP Protheus',
      descricao: 'Todo dia às 8h alguém baixa o extrato e confere lançamento a lançamento.',
      dor: 'Erro de digitação gera divergência que só aparece no fechamento.',
    },
  } as Opportunity;
}

function phases(): OpportunityPhase[] {
  return [
    {
      id: 'p1',
      opportunity_id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      phase_key: 'desenvolvimento',
      started_at: '2026-08-01',
      finished_at: null,
      planned_start_at: '2026-08-01',
      planned_end_at: '2026-09-30',
      created_at: '2026-07-15T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z',
    } as OpportunityPhase,
  ];
}

function risks(): OpportunityRisk[] {
  return [
    {
      id: 'r1',
      opportunity_id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      descricao: 'Portal do banco pode mudar o layout sem aviso',
      tipo: 'risco',
      responsavel: 'PSW',
      impacto: 'alto',
      probabilidade: 'possivel',
      status: 'novo',
      resposta: 'Monitorar e manter seletor configurável.',
      descricao_impacto: 'Automação para de rodar até adaptação.',
      priority: 'alta',
      created_by: null,
      created_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z',
    } as OpportunityRisk,
  ];
}

function tasks(): OpportunityTask[] {
  return [
    {
      id: 't1',
      opportunity_id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      parent_task_id: null,
      title: 'Mapear o fluxo do portal',
      description: null,
      status: 'em_andamento',
      priority: 'alta',
      priority_order: null,
      start_date: '2026-08-10',
      due_date: '2026-08-28',
      assignee_id: null,
      blocked_reason: null,
      created_by: null,
      created_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z',
    } as OpportunityTask,
  ];
}

function bundle(opportunity: Opportunity, cheio: boolean): SddData {
  return {
    opportunity,
    phases: cheio ? phases() : [],
    risks: cheio ? risks() : [],
    tasks: cheio ? tasks() : [],
    tenantName: cheio ? 'Empresa Exemplo' : null,
    brandColor: cheio ? '#0f766e' : null,
    geradoPor: 'Ciclana da Silva',
    geradoEm: '2026-08-20T14:35:00.000Z',
    versao: cheio ? 3 : 1,
    // Vazio de propósito no caso mínimo: exercita o fallback do seed de
    // `toolLabel`, que é o caminho real quando a empresa não cadastrou
    // ferramenta própria.
    toolCatalog: [],
  };
}

describe('SddDocument — renderização', () => {
  it('renderiza uma oportunidade sem quase nenhum dado preenchido', async () => {
    const buf = await renderToBuffer(
      <SddDocument data={bundle(minimalOpportunity(), false)} />
    );
    expect(buf.subarray(0, 5).toString('latin1')).toBe(PDF_MAGIC);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it('renderiza uma oportunidade com todas as seções preenchidas', async () => {
    const buf = await renderToBuffer(
      <SddDocument data={bundle(fullOpportunity(), true)} />
    );
    expect(buf.subarray(0, 5).toString('latin1')).toBe(PDF_MAGIC);
    // O documento cheio tem mais conteúdo que o mínimo — se os dois saíssem do
    // mesmo tamanho, seria sinal de que o template está ignorando os dados.
    const minimo = await renderToBuffer(
      <SddDocument data={bundle(minimalOpportunity(), false)} />
    );
    expect(buf.byteLength).toBeGreaterThan(minimo.byteLength);
  });

  it('aceita acento pt-BR sem quebrar a fonte padrão', async () => {
    const o = fullOpportunity();
    o.processo = 'Conciliação de operações — ação, çedilha, ãõéíú';
    const buf = await renderToBuffer(<SddDocument data={bundle(o, true)} />);
    expect(buf.subarray(0, 5).toString('latin1')).toBe(PDF_MAGIC);
  });
});
