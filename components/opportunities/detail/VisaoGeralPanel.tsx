'use client';

import Link from 'next/link';

import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityTask,
} from '@/lib/opportunities/types';
import type { TimelineEntry } from '@/lib/audit/timeline';
import { TASK_STATUS_ORDER, TASK_STATUS_META } from '@/lib/opportunities/task-labels';
import { summarizeTasks } from '@/lib/opportunities/task-summary';
import { STATUS_LABEL, priorityBadgeClass, priorityLabel } from '@/lib/opportunities/risk-labels';
import { scoreColor } from '@/lib/opportunities/utils';
import { PriorityPill } from '@/components/opportunities/cells';
import {
  buildPipeline,
  daysBetween,
  nextMilestone,
  phaseDates,
  buildDeadline,
  summarizeRisks,
  blockedTasks,
  overdueTasks,
  planIdleDays,
  PLAN_IDLE_ALERT_DAYS,
  topBenefits,
  recentActivity,
  dayLabel,
  projectTraits,
  diasNoCoe,
  type OverviewTarget,
  type PipelineStep,
} from '@/lib/opportunities/overview';

// =============================================================================
// VisaoGeralPanel — a seção "Visão Geral" do detalhe da oportunidade.
//
// Responde "como está o projeto agora" para quem NÃO trabalha nele todo dia.
// Tudo aqui é LEITURA DERIVADA dos arrays que a página já buscou (lib/
// opportunities/overview.ts) — a única exceção é `objetivo_projeto` (0061),
// que é o único campo editável desta seção e entra no fluxo global de
// Editar/Salvar do detalhe, como qualquer outro campo de `opportunities`.
//
// Ordem das faixas (deliberada):
//   1. Saúde — quatro NÚMEROS que mudam toda semana.
//   2. O caso — objetivo e valor: por que o projeto existe. Não muda.
//   3. Cronograma resumido — as 7 etapas do pipeline.
//   4. Ação — o que precisa de decisão + o que mudou desde a última visita.
// As faixas 1 e 2 são a resposta executiva e devem caber acima da dobra.
//
// Atributos ESTÁTICOS (complexidade/esforço/criticidade) ficam junto do
// objetivo, nunca na faixa 1: dado que nunca muda ao lado de indicadores vivos
// faz a faixa inteira mentir sobre ser "o estado agora".
// =============================================================================

type Props = {
  opportunity: Opportunity;
  tasks: OpportunityTask[];
  phases: OpportunityPhase[];
  risks: OpportunityRisk[];
  history: TimelineEntry[];
  /** Data de HOJE (ISO) vinda do servidor — ver `overview.ts`. */
  today: string;
  /** Leva o leitor à aba dona do assunto (alertas, "ver todos", etc.). */
  onNavigate: (target: OverviewTarget) => void;
  /** Fluxo global de edição do detalhe (D-12). */
  editMode: boolean;
  objetivoProjeto: string;
  onObjetivoChange: (v: string) => void;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return m && d ? `${d}/${m}` : '—';
}

export function VisaoGeralPanel({
  opportunity: o,
  tasks,
  phases,
  risks,
  history,
  today,
  onNavigate,
  editMode,
  objetivoProjeto,
  onObjetivoChange,
}: Props) {
  const summary = summarizeTasks(tasks, today);
  const pipeline = buildPipeline(phases, today);
  const marco = nextMilestone(pipeline, today);
  const deadline = buildDeadline(phases, tasks);
  const riskSummary = summarizeRisks(risks);
  const bloqueadas = blockedTasks(tasks);
  const atrasadas = overdueTasks(tasks, today);
  const idleDays = planIdleDays(tasks, today);
  const top3 = topBenefits(o.beneficios);
  const recentes = recentActivity(history, 6);
  const traits = projectTraits(o);
  const coeDias = diasNoCoe(o, today);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Faixa 1 — Saúde ─────────────────────────────────────────────── */}
      {/* Dois indicadores, e só. O card de marco some quando não há marco (a
          ausência dele não diz nada sobre o projeto, só que ninguém estimou
          fase ainda) e o progresso ocupa a faixa inteira. Riscos deixaram de
          ser um número aqui: viraram a LISTA da faixa 4, que é o que se
          precisa ler para agir. */}
      <div
        className={
          'grid grid-cols-1 gap-4 ' + (marco ? 'sm:grid-cols-2' : '')
        }
      >
        <ProgressCard summary={summary} />
        {marco && <MilestoneCard marco={marco} />}
      </div>

      {/* ── Faixa 2 — O caso ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <ObjetivoCard
            value={objetivoProjeto}
            editMode={editMode}
            onChange={onObjetivoChange}
            traits={traits}
            coeDias={coeDias}
          />
        </div>
        <ValorCard
          opportunity={o}
          top3={top3}
          onOpenScore={() => onNavigate('processo')}
        />
      </div>

      {/* ── Faixa 3 — Cronograma resumido ───────────────────────────────── */}
      <PipelineCard
        pipeline={pipeline}
        entregaFinal={deadline.estimado}
        onOpen={() => onNavigate('cronograma')}
      />

      {/* ── Faixa 4 — Ação ─────────────────────────────────────────────── */}
      {/* Riscos e pendências do plano são BLOCOS SEPARADOS de propósito: um
          risco é o que pode dar errado e se gerencia por resposta; uma tarefa
          atrasada ou travada é trabalho parado, e o que se faz com ela é
          abrir. Misturar os dois numa lista só obrigava o leitor a triar. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <RiscosCard
            risks={riskSummary.abertos}
            onOpen={() => onNavigate('risco')}
          />
          <PendenciasCard
            opportunityId={o.id}
            atrasadas={atrasadas}
            bloqueadas={bloqueadas}
            idleDays={idleDays}
            today={today}
          />
        </div>
        <RecentesCard
          recentes={recentes}
          today={today}
          onOpen={() => onNavigate('historico')}
        />
      </div>

      <p className="text-[11px] text-mut text-right px-1">
        Última atualização: {fmtDate(o.updated_at)}
      </p>
    </div>
  );
}

// ─── Casca comum ─────────────────────────────────────────────────────────────

function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-wh border border-bdr rounded-xl shadow-sm px-4 py-3.5 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 mb-2.5">
          {title && (
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-mut">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Faixa 1 ─────────────────────────────────────────────────────────────────

/**
 * Progresso do plano. A barra sozinha é decoração: cinco cores sem chave não
 * dizem nada. Ela só vale acompanhada da LEGENDA COM OS NÚMEROS logo abaixo —
 * a barra dá a proporção de relance, a legenda dá o valor. É o mesmo par que a
 * rosca da coluna lateral já usava, e as cores são as mesmas do Kanban e dos
 * selos da Lista (`TASK_STATUS_META` é fonte única), para que quem lê o
 * detalhe inteiro não precise reaprender a paleta a cada seção.
 *
 * A legenda mostra os CINCO status sempre, inclusive os zerados: "Bloqueio 0"
 * é informação boa, e esconder categorias faria o vocabulário mudar de tela
 * para tela.
 */
function ProgressCard({ summary }: { summary: ReturnType<typeof summarizeTasks> }) {
  if (summary.total === 0) {
    return (
      <Card title="Progresso do plano">
        <div className="text-[32px] font-black text-mut leading-none">—</div>
        <p className="text-[12px] text-mut mt-2">
          Nenhuma tarefa cadastrada ainda. O progresso aparece assim que o plano de
          atividades tiver tarefas.
        </p>
      </Card>
    );
  }

  const composicao = TASK_STATUS_ORDER.map(
    (st) => `${summary.byStatus[st]} ${TASK_STATUS_META[st].label}`
  ).join(', ');

  return (
    <Card title="Progresso do plano">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[32px] font-black text-pri leading-none tabular-nums">
          {summary.percentComplete}%
        </span>
        <span className="text-[12px] text-mut">
          concluído — {summary.concluidas} de {summary.total}{' '}
          {summary.total === 1 ? 'tarefa finalizada' : 'tarefas finalizadas'}
        </span>
      </div>

      <div
        className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-bdr"
        role="img"
        aria-label={`Composição do plano: ${composicao}.`}
      >
        {TASK_STATUS_ORDER.map((st) => {
          const n = summary.byStatus[st];
          if (n === 0) return null;
          return (
            <div
              key={st}
              style={{
                width: `${(n / summary.total) * 100}%`,
                background: TASK_STATUS_META[st].color,
              }}
            />
          );
        })}
      </div>

      {/* A chave da barra. Sem isto o gráfico acima é enfeite. */}
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {TASK_STATUS_ORDER.map((st) => {
          const meta = TASK_STATUS_META[st];
          const n = summary.byStatus[st];
          return (
            <li
              key={st}
              className={
                'flex items-center gap-1.5 text-[11px] whitespace-nowrap ' +
                (n === 0 ? 'opacity-45' : '')
              }
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: meta.color }}
                aria-hidden="true"
              />
              <span className="text-mut">{meta.label}</span>
              <span className="font-bold text-txt tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Só é montado quando EXISTE marco (ver faixa 1) — por isso `marco` é não-nulo
 * aqui e não há ramo de estado vazio: o card inteiro é que não aparece.
 */
function MilestoneCard({ marco }: { marco: NonNullable<ReturnType<typeof nextMilestone>> }) {
  return (
    <Card title="Próximo marco">
      <>
        <div className="flex items-center gap-2">
            <span className="text-[18px]" aria-hidden="true">
              {marco.icon}
            </span>
            <span className="text-[16px] font-bold text-txt leading-tight">
              {marco.label}
            </span>
          </div>
          <div className="text-[15px] font-bold text-pri mt-1.5 tabular-nums">
            {fmtDate(marco.date)}
          </div>
        <p className="text-[11px] text-mut mt-1.5">
          {marco.diasRestantes > 0
            ? `Faltam ${marco.diasRestantes} dia${marco.diasRestantes > 1 ? 's' : ''}`
            : marco.diasRestantes === 0
              ? 'É hoje'
              : `Previsto há ${Math.abs(marco.diasRestantes)} dia${Math.abs(marco.diasRestantes) > 1 ? 's' : ''}, ainda não iniciado`}
        </p>
      </>
    </Card>
  );
}

// ─── Faixa 2 ─────────────────────────────────────────────────────────────────

function ObjetivoCard({
  value,
  editMode,
  onChange,
  traits,
  coeDias,
}: {
  value: string;
  editMode: boolean;
  onChange: (v: string) => void;
  traits: ReturnType<typeof projectTraits>;
  coeDias: number | null;
}) {
  return (
    <Card title="Objetivo do projeto">
      {editMode ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Em duas ou três linhas, para que este projeto existe — em linguagem de negócio."
          className="w-full px-3 py-2 border border-bdr rounded-lg text-[13px] bg-bg text-txt leading-relaxed"
        />
      ) : value.trim() !== '' ? (
        <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap">
          {value}
        </p>
      ) : (
        <p className="text-[13px] text-mut italic leading-relaxed">
          Nenhum objetivo descrito ainda. Use “Editar” para escrever, em duas ou três
          linhas, para que este projeto existe.
        </p>
      )}

      {/* Ficha de identidade: atributos que NÃO mudam com o andamento. Ficam
          aqui, subordinados ao objetivo — quem lê o objetivo entende, na mesma
          respiração, o tamanho do que está lendo. */}
      {(traits.length > 0 || coeDias !== null) && (
        <div className="mt-3 pt-3 border-t border-bdr flex items-center gap-2 flex-wrap">
          {traits.map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg border border-bdr text-[11px]"
              title={t.label}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="text-mut">{t.label}</span>
              <span className="font-bold text-txt">{t.value}</span>
            </span>
          ))}
          {coeDias !== null && (
            <span className="text-[11px] text-mut">
              · aberto no CoE há {coeDias} {coeDias === 1 ? 'dia' : 'dias'}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Valor esperado. Mostra o CABEÇALHO do caso de negócio, não o caso inteiro:
 * as horas economizadas, os três benefícios que mais pesaram e de onde veio o
 * score. Os 8 benefícios pontuados um a um e os 5 fatores do score ficam em
 * Processo Atual / Score — são leitura única, e repeti-los aqui faria da Visão
 * Geral uma segunda cópia deles.
 *
 * A COMPOSIÇÃO do score (Fatores 50% / Benefícios 30% / Critérios 20%) NÃO
 * fica aqui: ela é o conteúdo próprio da aba Score, que ainda mostra os 5
 * fatores e a nota de renormalização. Replicá-la aqui não era eco, era cópia
 * — o mesmo bloco, com os mesmos tooltips, em duas telas. Deste lado ficam só
 * o VALOR e a FAIXA (julgamento pronto, sem fórmula), com o caminho para a
 * explicação inteira a um clique.
 */
function ValorCard({
  opportunity: o,
  top3,
  onOpenScore,
}: {
  opportunity: Opportunity;
  top3: { label: string; value: number }[];
  onOpenScore: () => void;
}) {
  const esperados = (o.beneficios_esperados ?? []).filter((b) => b.trim() !== '');

  return (
    <Card title="Valor esperado">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[32px] font-black text-sky-600 dark:text-sky-400 leading-none tabular-nums">
          {o.fte_horas != null ? o.fte_horas : '—'}
        </span>
        <span className="text-[12px] text-mut">
          {o.fte_horas != null ? 'horas economizadas por mês' : 'FTE não informado'}
        </span>
      </div>

      {top3.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1.5">
            Benefícios mais fortes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {top3.map((b) => (
              <span
                key={b.label}
                className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                title={`Pontuado ${b.value} de 5`}
              >
                {b.label} {b.value}/5
              </span>
            ))}
          </div>
        </div>
      )}

      {top3.length === 0 && esperados.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {esperados.slice(0, 3).map((b, i) => (
            <li key={i} className="text-[12px] text-txt flex gap-1.5">
              <span className="text-pri flex-shrink-0">→</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-bdr">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px] text-mut">Score de prioridade</span>
          <span className="flex items-center gap-2">
            {o.priority_level && <PriorityPill level={o.priority_level} />}
            <span
              className="text-[15px] font-black tabular-nums"
              style={{ color: scoreColor(o.score) }}
            >
              {o.score}
              <span className="text-[11px] text-mut font-normal"> /100</span>
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenScore}
          className="mt-2 text-[11px] font-semibold text-pri hover:text-pril"
        >
          Como este score foi calculado →
        </button>
      </div>
    </Card>
  );
}

// ─── Faixa 3 ─────────────────────────────────────────────────────────────────

/**
 * As 7 etapas do pipeline. Rótulo e cor vêm de `STATUS_META` — por isso
 * `em_analise` aparece como "Refinamento" sem nenhum mapa local, e a etapa
 * "Produção" tem aqui o nome que tem em toda a plataforma.
 */
function PipelineCard({
  pipeline,
  entregaFinal,
  onOpen,
}: {
  pipeline: PipelineStep[];
  entregaFinal: string | null;
  onOpen: () => void;
}) {
  const atual = pipeline.find((p) => p.state === 'atual');

  return (
    <Card
      title="Resumo do cronograma"
      action={
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] font-semibold text-pri hover:text-pril"
        >
          Abrir cronograma →
        </button>
      }
    >
      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
        {/* Etapas — rolam na horizontal dentro do próprio contêiner; a página
            nunca rola lateralmente. */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-stretch gap-1 min-w-max py-0.5">
            {pipeline.map((p, i) => (
              <div key={p.key} className="flex items-center gap-1">
                <div
                  className={
                    'px-3 py-2 rounded-lg border min-w-[104px] ' +
                    (p.state === 'atual'
                      ? 'border-pri bg-pri/5 dark:bg-pri/15'
                      : p.state === 'concluida'
                        ? 'border-bdr bg-bg'
                        : 'border-bdr bg-wh')
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" aria-hidden="true">
                      {p.state === 'concluida' ? '✓' : p.icon}
                    </span>
                    <span
                      className={
                        'text-[11px] font-bold truncate ' +
                        (p.state === 'atual'
                          ? 'text-pri'
                          : p.state === 'concluida'
                            ? 'text-txt'
                            : 'text-mut')
                      }
                    >
                      {p.label}
                    </span>
                  </div>
                  <PhaseDateLines step={p} />
                  {p.state === 'atual' && (
                    <div className="text-[9px] font-bold text-pri mt-0.5">
                      em andamento
                    </div>
                  )}
                  {p.atrasada && (
                    <div className="text-[9px] font-bold text-red-600 dark:text-red-400 mt-0.5">
                      prazo vencido
                    </div>
                  )}
                </div>
                {i < pipeline.length - 1 && (
                  <span className="text-mut text-[12px]" aria-hidden="true">
                    ›
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-mut mt-2">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">real.</span>{' '}
            datas realizadas (automáticas) ·{' '}
            <span className="font-bold">prev.</span> datas estimadas (editáveis no
            Cronograma)
          </p>
        </div>

        <div className="xl:w-[190px] xl:shrink-0 xl:border-l xl:border-bdr xl:pl-4 flex flex-col gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut">
              Fase atual
            </div>
            <div className="text-[12px] font-bold text-txt mt-0.5">
              {atual ? atual.label : '—'}
            </div>
            {atual && (
              <div className="text-[11px] text-mut tabular-nums flex flex-col">
                <span>
                  Iniciada em{' '}
                  <span className="text-txt font-semibold">
                    {fmtDate(atual.startedAt)}
                  </span>
                </span>
                <span>
                  Fim estimado{' '}
                  <span className="text-txt font-semibold">
                    {fmtDate(atual.plannedEnd)}
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-bdr">
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut">
              Entrega final
            </div>
            <div className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
              {fmtDate(entregaFinal)}
            </div>
            <div className="text-[10px] text-mut">Fim estimado da última fase</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * As datas de uma fase, com o rótulo que diz de qual linha do tempo elas vêm.
 * A escolha (realizado × estimado) é a regra pura `phaseDates` — aqui só se
 * desenha. Sem os rótulos "real."/"prev." o leitor via duas datas e não tinha
 * como saber se era o que aconteceu ou o que se planeja.
 */
function PhaseDateLines({ step }: { step: PipelineStep }) {
  const { principal, secundaria } = phaseDates(step);

  if (!principal) {
    return (
      <div className="text-[10px] text-mut mt-0.5 whitespace-nowrap">sem data</div>
    );
  }

  return (
    <div className="mt-0.5 flex flex-col leading-tight">
      <span className="text-[10px] tabular-nums whitespace-nowrap">
        <span
          className={
            'font-bold mr-1 ' +
            (principal.label === 'real.'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-mut')
          }
        >
          {principal.label}
        </span>
        <span className="text-mut">
          {fmtDateShort(principal.inicio)}
          {principal.fim || principal.label === 'prev.'
            ? ` – ${fmtDateShort(principal.fim)}`
            : ' –'}
        </span>
      </span>
      {secundaria && (
        <span className="text-[10px] tabular-nums whitespace-nowrap">
          <span className="font-bold mr-1 text-mut">{secundaria.label}</span>
          <span className="text-mut">fim {fmtDateShort(secundaria.fim)}</span>
        </span>
      )}
    </div>
  );
}

// ─── Faixa 4 ─────────────────────────────────────────────────────────────────

/**
 * Riscos abertos — LISTA, não contador. O número sozinho ("3 riscos abertos")
 * obriga a ir a outra tela para saber se importa; a lista já responde. Mostra
 * os de maior prioridade primeiro (`summarizeRisks` ordena) e manda o resto
 * para a aba Risco, que é a dona do assunto.
 */
function RiscosCard({
  risks,
  onOpen,
}: {
  risks: OpportunityRisk[];
  onOpen: () => void;
}) {
  const MAX = 5;

  return (
    <Card
      title="Riscos abertos"
      action={
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] font-semibold text-pri hover:text-pril"
        >
          Ver todos os riscos →
        </button>
      }
    >
      {risks.length === 0 ? (
        <p className="text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold">
          ✓ Nenhum risco em aberto.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-bdr/60">
            {risks.slice(0, MAX).map((r) => (
              <li key={r.id} className="py-2 flex items-start gap-2.5">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${priorityBadgeClass(r.priority)}`}
                >
                  {priorityLabel(r.priority)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-txt">{r.descricao}</span>
                  <span className="block text-[10px] text-mut">
                    {STATUS_LABEL[r.status]}
                    {r.responsavel ? ` · ${r.responsavel}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {risks.length > MAX && (
            <p className="text-[11px] text-mut mt-2">
              e mais {risks.length - MAX}{' '}
              {risks.length - MAX === 1 ? 'risco aberto' : 'riscos abertos'}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Pendências do plano — bloco PRÓPRIO, separado dos riscos. Cada linha leva
 * direto à tarefa (`/tarefas?tarefa=<id>` abre o diálogo dela na tela cheia do
 * plano), porque o que se faz com trabalho parado é abrir, não catalogar.
 */
function PendenciasCard({
  opportunityId,
  atrasadas,
  bloqueadas,
  idleDays,
  today,
}: {
  opportunityId: string;
  atrasadas: OpportunityTask[];
  bloqueadas: OpportunityTask[];
  idleDays: number | null;
  today: string;
}) {
  const MAX = 4;
  const parado = idleDays !== null && idleDays >= PLAN_IDLE_ALERT_DAYS;
  const vazio = atrasadas.length === 0 && bloqueadas.length === 0 && !parado;

  function href(taskId: string) {
    return `/opportunities/${opportunityId}/tarefas?tarefa=${taskId}`;
  }

  return (
    <Card title="Pendências do plano">
      {vazio ? (
        <p className="text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold">
          ✓ Nenhuma tarefa atrasada ou bloqueada.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {atrasadas.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1.5">
                ⏰ Atrasadas ({atrasadas.length})
              </div>
              <ul className="flex flex-col divide-y divide-bdr/60">
                {atrasadas.slice(0, MAX).map((t) => {
                  const dias = daysBetween(t.due_date!.slice(0, 10), today);
                  return (
                    <li key={t.id} className="py-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-txt truncate">
                          {t.title}
                        </span>
                        <span className="block text-[10px] text-mut">
                          Entrega {fmtDate(t.due_date)} · {dias}{' '}
                          {dias === 1 ? 'dia' : 'dias'} de atraso
                        </span>
                      </span>
                      <Link
                        href={href(t.id)}
                        className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-bdr bg-wh text-txt text-[11px] font-bold hover:bg-bg transition-colors"
                      >
                        Abrir
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {atrasadas.length > MAX && (
                <p className="text-[11px] text-mut mt-1">
                  e mais {atrasadas.length - MAX} atrasada
                  {atrasadas.length - MAX > 1 ? 's' : ''}.
                </p>
              )}
            </div>
          )}

          {bloqueadas.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1.5">
                🚫 Bloqueadas ({bloqueadas.length})
              </div>
              <ul className="flex flex-col divide-y divide-bdr/60">
                {bloqueadas.slice(0, MAX).map((t) => (
                  <li key={t.id} className="py-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-txt truncate">
                        {t.title}
                      </span>
                      <span className="block text-[10px] text-mut">
                        {t.blocked_reason ?? 'Sem motivo registrado.'}
                      </span>
                    </span>
                    <Link
                      href={href(t.id)}
                      className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-bdr bg-wh text-txt text-[11px] font-bold hover:bg-bg transition-colors"
                    >
                      Abrir
                    </Link>
                  </li>
                ))}
              </ul>
              {bloqueadas.length > MAX && (
                <p className="text-[11px] text-mut mt-1">
                  e mais {bloqueadas.length - MAX} bloqueada
                  {bloqueadas.length - MAX > 1 ? 's' : ''}.
                </p>
              )}
            </div>
          )}

          {/* Plano parado: nenhuma tarefa criada ou alterada há semanas. É o
              sinal mais honesto de projeto travado e não existia em lugar
              nenhum — nem tarefa atrasada ele produz, porque plano sem data
              nunca vence. */}
          {parado && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-2">
              💤 Plano sem movimentação há {idleDays} dias.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * "O que mudou recentemente" — a pergunta real de quem acompanha um projeto
 * semanalmente não é "como está?", é "o que mudou desde a última vez que
 * olhei?". Sai do registro de auditoria (0038).
 *
 * As linhas são OCORRÊNCIAS NOMEADAS, não contagens: "Tarefa X concluída" diz
 * o que uma contagem ("4 tarefas editadas") apaga. Só a cauda de um lote
 * grande vira resumo — ver `recentActivity`.
 */
function RecentesCard({
  recentes,
  today,
  onOpen,
}: {
  recentes: ReturnType<typeof recentActivity>;
  today: string;
  onOpen: () => void;
}) {
  /** Só a parte local do e-mail: o domínio repetido em toda linha é ruído. */
  function shortActor(a: string | null): string | null {
    if (!a) return null;
    return a.includes('@') ? a.slice(0, a.indexOf('@')) : a;
  }

  return (
    <Card
      title="O que mudou recentemente"
      action={
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] font-semibold text-pri hover:text-pril"
        >
          Ver tudo →
        </button>
      }
    >
      {recentes.length === 0 ? (
        <p className="text-[12px] text-mut italic">Nenhuma movimentação registrada.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bdr/60">
          {recentes.map((r) => (
            <li key={r.key} className="py-2 flex items-start gap-2">
              <span
                className="text-[13px] leading-none mt-0.5 w-4 text-center flex-shrink-0"
                aria-hidden="true"
              >
                {r.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={
                    'block text-[12px] ' + (r.isTail ? 'text-mut italic' : 'text-txt')
                  }
                >
                  {r.text}
                </span>
                {/* Dia e autor na MESMA linha, em texto miúdo: antes o e-mail
                    completo ocupava uma linha inteira por ocorrência. */}
                <span className="block text-[10px] text-mut">
                  {dayLabel(r.day, today)}
                  {shortActor(r.actor) ? ` · ${shortActor(r.actor)}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
