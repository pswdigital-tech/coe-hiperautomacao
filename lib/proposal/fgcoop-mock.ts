// lib/proposal/fgcoop-mock.ts
// =============================================================================
// Dados MOCK da proposta FGCoop — "CoE de Dados e Hiperautomação".
// Consolidado em duas visões:
//   1) Entregas por Fase  (Fundação + Fase 1/2/3) — narrativa executiva.
//   2) Frentes            — a tabela detalhada (processos, tech, horas, fase).
//
// MOCK-ONLY: enquanto não há geração real de proposta, os números são
// estáticos e servem só à empresa FGCoop (slug `fgcoop`). Qualquer outra
// empresa cai no empty state "nenhuma proposta gerada ainda".
// =============================================================================

export const PROPOSAL_SLUG = 'fgcoop';

/** Cabeçalho / metadados da proposta. */
export const proposalMeta = {
  cliente: 'FGCoop',
  titulo: 'CoE de Dados e Hiperautomação — Entregas por Fase',
  descricao:
    'Cada onda começa com o analista de requisitos refinando o escopo com a área antes da construção. Programa total estimado em cerca de 3.400h.',
  programaHoras: 3400,
} as const;

export type Phase = {
  key: string;
  titulo: string;
  periodo: string;
  /** Cor de destaque do cabeçalho do card. */
  cor: string;
  frentes: string;
  oQueFaz: string;
  oQueResolve: string;
  tempoEstimado: string;
};

/** Entregas por Fase (imagem "Entregas por Fase"). */
export const phases: Phase[] = [
  {
    key: 'fundacao',
    titulo: 'Fundação da Plataforma',
    periodo: 'ago a out/2026',
    cor: '#1e293b',
    frentes: 'Base técnica que sustenta todas as ondas.',
    oQueFaz:
      'Monta o ambiente de dados governado no Databricks (catálogos separados de desenvolvimento e produção isolada), versionamento e esteira de deploy com Git e CI/CD, ingestão de arquivos das áreas via S3, corte controlado para produção e os três ambientes do Power Platform.',
    oQueResolve:
      'Hoje não existe separação entre teste e produção, nem versionamento, nem controle de acesso por grupo. A fundação cria a base confiável e auditável sobre a qual toda automação passa a rodar com segurança.',
    tempoEstimado: 'Cerca de 1.156h. Requisitos no início, depois construção.',
  },
  {
    key: 'fase1',
    titulo: 'Fase 1 · Ganhos Rápidos',
    periodo: 'ago a out/2026',
    cor: '#1c3f8f',
    frentes:
      'Prazos e planos de ação (F1), Verificação de terceiros (F3), Atas de reunião (F4).',
    oQueFaz:
      'Acompanha prazos normativos e planos de ação com alertas e escalação automática; verifica fornecedores em bases públicas de sanção com relatório em semáforo; transcreve, redige e publica atas de reunião.',
    oQueResolve:
      'Acaba com o risco de perder prazo regulatório, tira a verificação manual de fornecedor (de horas para minutos) e elimina a redação manual de atas.',
    tempoEstimado:
      'Cerca de 452h. Não depende da produção, entrega valor já nos primeiros meses.',
  },
  {
    key: 'fase2',
    titulo: 'Fase 2 · Automação sobre a Produção',
    periodo: 'nov a dez/2026',
    cor: '#1e293b',
    frentes:
      'Entrada de NF e contas a pagar (F5), Conferência de folha e obrigações (F6), Bases e dashboards (F7).',
    oQueFaz:
      'Lê a nota fiscal, valida e lança no Protheus; concilia a folha contra eSocial e impostos apontando divergências; atualiza as bases dos dashboards de forma automática e validada.',
    oQueResolve:
      'Elimina o lançamento manual de NF (3 a 4h por dia), a conferência manual de folha (uma semana por mês) e o dado desatualizado na hora da decisão.',
    tempoEstimado:
      'Cerca de 900h. Roda depois da produção estar cortada e populada, por isso arranca em novembro.',
  },
  {
    key: 'fase3',
    titulo: 'Fase 3 · Roadmap 2027',
    periodo: 'a partir de jan/2027',
    cor: '#b45309',
    frentes:
      'Base normativa com agente de IA (F8), Assistência Financeira (F9), Risco de cooperativas (F10).',
    oQueFaz:
      'Agente de IA que consulta e monitora normas e gera minutas; digitaliza o fluxo de Assistência Financeira às cooperativas com checklists e rastreabilidade; pipeline de dados e modelo de classificação de risco das cooperativas.',
    oQueResolve:
      'Monitoramento normativo contínuo e minutas mais rápidas; ciclo de Assistência Financeira de meses para semanas; classificação de risco consistente e auditável, sem depender de pessoa-chave.',
    tempoEstimado:
      'Cerca de 904h. Executada em 2027 por depender da plataforma e das ondas anteriores já estabilizadas.',
  },
];

export type FrenteRow = {
  num: number;
  /** Processos consolidados (nomes dos pedidos), como na Planilha1. */
  processos: string[];
  areas: string[];
  qtd: number;
  /** No compromisso do programa? (S/N na planilha) */
  noEscopo: boolean;
  databricks: string;
  powerAutomate: string;
  n8n: string;
  dependencia: string;
  hDados: number;
  hAutom: number;
  hRequis: number;
  hRefin: number;
  hTotal: number;
  /** Fase da planilha: '1' | '2' | '3' | '2027'. */
  fase: string;
  /** Datas (Início req. / Início constr.), formato dd/mm/aaaa. */
  iniReq: string;
  iniConstr: string;
};

/**
 * As 10 frentes — espelham a Planilha1 de _____essa_aqui.xlsx exatamente.
 * As colunas "Ganho h/ano" e "H Build calc" foram omitidas: naquela planilha
 * são fórmulas quebradas (#REF! / referência externa), sem valor real.
 */
export const frentes: FrenteRow[] = [
  {
    num: 1,
    processos: [
      '1. Acompanhamento de Projetos do Planejamento Estratégico',
      '4. Acompanhamento de Prazos (Normativos e Planos de Ação)',
      '17. Gestão de Riscos Corporativos',
    ],
    areas: ['Riscos e Compliance'],
    qtd: 3,
    noEscopo: true,
    databricks: 'Só se cruzar indicador',
    powerAutomate: 'Lista SharePoint, fluxo agendado, D-30/15/7/0, card no Teams, escalação',
    n8n: 'Não',
    dependencia: '—',
    hDados: 0, hAutom: 80, hRequis: 24, hRefin: 24, hTotal: 128,
    fase: '1', iniReq: '01/08/2026', iniConstr: '15/08/2026',
  },
  {
    num: 2,
    processos: ['26. Engenharia de Dados: transformação nativa e orquestração de pipelines'],
    areas: ['Gerência de Modelagem e Monitoramento'],
    qtd: 1,
    noEscopo: true,
    databricks: 'Tudo: ingestão S3, transformação nativa (Lakeflow) e Workflows',
    powerAutomate: 'Não entra',
    n8n: 'Não. Divergência com o pedido',
    dependencia: '—',
    hDados: 0, hAutom: 0, hRequis: 0, hRefin: 0, hTotal: 0,
    fase: '2', iniReq: '01/09/2026', iniConstr: '15/09/2026',
  },
  {
    num: 3,
    processos: [
      '3. Cadastro de Fornecedor no ERP Protheus',
      '14. Due Diligence para Contratações',
      '24. Verificação de Fornecedores (Compliance)',
    ],
    areas: ['Administrativo Financeiro', 'Gerência Jurídica', 'Riscos e Compliance'],
    qtd: 3,
    noEscopo: true,
    databricks: 'Histórico auditável, dimensão fornecedor, sanção em SCD2',
    powerAutomate: 'HTTP nas bases públicas, relatório com semáforo, preenche Protheus',
    n8n: 'Condicional: fonte com certificado ou scraping',
    dependencia: 'Limite das APIs públicas',
    hDados: 40, hAutom: 120, hRequis: 24, hRefin: 40, hTotal: 224,
    fase: '2', iniReq: '08/09/2026', iniConstr: '22/09/2026',
  },
  {
    num: 4,
    processos: [
      '6. Redigir Ata de Reunião',
      '19. Automação de Governança e Gestão de Atas',
    ],
    areas: ['Coordenação de Governança', 'Governança Corporativa'],
    qtd: 2,
    noEscopo: true,
    databricks: 'Não entra',
    powerAutomate: 'Graph pega transcrição, Copilot gera, fluxo aprova e publica',
    n8n: 'Condicional: publicar no Atlas',
    dependencia: 'Transcript API habilitada',
    hDados: 0, hAutom: 60, hRequis: 24, hRefin: 16, hTotal: 100,
    fase: '2', iniReq: '15/09/2026', iniConstr: '29/09/2026',
  },
  {
    num: 5,
    processos: [
      '5. Automação de NFs e Acompanhamento de Investimentos',
      '12. Inclusão de Notas Fiscais no Protheus',
      '23. Hiperautomação – Contas a Pagar',
    ],
    areas: ['Administrativo', 'Administrativo/Financeiro', 'Financeiro'],
    qtd: 3,
    noEscopo: true,
    databricks: 'NF estruturada em bronze/silver, gold do dashboard',
    powerAutomate: 'Gatilho Outlook, parse XML, AI Builder no PDF, validação, aprovação, lança Protheus',
    n8n: 'Não',
    dependencia: 'API do Protheus',
    hDados: 60, hAutom: 200, hRequis: 32, hRefin: 56, hTotal: 348,
    fase: '3', iniReq: '01/11/2026', iniConstr: '15/11/2026',
  },
  {
    num: 6,
    processos: [
      '8. Automação RH: Folha, Relatórios e Aprovações',
      '11. Automação Contábil: Conciliações e Fechamento',
      '13. Conferências de Folha, Impostos e eSocial',
      '27. Controles e Gerações Automáticas (Contabilidade)',
    ],
    areas: [
      'Administrativa Financeiro',
      'Administrativo/Financeiro',
      'Gestão de Pessoas',
      'Gestão de Pessoas e Comunicação',
    ],
    qtd: 4,
    noEscopo: true,
    databricks: 'É o motor: ingestão, conformação, regra nativa no Lakeflow, gold de divergência',
    powerAutomate: 'Alerta de divergência no Teams',
    n8n: 'Provável: ponte do eSocial',
    dependencia: 'Extração eSocial e Ahgora',
    hDados: 160, hAutom: 80, hRequis: 32, hRefin: 56, hTotal: 328,
    fase: '3', iniReq: '01/11/2026', iniConstr: '15/11/2026',
  },
  {
    num: 7,
    processos: [
      '2. Atualização de Ficha Gráfica das Cooperativas',
      '7. Automação de Contribuições e Orçamento',
      '20. Atualização de Bases para Dashboards',
    ],
    areas: ['Administrativo Financeiro', 'Administrativo/Financeiro', 'Operações e Relacionamento'],
    qtd: 3,
    noEscopo: true,
    databricks: 'Tudo até a gold',
    powerAutomate: 'Dispara refresh, valida, alerta, distribui',
    n8n: 'Não',
    dependencia: 'Frente 2',
    hDados: 120, hAutom: 40, hRequis: 24, hRefin: 40, hTotal: 224,
    fase: '3', iniReq: '15/11/2026', iniConstr: '29/11/2026',
  },
  {
    num: 8,
    processos: [
      '10. Automação Jurídica e Monitoramento Normativo',
      '16. Repositório de Documentos Institucionais',
      '18. Proposição Normativa – Consulta via IA',
      '21. Monitoramento de Normas e Regulações',
    ],
    areas: ['Gerência Jurídica', 'Riscos e Compliance'],
    qtd: 4,
    noEscopo: false,
    databricks: 'Não entra',
    powerAutomate: 'SharePoint como GED, Copilot Studio como agente',
    n8n: 'Sim: captura no BCB e DOU',
    dependencia: 'Licença de Copilot Studio',
    hDados: 0, hAutom: 160, hRequis: 32, hRefin: 32, hTotal: 224,
    fase: '2027', iniReq: '04/01/2027', iniConstr: '18/01/2027',
  },
  {
    num: 9,
    processos: ['28. Assistência Financeira às Cooperativas'],
    areas: ['Operações e Relacionamento'],
    qtd: 1,
    noEscopo: false,
    databricks: 'Painel e dado da cooperativa',
    powerAutomate: 'SharePoint, checklist, coleta, aprovação',
    n8n: 'Não',
    dependencia: 'Dono de processo',
    hDados: 60, hAutom: 240, hRequis: 40, hRefin: 56, hTotal: 396,
    fase: '2027', iniReq: '04/01/2027', iniConstr: '18/01/2027',
  },
  {
    num: 10,
    processos: [
      '15. Estruturação de Dados não Estruturados e APIs',
      '29. Classificação de Riscos de Cooperativas',
    ],
    areas: ['Gerência de Modelagem e Monitoramento', 'Operações e Relacionamento'],
    qtd: 2,
    noEscopo: false,
    databricks: 'Tudo: pipeline, feature, modelo, MLflow',
    powerAutomate: 'Alerta',
    n8n: 'Não',
    dependencia: 'Frente 2',
    hDados: 200, hAutom: 20, hRequis: 24, hRefin: 40, hTotal: 284,
    fase: '2027', iniReq: '18/01/2027', iniConstr: '01/02/2027',
  },
];

/** Totais da tabela de Frentes (linha TOTAL da Planilha1). */
export const frentesTotals = {
  qtd: 26,
  hDados: 640,
  hAutom: 1000,
  hRequis: 256,
  hRefin: 360,
  hTotal: 2256,
} as const;

// ── Cronograma / Gantt ──────────────────────────────────────────────────────
// A Planilha1 tem Início req. e Início constr. (marcos reais), mas NÃO tem data
// de fim nem % de avanço. Então:
//   • `fim` é uma ESTIMATIVA de janela de construção, coerente com cada fase.
//   • `progresso` é placeholder (0%) — o programa começa em ago/2026. É aqui que
//     um tracking real (ex. status das oportunidades) se conecta depois.

export type GanttRow = {
  num: number;
  /** Rótulo curto da frente para o eixo do Gantt. */
  label: string;
  fase: string;
  /** Início dos requisitos (marco real da planilha). */
  iniReq: string;
  /** Início da construção (marco real da planilha). */
  iniConstr: string;
  /** Fim estimado da construção (não está na planilha). */
  fim: string;
  /** Avanço 0–100 (placeholder até haver tracking real). */
  progresso: number;
  noEscopo: boolean;
};

export const gantt: GanttRow[] = [
  { num: 1, label: 'Prazos, planos de ação e riscos', fase: '1', iniReq: '01/08/2026', iniConstr: '15/08/2026', fim: '30/09/2026', progresso: 0, noEscopo: true },
  { num: 2, label: 'Fundação: ingestão S3 e orquestração', fase: '2', iniReq: '01/09/2026', iniConstr: '15/09/2026', fim: '31/10/2026', progresso: 0, noEscopo: true },
  { num: 3, label: 'Motor de verificação de terceiros', fase: '2', iniReq: '08/09/2026', iniConstr: '22/09/2026', fim: '31/10/2026', progresso: 0, noEscopo: true },
  { num: 4, label: 'Atas de reunião', fase: '2', iniReq: '15/09/2026', iniConstr: '29/09/2026', fim: '31/10/2026', progresso: 0, noEscopo: true },
  { num: 5, label: 'Entrada de NF e contas a pagar', fase: '3', iniReq: '01/11/2026', iniConstr: '15/11/2026', fim: '31/12/2026', progresso: 0, noEscopo: true },
  { num: 6, label: 'Conferência de folha e obrigações', fase: '3', iniReq: '01/11/2026', iniConstr: '15/11/2026', fim: '31/12/2026', progresso: 0, noEscopo: true },
  { num: 7, label: 'Bases e dashboards', fase: '3', iniReq: '15/11/2026', iniConstr: '29/11/2026', fim: '31/12/2026', progresso: 0, noEscopo: true },
  { num: 8, label: 'Base normativa com agente de IA', fase: '2027', iniReq: '04/01/2027', iniConstr: '18/01/2027', fim: '31/03/2027', progresso: 0, noEscopo: false },
  { num: 9, label: 'Assistência Financeira', fase: '2027', iniReq: '04/01/2027', iniConstr: '18/01/2027', fim: '31/03/2027', progresso: 0, noEscopo: false },
  { num: 10, label: 'Risco de cooperativas', fase: '2027', iniReq: '18/01/2027', iniConstr: '01/02/2027', fim: '31/03/2027', progresso: 0, noEscopo: false },
];

/** "Hoje" — marcador no Gantt. Fixo (o ambiente não permite Date.now()). */
export const ganttToday = '20/07/2026';
