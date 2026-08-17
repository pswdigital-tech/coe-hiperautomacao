// lib/opportunities/csv.ts
// =============================================================================
// Serialização PURA de Opportunity[] → CSV. Sem JSX/React, sem import de
// servidor — importável em vitest. Read-only: só formata, nunca persiste.
//
// Formato: separador ';' + BOM UTF-8 (default do Excel pt-BR), campos com aspas
// escapadas ("" para aspas internas) sempre que contêm ; " ou quebra de linha.
// Colunas derivadas (`score`, `priority_level`, `rpa_score`) vêm da view — não
// recalcula (docs/PROJETO.md §3 — score nunca persistido/recomputado fora da view).
//
// Portado de origin/feat/v0.3-produtizacao (commit 6ce45d1, nunca mesclada) e
// atualizado com os campos operacionais v0.3 (0017) que não existiam quando
// aquele commit foi escrito — espelha a whitelist `OPPORTUNITY_COLUMNS` de
// queries.ts (mesma motivação de HARDEN-E-06: lista explícita, sem select(*)).
// =============================================================================

import type { Opportunity } from '@/lib/opportunities/types';
import { assigneeName, type Assignee } from '@/lib/opportunities/assignee-types';
import { toolLabel } from '@/lib/opportunities/tools';

type Column = {
  /** Cabeçalho pt-BR exibido na primeira linha do CSV. */
  header: string;
  /** Extrai o valor bruto da oportunidade (será stringificado depois). */
  value: (o: Opportunity) => unknown;
};

/**
 * Ordem e rótulo de TODAS as colunas exportadas. Espelha a whitelist de
 * `OPPORTUNITY_COLUMNS` (queries.ts) — se uma coluna nova entrar lá e fizer
 * sentido no export, adicionar aqui também.
 */
const COLUMNS: Column[] = [
  { header: 'ID', value: (o) => o.seq_id },
  { header: 'Código do chamado', value: (o) => (o.seq_id ? `CHM-${String(o.seq_id).padStart(4, '0')}` : '') },
  { header: 'Fonte (origem)', value: (o) => o.source },
  { header: 'Tipo de solicitação', value: (o) => o.request_type },
  { header: 'Solicitante', value: (o) => o.solicitante },
  { header: 'E-mail', value: (o) => o.email },
  { header: 'Área', value: (o) => o.area },
  { header: 'Subárea', value: (o) => o.subarea },
  { header: 'Processo', value: (o) => o.processo },
  { header: 'Frequência', value: (o) => o.frequencia },
  { header: 'Número de execuções', value: (o) => o.volume_medio },
  { header: 'Tempo de execução', value: (o) => o.tempo_execucao },
  { header: 'Nº de pessoas', value: (o) => o.num_pessoas },
  // 0055 — sai o enum legado, entra a seleção real. Sem o catálogo em mãos
  // (este módulo é puro), `toolLabel` resolve o seed e prettifica o resto; o
  // array cai no join ' | ' padrão das demais colunas de lista.
  { header: 'Ferramentas', value: (o) => (o.ferramentas ?? []).map((s) => toolLabel(s)) },
  { header: 'Escopo da automação', value: (o) => o.escopo_automacao },
  { header: 'Benefícios esperados', value: (o) => o.beneficios_esperados },
  { header: 'Esforço', value: (o) => o.esforco },
  { header: 'Complexidade', value: (o) => o.complexidade },
  { header: 'Tempo (frequência)', value: (o) => o.tempo },
  { header: 'Objetivo (1-5)', value: (o) => o.objetivo },
  { header: 'FTE (bucket)', value: (o) => o.fte },
  { header: 'FTE (h/mês)', value: (o) => o.fte_horas },
  { header: 'Score', value: (o) => o.score },
  // Duas prioridades independentes (0050): a calculada pela faixa de score e a
  // definida à mão. Cabeçalhos distintos para não virar a mesma coluna no Excel.
  { header: 'Prioridade calculada (score)', value: (o) => o.priority_level },
  { header: 'Prioridade (manual)', value: (o) => o.priority_tag },
  { header: 'Ordem de prioridade', value: (o) => o.priority_order },
  { header: 'RPA Score (0-6)', value: (o) => o.rpa_score },
  { header: 'Status', value: (o) => o.status },
  // Legado: a UI não mostra mais `responsavel` (0032), mas o dado histórico
  // continua no banco e sai no export. "Atribuído a" é o campo atual.
  { header: 'Responsável (legado)', value: (o) => o.responsavel },
  { header: 'Rótulo de origem', value: (o) => o.fonte },
  { header: 'Tipo de processo', value: (o) => o.tipo_processo },
  { header: 'Benefício qualitativo', value: (o) => o.beneficio_qualitativo },
  { header: 'Critérios (RPA Fit)', value: (o) => o.criterios },
  { header: 'Benefícios (escala 1-5)', value: (o) => o.beneficios },
  { header: 'Notas', value: (o) => o.notas },
  { header: 'Observação', value: (o) => o.observacao },
  { header: 'Risco (nota livre)', value: (o) => o.risco },
  // v0.3 (0017) — campos operacionais.
  { header: 'Criticidade', value: (o) => o.criticidade },
  { header: 'Código Azure Boards', value: (o) => o.azure_boards_codigo },
  { header: 'Linguagem', value: (o) => o.linguagem },
  { header: 'Execução', value: (o) => o.execucao },
  { header: 'Usuários do serviço', value: (o) => o.usuarios_servico },
  { header: 'Execuções/mês', value: (o) => o.execucoes_mes },
  { header: 'Data de conclusão', value: (o) => o.data_conclusao },
  { header: 'Abertura no COE', value: (o) => o.data_abertura_coe },
  { header: 'Fechamento no COE', value: (o) => o.data_fechamento_coe },
  { header: 'Enriquecimento IA (status)', value: (o) => o.ai_enrichment_status },
  { header: 'Enriquecido em', value: (o) => o.ai_enriched_at },
  { header: 'Criado em', value: (o) => o.created_at },
  { header: 'Atualizado em', value: (o) => o.updated_at },
];

/**
 * Converte um valor bruto em texto de célula (ainda não escapado).
 * - null/undefined → ''
 * - array → itens juntados por ' | '
 * - objeto (Json) → JSON compacto
 * - resto → String(...)
 */
function toCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => toCell(v)).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Escapa uma célula para CSV: envolve em aspas e duplica aspas internas quando
 * o texto contém o separador, aspas ou quebra de linha.
 */
function escape(cell: string): string {
  if (/[;"\n\r]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

const SEP = ';';
const EOL = '\r\n';
/** BOM UTF-8 — faz o Excel (pt-BR) abrir acentuação corretamente. */
const BOM = '﻿';

/**
 * Serializa Opportunity[] → string CSV completa (com cabeçalho + BOM).
 * Função pura: nunca busca dados nem persiste.
 */
export function opportunitiesToCsv(
  opps: Opportunity[],
  /** Assignees por opportunity_id (0032). Omitido = coluna sai vazia. */
  assigneesByOpportunity: Record<string, Assignee[]> = {}
): string {
  const headerRow = [...COLUMNS.map((c) => escape(c.header)), escape('Atribuído a')].join(
    SEP
  );
  const rows = opps.map((o) =>
    [
      ...COLUMNS.map((c) => escape(toCell(c.value(o)))),
      escape((assigneesByOpportunity[o.id] ?? []).map(assigneeName).join(' | ')),
    ].join(SEP)
  );
  return BOM + [headerRow, ...rows].join(EOL) + EOL;
}
