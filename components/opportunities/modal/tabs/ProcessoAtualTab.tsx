import type { Opportunity } from '@/lib/opportunities/types';
import {
  StatusBadge,
  CriticidadeBadge,
  RpaFitBadge,
} from '@/components/opportunities/cells';
import { tempoAbertoCoe } from '@/lib/opportunities/coe';
import { PriorityPill } from '@/components/opportunities/cells';
import { InfoTip } from '@/components/opportunities/InfoTip';
import { scoreColor } from '@/lib/opportunities/utils';
import {
  calcScore,
  beneficiosSubscore,
  criteriosSubscore,
  priorityLevel,
  SCORE_BLOCK_INFO,
  SCORE_RENORMALIZE_NOTE,
} from '@/lib/opportunities/score';
import {
  GATILHO_LABELS,
  FORMATO_ENTRADA_LABELS,
  DADOS_SENSIVEIS_LABELS,
  labelOf,
} from '@/lib/opportunities/discovery-labels';

// =============================================================================
// ProcessoAtualTab — "como é hoje e por que vale automatizar".
//
// Absorve as abas "Processo" e "Critérios": eram duas telas da MESMA leitura.
// Os 8 critérios não descrevem outra coisa — são o diagnóstico feito SOBRE o
// processo descrito logo acima, e separá-los obrigava a ir e voltar para
// julgar se a resposta fazia sentido.
//
// Recupera o `rpa_score` (coluna GENERATED, derivada dos critérios): ele
// existia no card do Kanban e no CSV, e em lugar nenhum do detalhe — o
// diagnóstico de aderência a RPA estava calculado e invisível.
//
// Absorve também a aba "Score" (PO, 2026-08-19). Ela ficava solta: os
// critérios respondem "dá para automatizar?" e o score responde "e em que
// ordem?" — é a mesma avaliação, o mesmo movimento de leitura, e 20% do score
// (o bloco Critérios) já era calculado a partir da matriz logo acima. A Visão
// Geral foi descartada como destino: lá o score aparece como VALOR e FAIXA,
// julgamento pronto; a máquina de priorização (pesos, pontos sobre 20,
// renormalização) é leitura de quem prioriza, não de quem acompanha.
//
// Mesma linguagem de cartões da seção Solução, e pelo mesmo motivo: o conteúdo
// é heterogêneo (uma grade de fichas curtas, três textos corridos e uma matriz
// de critérios) e precisa de fronteiras visíveis. Por isso também é montada
// FORA da casca branca das abas de ficha.
// =============================================================================

type Props = { opportunity: Opportunity };

type CriterioValor = 'sim' | 'nao' | 'parcial';

type CriterioKey =
  | 'causaReclamacoes'
  | 'totalmenteManual'
  | 'regrasClaras'
  | 'decisaoHumana'
  | 'padronizacaoDocs'
  | 'validacaoDados'
  | 'schedulable'
  | 'temDocumentacao';

// `favoravelQuando` deixa a inversão EXPLÍCITA em vez de escondida num if:
// `decisaoHumana` é favorável quando a resposta é NÃO (sem decisão humana
// frequente, mais automatizável). Antes isso vivia só num comentário, e quem
// lia a tela não tinha como saber por que um "Não" estava verde.
const CRITERIOS: {
  key: CriterioKey;
  label: string;
  favoravelQuando: 'sim' | 'nao';
}[] = [
  { key: 'causaReclamacoes', label: 'Causa reclamações quando falha', favoravelQuando: 'sim' },
  { key: 'totalmenteManual', label: 'Totalmente manual', favoravelQuando: 'sim' },
  { key: 'regrasClaras', label: 'Processo baseado em regras claras', favoravelQuando: 'sim' },
  { key: 'decisaoHumana', label: 'Necessidade de decisão humana frequente', favoravelQuando: 'nao' },
  { key: 'padronizacaoDocs', label: 'Padronização em documentos (PDFs, formulários)', favoravelQuando: 'sim' },
  { key: 'validacaoDados', label: 'Validação ou conferência de dados simples', favoravelQuando: 'sim' },
  { key: 'schedulable', label: 'Pode ser programado para horários específicos', favoravelQuando: 'sim' },
  { key: 'temDocumentacao', label: 'Possui documentação do processo', favoravelQuando: 'sim' },
];

// Pontos por fator — ESPELHO da tabela de `calcScore` (score.ts). Vive aqui só
// para exibir a decomposição; o total NUNCA é recalculado a partir dela (usa
// `o.score`, da view). Esforço e complexidade são INVERTIDOS: menos esforço e
// menos complexidade pontuam mais, porque são mais fáceis de entregar.
const FATOR_PONTOS = {
  esforco: { baixo: 20, medio: 14, alto: 8 } as Record<string, number>,
  complexidade: { baixo: 20, medio: 13, alto: 6 } as Record<string, number>,
  tempo: { diario: 20, semanal: 16, quinzenal: 12, mensal: 8, anual: 2 } as Record<string, number>,
  fte: { muito_baixo: 4, baixo: 8, medio: 12, alto: 16, muito_alto: 20 } as Record<string, number>,
};
const OBJ_PONTOS: Record<number, number> = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 };

const NIVEL_LABEL: Record<string, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };
const FREQ_LABEL: Record<string, string> = {
  diario: 'Diário', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', anual: 'Anual',
};
const FTE_LABEL: Record<string, string> = {
  muito_baixo: 'Muito Baixo', baixo: 'Baixo', medio: 'Médio', alto: 'Alto', muito_alto: 'Muito Alto',
};

function pill(v: CriterioValor | undefined) {
  if (v === 'sim')
    return { label: 'Sim', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
  if (v === 'nao')
    return { label: 'Não', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
  if (v === 'parcial')
    return { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200' };
  return { label: '—', cls: 'bg-slate-100 text-mut dark:bg-slate-800' };
}

export function ProcessoAtualTab({ opportunity: o }: Props) {
  const extras = o.formulario_extras ?? {};
  const tempoAberto = tempoAbertoCoe(o.data_abertura_coe, o.data_fechamento_coe);
  const criterios = (o.criterios ?? null) as Partial<
    Record<CriterioKey, CriterioValor>
  > | null;

  const favoraveis = criterios
    ? CRITERIOS.filter((c) => criterios[c.key] === c.favoravelQuando).length
    : 0;
  const pctFav = (favoraveis / CRITERIOS.length) * 100;
  const barColor = favoraveis >= 6 ? '#22c55e' : favoraveis >= 4 ? '#f59e0b' : '#ef4444';

  const narrativas = [
    { label: 'Como o processo funciona hoje', valor: extras.descricao },
    { label: 'Sistemas utilizados', valor: extras.sistemas },
    { label: 'Dor atual e motivação', valor: extras.dor },
  ].filter((n) => n.valor && n.valor.trim() !== '');

  return (
    <div className="flex flex-col gap-4">
      {/* ── Os fatos do processo ───────────────────────────────────────── */}
      <Card title="O processo hoje">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          <Fact label="Frequência de execução" value={o.frequencia} />
          <Fact label="Número de execuções" value={o.volume_medio} />
          <Fact
            label="Execuções por mês"
            value={o.execucoes_mes != null ? String(o.execucoes_mes) : null}
          />
          <Fact label="Tempo médio de execução" value={o.tempo_execucao} />
          <Fact label="Pessoas envolvidas" value={o.num_pessoas} />
          <Fact label="Área responsável" value={o.area} />
          <Fact label="Subárea / time" value={o.subarea} />
          <Fact label="Tipo do processo" value={extras.tipo_processo} />
          <Fact label="Gatilho (o que inicia)" value={labelOf(GATILHO_LABELS, extras.gatilho)} />
          <Fact
            label="Formato das entradas"
            value={labelOf(FORMATO_ENTRADA_LABELS, extras.formato_entrada)}
          />
          <Fact
            label="Dados sensíveis (LGPD)"
            value={labelOf(DADOS_SENSIVEIS_LABELS, extras.dados_sensiveis)}
          />
          <Fact label="Criticidade">
            <CriticidadeBadge value={o.criticidade} />
          </Fact>
          <Fact label="Status atual">
            <StatusBadge status={o.status} />
          </Fact>
        </div>

        {tempoAberto && (
          <p className="text-[11px] text-mut mt-3 pt-3 border-t border-bdr">
            ⏱️ {tempoAberto} no CoE
          </p>
        )}
      </Card>

      {/* ── O processo em palavras ─────────────────────────────────────── */}
      {narrativas.length > 0 && (
        <Card title="Detalhamento">
          <div className="flex flex-col gap-4">
            {narrativas.map((n) => (
              <div key={n.label}>
                <div className="text-[11px] font-semibold text-txt mb-1.5">
                  {n.label}
                </div>
                <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap">
                  {n.valor}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── O diagnóstico feito sobre o processo acima ─────────────────── */}
      <Card title="Diagnóstico de automação">
        {criterios == null ? (
          <p className="text-[12px] text-mut italic">
            Critérios técnicos ainda não preenchidos para esta oportunidade.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 flex-wrap mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                <span className="text-[13px] font-bold text-txt whitespace-nowrap">
                  {favoraveis} de {CRITERIOS.length} critérios favoráveis
                </span>
                <div className="flex-1 h-2 bg-bdr rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pctFav}%`, background: barColor }}
                  />
                </div>
              </div>

              {/* Aderência a RPA — derivada dos critérios pelo banco. */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
                  Aderência
                </span>
                <RpaFitBadge score={o.rpa_score} />
              </div>
            </div>

            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {CRITERIOS.map((c) => {
                const v = criterios[c.key];
                const favoravel = v === c.favoravelQuando;
                const p = pill(v);
                return (
                  <li
                    key={c.key}
                    className="bg-bg rounded-lg pl-3.5 pr-3 py-2.5 flex justify-between items-center gap-2 border-l-[3px]"
                    style={{ borderLeftColor: favoravel ? '#22c55e' : '#ef4444' }}
                  >
                    <span className="text-[12px] text-txt flex-1 leading-snug">
                      {c.label}
                      {/* A inversão do critério fica VISÍVEL, não escondida num
                          comentário de código: sem isto, um "Não" em verde
                          parece erro de renderização. */}
                      {c.favoravelQuando === 'nao' && (
                        <span className="block text-[10px] text-mut">
                          favorável quando “Não”
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${p.cls}`}
                    >
                      {p.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* ── Por que foi priorizado assim ───────────────────────────────── */}
      <PrioridadeCard opportunity={o} />

      {/* ── Interno ────────────────────────────────────────────────────── */}
      {o.notas && o.notas.trim() !== '' && (
        <Card title="Notas internas">
          <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap">
            {o.notas}
          </p>
        </Card>
      )}
    </div>
  );
}

/**
 * A explicação do score — o que era a aba "Score".
 *
 * O TOTAL vem de `o.score` (calculado pela view, DB-authoritative); os
 * sub-scores usam as mesmas funções de `score.ts`. A tabela de pontos por
 * fator existe só para decompor visualmente — nada aqui recalcula o total, que
 * nunca é persistido nem derivado no cliente.
 */
function PrioridadeCard({ opportunity: o }: { opportunity: Opportunity }) {
  const prioridade = {
    esforco: o.esforco ?? undefined,
    complexidade: o.complexidade ?? undefined,
    tempo: o.tempo ?? undefined,
    objetivo: o.objetivo ?? undefined,
    fte: o.fte ?? undefined,
  };

  const blocos = [
    { key: 'fatores' as const, sub: calcScore(prioridade) },
    {
      key: 'beneficios' as const,
      sub: beneficiosSubscore(
        o.beneficios as Record<string, number | null | undefined> | null
      ),
    },
    {
      key: 'criterios' as const,
      sub: criteriosSubscore(
        o.criterios as Record<string, string | null | undefined> | null
      ),
    },
  ];

  const fatores = [
    {
      label: 'Esforço / viabilidade',
      valor: o.esforco ? (NIVEL_LABEL[o.esforco] ?? o.esforco) : '—',
      pts: o.esforco ? (FATOR_PONTOS.esforco[o.esforco] ?? 14) : 0,
    },
    {
      label: 'Complexidade',
      valor: o.complexidade ? (NIVEL_LABEL[o.complexidade] ?? o.complexidade) : '—',
      pts: o.complexidade ? (FATOR_PONTOS.complexidade[o.complexidade] ?? 13) : 0,
    },
    {
      label: 'Frequência / retorno',
      valor: o.tempo ? (FREQ_LABEL[o.tempo] ?? o.tempo) : '—',
      pts: o.tempo ? (FATOR_PONTOS.tempo[o.tempo] ?? 16) : 0,
    },
    {
      label: 'Alinhamento estratégico',
      valor: o.objetivo ? `${o.objetivo}/5` : '—',
      pts: o.objetivo ? (OBJ_PONTOS[o.objetivo] ?? 12) : 0,
    },
    {
      label: 'FTE — impacto em horas',
      valor: o.fte ? (FTE_LABEL[o.fte] ?? o.fte) : '—',
      pts: o.fte ? (FATOR_PONTOS.fte[o.fte] ?? 12) : 0,
    },
  ];

  const nivel = o.priority_level ?? priorityLevel(o.score);

  return (
    <Card title="Por que foi priorizado assim">
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <span
          className="text-[32px] font-black leading-none tabular-nums"
          style={{ color: scoreColor(o.score) }}
        >
          {o.score}
          <span className="text-[13px] text-mut font-normal"> / 100</span>
        </span>
        <PriorityPill level={nivel} />
        <span className="text-[11px] text-mut">Score de prioridade</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {blocos.map(({ key, sub }) => {
          const info = SCORE_BLOCK_INFO[key];
          return (
            <div key={key} className="bg-bg rounded-lg px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] text-mut inline-flex items-center gap-1.5">
                  {info.label}
                  <InfoTip label={info.label}>{info.explica}</InfoTip>
                </span>
                <span className="text-[10px] font-bold text-mut bg-bdr/60 rounded-full px-1.5 py-0.5">
                  {info.peso}
                </span>
              </div>
              <div className="text-[15px] font-extrabold text-txt tabular-nums mb-1.5">
                {sub == null ? 'n/i' : sub}
                {sub != null && <span className="text-[11px] text-mut font-normal"> / 100</span>}
              </div>
              <div className="h-1.5 bg-bdr rounded-full overflow-hidden">
                <div className="h-full bg-pri rounded-full" style={{ width: `${sub ?? 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] font-semibold text-txt mb-2">
        Os 5 fatores, 20 pontos cada
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
        {fatores.map((f) => (
          <li key={f.label} className="flex items-center gap-3">
            <span className="text-[12px] text-mut w-[168px] flex-shrink-0 truncate">
              {f.label}
            </span>
            <span className="text-[12px] font-semibold text-txt w-[92px] flex-shrink-0 truncate">
              {f.valor}
            </span>
            <span className="flex-1 h-1.5 bg-bdr rounded-full overflow-hidden">
              <span
                className="block h-full bg-pri rounded-full"
                style={{ width: `${(f.pts / 20) * 100}%` }}
              />
            </span>
            <span className="text-[11px] text-mut tabular-nums w-11 text-right flex-shrink-0">
              +{f.pts}/20
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-mut mt-3 bg-bg rounded-lg px-3 py-2">
        💡 {SCORE_RENORMALIZE_NOTE}
      </p>
    </Card>
  );
}

// ─── Primitivos (mesma linguagem da seção Solução) ───────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-wh border border-bdr rounded-xl shadow-sm px-4 py-3.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  const vazio = !value || value.trim() === '' || value === '–';
  if (vazio && !children) return null;

  return (
    <div className="bg-bg rounded-lg px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1 leading-tight">
        {label}
      </div>
      {children ?? (
        <div className="text-[13px] font-semibold text-txt leading-snug break-words">
          {value}
        </div>
      )}
    </div>
  );
}
