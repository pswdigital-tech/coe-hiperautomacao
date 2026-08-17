/**
 * Importa as respostas do Google Forms da Natura para `opportunities` e dispara
 * o MESMO enriquecimento de IA do formulário público (`lib/ai/enrichment.ts`).
 *
 * Uso:
 *   npx tsx --conditions=react-server scripts/import/natura-google-forms.ts            # dry-run
 *   npx tsx --conditions=react-server scripts/import/natura-google-forms.ts --commit   # insere + enriquece
 *   npx tsx --conditions=react-server scripts/import/natura-google-forms.ts --retry-enrichment  # só re-enriquece o que falhou
 *
 * `--conditions=react-server` é necessário porque `lib/**` importa `server-only`,
 * que só resolve para um módulo vazio sob essa condition.
 *
 * SEGURANÇA: usa service role (bypassa RLS) — todo write é feito com
 * `tenant_id` fixo, resolvido pelo slug, e o enrichment filtra por
 * `id + tenant_id + pending` (defesa em profundidade já existente).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { serviceRoleClient } from '../../lib/supabase/server';
import { enrichOpportunity } from '../../lib/ai/enrichment';
import { computeFteHoras, deriveFteBucket } from '../../lib/opportunities/fte';

const TENANT_SLUG = 'natura';
const FONTE = 'Google Forms (jul/2026)';
const CSV_PATH =
  'Formulario Registrar oportunidade de automacao (respostas) - Respostas ao formulário 1.csv';

const COMMIT = process.argv.includes('--commit');
// Reenfileira e re-enriquece o que ficou 'failed' (ex.: OpenAI sem crédito).
// `enrichOpportunity` só age em rows 'pending' — por isso o reset antes.
const RETRY = process.argv.includes('--retry-enrichment');

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing (RFC 4180 — aspas duplas, vírgulas e quebras de linha no campo)
// ─────────────────────────────────────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const norm = (s: string | undefined | null) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const clean = (s: string | undefined | null) => (s ?? '').trim();
const orNull = (s: string | undefined | null) => clean(s) || null;
const cut = (s: string | null, max: number) =>
  s == null ? null : s.length > max ? s.slice(0, max - 1) + '…' : s;

// ─────────────────────────────────────────────────────────────────────────────
// Mapas de domínio (labels do Google Forms → domínio do app)
// ─────────────────────────────────────────────────────────────────────────────
const GATILHO: Record<string, string> = {
  'chega um e-mail ou mensagem': 'email',
  'horario ou agenda': 'horario',
  'alguem solicita ou abre chamado': 'solicitacao',
  'evento em um sistema': 'evento_sistema',
  'atualizacao de planilha ou arquivo': 'planilha',
  outro: 'outro',
};
const FORMATO: Record<string, string> = {
  'estruturado (planilha, sistema, formulario)': 'estruturado',
  'nao estruturado (pdf, e-mail livre, imagem, papel)': 'nao_estruturado',
  misto: 'misto',
};
const LGPD: Record<string, string> = {
  'sim, dados pessoais ou sensiveis': 'sim',
  nao: 'nao',
  'nao sei': 'nao_sei',
};
const FREQUENCIA: Record<string, string> = {
  diario: 'diario',
  semanal: 'semanal',
  quinzenal: 'quinzenal',
  mensal: 'mensal',
  anual: 'anual',
};
const CRITICIDADE: Record<string, string> = {
  baixa: 'baixa',
  media: 'media',
  alta: 'alta',
  critica: 'critica',
};

// 8 critérios — chaves camelCase do schema (lib/opportunities/schema.ts §260).
const CRITERIOS: { key: string; label: string }[] = [
  { key: 'causaReclamacoes', label: 'Causa reclamacoes quando falha' },
  { key: 'totalmenteManual', label: 'Totalmente Manual' },
  { key: 'regrasClaras', label: 'Processo baseado em regras claras' },
  { key: 'decisaoHumana', label: 'Necessidade de decisao humana frequente' },
  { key: 'padronizacaoDocs', label: 'Padronizacao em documentos (PDFs, formularios)' },
  { key: 'validacaoDados', label: 'Validacao ou conferencia de dados simples' },
  { key: 'schedulable', label: 'Pode ser programado para horarios especificos' },
  { key: 'temDocumentacao', label: 'Possui documentacao do processo' },
];

const BENEFICIOS: { key: string; label: string }[] = [
  { key: 'reducaoTempo', label: 'Reducao de Tempo' },
  { key: 'eliminacaoErros', label: 'Eliminacao de Erros' },
  { key: 'produtividade', label: 'Aumento de Produtividade' },
  { key: 'qualidadeDados', label: 'Qualidade de Dados' },
  { key: 'reducaoCustos', label: 'Reducao de Custos' },
  { key: 'reducaoRetrabalho', label: 'Reducao de Retrabalho' },
  { key: 'compliance', label: 'Compliance e Regulatorio' },
  { key: 'objetivosEstrategicos', label: 'Objetivos Estrategicos' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Normalização numérica APENAS para o cálculo de FTE (o texto original é
// preservado nas colunas `tempo_execucao` / `num_pessoas`).
//
// computeFteHoras assume `tempo_execucao` em HORAS e um número em
// `num_pessoas`; o Google Forms trouxe "30 minutos", "8h/semana", "Uma pessoa".
// Convertemos aqui para não gerar FTE absurdo — a fórmula continua sendo a do
// lib (fonte única), só a entrada é saneada.
// ─────────────────────────────────────────────────────────────────────────────
function horasPorExecucao(raw: string): string | null {
  const t = norm(raw);
  const m = t.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (/min/.test(t)) return String(n / 60);
  if (/\bdias?\b/.test(t)) return String(n * 8);
  // Sem unidade e acima de 12 → quase certamente MINUTOS ("90", "20", "15").
  // Ninguém gasta >12h numa única execução de um processo diário/semanal;
  // tratar como horas produzia FTE de milhares de h/mês.
  if (!/h/.test(t) && n > 12) return String(n / 60);
  return String(n); // "2", "1h", "04 horas", "8h/semana" → horas
}

const PESSOAS_PALAVRA: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5,
};
function pessoasNum(raw: string): string | null {
  const t = norm(raw);
  const m = t.match(/(\d+)/);
  if (m) return m[1];
  for (const [w, n] of Object.entries(PESSOAS_PALAVRA)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return String(n);
  }
  if (/\+/.test(t)) return null;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento linha → payload de INSERT
// ─────────────────────────────────────────────────────────────────────────────
type Mapped = {
  row: Record<string, string>;
  payload: Record<string, unknown>;
  warnings: string[];
};

function mapRow(r: Record<string, string>, tenantId: string): Mapped {
  const warnings: string[] = [];
  const g = (k: string) => clean(r[k]);

  // Critérios: a grade do Forms só registra o que foi marcado — não-marcado
  // vira 'nao' (decisão do PO, 2026-07-31) para satisfazer o CHECK dos 8.
  const criterios: Record<string, string> = {};
  let marcados = 0;
  for (const [col, val] of [
    ['Critérios de avaliacao [Sim]', 'sim'],
    ['Critérios de avaliacao [Parcial]', 'parcial'],
    ['Critérios de avaliacao [Nao]', 'nao'],
  ] as const) {
    const cell = norm(r[col]);
    for (const c of CRITERIOS) {
      if (cell.includes(norm(c.label))) { criterios[c.key] = val; marcados++; }
    }
  }
  for (const c of CRITERIOS) if (!criterios[c.key]) criterios[c.key] = 'nao';
  if (marcados < 8) warnings.push(`criterios: ${marcados}/8 marcados (resto = 'nao')`);

  // Benefícios: colunas [1]..[5] — o índice da coluna é a nota.
  const beneficios: Record<string, number> = {};
  for (let nota = 1; nota <= 5; nota++) {
    const cell = norm(r[`Beneficios esperados (1=Nada, 5=Totalmente) [${nota}]`]);
    if (!cell) continue;
    for (const b of BENEFICIOS) if (cell.includes(norm(b.label))) beneficios[b.key] = nota;
  }
  if (Object.keys(beneficios).length === 0) warnings.push('beneficios: nenhum pontuado');

  const frequenciaRaw = g('Frequencia');
  const tempoBucket = FREQUENCIA[norm(frequenciaRaw)] ?? null;
  if (frequenciaRaw && !tempoBucket) warnings.push(`frequencia fora do domínio: "${frequenciaRaw}"`);

  const tempoExec = g('Tempo de Execucao');
  const numPessoas = g('Pessoas Envolvidas');
  const fteHoras = computeFteHoras({
    // `execucoes_mes` fica null: a pergunta "Numero de Execucoes" não declara o
    // período, então deixamos o fallback por frequência do lib decidir.
    execucoesMes: null,
    tempo: tempoBucket,
    tempoExecucao: horasPorExecucao(tempoExec),
    numPessoas: pessoasNum(numPessoas),
  });
  if (fteHoras == null) warnings.push('fte_horas: não calculável');

  const criticidade = CRITICIDADE[norm(g('Criticidade'))] ?? null;
  const objetivoRaw = Number(g('Alinhamento Estrategico'));
  const objetivo =
    Number.isInteger(objetivoRaw) && objetivoRaw >= 1 && objetivoRaw <= 5 ? objetivoRaw : 3;

  const tipoProcesso = orNull(g('Tipo do Processo'));

  const payload = {
    tenant_id: tenantId,
    source: 'formulario',
    request_type: 'nova_oportunidade',
    status: 'novo',
    fonte: FONTE,
    solicitante: cut(clean(g('Solicitante')) || clean(g('E-mail')), 200),
    email: orNull(g('E-mail')),
    area: cut(clean(g('Area')) || 'Não informada', 200),
    subarea: cut(orNull(g('Subarea ou Time')), 200),
    processo: cut(clean(g('Nome do processo ou oportunidade')), 2000),
    frequencia: cut(orNull(frequenciaRaw), 60),
    volume_medio: cut(orNull(g('Numero de Execucoes')), 60),
    tempo_execucao: cut(orNull(tempoExec), 60),
    num_pessoas: cut(orNull(numPessoas), 60),
    tempo: tempoBucket,
    objetivo,
    responsavel: cut(orNull(g('Responsavel CoE')), 200),
    criticidade,
    tipo_processo: tipoProcesso ? [tipoProcesso] : [],
    criterios,
    beneficios: Object.keys(beneficios).length ? beneficios : null,
    fte_horas: fteHoras,
    fte: fteHoras != null ? deriveFteBucket(fteHoras) : null,
    formulario_extras: {
      tipo_processo: tipoProcesso ?? undefined,
      sistemas: cut(orNull(g('Sistemas Utilizados')), 1000) ?? undefined,
      descricao: cut(orNull(g('Como o processo funciona hoje')), 2000) ?? undefined,
      dor: cut(orNull(g('Qual a maior dor hoje? Por que automatizar?')), 2000) ?? undefined,
      gatilho: GATILHO[norm(g('O que inicia o processo?'))] ?? undefined,
      formato_entrada: FORMATO[norm(g('Formato das informacoes de entrada'))] ?? undefined,
      dados_sensiveis: LGPD[norm(g('Envolve dados pessoais ou sensiveis (LGPD)?'))] ?? undefined,
    },
    // esforco/complexidade/ferramenta/escopo/beneficios_esperados/observacao/risco
    // NÃO são setados: são AI-owned (enrichOpportunity sobrescreve os defaults).
  };

  return { row: r, payload, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const raw = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const header = raw[0];
  const records = raw.slice(1).map((cells) =>
    Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
  );

  const sb = serviceRoleClient();
  const { data: tenant, error: tErr } = await sb
    .from('tenants')
    .select('id, name')
    .eq('slug', TENANT_SLUG)
    .single();
  if (tErr || !tenant) throw new Error(`tenant "${TENANT_SLUG}" não encontrado: ${tErr?.message}`);
  const tenantId = tenant.id as string;

  // Idempotência: não reimportar processos já existentes deste tenant/fonte.
  const { data: existing } = await sb
    .from('opportunities')
    .select('processo')
    .eq('tenant_id', tenantId)
    .eq('fonte', FONTE);
  const jaImportados = new Set((existing ?? []).map((o) => norm(o.processo as string)));

  if (RETRY) {
    const { data: pendentes, error } = await sb
      .from('opportunities')
      .select('id, processo, ai_enrichment_status')
      .eq('tenant_id', tenantId)
      .eq('fonte', FONTE)
      .in('ai_enrichment_status', ['failed', 'pending']);
    if (error) throw new Error(error.message);
    const alvos = (pendentes ?? []) as { id: string; processo: string }[];
    console.log(`\nRe-enriquecendo ${alvos.length} oportunidade(s) do tenant ${tenant.name}\n`);
    for (const o of alvos) {
      await sb
        .from('opportunities')
        .update({ ai_enrichment_status: 'pending', ai_enrichment_error: null } as never)
        .eq('id', o.id)
        .eq('tenant_id', tenantId);
      await enrichOpportunity(o.id, tenantId);
      const { data } = await sb
        .from('opportunities')
        .select('ai_enrichment_status, ai_enrichment_error, ferramenta, esforco, complexidade')
        .eq('id', o.id)
        .eq('tenant_id', tenantId)
        .single();
      const s = data as Record<string, unknown> | null;
      console.log(
        s?.ai_enrichment_status === 'enriched'
          ? `  ✓ ${o.processo} → ${s.ferramenta} / esforço ${s.esforco} / complexidade ${s.complexidade}`
          : `  ✗ ${o.processo} → ${s?.ai_enrichment_status}: ${s?.ai_enrichment_error}`,
      );
    }
    return;
  }

  const mapped = records.map((r) => mapRow(r, tenantId));
  const novos = mapped.filter((m) => !jaImportados.has(norm(m.payload.processo as string)));
  const pulados = mapped.length - novos.length;

  console.log(`\nTenant: ${tenant.name} (${tenantId})`);
  console.log(`CSV: ${mapped.length} respostas | novas: ${novos.length} | já importadas: ${pulados}`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (insere + enriquece)' : 'DRY-RUN'}\n`);

  novos.forEach((m, i) => {
    const p = m.payload as Record<string, any>;
    console.log(
      `${String(i + 1).padStart(2)}. ${p.processo}\n` +
        `    ${p.solicitante} <${p.email}> | ${p.area}${p.subarea ? ' / ' + p.subarea : ''}\n` +
        `    freq=${p.tempo ?? '—'} crit=${p.criticidade ?? '—'} fte=${p.fte_horas ?? '—'}h (${p.fte ?? '—'}) obj=${p.objetivo}\n` +
        `    criterios=${CRITERIOS.map((c) => (p.criterios[c.key] === 'sim' ? '✅' : p.criterios[c.key] === 'parcial' ? '⚠️' : '❌')).join('')}` +
        ` beneficios=${Object.entries(p.beneficios ?? {}).map(([k, v]) => `${k}:${v}`).join(' ') || '—'}\n` +
        `    extras: gatilho=${p.formulario_extras.gatilho ?? '—'} formato=${p.formulario_extras.formato_entrada ?? '—'} lgpd=${p.formulario_extras.dados_sensiveis ?? '—'}` +
        (m.warnings.length ? `\n    ⚠️  ${m.warnings.join(' | ')}` : ''),
    );
  });

  if (!COMMIT) {
    console.log('\nDry-run — nada foi escrito. Rode com --commit para importar.');
    return;
  }

  console.log('\n── Inserindo ──');
  const inserted: { id: string; processo: string }[] = [];
  for (const m of novos) {
    const { data, error } = await sb
      .from('opportunities')
      .insert(m.payload as never)
      .select('id')
      .single();
    if (error || !data) {
      console.error(`  ✗ ${m.payload.processo}: ${error?.message}`);
      continue;
    }
    inserted.push({ id: (data as { id: string }).id, processo: String(m.payload.processo) });
    console.log(`  ✓ ${m.payload.processo}`);
  }

  console.log(`\n── Enriquecimento IA (${inserted.length}) ──`);
  for (const o of inserted) {
    await enrichOpportunity(o.id, tenantId);
    const { data } = await sb
      .from('opportunities')
      .select('ai_enrichment_status, ai_enrichment_error, ferramenta, esforco, complexidade')
      .eq('id', o.id)
      .eq('tenant_id', tenantId)
      .single();
    const s = data as Record<string, unknown> | null;
    console.log(
      s?.ai_enrichment_status === 'enriched'
        ? `  ✓ ${o.processo} → ${s.ferramenta} / esforço ${s.esforco} / complexidade ${s.complexidade}`
        : `  ✗ ${o.processo} → ${s?.ai_enrichment_status}: ${s?.ai_enrichment_error}`,
    );
  }

  console.log('\nConcluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
