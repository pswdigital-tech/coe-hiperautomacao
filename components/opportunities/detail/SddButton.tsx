'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateSdd, getSddDownloadUrl } from '@/lib/opportunities/sdd/actions';
import type { SddState } from '@/lib/opportunities/sdd/data';

type Props = {
  opportunityId: string;
  state: SddState;
  /**
   * Emitir versão nova é gate de editor (`requireEditorRole`) — resolvido no
   * servidor e descido como prop. Aqui só decide o que é MONTADO; o bloqueio
   * real está na Server Action. Baixar não tem gate: quem enxerga a
   * oportunidade baixa o documento dela.
   */
  canGenerate: boolean;
};

/**
 * Botão do Documento de Desenho da Solução — TRÊS estados, não dois:
 *
 *   1. nunca gerado         → "Gerar SDD"
 *   2. gerado, dados iguais → "Baixar SDD (vN)" + "Gerar novamente" discreto
 *   3. gerado, dados MUDARAM depois → o mesmo par, mais um aviso âmbar e o
 *      botão de gerar promovido a ação primária
 *
 * O terceiro estado é o que faz o "gerar novamente" funcionar de verdade. Sem
 * ele, reemitir depende de a pessoa lembrar que editou algo semanas atrás — e
 * ela não lembra: manda o PDF velho para o cliente. A detecção compara a data
 * da última emissão com o `updated_at` mais recente de oportunidade, riscos e
 * fases (ver `fetchSddState`).
 *
 * O download NÃO guarda a URL assinada em estado: ela vale 60s e é pedida no
 * clique. Guardá-la renderizaria um link que expira silenciosamente na mão de
 * quem deixou a aba aberta.
 */
export function SddButton({ opportunityId, state, canGenerate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [pending, startTransition] = useTransition();
  // Duas esperas VISÍVEIS e distintas, mesma razão do ReprocessAiButton: em
  // "gerando" nada foi gravado; em "aplicando" o PDF já está no banco e falta
  // a tela. Fechar o estado de espera entre as duas mostraria o botão antigo
  // por um instante — lê como "não fez nada".
  const [fase, setFase] = useState<'idle' | 'gerando' | 'aplicando'>('idle');

  const rodando = fase !== 'idle';
  const latest = state.latest;

  useEffect(() => {
    if (fase === 'aplicando' && !pending) setFase('idle');
  }, [fase, pending]);

  async function baixar() {
    if (!latest) return;
    setError(null);
    setBaixando(true);
    const result = await getSddDownloadUrl(opportunityId, latest.documentId);
    setBaixando(false);
    if (result.ok) window.open(result.url, '_blank', 'noopener');
    else setError(result.error);
  }

  function gerar() {
    setError(null);
    setFase('gerando');
    startTransition(async () => {
      const result = await generateSdd(opportunityId);
      if (!result.ok) {
        setFase('idle');
        setError(result.error);
        return;
      }
      setFase('aplicando');
      router.refresh();
    });
  }

  // ── Estado 1: nunca gerado ────────────────────────────────────────────────
  if (!latest) {
    if (!canGenerate) return null;
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={gerar}
          disabled={rodando}
          title="Gerar o Documento de Desenho da Solução em PDF"
          className="px-3 py-2 rounded-lg border border-bdr bg-wh text-txt text-[12px] font-bold hover:bg-bg inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
        >
          {rodando ? <Spinner /> : '📄'}
          {rodando ? rotuloEspera(fase) : 'Gerar SDD'}
        </button>
        <ErrorLine error={error} />
      </div>
    );
  }

  // ── Estados 2 e 3: já existe versão ───────────────────────────────────────
  const desatualizado = state.desatualizado;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          title={`Baixar a versão ${latest.versao}, emitida em ${fmtData(latest.geradoEm)}`}
          className={
            'px-3 py-2 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ' +
            (desatualizado
              ? 'border border-bdr bg-wh text-txt hover:bg-bg'
              : 'bg-pri hover:bg-pril text-white')
          }
        >
          {baixando ? <Spinner /> : '📄'}
          Baixar SDD
          <span
            className={
              'px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ' +
              (desatualizado ? 'bg-bg text-mut' : 'bg-white/20 text-white')
            }
          >
            v{latest.versao}
          </span>
        </button>

        {canGenerate && (
          <button
            type="button"
            onClick={gerar}
            disabled={rodando}
            title={
              desatualizado
                ? 'Os dados mudaram desde a última emissão — gerar uma versão nova'
                : 'Gerar uma versão nova do documento'
            }
            className={
              'px-3 py-2 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ' +
              (desatualizado
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'border border-bdr bg-wh text-mut hover:bg-bg hover:text-txt')
            }
          >
            {rodando ? <Spinner /> : '↻'}
            {rodando ? rotuloEspera(fase) : desatualizado ? 'Gerar v' + (latest.versao + 1) : 'Gerar novamente'}
          </button>
        )}
      </div>

      {/* O aviso aparece para TODO MUNDO que enxerga a oportunidade, inclusive
          para quem não pode gerar: quem vai baixar precisa saber que o arquivo
          não reflete mais os dados atuais, mesmo sem poder resolver isso. */}
      {desatualizado && (
        <div className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1 max-w-[280px] text-right leading-snug">
          Dados alterados após a emissão da v{latest.versao}
          {state.dadosAlteradosEm ? ` (${fmtData(state.dadosAlteradosEm)})` : ''}.
          {canGenerate ? ' Gere uma versão nova antes de enviar ao cliente.' : ''}
        </div>
      )}

      <ErrorLine error={error} />
    </div>
  );
}

function rotuloEspera(fase: 'idle' | 'gerando' | 'aplicando'): string {
  return fase === 'aplicando' ? 'Aplicando...' : 'Gerando...';
}

/** Data curta pt-BR a partir de um ISO, sem `new Date` (evita desvio de fuso). */
function fmtData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.slice(0, 10);
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="text-[10px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md px-2 py-1 max-w-[280px] text-right leading-snug"
    >
      {error}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin flex-shrink-0"
    />
  );
}
