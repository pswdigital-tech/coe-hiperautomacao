'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveProfileVisibility, saveInviteVisibility } from '../../visibility-actions';
import type { VisibilityScope } from '@/lib/security/visibility';

export type OpportunityOption = {
  id: string;
  seqId: number | null;
  processo: string | null;
  area: string | null;
};

/**
 * Recorte de visibilidade de UMA pessoa — que pode ainda não ter conta.
 * `target.kind` decide para onde o formulário grava:
 *   • 'profile' → tabelas da 0053, valendo na hora.
 *   • 'invite'  → `invite_visibility` (0054), copiado no primeiro login.
 * A tela é a MESMA de propósito: o admin faz a mesma escolha nos dois casos, e
 * duas telas parecidas divergiriam na primeira mudança.
 *
 * A lista de checkboxes fica sempre montada (só desabilitada no modo "vê
 * tudo") em vez de ser desmontada: quem alterna para conferir o que estava
 * marcado e volta atrás não perde a seleção. Campos desabilitados não são
 * enviados no submit, então o modo "vê tudo" também não manda ids por acidente
 * — e a action apaga a lista nesse caso de qualquer forma.
 */
export function VisibilityForm({
  target,
  personLabel,
  initialScope,
  initialIds,
  opportunities,
}: {
  target: { kind: 'profile' | 'invite'; id: string };
  personLabel: string;
  initialScope: VisibilityScope;
  initialIds: string[];
  opportunities: OpportunityOption[];
}) {
  const [scope, setScope] = useState<VisibilityScope>(initialScope);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [busca, setBusca] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return opportunities;
    return opportunities.filter((o) =>
      [o.processo, o.area, o.seqId != null ? `#${o.seqId}` : null]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(q)),
    );
  }, [busca, opportunities]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "Marcar todas" opera sobre o que está VISÍVEL no filtro, não sobre o
  // catálogo inteiro — marcar 300 itens invisíveis a partir de uma busca por 3
  // é o tipo de surpresa que faz o admin desconfiar da tela.
  function marcarFiltradas(marcar: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of filtered) {
        if (marcar) next.add(o.id);
        else next.delete(o.id);
      }
      return next;
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result =
        target.kind === 'profile'
          ? await saveProfileVisibility(formData)
          : await saveInviteVisibility(formData);
      if ('error' in result) setError(result.error);
      else {
        // Para convite, o verbo tem que ser futuro: nada acontece até a pessoa
        // criar a conta, e prometer efeito imediato aqui seria mentira.
        const quantas = `${selected.size} oportunidade${selected.size === 1 ? '' : 's'}`;
        if (target.kind === 'profile') {
          setSuccess(
            scope === 'all'
              ? `${personLabel} volta a enxergar todas as oportunidades da empresa.`
              : `${personLabel} passa a enxergar ${quantas}.`,
          );
        } else {
          setSuccess(
            scope === 'all'
              ? `Ao criar a conta, ${personLabel} vai enxergar todas as oportunidades da empresa.`
              : `Ao criar a conta, ${personLabel} vai enxergar ${quantas}.`,
          );
        }
      }
    });
  }

  const radioCls = 'mt-0.5 accent-[color:var(--pri,#2563eb)]';

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <input
        type="hidden"
        name={target.kind === 'profile' ? 'profile_id' : 'invite_id'}
        value={target.id}
      />

      <fieldset className="bg-wh rounded-xl border border-bdr p-5 flex flex-col gap-3">
        <legend className="sr-only">Tipo de acesso</legend>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="scope"
            value="all"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
            className={radioCls}
          />
          <span>
            <span className="block text-sm font-semibold text-txt">
              Todas as oportunidades da empresa
            </span>
            <span className="block text-xs text-mut">
              Comportamento padrão — inclusive as que forem criadas depois.
              {target.kind === 'invite' && ' Vale a partir do primeiro login.'}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="scope"
            value="restricted"
            checked={scope === 'restricted'}
            onChange={() => setScope('restricted')}
            className={radioCls}
          />
          <span>
            <span className="block text-sm font-semibold text-txt">
              Apenas as oportunidades selecionadas
            </span>
            <span className="block text-xs text-mut">
              Oportunidades criadas depois NÃO entram sozinhas — é preciso voltar
              aqui e liberá-las.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset
        disabled={scope === 'all'}
        className="bg-wh rounded-xl border border-bdr overflow-hidden disabled:opacity-50"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bdr">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por processo, área ou #número"
            className="flex-1 px-3 py-1.5 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
          />
          <button
            type="button"
            onClick={() => marcarFiltradas(true)}
            className="text-[11px] font-semibold text-pri hover:underline"
          >
            Marcar todas
          </button>
          <button
            type="button"
            onClick={() => marcarFiltradas(false)}
            className="text-[11px] font-semibold text-mut hover:underline"
          >
            Limpar
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-mut">
              {opportunities.length === 0
                ? 'Esta empresa ainda não tem oportunidades.'
                : 'Nenhuma oportunidade corresponde à busca.'}
            </p>
          ) : (
            filtered.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-bg"
              >
                <input
                  type="checkbox"
                  name="opportunity_ids"
                  value={o.id}
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <span className="flex-1 text-sm text-txt">
                  {o.seqId != null && <span className="text-mut mr-1.5">#{o.seqId}</span>}
                  {o.processo ?? 'Sem descrição'}
                </span>
                {o.area && <span className="text-[11px] text-mut">{o.area}</span>}
              </label>
            ))
          )}
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800"
        >
          {success}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? 'Salvando...' : 'Salvar acesso'}
        </button>
        {scope === 'restricted' && (
          <span className="text-xs text-mut">
            {selected.size} de {opportunities.length} selecionada
            {selected.size === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </form>
  );
}
