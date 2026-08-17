'use client';

import { useState, useTransition } from 'react';
import { inviteTeamMember } from './actions';
import { CARGOS, CARGO_LABEL, CARGO_OPTION_PREFIX } from '@/lib/security/cargo';

/**
 * Form de convite do admin da empresa. Note a ausência de qualquer campo de
 * empresa — o tenant é sempre o do usuário logado (derivado no servidor).
 */
export function TeamInviteForm({ tenantName }: { tenantName: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const email = String(formData.get('email') ?? '');
    startTransition(async () => {
      const result = await inviteTeamMember(formData);
      if ('error' in result) setError(result.error);
      else {
        setSuccess(`Convite criado para ${email}.`);
        const form = document.getElementById('team-invite-form') as HTMLFormElement | null;
        form?.reset();
      }
    });
  }

  const inputCls =
    'mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20';
  const labelCls = 'text-xs font-bold uppercase tracking-wide text-mut';

  return (
    <form
      id="team-invite-form"
      action={onSubmit}
      className="bg-wh rounded-xl border border-bdr p-5 flex flex-col gap-4"
    >
      <h2 className="text-sm font-bold text-txt">
        Convidar pessoa{tenantName ? ` para ${tenantName}` : ''}
      </h2>

      <div>
        <label htmlFor="team-invite-email" className={labelCls}>
          E-mail
        </label>
        <input
          id="team-invite-email"
          name="email"
          type="email"
          required
          placeholder="pessoa@empresa.com.br"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="team-invite-role" className={labelCls}>
          Papel
        </label>
        {/* "Membro" genérico deixou de ser opção: os cargos ocupam o lugar dele
            — todos com o mesmo acesso de membro por baixo. O prefixo do value é
            desfeito no servidor (parseRoleAndCargo). */}
        <select id="team-invite-role" name="role" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Selecione…
          </option>
          <option value="tenant_admin">Admin da empresa — também convida pessoas</option>
          <option value="viewer">Leitor — somente leitura</option>
          {CARGOS.filter((c) => c !== 'outro').map((c) => (
            <option key={c} value={`${CARGO_OPTION_PREFIX}${c}`}>
              {CARGO_LABEL[c]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-mut">
          Todos os cargos criam e editam oportunidades, mas não convidam pessoas.
          O Leitor enxerga tudo e não altera nada.
        </p>
      </div>

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
          {success} Ela já pode criar a conta com esse e-mail.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
      >
        {pending ? 'Convidando...' : 'Convidar'}
      </button>
    </form>
  );
}
