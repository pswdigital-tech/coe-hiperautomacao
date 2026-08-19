import Link from 'next/link';
import type { OpportunityTask } from '@/lib/opportunities/types';
import { TASK_STATUS_ORDER, TASK_STATUS_META } from '@/lib/opportunities/task-labels';
import { summarizeTasks, nextDeliveries } from '@/lib/opportunities/task-summary';

type Props = {
  /** Array PLANO já buscado pela página — nenhuma query nova nesta coluna. */
  tasks: OpportunityTask[];
  /** Data de HOJE (ISO YYYY-MM-DD) vinda do servidor — ver `task-summary.ts`. */
  today: string;
  opportunityId: string;
};

// Data ISO → dd/mm/aa sem `new Date()`/locale (mesma técnica de `TaskList.fmtDate`).
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
}

/**
 * Coluna lateral do Plano de Atividades: a saúde do plano, ao lado da lista.
 *
 * O card "Resumo da Oportunidade" (frequência, execuções, pessoas, área,
 * gatilho, formato das entradas, dados sensíveis, sistemas) foi REMOVIDO: era
 * a seção Processo Atual repetida numa coluna estreita, e nenhum daqueles
 * campos ajuda a trabalhar na lista de tarefas ao lado. Ficam só progresso e
 * próximas entregas, que são contexto de execução. Sem estado e sem I/O: tudo
 * aqui é leitura derivada do que a página já buscou (é montado dentro de
 * `OpportunityDetail`, que é `'use client'`, então roda no cliente — daí
 * `today` vir por prop em vez de `new Date()` aqui dentro).
 */
export function SummarySidebar({ tasks, today, opportunityId }: Props) {
  const summary = summarizeTasks(tasks, today);
  const proximas = nextDeliveries(tasks);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Resumo do progresso">
        {summary.total === 0 ? (
          <p className="text-[12px] text-mut">Nenhuma tarefa cadastrada ainda.</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <ProgressDonut summary={summary} />
              <ul className="flex-1 min-w-0 flex flex-col gap-1">
                {TASK_STATUS_ORDER.map((s) => {
                  const meta = TASK_STATUS_META[s];
                  return (
                    <li
                      key={s}
                      className="flex items-center gap-2 text-[11px] text-txt whitespace-nowrap"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: meta.color }}
                        aria-hidden="true"
                      />
                      <span className="font-bold tabular-nums">
                        {summary.byStatus[s]}
                      </span>
                      <span className="text-mut truncate">{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <dl className="mt-3 pt-3 border-t border-bdr flex flex-col gap-1.5">
              <MiniRow
                label="Tarefas concluídas"
                value={`${summary.concluidas} de ${summary.total}`}
              />
              <MiniRow
                label="Atrasadas"
                value={String(summary.atrasadas)}
                emphasis={summary.atrasadas > 0}
              />
              <MiniRow
                label="Prazo do plano"
                value={`${fmtDate(summary.planStart)} → ${fmtDate(summary.planDue)}`}
              />
            </dl>
          </>
        )}
      </Card>

      <Card title="Próximas entregas">
        {proximas.length === 0 ? (
          <p className="text-[12px] text-mut">
            Nenhuma entrega pendente com data definida.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {proximas.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-txt truncate">
                    {t.title}
                  </span>
                  <span className="block text-[10px] text-mut">
                    {TASK_STATUS_META[t.status].icon}{' '}
                    {TASK_STATUS_META[t.status].label}
                  </span>
                </span>
                <span className="text-[11px] text-mut whitespace-nowrap">
                  🗓️ {fmtDate(t.due_date)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={`/opportunities/${opportunityId}/tarefas`}
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-pri hover:text-pril"
        >
          Ver todas as tarefas →
        </Link>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-wh border border-bdr rounded-xl shadow-sm px-4 py-3.5">
      <h2 className="text-[13px] font-bold text-txt mb-2.5">{title}</h2>
      {children}
    </section>
  );
}

function MiniRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] text-mut">{label}</dt>
      <dd
        className={
          'text-[12px] font-bold tabular-nums ' +
          (emphasis ? 'text-red-600 dark:text-red-400' : 'text-txt')
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Rosca de progresso — um arco por status, na ordem canônica de
 * `TASK_STATUS_ORDER` e nas cores de `TASK_STATUS_META` (as MESMAS dos badges
 * da lista e das colunas do Kanban: a legenda ao lado só funciona se a cor for
 * a mesma em toda a tela). SVG puro, sem dependência de gráfico.
 */
function ProgressDonut({
  summary,
}: {
  summary: ReturnType<typeof summarizeTasks>;
}) {
  const size = 92;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const arcs = TASK_STATUS_ORDER.map((s) => {
    const n = summary.byStatus[s];
    const len = summary.total === 0 ? 0 : (n / summary.total) * c;
    const arc = { status: s, len, offset };
    offset += len;
    return arc;
  }).filter((a) => a.len > 0);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-bdr"
        />
        {arcs.map((a) => (
          <circle
            key={a.status}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={TASK_STATUS_META[a.status].color}
            strokeDasharray={`${a.len} ${c - a.len}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[16px] font-black text-txt tabular-nums">
          {summary.percentComplete}%
        </span>
      </div>
    </div>
  );
}
