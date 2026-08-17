'use client';

import type { PublicOpportunityOption } from '@/lib/tenants/queries';

// Porta de entrada do formulário público (2026-07-31). NÃO é um step do wizard:
// vive antes dele, fora da máquina de estado de `wizard/state.ts`, porque é
// exclusivo do fluxo público e o wizard autenticado não deve mudar por causa
// disto. Escolhido o tipo (e, em Melhoria/Incidente, o projeto), entra-se no
// mesmo wizard de 5 steps de sempre.

/** Os 4 tipos oferecidos no público. O enum do banco tem um 5º valor
 *  (`duvidas_terceiros`) que segue existindo, mas só no modal autenticado. */
export type PublicRequestType =
  | 'nova_oportunidade'
  | 'melhoria_automacao'
  | 'incidente'
  | 'treinamento';

/** Tipos que exigem apontar a automação existente. */
export const TYPES_REQUIRING_PROJECT: PublicRequestType[] = [
  'melhoria_automacao',
  'incidente',
];

type Option = {
  value: PublicRequestType;
  icon: string;
  title: string;
  desc: string;
};

const OPTIONS: Option[] = [
  {
    value: 'nova_oportunidade',
    icon: '✨',
    title: 'Nova oportunidade',
    desc: 'Um processo ainda não automatizado que você acha que dá pra automatizar.',
  },
  {
    value: 'melhoria_automacao',
    icon: '🔧',
    title: 'Melhoria',
    desc: 'Evolução, ajuste ou expansão de uma automação que já está rodando.',
  },
  {
    value: 'incidente',
    icon: '🚨',
    title: 'Incidente',
    desc: 'Uma automação parou, falhou ou está se comportando de forma inesperada.',
  },
  {
    value: 'treinamento',
    icon: '🎓',
    title: 'Treinamento',
    desc: 'Pedido de capacitação do time em ferramentas ou processos do CoE.',
  },
];

export const REQUEST_TYPE_LABEL: Record<PublicRequestType, string> = {
  nova_oportunidade: 'Nova oportunidade',
  melhoria_automacao: 'Melhoria',
  incidente: 'Incidente',
  treinamento: 'Treinamento',
};

type Props = {
  requestType: PublicRequestType | null;
  parentId: string | null;
  projects: PublicOpportunityOption[];
  error: string | null;
  onSelectType: (t: PublicRequestType) => void;
  onSelectParent: (id: string | null) => void;
  onContinue: () => void;
};

export function IntroStep({
  requestType,
  parentId,
  projects,
  error,
  onSelectType,
  onSelectParent,
  onContinue,
}: Props) {
  const needsProject =
    requestType != null && TYPES_REQUIRING_PROJECT.includes(requestType);

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-extrabold text-txt leading-tight">
        Sobre o que é a sua solicitação?
      </h2>
      <p className="text-sm text-mut mt-1">
        Escolha o tipo para o CoE rotear e priorizar corretamente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelectType(o.value)}
            aria-pressed={requestType === o.value}
            className={
              'text-left p-4 rounded-xl border-2 transition-all ' +
              (requestType === o.value
                ? 'border-pri bg-pri/5 shadow-md'
                : 'border-bdr bg-wh hover:border-pril hover:bg-blue-50/40 dark:hover:bg-blue-950/40')
            }
          >
            <div className="text-3xl mb-2">{o.icon}</div>
            <div className="text-[14px] font-bold text-txt mb-1">{o.title}</div>
            <div className="text-[11px] text-mut leading-relaxed">{o.desc}</div>
          </button>
        ))}
      </div>

      {/* Seletor de projeto — só para Melhoria/Incidente. */}
      {needsProject && (
        <div className="mt-7 rounded-xl border border-bdr bg-bg/60 p-4">
          <label
            htmlFor="parent-opportunity"
            className="block text-[13px] font-bold text-txt"
          >
            Qual automação?{' '}
            <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <p className="text-[11px] text-mut mt-0.5 mb-3">
            Selecione o projeto a que{' '}
            {requestType === 'incidente' ? 'o incidente' : 'a melhoria'} se refere.
          </p>

          {projects.length === 0 ? (
            // Tenant sem nenhuma automação em andamento/produção: não trava a
            // pessoa — ela segue e descreve o caso no próprio formulário.
            <p className="text-[12px] text-mut leading-relaxed">
              Ainda não há automações cadastradas para selecionar. Pode seguir e
              descrever o caso no formulário — o CoE faz o vínculo depois.
            </p>
          ) : (
            <select
              id="parent-opportunity"
              value={parentId ?? ''}
              onChange={(e) => onSelectParent(e.target.value || null)}
              className="w-full px-3 py-2.5 bg-wh border border-bdr rounded-lg text-sm text-txt focus:outline-none focus:ring-2 focus:ring-pri/40"
            >
              <option value="">Selecione…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.seqId} — {p.processo}
                  {p.area ? ` (${p.area})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error && (
        <div className="mt-5 text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="mt-8 pt-5 border-t border-bdr flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
