'use client';

import { useState, useTransition } from 'react';
import { resendInvite } from './actions';

/** Reenvia o e-mail de um convite pendente, com feedback inline. */
export function ResendButton({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('id', id);
      const result = await resendInvite(fd);
      setState('error' in result ? 'error' : 'sent');
    });
  }

  if (state === 'sent') {
    return <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Reenviado</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={state === 'error' ? 'Falha ao enviar — verifique a configuração do provedor' : undefined}
      className={
        state === 'error'
          ? 'text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50'
          : 'text-[11px] font-semibold text-pri hover:underline disabled:opacity-50'
      }
    >
      {pending ? 'Enviando…' : state === 'error' ? 'Falhou — tentar de novo' : 'Reenviar'}
    </button>
  );
}
