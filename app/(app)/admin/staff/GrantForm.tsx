'use client';

import { useMemo, useState, useTransition } from 'react';
import { grantTenantAdmin } from './actions';

// =============================================================================
// GrantForm.tsx — formulário de concessão de admin de empresa (Phase 18, Plan
// 04, GRANT-07). Modelado em app/(app)/admin/invites/InviteForm.tsx: mesmo
// esqueleto de card, useTransition, banner de erro com role="alert".
// =============================================================================

type PersonOption = { id: string; fullName: string | null; email: string };
type TenantOption = { id: string; name: string };

type Props = {
  people: PersonOption[];
  tenants: TenantOption[];
  /** tenants já concedidos, por pessoa — usado para excluir do seletor e detectar "já admin de tudo". */
  grantedTenantIdsByPerson: Record<string, string[]>;
};

function personLabel(p: PersonOption): string {
  return p.fullName ? `${p.fullName} · ${p.email}` : p.email;
}

export function GrantForm({ people, tenants, grantedTenantIdsByPerson }: Props) {
  const [personId, setPersonId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Empresas ainda não concedidas para a pessoa selecionada — a concessão só
  // faz sentido para o que falta; reoferecer uma empresa já concedida
  // produziria o erro de duplicidade do servidor sem necessidade.
  const availableTenants = useMemo(() => {
    if (!personId) return tenants;
    const granted = new Set(grantedTenantIdsByPerson[personId] ?? []);
    return tenants.filter((t) => !granted.has(t.id));
  }, [personId, tenants, grantedTenantIdsByPerson]);

  // Caso do §UI Considerations: pessoa já é admin de TODAS as empresas — o
  // seletor não pode ficar vazio em silêncio.
  const personIsFullyGranted = personId !== '' && availableTenants.length === 0;

  function onPersonChange(id: string) {
    setPersonId(id);
    setTenantId('');
    setError(null);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await grantTenantAdmin(formData);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setPersonId('');
      setTenantId('');
      const form = document.getElementById('grant-form') as HTMLFormElement | null;
      form?.reset();
    });
  }

  const inputCls =
    'mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20 disabled:opacity-50';
  const labelCls = 'text-xs font-bold uppercase tracking-wide text-mut';

  const canSubmit = personId !== '' && tenantId !== '' && !personIsFullyGranted;

  return (
    <form
      id="grant-form"
      action={onSubmit}
      className="bg-wh rounded-xl border border-bdr p-5 flex flex-col gap-4"
    >
      <h2 className="text-sm font-bold text-txt">Conceder acesso de admin</h2>

      <div>
        <label htmlFor="grant-person" className={labelCls}>
          Pessoa
        </label>
        <select
          id="grant-person"
          name="profile_id"
          required
          value={personId}
          onChange={(e) => onPersonChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Selecione…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="grant-tenant" className={labelCls}>
          Empresa
        </label>
        <select
          id="grant-tenant"
          name="tenant_id"
          required
          value={tenantId}
          disabled={personIsFullyGranted}
          onChange={(e) => setTenantId(e.target.value)}
          className={inputCls}
        >
          <option value="">Selecione…</option>
          {personIsFullyGranted ? (
            <option value="" disabled>
              Esta pessoa já é admin de todas as empresas.
            </option>
          ) : (
            availableTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          )}
        </select>
      </div>

      {error && (
        <div
          role="alert"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || pending}
        className="py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
      >
        {pending ? 'Concedendo...' : 'Conceder acesso de admin'}
      </button>
    </form>
  );
}
