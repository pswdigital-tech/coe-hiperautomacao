'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OpportunityRisk } from '@/lib/opportunities/types';
import { createRisk, updateRisk } from '@/lib/opportunities/risk-actions';
import type { RiskInput } from '@/lib/opportunities/risk-schema';
import {
  TIPO_LABEL,
  IMPACTO_LABEL,
  PROBABILIDADE_LABEL,
  STATUS_LABEL,
  RESPONSAVEL_SUGGESTIONS,
  priorityLabel,
  priorityBadgeClass,
} from '@/lib/opportunities/risk-labels';
import type {
  RiskType,
  RiskImpact,
  RiskProbability,
  RiskStatus,
} from '@/lib/opportunities/types';

type Props = {
  opportunityId: string;
  mode: 'create' | 'edit';
  riskId?: string;
  initial?: OpportunityRisk;
  /** Chamado após salvar com sucesso (fechar dialog / navegar de volta). */
  onDone?: () => void;
};

/**
 * Formulário reusável de risco (dialog empilhado E página fullscreen).
 * Campos espelham _giba:1242-1259. Prioridade é READ-ONLY (D-04): em create exibe
 * "— (definida ao salvar)"; em edit exibe o badge da priority já calculada pelo
 * trigger. NÃO há matriz/cálculo no client (D-04). Responsável = texto livre com
 * sugestões via <datalist> (D-08). Submit via useTransition → createRisk/updateRisk;
 * o payload NÃO inclui priority/tenant_id/opportunity_id (mass-assignment, T-12-06).
 * Sucesso => router.refresh() + onDone().
 */
export function RiskForm({
  opportunityId,
  mode,
  riskId,
  initial,
  onDone,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [tipo, setTipo] = useState<RiskType>(initial?.tipo ?? 'risco');
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? '');
  const [impacto, setImpacto] = useState<RiskImpact>(
    initial?.impacto ?? 'moderado',
  );
  const [probabilidade, setProbabilidade] = useState<RiskProbability>(
    initial?.probabilidade ?? 'possivel',
  );
  const [status, setStatus] = useState<RiskStatus>(initial?.status ?? 'novo');
  const [resposta, setResposta] = useState(initial?.resposta ?? '');
  const [descricaoImpacto, setDescricaoImpacto] = useState(
    initial?.descricao_impacto ?? '',
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});

    // payload SEM priority/tenant_id/opportunity_id (server-derived / trigger).
    const payload: RiskInput = {
      descricao,
      tipo,
      responsavel,
      impacto,
      probabilidade,
      status,
      resposta,
      descricao_impacto: descricaoImpacto,
    };

    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createRisk(opportunityId, payload)
          : await updateRisk(riskId!, opportunityId, payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      router.refresh();
      onDone?.();
    });
  }

  function fieldError(name: string): string | null {
    const e = errors[name];
    return e && e.length > 0 ? e[0] : null;
  }

  const inputCls =
    'w-full text-[12px] border border-bdr rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pri';
  const labelCls =
    'text-[10px] font-bold uppercase tracking-wider text-mut mb-1 block';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className={labelCls} htmlFor="rf-desc">
          Descrição do Risco *
        </label>
        <input
          id="rf-desc"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o risco..."
          className={inputCls}
        />
        {fieldError('descricao') && (
          <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
            {fieldError('descricao')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="rf-tipo">
            Tipo de Risco
          </label>
          <select
            id="rf-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as RiskType)}
            className={inputCls}
          >
            {Object.entries(TIPO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="rf-resp">
            Responsável
          </label>
          <input
            id="rf-resp"
            list="resp-hints"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Ex: PSW"
            className={inputCls}
          />
          <datalist id="resp-hints">
            {RESPONSAVEL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelCls} htmlFor="rf-imp">
            Impacto
          </label>
          <select
            id="rf-imp"
            value={impacto}
            onChange={(e) => setImpacto(e.target.value as RiskImpact)}
            className={inputCls}
          >
            {Object.entries(IMPACTO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="rf-prob">
            Probabilidade
          </label>
          <select
            id="rf-prob"
            value={probabilidade}
            onChange={(e) =>
              setProbabilidade(e.target.value as RiskProbability)
            }
            className={inputCls}
          >
            {Object.entries(PROBABILIDADE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Prioridade (auto)</label>
          <div className="py-1.5">
            {mode === 'edit' && initial ? (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadgeClass(initial.priority)}`}
              >
                {priorityLabel(initial.priority)}
              </span>
            ) : (
              <span className="text-[11px] text-mut italic">
                — (definida ao salvar)
              </span>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="rf-status">
            Status do Risco
          </label>
          <select
            id="rf-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as RiskStatus)}
            className={inputCls}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="rf-resposta">
          Resposta ao Risco (ação)
        </label>
        <textarea
          id="rf-resposta"
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="rf-impDesc">
          Descrição do Impacto
        </label>
        <textarea
          id="rf-impDesc"
          value={descricaoImpacto}
          onChange={(e) => setDescricaoImpacto(e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </div>

      {formError && (
        <div className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {formError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDone?.()}
          disabled={pending}
          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50"
        >
          {pending ? 'Salvando...' : '💾 Salvar'}
        </button>
      </div>
    </form>
  );
}
