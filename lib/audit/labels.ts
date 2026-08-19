import type { Json } from '@/lib/database.types';

// =============================================================================
// labels.ts — tradução do log cru para pt-BR legível
// -----------------------------------------------------------------------------
// A trigger `audit_trigger()` (0038) grava nomes de coluna e valores de enum
// como estão no banco (inglês/snake_case). Quem lê a tela de log é o admin da
// empresa, não um DBA — então tudo que aparece na UI passa por aqui.
//
// Campo sem rótulo mapeado cai no fallback `humanize()` (snake_case → "Snake
// case"): uma coluna nova nasce legível sem virar `undefined` na tela.
// =============================================================================

export const TABLE_LABEL: Record<string, string> = {
  opportunities: 'Oportunidade',
  opportunity_tasks: 'Tarefa',
  opportunity_risks: 'Risco',
  opportunity_notes: 'Anotação',
  opportunity_documents: 'Documento',
  opportunity_assignees: 'Responsável',
  // `opportunity_phases` NÃO entra aqui de propósito: não é auditada (0038 §3 —
  // é derivada de opportunities.status). Incluí-la só criaria uma opção no
  // filtro da tela de log que nunca devolve nada.
  profiles: 'Usuário',
  invited_emails: 'Convite',
  tenants: 'Empresa',
};

export const ACTION_LABEL = {
  insert: 'Criou',
  update: 'Editou',
  delete: 'Excluiu',
} as const;

/**
 * Rótulos de coluna. Chaves repetidas entre tabelas (`status`, `descricao`)
 * compartilham o rótulo de propósito — o contexto vem da coluna "Registro".
 * Os nomes espelham `SCALAR_FIELDS` de lib/opportunities/history.ts para que a
 * aba Histórico não mude de vocabulário ao migrar para o log novo.
 */
export const FIELD_LABEL: Record<string, string> = {
  // opportunities
  solicitante: 'Solicitante',
  email: 'E-mail',
  area: 'Área',
  subarea: 'Subárea',
  processo: 'Processo',
  frequencia: 'Frequência',
  volume_medio: 'Número de Execuções',
  tempo_execucao: 'Tempo de Execução',
  num_pessoas: 'Pessoas Envolvidas',
  ferramentas: 'Ferramentas',
  // 0055 — derivada de `ferramentas` pelo trigger. Aparece no histórico junto
  // da mudança que a causou; o rótulo distingue as duas linhas.
  ferramenta: 'Ferramenta (legado)',
  responsavel: 'Responsável',
  criticidade: 'Criticidade',
  azure_boards_codigo: 'Código Azure Boards',
  linguagem: 'Linguagem',
  execucao: 'Execução',
  usuarios_servico: 'Usuários de Serviço',
  execucoes_mes: 'Execuções/mês',
  data_conclusao: 'Data de Conclusão',
  beneficio_qualitativo: 'Benefício Qualitativo',
  objetivo_projeto: 'Objetivo do Projeto', // 0061
  fora_escopo: 'Fora do escopo',
  criterios_aceite: 'Critérios de aceite',
  fte_horas: 'FTE (h/mês)',
  fte: 'Faixa de FTE',
  criterios: 'Critérios',
  beneficios: 'Benefícios',
  escopo_automacao: 'Escopo da automação',
  beneficios_esperados: 'Benefícios esperados',
  esforco: 'Esforço',
  complexidade: 'Complexidade',
  tempo: 'Tempo (frequência)',
  objetivo: 'Objetivo',
  status: 'Status',
  source: 'Origem',
  request_type: 'Tipo de solicitação',
  fonte: 'Fonte',
  tipo_processo: 'Tipo de processo',
  observacao: 'Observação',
  risco: 'Risco (nota)',
  notas: 'Notas',
  visivel: 'Visível',
  seq_id: 'Nº',

  // opportunity_tasks (0037)
  titulo: 'Título',
  parent_task_id: 'Tarefa pai',
  assignee_id: 'Responsável',
  data_inicio: 'Data de início',
  data_fim: 'Data de término',
  motivo_bloqueio: 'Motivo do bloqueio',
  ordem: 'Ordem',
  // task-schema.ts usa nomes de campo em inglês (convenção de código) — o
  // audit_trigger grava as colunas em pt-BR acima; estes cobrem os erros de
  // validação do INPUT (validation-errors.ts), que vêm antes do insert/update.
  title: 'Título',
  description: 'Descrição',
  start_date: 'Data de início',
  due_date: 'Data de término',
  blocked_reason: 'Motivo do bloqueio',
  // phase-schema.ts (estimativa de fase, 0048) — datas PLANEJADAS, distintas
  // das datas REALIZADAS acima (started_at/finished_at, geridas por trigger).
  planned_start_at: 'Início estimado',
  planned_end_at: 'Fim estimado',

  // opportunity_risks
  descricao: 'Descrição',
  tipo: 'Tipo',
  impacto: 'Impacto',
  probabilidade: 'Probabilidade',
  resposta: 'Resposta',
  descricao_impacto: 'Descrição do impacto',
  priority: 'Prioridade',

  // documentos / anotações
  kind: 'Tipo',
  nome: 'Nome',
  url: 'URL',
  storage_path: 'Arquivo',
  texto: 'Texto',

  // profiles / convites / empresa
  full_name: 'Nome',
  role: 'Papel',
  cargo: 'Cargo',
  tenant_id: 'Empresa',
  used_at: 'Utilizado em',
  name: 'Nome',
  slug: 'Slug',
  brand_color: 'Cor da marca',
  logo_path: 'Logo',

  // fases
  phase_key: 'Fase',
  started_at: 'Iniciada em',
  finished_at: 'Concluída em',
};

/** Valores de enum/booleano que ficariam crus na tela. */
const VALUE_LABEL: Record<string, string> = {
  // status de oportunidade
  novo: 'Novo',
  em_analise: 'Refinamento',
  planejamento: 'Planejamento',
  backlog: 'Backlog',
  desenvolvimento: 'Desenvolvimento',
  homologacao: 'Homologação',
  // tarefas
  em_andamento: 'Em andamento',
  bloqueio: 'Bloqueio',
  finalizado: 'Finalizado',
  // papéis
  platform_admin: 'Administrador da plataforma',
  tenant_admin: 'Admin da empresa',
  member: 'Membro',
  viewer: 'Somente leitura',
  // escalas genéricas
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  muito_baixo: 'Muito baixo',
  muito_alto: 'Muito alto',
  sim: 'Sim',
  nao: 'Não',
  parcial: 'Parcial',
};

/** `snake_case` → `Snake case`. Fallback para coluna/valor sem rótulo. */
function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? humanize(key);
}

export function tableLabel(table: string): string {
  return TABLE_LABEL[table] ?? humanize(table);
}

/**
 * Formata um valor do de→para para exibição. Vazio/null viram `—` (o mesmo
 * traço de `scalarToString` em history.ts) para que "campo preenchido" e
 * "campo apagado" sejam visualmente simétricos.
 *
 * Objetos e arrays são resumidos, não despejados: numa coluna estreita, o JSON
 * inteiro de `criterios` esconde a mudança em vez de mostrá-la. O `old_data`/
 * `new_data` completo continua no banco para quem precisar do detalhe.
 */
export function formatValue(v: Json | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v.map((item) => formatValue(item as Json)).join(', ');
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length === 0 ? '—' : `{${keys.length} campo(s)}`;
  }

  const s = String(v);

  // Timestamptz / date → pt-BR. Só tenta se o formato for reconhecível, senão
  // um texto livre qualquer viraria "Invalid Date".
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return s.length <= 10
        ? d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
        : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}`;
    }
  }

  return VALUE_LABEL[s] ?? s;
}

/** Data/hora do registro de log — formato único em toda a rastreabilidade. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Identificação humana do registro afetado, extraída da própria linha logada.
 * Sem isto o admin lê "Editou Tarefa" e não sabe QUAL tarefa — e o registro
 * pode já ter sido apagado, então não dá para ir buscar o nome no banco.
 */
export function recordName(
  table: string,
  data: Record<string, unknown> | null
): string | null {
  if (!data) return null;
  const candidates: Record<string, string[]> = {
    opportunities: ['processo', 'solicitante'],
    // A coluna é `title` (identificadores da tabela são em inglês, ver
    // DATA-MODEL §Princípios). Procurar `titulo` aqui nunca casava, e o
    // efeito era toda tarefa aparecer sem nome no Histórico e no bloco
    // "O que mudou recentemente".
    opportunity_tasks: ['title'],
    opportunity_risks: ['descricao'],
    opportunity_notes: ['texto'],
    opportunity_documents: ['nome'],
    profiles: ['full_name', 'email'],
    invited_emails: ['email'],
    tenants: ['name'],
  };
  for (const key of candidates[table] ?? ['nome', 'titulo', 'name']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) {
      return v.length > 60 ? `${v.slice(0, 60)}…` : v;
    }
  }
  return null;
}
