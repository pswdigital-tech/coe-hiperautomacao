'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { requestPasswordReset } from './actions';

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(formData);
      if ('error' in result) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md bg-wh rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-pri to-pril text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
              <Image src="/brand/psw-icone.png" alt="PSW Digital" width={24} height={24} />
            </div>
            <div>
              <h1 className="text-base font-bold">Recuperar senha</h1>
              <p className="text-xs opacity-75">CoE Hiperautomação · PSW Digital</p>
            </div>
          </div>
        </div>

        {sent ? (
          <div className="px-6 py-6 flex flex-col gap-4">
            <div
              role="status"
              className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800"
            >
              Se existir uma conta com esse e-mail, enviamos um link para redefinir
              a senha. O link vale por tempo limitado e só pode ser usado uma vez.
            </div>
            <p className="text-xs text-mut text-center">
              Não recebeu? Verifique a caixa de spam ou{' '}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-semibold text-pri hover:underline"
              >
                tente outro e-mail
              </button>
              .
            </p>
            <Link
              href="/login"
              className="w-full py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg text-center transition-colors"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form action={onSubmit} className="px-6 py-6 flex flex-col gap-4">
            <p className="text-xs text-mut">
              Informe o e-mail da sua conta. Enviaremos um link seguro para você
              cadastrar uma nova senha.
            </p>

            <div>
              <label htmlFor="email" className="text-xs font-bold uppercase tracking-wide text-mut">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
              />
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
              disabled={pending}
              className="w-full py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {pending ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>

            <p className="text-xs text-mut text-center">
              Lembrou a senha?{' '}
              <Link href="/login" className="font-semibold text-pri hover:underline">
                Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
