'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  reprocessOpportunityEnrichment,
  type ReprocessMode,
} from '@/lib/ai/reprocess-actions';
import type { AiEnrichmentStatus } from '@/lib/opportunities/types';

type Props = {
  opportunityId: string;
  /** Estado atual do enriquecimento — muda só a COPY do diálogo, não o que ele faz. */
  status: AiEnrichmentStatus | null | undefined;
  /** `ai_enrichment_error` — mostrado no diálogo quando o estado é 'failed'. */
  error?: string | null;
  /** Classes do botão disparador (o diálogo nunca muda) — mesma mecânica do DeleteButton. */
  triggerClassName?: string;
};

const DEFAULT_TRIGGER =
  'px-3 py-2 rounded-lg border border-bdr bg-wh text-txt text-[12px] font-bold hover:bg-bg inline-flex items-center gap-1.5 transition-colors';

/**
 * Botão "Reprocessar IA" — reexecuta o enriquecimento por IA numa oportunidade
 * que já existe. Só é montado para quem administra a empresa dona da
 * oportunidade (o gate vem de cima, via prop; o bloqueio real está na Server
 * Action e na RLS).
 *
 * O diálogo existe por um motivo só: ESCOLHER O MODO DE MESCLAGEM. Reprocessar
 * uma oportunidade madura pode passar por cima de campo que uma pessoa
 * escreveu à mão, então a decisão é dela — com o modo seguro
 * (`fill-empty`, só preenche buraco) pré-selecionado e a lista do que a IA
 * jamais toca visível antes do clique.
 */
export function ReprocessAiButton({
  opportunityId,
  status,
  error,
  triggerClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReprocessMode>('fill-empty');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Duas etapas VISÍVEIS de espera, porque são duas esperas de verdade: a
  // chamada da IA (segundos, no servidor) e o recarregamento da página com o
  // resultado. Fechar o diálogo entre uma e outra mostraria a ficha ANTIGA por
  // um instante — parece que o reprocesso não fez nada.
  const [phase, setPhase] = useState<'idle' | 'analisando' | 'aplicando'>('idle');
  const [elapsed, setElapsed] = useState(0);

  const failed = status === 'failed';
  const running = phase !== 'idle';

  // Cronômetro do "alguns segundos": numa espera que passa de 5s, um número
  // subindo é a diferença entre "está trabalhando" e "travou".
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);

  // O diálogo só sai da tela quando o refresh terminou — ou seja, quando os
  // campos novos JÁ estão renderizados atrás dele.
  useEffect(() => {
    if (phase === 'aplicando' && !pending) {
      setOpen(false);
      setPhase('idle');
    }
  }, [phase, pending]);

  function openDialog(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    setActionError(null);
    setMode('fill-empty');
    setPhase('idle');
    setElapsed(0);
  }

  function close() {
    if (running) return; // nunca fechar no meio de uma chamada em voo
    setOpen(false);
  }

  function confirm() {
    setActionError(null);
    setElapsed(0);
    setPhase('analisando');
    startTransition(async () => {
      const result = await reprocessOpportunityEnrichment(opportunityId, mode);
      if (!result.ok) {
        setPhase('idle');
        setActionError(result.error);
        return;
      }
      // A action é aguardada no servidor — aqui o resultado já está no banco;
      // falta trazer a página nova. O `useEffect` acima fecha quando chegar.
      setPhase('aplicando');
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="Reprocessar a análise da IA para esta oportunidade"
        className={triggerClassName ?? DEFAULT_TRIGGER}
      >
        🤖 Reprocessar IA
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-busy={running}
          aria-label="Reprocessar análise da IA"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-wh rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-bg border-b border-bdr px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pri/10 flex items-center justify-center text-xl">
                🤖
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-txt">
                  Reprocessar análise da IA
                </h2>
                <p className="text-[11px] text-mut mt-0.5">
                  A IA relê os dados atuais desta oportunidade e gera de novo os
                  campos derivados. Leva alguns segundos.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              {running && <ProgressPanel phase={phase} elapsed={elapsed} />}

              {failed && !running && (
                <div className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  <strong>A última tentativa falhou.</strong>
                  {error ? <> Detalhe técnico: {error}</> : null}
                </div>
              )}

              {/* Em execução as opções continuam VISÍVEIS (a pessoa confere o
                  que escolheu enquanto espera), porém inertes e esmaecidas. */}
              <fieldset
                disabled={running}
                className={
                  'flex flex-col gap-2 transition-opacity ' +
                  (running ? 'opacity-50' : '')
                }
              >
                <legend className="text-[10px] uppercase tracking-wider font-bold text-mut mb-1">
                  O que a IA pode escrever
                </legend>

                <ModeOption
                  checked={mode === 'fill-empty'}
                  onChange={() => setMode('fill-empty')}
                  disabled={running}
                  title="Completar o que está vazio"
                  hint="Recomendado"
                  description="A IA só preenche campos em branco. Nada que já esteja preenchido é alterado."
                />

                <ModeOption
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                  disabled={running}
                  title="Refazer a análise"
                  description="Substitui os campos gerados pela IA: escopo da automação, benefícios esperados, observação, risco, esforço, complexidade e objetivo. Use quando os dados do processo mudaram."
                />
              </fieldset>

              {mode === 'overwrite' && (
                <div className="text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  ⚠️ Se você editou algum desses sete campos à mão, o texto atual
                  será substituído pelo que a IA gerar agora.
                </div>
              )}

              <div className="text-[11px] text-mut bg-bg border border-bdr rounded-lg px-3 py-2">
                <strong className="text-txt">Nunca é alterado</strong>, em
                nenhum dos dois modos: processo, área, frequência, volume,
                critérios, benefícios pontuados, FTE, ferramentas selecionadas,
                status, tarefas, riscos, documentos, anotações e responsáveis.
              </div>

              {actionError && (
                <div className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {actionError}
                </div>
              )}
            </div>

            <div className="bg-bg border-t border-bdr px-5 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={running}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={running}
                className="px-3 py-1.5 bg-pri hover:bg-pril text-white text-[12px] font-bold rounded-lg disabled:opacity-70 inline-flex items-center gap-1.5"
              >
                {running ? (
                  <>
                    <Spinner />
                    {phase === 'aplicando' ? 'Aplicando...' : 'Reprocessando...'}
                  </>
                ) : (
                  '🤖 Reprocessar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Estado de espera do reprocesso. Não é enfeite: a chamada da IA leva alguns
 * segundos no servidor e, sem sinal de vida, a leitura natural é "travou" —
 * e o segundo clique dispara um segundo reprocesso.
 *
 * As duas etapas são nomeadas porque significam coisas diferentes para quem
 * espera: em "analisando" nada foi gravado ainda; em "aplicando" o banco JÁ
 * tem o resultado e o que falta é a tela.
 */
function ProgressPanel({
  phase,
  elapsed,
}: {
  phase: 'analisando' | 'aplicando' | 'idle';
  elapsed: number;
}) {
  const analisando = phase === 'analisando';
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-pri/25 bg-pri/5 px-3 py-2.5 flex items-start gap-2.5"
    >
      <Spinner className="mt-0.5 border-pri/30 border-t-pri" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-txt flex items-center gap-2">
          {analisando ? 'Analisando com IA...' : 'Aplicando o resultado...'}
          {elapsed > 0 && (
            <span className="text-[11px] font-semibold text-mut tabular-nums">
              {elapsed}s
            </span>
          )}
        </div>
        <p className="text-[11px] text-mut mt-0.5">
          {analisando
            ? 'Costuma levar de 5 a 15 segundos. Não feche esta janela — nada foi gravado ainda.'
            : 'A análise foi gravada. Recarregando a ficha com os campos novos.'}
        </p>
        {/* Barra indeterminada: o progresso real não é observável (a IA não
            reporta parcial), então a barra diz "em andamento", nunca "x%". */}
        <div className="mt-2 h-1 rounded-full bg-pri/15 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-pri animate-[loading-slide_1.4s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

/** Anel girando — usado no painel de progresso e dentro do botão. */
function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={
        'inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin flex-shrink-0 ' +
        className
      }
    />
  );
}

function ModeOption({
  checked,
  onChange,
  disabled,
  title,
  hint,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  title: string;
  hint?: string;
  description: string;
}) {
  return (
    <label
      className={
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ' +
        (checked ? 'border-pri bg-pri/5' : 'border-bdr hover:bg-bg')
      }
    >
      <input
        type="radio"
        name="reprocess-mode"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 accent-pri"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-txt">
          {title}
          {hint && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold align-middle">
              {hint}
            </span>
          )}
        </span>
        <span className="block text-[11px] text-mut mt-0.5">{description}</span>
      </span>
    </label>
  );
}
