'use client';

import { useEffect, useState, useTransition } from 'react';
import { setInviteRole, setProfileRole } from './actions';

/** Os três papéis de CLIENTE — o mesmo conjunto fechado da RPC 0064.
 *  `psw_staff` e `platform_admin` não entram aqui de propósito: o primeiro é
 *  lotação (quem é staff nasce staff, no tenant da PSW) e o segundo é o topo
 *  da cadeia — ambos continuam sendo mudança deliberada no banco. */
export type EditableRole = 'member' | 'viewer' | 'tenant_admin';

const OPTIONS: Array<{ value: EditableRole; label: string }> = [
  { value: 'member', label: 'Membro' },
  { value: 'tenant_admin', label: 'Admin da empresa' },
  { value: 'viewer', label: 'Leitor (somente leitura)' },
];

type Props = {
  /** 'invite' = convite pendente (`invited_emails`, RLS da 0022);
   *  'profile' = pessoa com conta (`profiles`, RPC `set_profile_role` da 0064).
   *  Duas escritas diferentes, mesma UI — o controle é o mesmo dos dois lados
   *  da tela e não deve parecer dois controles. */
  target: 'invite' | 'profile';
  id: string;
  /** Só para o rótulo acessível — o <select> sozinho não diz de quem é. */
  email: string;
  role: EditableRole;
};

export function RoleSelect({ target, id, email, role }: Props) {
  const [value, setValue] = useState<EditableRole>(role);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // O papel vindo do servidor manda: depois do revalidatePath a linha volta
  // com o valor gravado, e isso reconcilia qualquer divergência (ex.: duas
  // abas abertas na mesma tela).
  useEffect(() => {
    setValue(role);
  }, [role]);

  // "Salvo" some sozinho — sem isto a linha ficaria verde para sempre, e o
  // sinal perde o sentido de "acabou de acontecer".
  useEffect(() => {
    if (feedback?.kind !== 'ok') return;
    const t = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(t);
  }, [feedback]);

  function onChange(next: EditableRole) {
    const previous = value;
    setValue(next);
    setFeedback(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set(target === 'invite' ? 'invite_id' : 'profile_id', id);
      fd.set('role', next);
      const result =
        target === 'invite' ? await setInviteRole(fd) : await setProfileRole(fd);

      if ('error' in result) {
        // Volta ao papel anterior: o <select> nunca pode ficar mostrando um
        // papel que o banco recusou.
        setValue(previous);
        setFeedback({ kind: 'error', text: result.error });
      } else {
        setFeedback({ kind: 'ok', text: 'Salvo' });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Papel de ${email}`}
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as EditableRole)}
        className="h-8 pl-2 pr-7 border border-bdr rounded-lg text-xs bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20 disabled:opacity-50 transition-colors"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {pending && <span className="text-[11px] text-mut">Salvando…</span>}

      {!pending && feedback && (
        <span
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          title={feedback.kind === 'error' ? feedback.text : undefined}
          className={
            feedback.kind === 'ok'
              ? 'text-[11px] font-semibold text-emerald-600 dark:text-emerald-400'
              : 'inline-block align-middle max-w-[220px] truncate text-[11px] font-semibold text-red-600 dark:text-red-400'
          }
        >
          {feedback.kind === 'ok' ? '✓ Salvo' : feedback.text}
        </span>
      )}
    </span>
  );
}
