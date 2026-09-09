'use client';

import type { TenantSummary } from '@/lib/tenants/queries';
import type { EventOption } from '@/lib/events/types';

// Etapa EXCLUSIVA do registro interno (staff PSW / super-admin): escolher em
// nome de QUAL empresa a oportunidade será registrada. Deliberadamente NÃO
// existe no formulário público (`/r/<slug>`) — lá o tenant já vem do slug da
// URL e quem preenche é anônimo; oferecer uma lista de empresas ali seria
// vazar a carteira de clientes para qualquer visitante. Por isso ela mora
// aqui, nesta rota, e não em `components/opportunities/wizard/` (compartilhado
// com o público e com o modal da home).
//
// A lista JÁ VEM RECORTADA do servidor (`staff_writable_tenant_ids()`, 0051) —
// este componente nunca filtra nem decide escopo, só desenha o que recebeu.

type Props = {
  tenants: TenantSummary[];
  selectedId: string | null;
  error: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  /**
   * 0066 — eventos da empresa ESCOLHIDA (carregados pelo pai depois da
   * seleção; a RLS de `events` já recortou). O padrão "Registro avulso" é a
   * opção neutra — quem não levantou num evento deixa como está.
   */
  events?: EventOption[];
  selectedEventId?: string | null;
  eventsLoading?: boolean;
  onSelectEvent?: (id: string) => void;
};

function eventLabel(e: EventOption): string {
  if (e.is_default) return `${e.name} — sem evento`;
  const date = new Date(`${e.starts_at}T00:00:00`).toLocaleDateString('pt-BR');
  return `${e.name} · ${date}${e.status === 'closed' ? ' (encerrado)' : ''}`;
}

export function TenantStep({
  tenants,
  selectedId,
  error,
  onSelect,
  onContinue,
  events = [],
  selectedEventId = null,
  eventsLoading = false,
  onSelectEvent,
}: Props) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-extrabold text-txt leading-tight">
        Para qual empresa é este registro?
      </h2>
      <p className="text-sm text-mut mt-1">
        A oportunidade será criada no pipeline da empresa escolhida — como se
        tivesse chegado pelo formulário dela.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {tenants.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={selectedId === t.id}
            className={
              'text-left p-4 rounded-xl border-2 transition-all ' +
              (selectedId === t.id
                ? 'border-pri bg-pri/5 shadow-md'
                : 'border-bdr bg-wh hover:border-pril hover:bg-blue-50/40 dark:hover:bg-blue-950/40')
            }
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pri/10 text-pri flex items-center justify-center text-[13px] font-black shrink-0">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-txt truncate">
                  {t.name}
                </div>
                <div className="text-[11px] text-mut truncate">{t.slug}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedId && onSelectEvent && (
        <div className="mt-6">
          <label
            htmlFor="register-event"
            className="block text-[12px] font-bold text-txt mb-1"
          >
            Evento de levantamento
          </label>
          <select
            id="register-event"
            value={selectedEventId ?? ''}
            onChange={(e) => onSelectEvent(e.target.value)}
            disabled={eventsLoading || events.length === 0}
            className="w-full max-w-md px-3 py-2 border border-bdr rounded-lg text-[13px] bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15 disabled:opacity-60"
          >
            {eventsLoading && <option value="">Carregando eventos…</option>}
            {!eventsLoading && events.length === 0 && (
              <option value="">Registro avulso — sem evento</option>
            )}
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {eventLabel(e)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-mut">
            Em qual workshop ou levantamento esta demanda surgiu. Sem evento,
            fica em &quot;Registro avulso&quot;. Eventos novos são criados em{' '}
            <span className="font-semibold">Eventos</span>, no menu.
          </p>
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
