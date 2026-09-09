'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEvent, setEventStatus } from '@/lib/events/actions';
import { publicEventPath } from '@/lib/events/slug';
import type { EventWithCount } from '@/lib/events/types';
import type { TenantSummary } from '@/lib/tenants/queries';
import { EventForm } from './EventForm';

// =============================================================================
// EventsManager — lista + formulário da tela /eventos (0066)
// -----------------------------------------------------------------------------
// Client component só pelo que exige interação: copiar o link (clipboard),
// abrir o formulário inline, encerrar/reabrir/excluir com confirmação. Toda
// decisão de escopo já veio resolvida do servidor (`tenants` = empresas
// administradas; `events` = o que a RLS deixou ver).
//
// "Ver oportunidades" leva à listagem com `?empresa=<slug>&evento=<slug>` —
// a URL carrega slugs legíveis, nunca UUID; a page da listagem resolve.
// =============================================================================

type Props = {
  tenants: TenantSummary[];
  events: EventWithCount[];
  selectedTenantId: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function dateRange(e: Pick<EventWithCount, 'starts_at' | 'ends_at'>): string {
  if (e.ends_at && e.ends_at !== e.starts_at) {
    return `${formatDate(e.starts_at)} – ${formatDate(e.ends_at)}`;
  }
  return formatDate(e.starts_at);
}

const btnClass =
  'px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border border-bdr bg-wh text-txt hover:bg-bg whitespace-nowrap disabled:opacity-50 disabled:hover:bg-wh';

export function EventsManager({ tenants, events, selectedTenantId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<{ kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; event: EventWithCount }>(
    { kind: 'closed' },
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const showCompany = tenants.length > 1;

  async function copyLink(e: EventWithCount) {
    const tenant = tenantById.get(e.tenant_id);
    if (!tenant) return;
    const url = `${window.location.origin}${publicEventPath(tenant.slug, e.slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(e.id);
      setTimeout(() => setCopiedId((cur) => (cur === e.id ? null : cur)), 2000);
    } catch {
      window.prompt('Copie o link manualmente:', url);
    }
  }

  function run(e: EventWithCount, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusyId(e.id);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error ?? 'Não foi possível concluir.');
        else router.refresh();
      } catch {
        setError('Não foi possível concluir agora. Recarregue a página e tente novamente.');
      } finally {
        setBusyId(null);
      }
    });
  }

  function toggleStatus(e: EventWithCount) {
    const closing = e.status === 'active';
    if (
      closing &&
      !window.confirm(
        `Encerrar "${e.name}"? O link do formulário deixa de aceitar respostas. Você pode reabrir depois.`,
      )
    ) {
      return;
    }
    run(e, () => setEventStatus(e.id, closing ? 'closed' : 'active'));
  }

  function remove(e: EventWithCount) {
    if (!window.confirm(`Excluir "${e.name}"? Esta ação não pode ser desfeita.`)) return;
    run(e, () => deleteEvent(e.id));
  }

  function opportunitiesHref(e: EventWithCount): string {
    const tenant = tenantById.get(e.tenant_id);
    const qs = new URLSearchParams();
    if (tenant) qs.set('empresa', tenant.slug);
    qs.set('evento', e.slug);
    return `/opportunities?${qs.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode({ kind: 'new' })}
          disabled={mode.kind === 'new'}
          className="px-4 py-2 text-[13px] font-bold rounded-lg bg-pri hover:bg-pril text-white disabled:opacity-60"
        >
          ➕ Novo evento
        </button>
        <span className="ml-auto text-[12px] text-mut">
          {events.length === 1 ? '1 evento' : `${events.length} eventos`}
        </span>
      </div>

      {mode.kind !== 'closed' && (
        <EventForm
          key={mode.kind === 'edit' ? mode.event.id : 'new'}
          tenants={tenants}
          defaultTenantId={selectedTenantId}
          event={mode.kind === 'edit' ? mode.event : null}
          onClose={() => setMode({ kind: 'closed' })}
        />
      )}

      {error && (
        <div
          role="alert"
          className="text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
        >
          {error}
        </div>
      )}

      <div className="bg-wh border border-bdr rounded-xl overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-bdr">
              <th className="px-4 py-3 font-bold">Evento</th>
              <th className="px-4 py-3 font-bold whitespace-nowrap">Data</th>
              {showCompany && <th className="px-4 py-3 font-bold">Empresa</th>}
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-right whitespace-nowrap">
                Oportunidades
              </th>
              <th className="px-4 py-3 font-bold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={showCompany ? 6 : 5} className="px-4 py-10 text-center text-mut">
                  Nenhum evento ainda. Crie o primeiro para gerar um link de formulário.
                </td>
              </tr>
            )}
            {events.map((e) => {
              const tenant = tenantById.get(e.tenant_id);
              const busy = busyId === e.id;
              const closed = e.status === 'closed';
              return (
                <tr key={e.id} className="border-b border-bdr last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-bold text-txt">{e.name}</div>
                    <div className="text-[11px] text-mut font-mono mt-0.5">
                      {e.is_default
                        ? 'sem link público'
                        : tenant
                          ? publicEventPath(tenant.slug, e.slug)
                          : e.slug}
                    </div>
                    {e.description && (
                      <div className="text-[12px] text-mut mt-1 max-w-md">{e.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-txt">
                    {e.is_default ? <span className="text-mut">—</span> : dateRange(e)}
                  </td>
                  {showCompany && (
                    <td className="px-4 py-3 text-txt">{tenant?.name ?? '—'}</td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {e.is_default ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-bg border border-bdr text-[11px] font-bold text-mut">
                        Padrão
                      </span>
                    ) : closed ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                        Encerrado
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-bold">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-txt tabular-nums">
                    {e.opportunities_count}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!e.is_default && (
                        <button
                          type="button"
                          onClick={() => copyLink(e)}
                          disabled={busy || closed}
                          title={
                            closed
                              ? 'Evento encerrado — o link não aceita respostas'
                              : 'Copiar o link do formulário deste evento'
                          }
                          className={
                            btnClass +
                            (copiedId === e.id
                              ? ' !bg-emerald-50 !text-emerald-700 !border-emerald-300 dark:!bg-emerald-950/40 dark:!text-emerald-300 dark:!border-emerald-700'
                              : '')
                          }
                        >
                          {copiedId === e.id ? '✓ Copiado' : '🔗 Copiar link'}
                        </button>
                      )}
                      <Link href={opportunitiesHref(e)} className={btnClass}>
                        Ver oportunidades
                      </Link>
                      <button
                        type="button"
                        onClick={() => setMode({ kind: 'edit', event: e })}
                        disabled={busy}
                        className={btnClass}
                      >
                        Editar
                      </button>
                      {!e.is_default && (
                        <button
                          type="button"
                          onClick={() => toggleStatus(e)}
                          disabled={busy}
                          className={btnClass}
                        >
                          {closed ? 'Reabrir' : 'Encerrar'}
                        </button>
                      )}
                      {!e.is_default && e.opportunities_count === 0 && (
                        <button
                          type="button"
                          onClick={() => remove(e)}
                          disabled={busy}
                          className={
                            btnClass +
                            ' !text-red-700 hover:!bg-red-50 dark:!text-red-300 dark:hover:!bg-red-950/40'
                          }
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
