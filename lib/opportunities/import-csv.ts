// lib/opportunities/import-csv.ts
// =============================================================================
// Parser PURO de CSV → payloads de oportunidade, para a importação em massa.
// Sem JSX, sem `server-only`, sem Supabase: roda igual no browser (pré-visualização
// instantânea, sem round-trip) e no servidor (a Server Action re-parseia o MESMO
// texto antes de gravar — ver import-actions.ts).
//
// POR QUE O SERVIDOR RE-PARSEIA EM VEZ DE CONFIAR NO QUE O CLIENTE MANDOU:
// se a action aceitasse a lista de linhas já parseada, um cliente forjado poderia
// enviar payload arbitrário (status, datas, tenant) driblando toda a validação
// desta função. Mandando o TEXTO CRU, existe um único caminho de validação e ele
// roda no servidor. A pré-visualização vira o que sempre deveria ser: uma
// conveniência de UI, não uma etapa de confiança.
//
// VOCABULÁRIO DE COLUNAS: os nomes técnicos das colunas de `opportunities`
// (decisão do PO, 2026-08-18) — `solicitante`, `area`, `processo`,
// `criterios.causaReclamacoes`, `beneficios.reducaoTempo`… É o cabeçalho da
// planilha de levantamento que o time já usa. Coluna desconhecida NÃO é erro:
// entra em `unknownColumns` e a UI avisa que foi ignorada (planilha de trabalho
// costuma ter coluna de anotação que não é do sistema).
//
// O QUE ESTE MÓDULO **NÃO** FAZ: não decide tenant, não decide responsável, não
// grava nada, e não inventa `seq_id`/`score`/`rpa_score` (derivados no banco —
// docs/PROJETO.md §3).
// =============================================================================

import { slugifyTool, MAX_TOOLS_PER_OPPORTUNITY } from './tools';

// -----------------------------------------------------------------------------
// Limites — espelham os CHECKs do banco e o Zod de schema.ts
// -----------------------------------------------------------------------------
/** Teto de linhas por importação. Acima disso o navegador trava na pré-visualização
 *  e a transação no banco fica longa demais — o caminho é quebrar em dois arquivos. */
export const MAX_IMPORT_ROWS = 500;
/** Teto do texto aceito (bytes UTF-16 aproximados por `length`). 2 MB de CSV são
 *  ~4× as 500 linhas máximas com todas as colunas preenchidas. */
export const MAX_IMPORT_TEXT_LENGTH = 2_000_000;

const MAX_LIST_ITEMS = 20;

// -----------------------------------------------------------------------------
// Domínios — espelham os enums do banco (0001/0011/0016/0017/0050)
// -----------------------------------------------------------------------------
const SOURCES = ['persona', 'formulario'] as const;
const REQUEST_TYPES = [
  'nova_oportunidade',
  'melhoria_automacao',
  'duvidas_terceiros',
  'incidente',
  'treinamento',
] as const;
const EFFORTS = ['baixo', 'medio', 'alto'] as const;
const COMPLEXITIES = ['baixo', 'medio', 'alto'] as const;
const FREQUENCY_BUCKETS = ['diario', 'semanal', 'quinzenal', 'mensal', 'anual'] as const;
const FTE_BUCKETS = ['muito_baixo', 'baixo', 'medio', 'alto', 'muito_alto'] as const;
const STATUSES = [
  'novo',
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
  'gestao',
  'manutencao',
  'descontinuado',
] as const;
const CRITICIDADES = ['baixa', 'media', 'alta', 'critica'] as const;
const PRIORITY_TAGS = ['alta', 'media', 'baixa'] as const;
const CRITERIO_VALUES = ['sim', 'nao', 'parcial'] as const;

/** As 8 chaves de `opportunities.criterios` — o CHECK `opportunities_criterios_chk`
 *  (0011) exige TODAS as 8 quando a coluna não é nula. Daí a regra tudo-ou-nada
 *  aplicada abaixo: preencher 3 das 8 na planilha viraria erro cru de constraint. */
export const CRITERIO_KEYS = [
  'causaReclamacoes',
  'totalmenteManual',
  'regrasClaras',
  'decisaoHumana',
  'padronizacaoDocs',
  'validacaoDados',
  'schedulable',
  'temDocumentacao',
] as const;

/** As 8 chaves de `opportunities.beneficios` (1–5). O CHECK é null-tolerante
 *  por chave, então aqui o preenchimento parcial é permitido. */
export const BENEFICIO_KEYS = [
  'reducaoTempo',
  'eliminacaoErros',
  'produtividade',
  'qualidadeDados',
  'reducaoCustos',
  'reducaoRetrabalho',
  'compliance',
  'objetivosEstrategicos',
] as const;

/** Cabeçalhos aceitos, na ordem em que devem aparecer no modelo. */
export const IMPORT_COLUMNS: string[] = [
  'solicitante',
  'email',
  'area',
  'subarea',
  'processo',
  'source',
  'request_type',
  'frequencia',
  'volume_medio',
  'tempo_execucao',
  'num_pessoas',
  'ferramenta',
  'fonte',
  'tipo_processo',
  'escopo_automacao',
  'beneficios_esperados',
  'beneficio_qualitativo',
  'esforco',
  'complexidade',
  'tempo',
  'objetivo',
  'fte',
  'fte_horas',
  ...CRITERIO_KEYS.map((k) => `criterios.${k}`),
  ...BENEFICIO_KEYS.map((k) => `beneficios.${k}`),
  'status',
  'criticidade',
  'priority_tag',
  'responsavel',
  'notas',
  'observacao',
  'risco',
  'azure_boards_codigo',
  'linguagem',
  'execucao',
  'usuarios_servico',
  'execucoes_mes',
  'data_abertura_coe',
  'data_fechamento_coe',
  'data_conclusao',
];

/** Sem estas três a linha não vira oportunidade (NOT NULL / min length no banco). */
export const REQUIRED_COLUMNS = ['solicitante', 'area', 'processo'] as const;

// -----------------------------------------------------------------------------
// Tipos de saída
// -----------------------------------------------------------------------------

/** Payload de UMA linha, com as chaves EXATAS que a RPC `import_opportunities`
 *  (migration 0059) espera. Nunca inclui tenant, responsável (assignee) ou
 *  qualquer coluna derivada — esses vêm do formulário/servidor, não do arquivo. */
export type ImportRowPayload = {
  solicitante: string;
  email: string | null;
  area: string;
  subarea: string | null;
  processo: string;
  source: (typeof SOURCES)[number];
  request_type: (typeof REQUEST_TYPES)[number];
  frequencia: string | null;
  volume_medio: string | null;
  tempo_execucao: string | null;
  num_pessoas: string | null;
  ferramentas: string[];
  fonte: string | null;
  tipo_processo: string[];
  escopo_automacao: string[];
  beneficios_esperados: string[];
  beneficio_qualitativo: string | null;
  esforco: (typeof EFFORTS)[number] | null;
  complexidade: (typeof COMPLEXITIES)[number] | null;
  tempo: (typeof FREQUENCY_BUCKETS)[number] | null;
  objetivo: number | null;
  fte: (typeof FTE_BUCKETS)[number] | null;
  fte_horas: number | null;
  criterios: Record<string, string> | null;
  beneficios: Record<string, number> | null;
  status: (typeof STATUSES)[number];
  criticidade: (typeof CRITICIDADES)[number] | null;
  priority_tag: (typeof PRIORITY_TAGS)[number] | null;
  responsavel: string | null;
  notas: string | null;
  observacao: string | null;
  risco: string | null;
  azure_boards_codigo: string | null;
  linguagem: string | null;
  execucao: string | null;
  usuarios_servico: string | null;
  execucoes_mes: number | null;
  data_abertura_coe: string | null;
  data_fechamento_coe: string | null;
  data_conclusao: string | null;
};

/** Problema encontrado numa célula ou linha. `line` é o número da LINHA DO
 *  ARQUIVO (1 = cabeçalho), para a pessoa achar no Excel sem contar de cabeça. */
export type ImportIssue = {
  line: number;
  column: string | null;
  message: string;
};

export type ParsedImportRow = {
  /** Linha do arquivo (1-based, contando o cabeçalho). */
  line: number;
  payload: ImportRowPayload;
};

export type ImportParseResult = {
  /** Linhas válidas, prontas para a RPC. */
  rows: ParsedImportRow[];
  /** Erros que impedem uma linha (ou o arquivo inteiro) de entrar. */
  issues: ImportIssue[];
  /** Cabeçalhos presentes no arquivo que o sistema não conhece — ignorados. */
  unknownColumns: string[];
  /** Cabeçalhos obrigatórios ausentes. Não-vazio ⇒ `rows` vem vazio. */
  missingColumns: string[];
  /** Quantas linhas de dado o arquivo tinha (inclui as que falharam). */
  totalRows: number;
  /** Separador detectado — a UI mostra para a pessoa conferir. */
  delimiter: string;
};

// -----------------------------------------------------------------------------
// CSV → matriz de células (RFC 4180 com aspas duplas escapadas por duplicação)
// -----------------------------------------------------------------------------

/** Detecta o separador pela PRIMEIRA linha, fora de aspas. Ordem de desempate:
 *  ';' (default do Excel pt-BR, o mesmo do nosso export), ',' e tab. */
function detectDelimiter(text: string): string {
  const candidates = [';', ',', '\t'];
  const counts = new Map<string, number>(candidates.map((c) => [c, 0]));
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ';';
  let bestCount = 0;
  for (const c of candidates) {
    const n = counts.get(c) ?? 0;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/**
 * CSV → matriz de strings. Preserva quebras de linha DENTRO de células com
 * aspas (o campo `notas` do levantamento costuma ter parágrafo). Linhas
 * totalmente vazias são descartadas — Excel adora deixar uma no fim.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      pushCell();
      continue;
    }
    if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      pushRow();
      continue;
    }
    if (ch === '\n') {
      pushRow();
      continue;
    }
    cell += ch;
  }
  // Última linha sem quebra no fim.
  if (cell !== '' || row.length > 0) pushRow();

  return rows;
}

// -----------------------------------------------------------------------------
// Normalizações de célula
// -----------------------------------------------------------------------------

/** Compara cabeçalhos sem depender de caixa nem de espaço acidental. */
function normalizeHeader(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim().toLowerCase();
}

/** Valor de enum: sem acento, minúsculo, espaços/hífens viram '_'.
 *  "Muito Baixo" → muito_baixo; "Diário" → diario; "Concluído" → concluido. */
function normalizeEnum(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Célula de lista ("a | b | c") → array sem vazios. */
function splitList(raw: string): string[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Número aceitando vírgula decimal (planilha pt-BR) e separador de milhar. */
function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 'dd/mm/aaaa' ou 'aaaa-mm-dd' → 'aaaa-mm-dd'. Devolve null se não reconhecer. */
function parseDateOnly(raw: string): string | null {
  const v = raw.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Timestamp: ISO completo (com fuso) passa direto; 'dd/mm/aaaa', com hora
 *  opcional (hh:mm, com segundos opcionais), e 'aaaa-mm-dd' viram meia-noite
 *  UTC. Devolve null se não reconhecer.
 *
 *  NOTA DE FORMATAÇÃO (não é preciosismo): NÃO escreva um exemplo de formato
 *  entre colchetes aqui — o scanner do Tailwind v4 varre TODO arquivo do
 *  projeto, inclusive comentários, e lê `[hh:mm]` como utilitário de
 *  propriedade arbitrária. Ele gera CSS a partir disso, o CSS gerado não
 *  parseia, e o build inteiro morre com um `Missed semicolon` apontando para
 *  app/globals.css — um erro que não menciona este arquivo em lugar nenhum. */
function parseTimestamp(raw: string): string | null {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) {
    const d = new Date(v.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (br) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = br;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const dateOnly = parseDateOnly(v);
  if (dateOnly) {
    const d = new Date(`${dateOnly}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

// -----------------------------------------------------------------------------
// Linha → payload
// -----------------------------------------------------------------------------

type CellReader = (column: string) => string;

function buildRow(
  read: CellReader,
  line: number,
  issues: ImportIssue[]
): ImportRowPayload | null {
  const before = issues.length;
  const fail = (column: string, message: string) => issues.push({ line, column, message });

  /** Texto opcional com teto de caracteres. */
  const text = (column: string, max: number): string | null => {
    const v = read(column).trim();
    if (v === '') return null;
    if (v.length > max) {
      fail(column, `excede ${max} caracteres (tem ${v.length})`);
      return null;
    }
    return v;
  };

  /** Enum opcional. Valor fora do domínio é ERRO — nunca vira null em silêncio:
   *  "importou e o campo sumiu" é pior do que "a linha 12 tem esforço inválido". */
  const enumOf = <T extends string>(
    column: string,
    domain: readonly T[]
  ): T | null => {
    const raw = read(column).trim();
    if (raw === '') return null;
    const v = normalizeEnum(raw) as T;
    if (!domain.includes(v)) {
      fail(column, `valor "${raw}" não é aceito. Use: ${domain.join(', ')}`);
      return null;
    }
    return v;
  };

  const list = (column: string): string[] => {
    const items = splitList(read(column));
    if (items.length > MAX_LIST_ITEMS) {
      fail(column, `máximo de ${MAX_LIST_ITEMS} itens (tem ${items.length})`);
      return [];
    }
    const tooLong = items.find((i) => i.length > 200);
    if (tooLong) {
      fail(column, 'um dos itens excede 200 caracteres');
      return [];
    }
    return items;
  };

  const intInRange = (column: string, min: number, max: number): number | null => {
    const raw = read(column).trim();
    if (raw === '') return null;
    const n = parseNumber(raw);
    if (n === null || !Number.isInteger(n) || n < min || n > max) {
      fail(column, `deve ser um número inteiro entre ${min} e ${max} (veio "${raw}")`);
      return null;
    }
    return n;
  };

  // ── obrigatórios ──────────────────────────────────────────────────────────
  const solicitante = read('solicitante').trim();
  if (solicitante.length < 2) fail('solicitante', 'obrigatório (mínimo 2 caracteres)');
  else if (solicitante.length > 200) fail('solicitante', 'excede 200 caracteres');

  const area = read('area').trim();
  if (area.length < 2) fail('area', 'obrigatória (mínimo 2 caracteres)');
  else if (area.length > 200) fail('area', 'excede 200 caracteres');

  const processo = read('processo').trim();
  if (processo.length < 3) fail('processo', 'obrigatório (mínimo 3 caracteres)');
  else if (processo.length > 2000) fail('processo', 'excede 2000 caracteres');

  // ── e-mail (opcional, mas validado quando vem) ────────────────────────────
  const emailRaw = read('email').trim();
  let email: string | null = null;
  if (emailRaw !== '') {
    if (emailRaw.length > 200) fail('email', 'excede 200 caracteres');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) fail('email', `"${emailRaw}" não é um e-mail válido`);
    else email = emailRaw;
  }

  // ── ferramentas: nomes livres → slugs do catálogo (0055) ──────────────────
  const ferramentaRaw = splitList(read('ferramenta'));
  const ferramentas: string[] = [];
  for (const nome of ferramentaRaw) {
    const slug = slugifyTool(nome);
    if (!slug) {
      fail('ferramenta', `"${nome}" não vira um identificador válido de ferramenta`);
      continue;
    }
    if (!ferramentas.includes(slug)) ferramentas.push(slug);
  }
  if (ferramentas.length > MAX_TOOLS_PER_OPPORTUNITY) {
    fail('ferramenta', `máximo de ${MAX_TOOLS_PER_OPPORTUNITY} ferramentas por oportunidade`);
  }

  // ── critérios: TUDO ou NADA (CHECK opportunities_criterios_chk, 0011) ─────
  const criterios: Record<string, string> = {};
  const criteriosFaltando: string[] = [];
  for (const key of CRITERIO_KEYS) {
    const column = `criterios.${key}`;
    const raw = read(column).trim();
    if (raw === '') {
      criteriosFaltando.push(key);
      continue;
    }
    const v = normalizeEnum(raw);
    if (!(CRITERIO_VALUES as readonly string[]).includes(v)) {
      fail(column, `valor "${raw}" não é aceito. Use: sim, nao, parcial`);
      continue;
    }
    criterios[key] = v;
  }
  const criteriosPreenchidos = Object.keys(criterios).length;
  if (criteriosPreenchidos > 0 && criteriosFaltando.length > 0) {
    fail(
      'criterios',
      `preencha os 8 critérios ou nenhum — faltam: ${criteriosFaltando.join(', ')}`
    );
  }

  // ── benefícios: preenchimento parcial é permitido (CHECK null-tolerante) ──
  const beneficios: Record<string, number> = {};
  for (const key of BENEFICIO_KEYS) {
    const column = `beneficios.${key}`;
    const n = intInRange(column, 1, 5);
    if (n !== null) beneficios[key] = n;
  }

  // ── datas ─────────────────────────────────────────────────────────────────
  const timestampOf = (column: string): string | null => {
    const raw = read(column).trim();
    if (raw === '') return null;
    const v = parseTimestamp(raw);
    if (!v) fail(column, `data "${raw}" não reconhecida (use dd/mm/aaaa ou ISO)`);
    return v;
  };
  const dataAbertura = timestampOf('data_abertura_coe');
  const dataFechamento = timestampOf('data_fechamento_coe');
  const dataConclusaoRaw = read('data_conclusao').trim();
  let dataConclusao: string | null = null;
  if (dataConclusaoRaw !== '') {
    dataConclusao = parseDateOnly(dataConclusaoRaw);
    if (!dataConclusao) {
      fail('data_conclusao', `data "${dataConclusaoRaw}" não reconhecida (use dd/mm/aaaa)`);
    }
  }

  const fteHoras = (() => {
    const raw = read('fte_horas').trim();
    if (raw === '') return null;
    const n = parseNumber(raw);
    if (n === null || n < 0) {
      fail('fte_horas', `deve ser um número não negativo (veio "${raw}")`);
      return null;
    }
    return n;
  })();

  const execucoesMes = (() => {
    const raw = read('execucoes_mes').trim();
    if (raw === '') return null;
    const n = parseNumber(raw);
    if (n === null || !Number.isInteger(n) || n < 0) {
      fail('execucoes_mes', `deve ser um inteiro não negativo (veio "${raw}")`);
      return null;
    }
    return n;
  })();

  const payload: ImportRowPayload = {
    solicitante,
    email,
    area,
    subarea: text('subarea', 200),
    processo,
    source: enumOf('source', SOURCES) ?? 'formulario',
    request_type: enumOf('request_type', REQUEST_TYPES) ?? 'nova_oportunidade',
    frequencia: text('frequencia', 60),
    volume_medio: text('volume_medio', 60),
    tempo_execucao: text('tempo_execucao', 60),
    num_pessoas: text('num_pessoas', 60),
    ferramentas,
    fonte: text('fonte', 200),
    tipo_processo: list('tipo_processo'),
    escopo_automacao: list('escopo_automacao'),
    beneficios_esperados: list('beneficios_esperados'),
    beneficio_qualitativo: text('beneficio_qualitativo', 2000),
    esforco: enumOf('esforco', EFFORTS),
    complexidade: enumOf('complexidade', COMPLEXITIES),
    tempo: enumOf('tempo', FREQUENCY_BUCKETS),
    objetivo: intInRange('objetivo', 1, 5),
    fte: enumOf('fte', FTE_BUCKETS),
    fte_horas: fteHoras,
    criterios: criteriosPreenchidos === CRITERIO_KEYS.length ? criterios : null,
    beneficios: Object.keys(beneficios).length > 0 ? beneficios : null,
    status: enumOf('status', STATUSES) ?? 'novo',
    criticidade: enumOf('criticidade', CRITICIDADES),
    priority_tag: enumOf('priority_tag', PRIORITY_TAGS),
    responsavel: text('responsavel', 200),
    notas: text('notas', 2000),
    observacao: text('observacao', 2000),
    risco: text('risco', 2000),
    azure_boards_codigo: text('azure_boards_codigo', 200),
    linguagem: text('linguagem', 60),
    execucao: text('execucao', 60),
    usuarios_servico: text('usuarios_servico', 200),
    execucoes_mes: execucoesMes,
    data_abertura_coe: dataAbertura,
    data_fechamento_coe: dataFechamento,
    data_conclusao: dataConclusao,
  };

  // Uma linha com QUALQUER problema não entra — importação parcial de linha
  // (metade dos campos) é pior que recusar: ninguém confere o que faltou.
  return issues.length === before ? payload : null;
}

// -----------------------------------------------------------------------------
// API principal
// -----------------------------------------------------------------------------

/**
 * Texto CSV → linhas válidas + problemas. NUNCA lança: todo erro vira `issues`
 * (uma tela de importação que estoura exceção não diz à pessoa o que corrigir).
 *
 * Duplicidade DENTRO do arquivo (mesmo `processo` em duas linhas) é reportada
 * aqui; duplicidade contra o que JÁ EXISTE no banco só a RPC sabe, e é ela quem
 * pula e devolve a lista.
 */
export function parseImportCsv(text: string): ImportParseResult {
  const empty: ImportParseResult = {
    rows: [],
    issues: [],
    unknownColumns: [],
    missingColumns: [],
    totalRows: 0,
    delimiter: ';',
  };

  if (text.trim() === '') {
    return { ...empty, issues: [{ line: 0, column: null, message: 'Arquivo vazio.' }] };
  }
  if (text.length > MAX_IMPORT_TEXT_LENGTH) {
    return {
      ...empty,
      issues: [
        {
          line: 0,
          column: null,
          message: `Arquivo grande demais (limite ${Math.round(MAX_IMPORT_TEXT_LENGTH / 1000)} mil caracteres).`,
        },
      ],
    };
  }

  const delimiter = detectDelimiter(text.replace(/^\uFEFF/, ''));
  const matrix = parseCsv(text, delimiter);
  if (matrix.length === 0) {
    return { ...empty, delimiter, issues: [{ line: 0, column: null, message: 'Arquivo vazio.' }] };
  }

  const headerCells = matrix[0].map(normalizeHeader);
  const known = new Map<string, number>();
  const unknownColumns: string[] = [];
  const duplicated: string[] = [];
  const canonicalByLower = new Map(IMPORT_COLUMNS.map((c) => [c.toLowerCase(), c]));

  headerCells.forEach((h, index) => {
    if (h === '') return;
    const canonical = canonicalByLower.get(h);
    if (!canonical) {
      unknownColumns.push(matrix[0][index].trim());
      return;
    }
    if (known.has(canonical)) {
      duplicated.push(canonical);
      return; // a primeira ocorrência vence
    }
    known.set(canonical, index);
  });

  const issues: ImportIssue[] = duplicated.map((c) => ({
    line: 1,
    column: c,
    message: 'coluna repetida no cabeçalho — a segunda foi ignorada',
  }));

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !known.has(c));
  if (missingColumns.length > 0) {
    return {
      rows: [],
      issues: [
        ...issues,
        {
          line: 1,
          column: null,
          message: `Cabeçalho sem as colunas obrigatórias: ${missingColumns.join(', ')}.`,
        },
      ],
      unknownColumns,
      missingColumns: [...missingColumns],
      totalRows: Math.max(0, matrix.length - 1),
      delimiter,
    };
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      issues: [
        ...issues,
        {
          line: 0,
          column: null,
          message: `${dataRows.length} linhas no arquivo — o limite por importação é ${MAX_IMPORT_ROWS}. Divida em mais de um arquivo.`,
        },
      ],
      unknownColumns,
      missingColumns: [],
      totalRows: dataRows.length,
      delimiter,
    };
  }

  const rows: ParsedImportRow[] = [];
  const processosVistos = new Map<string, number>();

  dataRows.forEach((cells, i) => {
    const line = i + 2; // +1 do cabeçalho, +1 porque a contagem humana é 1-based
    const read: CellReader = (column) => {
      const index = known.get(column);
      if (index === undefined) return '';
      return cells[index] ?? '';
    };

    const payload = buildRow(read, line, issues);
    if (!payload) return;

    const chave = payload.processo.trim().toLowerCase();
    const anterior = processosVistos.get(chave);
    if (anterior !== undefined) {
      issues.push({
        line,
        column: 'processo',
        message: `repete o processo da linha ${anterior} — só a primeira será importada`,
      });
      return;
    }
    processosVistos.set(chave, line);
    rows.push({ line, payload });
  });

  return {
    rows,
    issues,
    unknownColumns,
    missingColumns: [],
    totalRows: dataRows.length,
    delimiter,
  };
}

/**
 * CSV-modelo com o cabeçalho canônico e uma linha de exemplo — o botão "baixar
 * modelo" da tela. Mesmo dialeto do export (';' + BOM) para o Excel pt-BR abrir
 * sem assistente de importação.
 */
export function importTemplateCsv(): string {
  const exemplo: Record<string, string> = {
    solicitante: 'Maria Souza',
    email: 'maria.souza@empresa.com.br',
    area: 'Tecnologia da Informação',
    subarea: 'COE de Dados',
    processo: 'Conciliação diária de extratos bancários',
    source: 'formulario',
    request_type: 'nova_oportunidade',
    frequencia: 'Diário',
    volume_medio: '1 a 3 Vezes',
    tempo_execucao: 'De 1 a 2 horas',
    num_pessoas: '1 Pessoa',
    ferramenta: 'n8n | Databricks',
    fonte: 'Levantamento 2026',
    tipo_processo: 'automacao',
    escopo_automacao: 'Baixar extrato | Conciliar lançamentos | Notificar divergência',
    beneficios_esperados: 'Fecha o dia sem planilha | Divergência vista na hora',
    beneficio_qualitativo: 'A conciliação deixa de depender de uma pessoa específica.',
    esforco: 'medio',
    complexidade: 'baixo',
    tempo: 'diario',
    objetivo: '4',
    fte: 'baixo',
    fte_horas: '20',
    status: 'novo',
    criticidade: 'media',
    priority_tag: 'alta',
    responsavel: 'Thiago Saldanha',
    notas: 'Estimativa de 30h de construção.',
    observacao: 'Aguardando acesso ao banco.',
    risco: 'Sem automação, o fechamento atrasa quando falta gente.',
    azure_boards_codigo: '',
    linguagem: 'Python | SQL',
    execucao: 'automatica',
    usuarios_servico: '2',
    execucoes_mes: '30',
    data_abertura_coe: '17/08/2026',
    data_fechamento_coe: '',
    data_conclusao: '',
  };
  for (const k of CRITERIO_KEYS) exemplo[`criterios.${k}`] = 'sim';
  for (const k of BENEFICIO_KEYS) exemplo[`beneficios.${k}`] = '4';

  const escape = (cell: string) =>
    /[;"\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

  const header = IMPORT_COLUMNS.map(escape).join(';');
  const row = IMPORT_COLUMNS.map((c) => escape(exemplo[c] ?? '')).join(';');
  return `\uFEFF${header}\r\n${row}\r\n`;
}
