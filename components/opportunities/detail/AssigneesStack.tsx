'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOpportunityAssignees } from '@/lib/opportunities/assignee-actions';
import {
  assigneeInitials,
  assigneeName,
  type Assignee,
  type AssignableProfile,
} from '@/lib/opportunities/assignee-types';
import { cargoLabel } from '@/lib/security/cargo';

type Props = {
  opportunityId: string;
  assignees: Assignee[];
  /** Pessoas atribuíveis do tenant da oportunidade. Vazio quando não pode atribuir. */
  options: AssignableProfile[];
  /** tenant_admin ou platform_admin — só eles abrem o editor (0032). */
  canAssign: boolean;
  /** Abre o editor de atribuição (controlado pelo botão "Gerenciar" do header). */
  editing: boolean;
  onEditingChange: (open: boolean) => void;
};

/** Quantos avatares aparecem antes do "+N". */
const VISIBLE = 4;

/**
 * Pilha de avatares dos responsáveis, no header do detalhe — substitui o
 * antigo `AssigneesPanel` (faixa de largura total acima do conteúdo), que
 * gastava uma linha inteira para o que agora cabe ao lado do título. A
 * mecânica de escrita é a MESMA (`setOpportunityAssignees` + `router.refresh`);
 * só a apresentação mudou: pilha + "Ver todos" (lista completa) + editor de
 * seleção aberto pelo botão "Gerenciar" do header, que é quem controla
 * `editing` — daí o par `editing`/`onEditingChange` em vez de estado local.
 */
export function AssigneesStack({
  opportunityId,
  assignees,
  options,
  canAssign,
  editing,
  onEditingChange,
}: Props) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string[]>(() =>
    assignees.map((a) => a.profileId)
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Ressincroniza a seleção quando o servidor devolve outra lista (mesma
  // técnica de ressincronização durante o render usada em `TaskList`).
  const [syncedFrom, setSyncedFrom] = useState(assignees);
  if (syncedFrom !== assignees) {
    setSyncedFrom(assignees);
    setSelected(assignees.map((a) => a.profileId));
  }

  function toggle(profileId: string) {
    setSelected((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
  }

  function onCancel() {
    setSelected(assignees.map((a) => a.profileId));
    setError(null);
    onEditingChange(false);
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await setOpportunityAssignees(opportunityId, selected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onEditingChange(false);
      router.refresh();
    });
  }

  const visible = assignees.slice(0, VISIBLE);
  const overflow = assignees.length - visible.length;

  return (
    <div className="relative">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider font-bold text-mut">
          Responsáveis
        </span>

        {assignees.length === 0 ? (
          <span className="text-[12px] text-mut">Ninguém atribuído</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center -space-x-1.5">
              {visible.map((a) => (
                <span
                  key={a.profileId}
                  title={`${assigneeName(a)}${a.cargo ? ` · ${cargoLabel(a.cargo)}` : ''}`}
                  className="w-7 h-7 rounded-full bg-pri text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-wh"
                >
                  {assigneeInitials(a)}
                </span>
              ))}
              {overflow > 0 && (
                <span
                  title={assignees
                    .slice(VISIBLE)
                    .map((a) => assigneeName(a))
                    .join(', ')}
                  className="w-7 h-7 rounded-full bg-bg text-txt text-[10px] font-bold flex items-center justify-center ring-2 ring-wh border border-bdr"
                >
                  +{overflow}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="text-[11px] font-semibold text-pri hover:text-pril underline-offset-2 hover:underline"
            >
              {showAll ? 'Ocultar' : 'Ver todos'}
            </button>
          </div>
        )}
      </div>

      {showAll && assignees.length > 0 && (
        <div className="absolute z-20 top-full left-0 mt-2 w-64 bg-wh border border-bdr rounded-xl shadow-lg p-2 flex flex-col gap-1">
          {assignees.map((a) => (
            <div
              key={a.profileId}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md"
              title={a.email}
            >
              <span className="w-6 h-6 rounded-full bg-pri text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                {assigneeInitials(a)}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] text-txt font-medium truncate">
                  {assigneeName(a)}
                </span>
                <span className="block text-[10px] text-mut truncate">
                  {a.cargo ? cargoLabel(a.cargo) : a.email}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {canAssign && editing && (
        <div className="absolute z-30 top-full right-0 mt-2 w-72 bg-wh border border-bdr rounded-xl shadow-lg p-3 flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-mut">
            Atribuir pessoas
          </div>

          {options.length === 0 ? (
            <p className="text-[12px] text-mut">
              Ninguém desta empresa tem conta ainda — convide pessoas em Equipe.
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {options.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-[13px] text-txt px-1.5 py-1 rounded-md hover:bg-bg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    disabled={pending}
                  />
                  <span className="font-medium truncate">{assigneeName(p)}</span>
                  <span className="text-[11px] text-mut truncate">
                    {p.cargo ? cargoLabel(p.cargo) : p.email}
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-pri hover:bg-pril text-white disabled:opacity-50 transition-colors"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-bdr bg-wh text-txt hover:bg-bg disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
