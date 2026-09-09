// =============================================================================
// sdd/document.tsx — o template do Documento de Desenho da Solução
// -----------------------------------------------------------------------------
// React puro sobre `@react-pdf/renderer`. NÃO conhece Supabase: recebe um
// `SddData` já montado (sdd/data.ts) e devolve páginas. Essa fronteira é o que
// permite mexer no layout sem tocar em query, e vice-versa.
//
// POR QUE @react-pdf E NÃO PUPPETEER: a alternativa seria reaproveitar o
// HTML/Tailwind da tela de detalhe num headless Chrome. Não serve — documento
// impresso tem paginação, quebra controlada, cabeçalho e rodapé repetidos e
// numeração de página, que a tela não tem e não deveria ter. Além disso um
// binário de browser numa Function é cold start de segundos por geração.
//
// FONTE: Helvetica (uma das 14 padrão do PDF), sem registro de fonte externa.
// Cobre acento pt-BR via WinAnsi. Registrar uma fonte própria exigiria embutir
// arquivo no bundle — custo real, ganho estético; se um dia entrar, é aqui.
//
// AS 12 SEÇÕES são as combinadas com o PO. As que dependiam de campo
// inexistente (arquitetura, integrações estruturadas, infraestrutura e acessos,
// segurança, dependências) FICARAM DE FORA da v1 por decisão dele, e aparecem
// como pauta declarada na seção 12 — nem capítulo vazio "a definir" (que lê
// como documento inacabado), nem sumiço silencioso (que na v2 renumeraria tudo
// e pareceria escopo crescendo).
//
// NENHUM TEXTO É INVENTADO AQUI. Campo sem dado imprime "Não informado" em
// cinza. Num documento assinado pela PSW e entregue ao cliente, um parágrafo
// plausível gerado para preencher espaço é o pior defeito possível — o cliente
// usa este PDF para liberar acesso e para cobrar entrega.
// =============================================================================

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { SddData } from './data';
import { STATUS_META } from '../status';
import {
  CRITERIOS,
  criterioValor,
  isFavoravel,
  countFavoraveis,
  CRITERIO_VALOR_LABEL,
} from '../criteria-labels';
import { scoredBenefits, benefitsAverage } from '../benefit-labels';
import { toolLabel } from '../tools';
import {
  TIPO_LABEL as RISK_TIPO_LABEL,
  IMPACTO_LABEL,
  PROBABILIDADE_LABEL,
  STATUS_LABEL as RISK_STATUS_LABEL,
  priorityLabel as riskPriorityLabel,
} from '../risk-labels';
import {
  GATILHO_LABELS,
  FORMATO_ENTRADA_LABELS,
  DADOS_SENSIVEIS_LABELS,
  labelOf,
} from '../discovery-labels';

// A hifenização automática do @react-pdf é feita para inglês e não conhece as
// regras do português: ela partia "automação" como "au-tomação" no meio de um
// cartão do sumário. Devolver a palavra inteira desliga o algoritmo — o texto
// quebra por espaço, como qualquer documento em pt-BR. Chamada de módulo, uma
// vez por processo.
Font.registerHyphenationCallback((word) => [word]);

// Azul institucional — o mesmo padrão de quando o tenant não escolheu cor (0033).
const FALLBACK_BRAND = '#1e3a8a';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const SOFT = '#f8fafc';

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: INK,
    lineHeight: 1.5,
  },
  // ── Capa ────────────────────────────────────────────────────────────────
  coverPage: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: INK,
    justifyContent: 'space-between',
  },
  coverRule: { height: 4, width: 96, marginBottom: 28 },
  coverKicker: {
    fontSize: 9,
    letterSpacing: 2,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
  },
  coverTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', lineHeight: 1.25 },
  coverProcess: { fontSize: 14, color: MUTED, marginTop: 12, lineHeight: 1.4 },
  coverMetaBox: {
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderTopStyle: 'solid',
    paddingTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coverMetaCell: { width: '50%', marginBottom: 12 },
  // ── Estrutura ───────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
  },
  section: { marginBottom: 20 },
  subTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    color: MUTED,
    marginBottom: 5,
    marginTop: 10,
  },
  para: { marginBottom: 6, textAlign: 'justify' },
  muted: { color: MUTED, fontStyle: 'italic' },
  // ── Grade de fichas ─────────────────────────────────────────────────────
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', paddingRight: 10, marginBottom: 9 },
  cellHalf: { width: '50%', paddingRight: 10, marginBottom: 9 },
  cellLabel: {
    fontSize: 7.5,
    letterSpacing: 0.6,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 1,
  },
  cellValue: { fontSize: 9.5 },
  // ── Listas ──────────────────────────────────────────────────────────────
  li: { flexDirection: 'row', marginBottom: 4, paddingRight: 8 },
  liMark: { width: 14, fontFamily: 'Helvetica-Bold' },
  liText: { flex: 1 },
  // ── Tabelas ─────────────────────────────────────────────────────────────
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    borderBottomStyle: 'solid',
    paddingBottom: 4,
    marginBottom: 3,
  },
  thText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    color: MUTED,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    borderBottomStyle: 'solid',
    paddingVertical: 4,
  },
  td: { fontSize: 8.5, paddingRight: 6 },
  // ── Destaques ───────────────────────────────────────────────────────────
  metricRow: { flexDirection: 'row', marginBottom: 12 },
  metric: {
    width: '25%',
    backgroundColor: SOFT,
    borderRadius: 4,
    padding: 8,
    marginRight: 6,
  },
  metricValue: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  metricLabel: { fontSize: 7.5, color: MUTED, marginTop: 2, lineHeight: 1.3 },
  callout: {
    backgroundColor: SOFT,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    padding: 9,
    marginTop: 8,
  },
  // ── Rodapé ──────────────────────────────────────────────────────────────
  // Dois `Text` absolutos e independentes, em vez de um `View` com dois filhos:
  // o `fixed` reavalia o elemento MARCADO a cada página, e um View-contêiner
  // fixo não propagava para dentro — o rodapé inteiro sumia do documento.
  //
  // SEM "página X de Y", e não por esquecimento. A prop `render` do
  // @react-pdf (4.6.1), que é como se obtém `pageNumber`/`totalPages`, NÃO
  // produz saída neste documento: o texto simplesmente não é desenhado, sem
  // erro nenhum na geração. Foi verificado que o mecanismo funciona em
  // documentos isolados (inclusive multi-página, com o mesmo estilo, o mesmo
  // StyleSheet e a mesma posição absoluta) e que aqui falha em QUALQUER
  // posição — primeiro filho, último filho, ancorado à esquerda, com e sem
  // `totalPages`, com e sem `wrap` explícito na Page, com e sem `lineHeight`
  // herdado e com e sem o callback de hifenização. Trocar o mesmo elemento
  // por texto estático renderiza normalmente. Não vale mais tempo de
  // investigação: o rodapé estático já entrega o essencial — uma página solta
  // continua rastreável ao documento e à VERSÃO, que é o que a circulação por
  // e-mail exige. Se for reatacar, comece por reproduzir com um componente de
  // função como filho da Page (a diferença estrutural que sobrou sem teste).
  footerLeft: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    fontSize: 7.5,
    lineHeight: 1,
    color: MUTED,
  },
  footerRight: {
    position: 'absolute',
    bottom: 28,
    // `left` E `right`, com alinhamento à direita, em vez de só `right`: um
    // absoluto ancorado por um lado só colapsa para largura zero e o texto não
    // é desenhado. O rodapé da esquerda escapava por ter conteúdo curto.
    left: 48,
    right: 48,
    textAlign: 'right',
    fontSize: 7.5,
    lineHeight: 1,
    color: MUTED,
  },
  footerRule: {
    position: 'absolute',
    bottom: 42,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderTopStyle: 'solid',
  },
  // Caixa de conferência DESENHADA (View com borda), não o caractere '☐': a
  // Helvetica padrão do PDF não tem esse glifo e ele saía como espaço em
  // branco. Vale para qualquer símbolo fora do WinAnsi — ver `Bullets`.
  checkbox: {
    width: 6,
    height: 6,
    borderWidth: 0.8,
    borderColor: '#94a3b8',
    borderStyle: 'solid',
    marginTop: 3.5,
    marginRight: 6,
  },
});

// =============================================================================
// Helpers de formatação
// =============================================================================

/**
 * Datas do banco chegam como 'YYYY-MM-DD' ou ISO completo. Fatiar a string em
 * vez de `new Date(...)` é deliberado: `new Date('2026-08-20')` é interpretado
 * como UTC e, num servidor a oeste de Greenwich, imprime o dia ANTERIOR. Num
 * documento com prazo contratual, errar um dia é errar de verdade.
 */
function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtDateTime(iso: string): string {
  const d = fmtDate(iso) ?? '';
  const t = /T(\d{2}):(\d{2})/.exec(iso);
  return t ? `${d} às ${t[1]}h${t[2]}` : d;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

function cleanList(v: string[] | null | undefined): string[] {
  return (v ?? []).map((i) => i.trim()).filter((i) => i !== '');
}

// =============================================================================
// Componentes de apoio
// =============================================================================

function Field({ label, value, half }: { label: string; value: string | null; half?: boolean }) {
  return (
    <View style={half ? s.cellHalf : s.cell}>
      <Text style={s.cellLabel}>{label.toUpperCase()}</Text>
      {value ? (
        <Text style={s.cellValue}>{value}</Text>
      ) : (
        <Text style={[s.cellValue, s.muted]}>Não informado</Text>
      )}
    </View>
  );
}

function Paragraph({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text style={s.subTitle}>{label.toUpperCase()}</Text>
      {value ? (
        <Text style={s.para}>{value}</Text>
      ) : (
        <Text style={[s.para, s.muted]}>Não informado.</Text>
      )}
    </View>
  );
}

/**
 * Lista com marcador.
 *
 * SÓ SÃO USADOS SÍMBOLOS DO WINANSI — o conjunto que as 14 fontes padrão do
 * PDF conseguem desenhar. A primeira versão usava ✓ ✕ ◆ ▲ ☐ →, e o resultado
 * impresso foi: os dois primeiros e a caixa saíram em BRANCO, o losango virou
 * "Æ" e o triângulo virou "²". Falha silenciosa — o PDF gera sem erro nenhum e
 * o defeito só aparece olhando o arquivo. Marcas seguras: • × » · – —
 * Para qualquer forma fora disso, desenhar com View (ver `box`).
 */
function Bullets({
  items,
  mark = '•',
  empty,
  color,
  box = false,
}: {
  items: string[];
  mark?: string;
  empty: string;
  color?: string;
  /** Caixa de conferência desenhada no lugar do marcador textual. */
  box?: boolean;
}) {
  if (items.length === 0) return <Text style={[s.para, s.muted]}>{empty}</Text>;
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.li} wrap={false}>
          {box ? (
            <View style={s.checkbox} />
          ) : (
            <Text style={[s.liMark, color ? { color } : {}]}>{mark}</Text>
          )}
          <Text style={s.liText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({
  n,
  title,
  brand,
  children,
}: {
  n: number;
  title: string;
  brand: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { borderBottomColor: brand, color: brand }]}>
        {n}. {title}
      </Text>
      {children}
    </View>
  );
}

// =============================================================================
// O documento
// =============================================================================

export function SddDocument({ data }: { data: SddData }) {
  const o = data.opportunity;
  const brand = data.brandColor ?? FALLBACK_BRAND;
  const fx = o.formulario_extras ?? {};
  const px = o.persona_extras ?? {};
  const titulo = clean(o.processo) ?? `Oportunidade #${o.seq_id}`;
  const rodapeId = `#${String(o.seq_id).padStart(4, '0')} · ${titulo}`;

  return (
    <Document
      title={`SDD — ${titulo} (v${data.versao})`}
      author="PSW Digital"
      subject="Documento de Desenho da Solução"
      creator="CoE Hiperautomação"
    >
      {/* ══ 1. Capa ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.coverPage}>
        <View>
          <View style={[s.coverRule, { backgroundColor: brand }]} />
          <Text style={s.coverKicker}>DOCUMENTO DE DESENHO DA SOLUÇÃO</Text>
          <Text style={s.coverTitle}>{titulo}</Text>
          <Text style={s.coverProcess}>
            {[clean(o.area), clean(o.subarea)].filter(Boolean).join(' · ') ||
              'Área não informada'}
          </Text>
        </View>

        <View style={s.coverMetaBox}>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>EMPRESA</Text>
            <Text style={{ fontSize: 11 }}>{data.tenantName ?? '—'}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>IDENTIFICADOR</Text>
            <Text style={{ fontSize: 11 }}>#{String(o.seq_id).padStart(4, '0')}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>VERSÃO</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
              v{data.versao}
            </Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>EMITIDO EM</Text>
            <Text style={{ fontSize: 11 }}>{fmtDateTime(data.geradoEm)}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>EMITIDO POR</Text>
            <Text style={{ fontSize: 11 }}>{data.geradoPor}</Text>
          </View>
          <View style={s.coverMetaCell}>
            <Text style={s.cellLabel}>SITUAÇÃO ATUAL</Text>
            <Text style={{ fontSize: 11 }}>{STATUS_META[o.status]?.label ?? o.status}</Text>
          </View>
          <View style={{ width: '100%', marginTop: 4 }}>
            <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.4 }}>
              Documento gerado a partir dos dados registrados na plataforma CoE
              Hiperautomação. Cada emissão recebe um número de versão próprio; ao
              circular este arquivo, confira se a versão acima é a mais recente.
            </Text>
          </View>
        </View>
      </Page>

      {/* ══ Miolo ═════════════════════════════════════════════════════════ */}
      <Page size="A4" style={s.page}>
        <SumarioExecutivo data={data} brand={brand} />
        <ObjetivoContexto data={data} brand={brand} />
        <CenarioAtual data={data} brand={brand} fx={fx} px={px} />
        <ProcessoProposto data={data} brand={brand} fx={fx} px={px} />
        <Escopo data={data} brand={brand} />
        <Ganhos data={data} brand={brand} />
        <PremissasRestricoes data={data} brand={brand} />
        <Riscos data={data} brand={brand} />
        <Cronograma data={data} brand={brand} />
        <CriteriosAceite data={data} brand={brand} />
        <ProximosPassos data={data} brand={brand} />

        {/* No FIM dos filhos e cada um com seu próprio `fixed`. Ver a nota em
            `s.footerLeft` — inclusive sobre a ausência do número de página. */}
        <View style={s.footerRule} fixed />
        <Text style={s.footerLeft} fixed>
          {rodapeId}
        </Text>
        <Text style={s.footerRight} fixed>
          {`Versão ${data.versao} · emitido em ${fmtDate(data.geradoEm) ?? ''}`}
        </Text>
      </Page>
    </Document>
  );
}

// ── 2. Sumário executivo ─────────────────────────────────────────────────────
function SumarioExecutivo({ data, brand }: { data: SddData; brand: string }) {
  const o = data.opportunity;
  const favoraveis = countFavoraveis(o.criterios);
  const prazo = ultimaDataPlanejada(data);

  return (
    <Section n={2} title="Sumário executivo" brand={brand}>
      <View style={s.metricRow}>
        <View style={s.metric}>
          <Text style={[s.metricValue, { color: brand }]}>{o.score ?? '—'}</Text>
          <Text style={s.metricLabel}>score de prioridade (0–100)</Text>
        </View>
        <View style={s.metric}>
          <Text style={[s.metricValue, { color: brand }]}>
            {o.fte_horas != null ? `${o.fte_horas}h` : '—'}
          </Text>
          <Text style={s.metricLabel}>economia estimada por mês</Text>
        </View>
        <View style={s.metric}>
          <Text style={[s.metricValue, { color: brand }]}>{favoraveis}/8</Text>
          <Text style={s.metricLabel}>critérios favoráveis à automação</Text>
        </View>
        <View style={[s.metric, { marginRight: 0 }]}>
          <Text style={[s.metricValue, { color: brand }]}>{prazo ?? '—'}</Text>
          <Text style={s.metricLabel}>conclusão planejada</Text>
        </View>
      </View>

      {clean(o.objetivo_projeto) ? (
        <Text style={s.para}>{clean(o.objetivo_projeto)}</Text>
      ) : (
        <Text style={[s.para, s.muted]}>
          O objetivo do projeto ainda não foi descrito na plataforma.
        </Text>
      )}
    </Section>
  );
}

// ── 3. Objetivo e contexto ───────────────────────────────────────────────────
function ObjetivoContexto({ data, brand }: { data: SddData; brand: string }) {
  const o = data.opportunity;
  return (
    <Section n={3} title="Objetivo e contexto do projeto" brand={brand}>
      <Paragraph label="Objetivo do projeto" value={clean(o.objetivo_projeto)} />
      <Text style={s.subTitle}>ORIGEM DA DEMANDA</Text>
      <View style={s.grid}>
        <Field label="Solicitante" value={clean(o.solicitante)} />
        <Field label="Área" value={clean(o.area)} />
        <Field label="Subárea / time" value={clean(o.subarea)} />
        <Field label="Processo" value={clean(o.processo)} />
        <Field label="Abertura no CoE" value={fmtDate(o.data_abertura_coe)} />
        <Field label="Situação atual" value={STATUS_META[o.status]?.label ?? o.status} />
      </View>
    </Section>
  );
}

// ── 4. Cenário atual (AS IS) ─────────────────────────────────────────────────
function CenarioAtual({
  data,
  brand,
  fx,
  px,
}: {
  data: SddData;
  brand: string;
  fx: NonNullable<SddData['opportunity']['formulario_extras']>;
  px: NonNullable<SddData['opportunity']['persona_extras']>;
}) {
  const o = data.opportunity;
  const favoraveis = countFavoraveis(o.criterios);

  return (
    <Section n={4} title="Cenário atual — AS IS" brand={brand}>
      <Text style={s.subTitle}>COMO O PROCESSO FUNCIONA HOJE</Text>
      <View style={s.grid}>
        <Field label="Frequência" value={clean(o.frequencia)} />
        <Field label="Volume médio" value={clean(o.volume_medio)} />
        <Field label="Tempo por execução" value={clean(o.tempo_execucao)} />
        <Field label="Pessoas envolvidas" value={clean(o.num_pessoas)} />
        <Field
          label="Execuções por mês"
          value={o.execucoes_mes != null ? String(o.execucoes_mes) : null}
        />
        <Field label="Criticidade" value={o.criticidade ? cap(o.criticidade) : null} />
        <Field label="O que dispara" value={labelOf(GATILHO_LABELS, fx.gatilho)} />
        <Field
          label="Formato das entradas"
          value={labelOf(FORMATO_ENTRADA_LABELS, fx.formato_entrada)}
        />
        <Field
          label="Dados sensíveis (LGPD)"
          value={labelOf(DADOS_SENSIVEIS_LABELS, fx.dados_sensiveis)}
        />
      </View>

      <Paragraph
        label="Descrição do processo atual"
        value={clean(fx.descricao) ?? clean(px.papel)}
      />
      <Paragraph
        label="Sistemas utilizados hoje"
        value={clean(fx.sistemas) ?? clean(px.sistemas)}
      />
      <Paragraph
        label="Dor atual e motivação"
        value={clean(fx.dor) ?? clean(px.desafios)}
      />

      <Text style={s.subTitle}>
        DIAGNÓSTICO DE AUTOMAÇÃO — {favoraveis} DE 8 CRITÉRIOS FAVORÁVEIS
      </Text>
      <View style={s.th}>
        <Text style={[s.thText, { width: '72%' }]}>CRITÉRIO</Text>
        <Text style={[s.thText, { width: '14%' }]}>RESPOSTA</Text>
        <Text style={[s.thText, { width: '14%' }]}>AVALIAÇÃO</Text>
      </View>
      {CRITERIOS.map((def) => {
        const v = criterioValor(o.criterios, def.key);
        const ok = isFavoravel(def, v);
        return (
          <View key={def.key} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: '72%' }]}>{def.label}</Text>
            <Text style={[s.td, { width: '14%' }]}>
              {v ? CRITERIO_VALOR_LABEL[v] : '—'}
            </Text>
            <Text
              style={[
                s.td,
                { width: '14%', color: v == null ? MUTED : ok ? '#15803d' : '#b91c1c' },
              ]}
            >
              {v == null ? '—' : ok ? 'Favorável' : 'Desfavorável'}
            </Text>
          </View>
        );
      })}
      <Text style={[s.metricLabel, { marginTop: 6 }]}>
        Leitura: “necessidade de decisão humana frequente” é o único critério
        invertido — responder “Não” é o que favorece a automação.
        {o.rpa_score != null
          ? ` Aderência a RPA: ${o.rpa_score} de 6.`
          : ''}
      </Text>
    </Section>
  );
}

// ── 5. Processo proposto (TO BE) ─────────────────────────────────────────────
function ProcessoProposto({
  data,
  brand,
  fx,
  px,
}: {
  data: SddData;
  brand: string;
  fx: NonNullable<SddData['opportunity']['formulario_extras']>;
  px: NonNullable<SddData['opportunity']['persona_extras']>;
}) {
  const o = data.opportunity;
  const ferramentas = cleanList(o.ferramentas);

  return (
    <Section n={5} title="Processo proposto — TO BE" brand={brand}>
      <Paragraph label="O que a automação fará" value={clean(o.objetivo_projeto)} />

      <Text style={s.subTitle}>FERRAMENTAS PREVISTAS</Text>
      {ferramentas.length > 0 ? (
        <Text style={s.para}>
          {ferramentas.map((slug) => toolLabel(slug, data.toolCatalog)).join(' · ')}
        </Text>
      ) : (
        <Text style={[s.para, s.muted]}>
          Nenhuma ferramenta de automação definida até o momento.
        </Text>
      )}

      <Paragraph
        label="Sistemas envolvidos"
        value={clean(fx.sistemas) ?? clean(px.sistemas)}
      />

      <View style={[s.callout, { borderLeftColor: brand }]}>
        <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.45 }}>
          O desenho técnico detalhado — arquitetura da solução, mapa de
          integrações por sistema, requisitos de infraestrutura e acessos e
          controles de segurança — será elaborado na fase de desenho técnico e
          incorporado à próxima versão deste documento. Ver seção 12.
        </Text>
      </View>
    </Section>
  );
}

// ── 6. Escopo ────────────────────────────────────────────────────────────────
function Escopo({ data, brand }: { data: SddData; brand: string }) {
  const o = data.opportunity;
  return (
    <Section n={6} title="Escopo" brand={brand}>
      <Text style={s.subTitle}>ESTÁ CONTEMPLADO</Text>
      <Bullets
        items={cleanList(o.escopo_automacao)}
        mark="•"
        color="#15803d"
        empty="Nenhum item de escopo registrado até o momento."
      />

      <Text style={s.subTitle}>NÃO ESTÁ CONTEMPLADO</Text>
      <Bullets
        items={cleanList(o.fora_escopo)}
        mark="×"
        color="#b91c1c"
        empty="Nada foi declarado explicitamente como fora do escopo."
      />
    </Section>
  );
}

// ── 7. Ganhos esperados ──────────────────────────────────────────────────────
function Ganhos({ data, brand }: { data: SddData; brand: string }) {
  const o = data.opportunity;
  const pontuados = scoredBenefits(o.beneficios);
  const media = benefitsAverage(o.beneficios);
  const descritos = cleanList(o.beneficios_esperados);

  return (
    <Section n={7} title="Ganhos esperados" brand={brand}>
      <View style={s.metricRow}>
        <View style={[s.metric, { width: '33%' }]}>
          <Text style={[s.metricValue, { color: brand }]}>
            {o.fte_horas != null ? `${o.fte_horas}h` : '—'}
          </Text>
          <Text style={s.metricLabel}>horas economizadas por mês</Text>
        </View>
        <View style={[s.metric, { width: '33%' }]}>
          <Text style={[s.metricValue, { color: brand }]}>{media ?? '—'}</Text>
          <Text style={s.metricLabel}>média dos benefícios (1 a 5)</Text>
        </View>
        <View style={[s.metric, { width: '33%', marginRight: 0 }]}>
          <Text style={[s.metricValue, { color: brand }]}>{o.score ?? '—'}</Text>
          <Text style={s.metricLabel}>score de prioridade</Text>
        </View>
      </View>

      {pontuados.length > 0 && (
        <>
          <Text style={s.subTitle}>BENEFÍCIOS PONTUADOS</Text>
          <View style={s.th}>
            <Text style={[s.thText, { width: '80%' }]}>DIMENSÃO</Text>
            <Text style={[s.thText, { width: '20%' }]}>NOTA (1–5)</Text>
          </View>
          {pontuados.map((b) => (
            <View key={b.key} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: '80%' }]}>{b.label}</Text>
              <Text style={[s.td, { width: '20%', fontFamily: 'Helvetica-Bold' }]}>
                {b.value}
              </Text>
            </View>
          ))}
        </>
      )}

      {descritos.length > 0 && (
        <>
          <Text style={s.subTitle}>BENEFÍCIOS DESCRITOS</Text>
          <Bullets items={descritos} empty="" color={brand} />
        </>
      )}

      {clean(o.beneficio_qualitativo) && (
        <View style={[s.callout, { borderLeftColor: brand }]}>
          <Text style={{ fontSize: 9 }}>{clean(o.beneficio_qualitativo)}</Text>
        </View>
      )}

      {pontuados.length === 0 && descritos.length === 0 && o.fte_horas == null && (
        <Text style={[s.para, s.muted]}>
          Os benefícios ainda não foram pontuados nem descritos na plataforma.
        </Text>
      )}
    </Section>
  );
}

// ── 8. Premissas e restrições ────────────────────────────────────────────────
function PremissasRestricoes({ data, brand }: { data: SddData; brand: string }) {
  const o = data.opportunity;
  return (
    <Section n={8} title="Premissas e restrições" brand={brand}>
      <Text style={s.subTitle}>PREMISSAS</Text>
      <Text style={[s.metricLabel, { marginBottom: 5 }]}>
        Condições assumidas como verdadeiras. Se alguma não se confirmar, prazo e
        escopo precisam ser reavaliados em conjunto.
      </Text>
      <Bullets
        items={cleanList(o.premissas)}
        mark="•"
        color={brand}
        empty="Nenhuma premissa registrada até o momento."
      />

      <Text style={s.subTitle}>RESTRIÇÕES</Text>
      <Bullets
        items={cleanList(o.restricoes)}
        mark="•"
        color="#b45309"
        empty="Nenhuma restrição registrada até o momento."
      />
    </Section>
  );
}

// ── 9. Riscos ────────────────────────────────────────────────────────────────
function Riscos({ data, brand }: { data: SddData; brand: string }) {
  const abertos = data.risks.filter((r) => r.status !== 'mitigado');

  return (
    <Section n={9} title="Riscos e impedimentos" brand={brand}>
      {abertos.length === 0 ? (
        <Text style={[s.para, s.muted]}>
          Nenhum risco em aberto registrado para esta oportunidade.
        </Text>
      ) : (
        <>
          <View style={s.th}>
            <Text style={[s.thText, { width: '40%' }]}>DESCRIÇÃO</Text>
            <Text style={[s.thText, { width: '13%' }]}>TIPO</Text>
            <Text style={[s.thText, { width: '13%' }]}>IMPACTO</Text>
            <Text style={[s.thText, { width: '14%' }]}>PROBABIL.</Text>
            <Text style={[s.thText, { width: '10%' }]}>PRIOR.</Text>
            <Text style={[s.thText, { width: '10%' }]}>SITUAÇÃO</Text>
          </View>
          {abertos.map((r) => (
            <View key={r.id} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: '40%' }]}>{r.descricao}</Text>
              <Text style={[s.td, { width: '13%' }]}>{RISK_TIPO_LABEL[r.tipo]}</Text>
              <Text style={[s.td, { width: '13%' }]}>{IMPACTO_LABEL[r.impacto]}</Text>
              <Text style={[s.td, { width: '14%' }]}>
                {PROBABILIDADE_LABEL[r.probabilidade]}
              </Text>
              <Text style={[s.td, { width: '10%' }]}>{riskPriorityLabel(r.priority)}</Text>
              <Text style={[s.td, { width: '10%' }]}>{RISK_STATUS_LABEL[r.status]}</Text>
            </View>
          ))}
          {abertos.some((r) => clean(r.resposta)) && (
            <>
              <Text style={s.subTitle}>PLANOS DE RESPOSTA</Text>
              {abertos
                .filter((r) => clean(r.resposta))
                .map((r) => (
                  <View key={r.id} style={s.li} wrap={false}>
                    <Text style={s.liMark}>•</Text>
                    <Text style={s.liText}>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>{r.descricao}: </Text>
                      {clean(r.resposta)}
                    </Text>
                  </View>
                ))}
            </>
          )}
        </>
      )}
    </Section>
  );
}

// ── 10. Cronograma ───────────────────────────────────────────────────────────
function Cronograma({ data, brand }: { data: SddData; brand: string }) {
  const comData = data.phases.filter(
    (p) => p.planned_start_at || p.planned_end_at || p.started_at || p.finished_at
  );

  return (
    <Section n={10} title="Cronograma" brand={brand}>
      {comData.length === 0 ? (
        <Text style={[s.para, s.muted]}>
          As fases do projeto ainda não têm datas planejadas ou realizadas.
        </Text>
      ) : (
        <>
          <View style={s.th}>
            <Text style={[s.thText, { width: '28%' }]}>FASE</Text>
            <Text style={[s.thText, { width: '18%' }]}>INÍCIO PREV.</Text>
            <Text style={[s.thText, { width: '18%' }]}>FIM PREV.</Text>
            <Text style={[s.thText, { width: '18%' }]}>INÍCIO REAL</Text>
            <Text style={[s.thText, { width: '18%' }]}>FIM REAL</Text>
          </View>
          {comData.map((p) => (
            <View key={p.id} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: '28%' }]}>
                {STATUS_META[p.phase_key]?.label ?? p.phase_key}
              </Text>
              <Text style={[s.td, { width: '18%' }]}>
                {fmtDate(p.planned_start_at) ?? '—'}
              </Text>
              <Text style={[s.td, { width: '18%' }]}>
                {fmtDate(p.planned_end_at) ?? '—'}
              </Text>
              <Text style={[s.td, { width: '18%' }]}>{fmtDate(p.started_at) ?? '—'}</Text>
              <Text style={[s.td, { width: '18%' }]}>{fmtDate(p.finished_at) ?? '—'}</Text>
            </View>
          ))}
        </>
      )}
    </Section>
  );
}

// ── 11. Critérios de aceite ──────────────────────────────────────────────────
function CriteriosAceite({ data, brand }: { data: SddData; brand: string }) {
  return (
    <Section n={11} title="Critérios de aceite" brand={brand}>
      <Text style={[s.metricLabel, { marginBottom: 6 }]}>
        Condições verificáveis que precisam ser verdadeiras para a entrega ser
        considerada aceita.
      </Text>
      <Bullets
        items={cleanList(data.opportunity.criterios_aceite)}
        box
        empty="Nenhum critério de aceite registrado até o momento."
      />
    </Section>
  );
}

// ── 12. Próximos passos ──────────────────────────────────────────────────────
function ProximosPassos({ data, brand }: { data: SddData; brand: string }) {
  // Só tarefas-raiz com data futura ou sem conclusão, as 5 mais próximas — o
  // documento é do projeto, não a lista de trabalho do time.
  const proximas = data.tasks
    .filter((t) => t.parent_task_id == null && t.status !== 'finalizado' && t.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 5);

  return (
    <Section n={12} title="Próximos passos" brand={brand}>
      {proximas.length > 0 && (
        <>
          <Text style={s.subTitle}>PRÓXIMAS ENTREGAS</Text>
          <View style={s.th}>
            <Text style={[s.thText, { width: '70%' }]}>ATIVIDADE</Text>
            <Text style={[s.thText, { width: '30%' }]}>PREVISÃO</Text>
          </View>
          {proximas.map((t) => (
            <View key={t.id} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: '70%' }]}>{t.title}</Text>
              <Text style={[s.td, { width: '30%' }]}>{fmtDate(t.due_date) ?? '—'}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={s.subTitle}>A DETALHAR NA FASE DE DESENHO TÉCNICO</Text>
      <Text style={[s.metricLabel, { marginBottom: 5 }]}>
        Os temas abaixo dependem do levantamento técnico com as áreas de TI e
        segurança e serão incorporados à próxima versão deste documento.
      </Text>
      <Bullets
        items={[
          'Arquitetura da solução — componentes, fluxo de dados e diagrama.',
          'Mapa de integrações — por sistema: forma de acesso, ambiente e responsável.',
          'Requisitos de infraestrutura e acessos — servidores, licenças, credenciais e ambientes.',
          'Segurança e governança — base legal de tratamento de dados, cofre de segredos e retenção de logs.',
          'Dependências externas — entregas de terceiros das quais o projeto depende.',
          'Tratamento de exceções e sustentação — o que ocorre em caso de falha, quem é acionado e o modelo de suporte após a entrada em produção.',
        ]}
        mark="»"
        color={brand}
        empty=""
      />
    </Section>
  );
}

// =============================================================================
// Auxiliares de domínio
// =============================================================================

/** Primeira letra maiúscula; `_` vira espaço (rótulo de enum sem mapa próprio). */
function cap(v: string): string {
  const t = v.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A data de fim planejada mais distante entre as fases — o "entrega quando". */
function ultimaDataPlanejada(data: SddData): string | null {
  const datas = data.phases
    .map((p) => p.planned_end_at)
    .filter((d): d is string => typeof d === 'string' && d !== '');
  if (datas.length === 0) return null;
  return fmtDate(datas.reduce((a, b) => (a > b ? a : b)));
}
