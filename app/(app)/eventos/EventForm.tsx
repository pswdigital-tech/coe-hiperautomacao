'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent, updateEvent } from '@/lib/events/actions';
import { slugifyEventName, EVENT_SLUG_MAX } from '@/lib/events/slug';
import type { EventWithCount } from '@/lib/events/types';
import type { TenantSummary } from '@/lib/tenants/queries';

// =============================================================================
// EventForm — criar/editar um evento (0066)
// -----------------------------------------------------------------------------
// O slug é derivado do nome enquanto a pessoa digita, até ela editar o campo
// de slug à mão (aí passa a valer o que digitou). No evento padrão o slug é
// travado — é a chave `registro-avulso` que o sistema usa para reconhecê-lo.
// A empresa só é escolhida na CRIAÇÃO e só quando há mais de uma
// administrada; na edição ela é a da linha (imutável, trigger no banco).
// =============================================================================

type Props = {
  tenants: TenantSummary[];
  /** Pré-seleção (empresa do seletor, ou a única administrada). */
  defaultTenantId: string | null;
  /** Presente = edição. */
  event?: EventWithCount | null;
  onClose: () => void;
};

const inputClass =
  'w-full px-3 py-2 border border-bdr rounded-lg text-[13px] bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15 disabled:opacity-60';
const labelClass = 'block text-[12px] font-bold text-txt mb-1';
const errClass = 'mt-1 text-[11px] text-red-700 dark:text-red-300';

export function EventForm({ tenants, defaultTenantId, event = null, onClose }: Props) {
  const router = useRouter();
  const isEdit = !!event;
  const isDefault = !!event?.is_default;

  const [tenantId, setTenantId] = useState<string>(
    event?.tenant_id ?? defaultTenantId ?? (tenants.length === 1 ? tenants[0].id : ''),
  );
  const [name, setName] = useState(event?.name ?? '');
  const [slug, setSlug] = useState(event?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(event?.description ?? '');
  const [startsAt, setStartsAt] = useState(
    event?.starts_at ?? new Date().toISOString().slice(0, 10),
  );
  const [endsAt, setEndsAt] = useState(event?.ends_at ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugifyEventName(v));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!isEdit && !tenantId) {
      setError('Escolha a empresa do evento.');
      return;
    }
    const input = {
      name,
      slug: isDefault ? '' : slug,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
    };
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateEvent(event!.id, input)
          : await createEvent(tenantId, input);
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError('Não foi possível salvar agora. Recarregue a página e tente novamente.');
      }
    });
  }

  const fe = (k: string) => fieldErrors[k]?.[0];

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-bdr bg-wh p-5 md:p-6 flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold text-txt">
            {isEdit ? 'Editar evento' : 'Novo evento'}
          </h2>
          <p className="text-[12px] text-mut mt-0.5">
            {isDefault
              ? 'O evento padrão recebe o que não foi vinculado a nenhum outro. Só o nome e a descrição mudam.'
              : 'O link do formulário é montado a partir do slug — escolha algo curto e reconhecível.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] font-semibold text-mut hover:text-txt"
        >
          Fechar ✕
        </button>
      </div>

      {!isEdit && tenants.length > 1 && (
        <div>
          <label className={labelClass} htmlFor="ev-tenant">
            Empresa
          </label>
          <select
            id="ev-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className={inputClass}
            disabled={pending}
          >
            <option value="">Escolha a empresa…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="ev-name">
            Nome do evento
          </label>
          <input
            id="ev-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ex.: Workshop Financeiro — Setembro"
            maxLength={120}
            className={inputClass}
            disabled={pending}
            required
          />
          {fe('name') && <p className={errClass}>{fe('name')}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="ev-slug">
            Slug (vai na URL)
          </label>
          <input
            id="ev-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            placeholder="workshop-financeiro-setembro"
            maxLength={EVENT_SLUG_MAX}
            className={`${inputClass} font-mono`}
            disabled={pending || isDefault}
            spellCheck={false}
          />
          {fe('slug') ? (
            <p className={errClass}>{fe('slug')}</p>
          ) : (
            <p className="mt-1 text-[11px] text-mut">
              Só letras minúsculas, números e hífens.
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="ev-starts">
            Data
          </label>
          <input
            id="ev-starts"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputClass}
            disabled={pending}
            required
          />
          {fe('starts_at') && <p className={errClass}>{fe('starts_at')}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="ev-ends">
            Até (opcional)
          </label>
          <input
            id="ev-ends"
            type="date"
            value={endsAt}
            min={startsAt || undefined}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
          {fe('ends_at') && <p className={errClass}>{fe('ends_at')}</p>}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="ev-desc">
          Descrição (opcional)
        </label>
        <textarea
          id="ev-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Contexto do evento, público, área envolvida…"
          className={inputClass}
          disabled={pending}
        />
        {fe('description') && <p className={errClass}>{fe('description')}</p>}
      </div>

      {error && (
        <div
          role="alert"
          className="text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-4 py-2 text-[13px] font-semibold rounded-lg border border-bdr bg-wh text-txt hover:bg-bg disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 text-[13px] font-bold rounded-lg bg-pri hover:bg-pril text-white disabled:opacity-60"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar evento'}
        </button>
      </div>
    </form>
  );
}
