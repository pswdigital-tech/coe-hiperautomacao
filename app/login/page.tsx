'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // `?erro=link_invalido` vem do /auth/callback quando o link de recuperação
  // expirou ou já foi usado. Lido do window (e não de useSearchParams) para não
  // exigir Suspense boundary numa página inteiramente client-side.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('erro') === 'link_invalido') {
      setError('Link inválido ou expirado. Solicite uma nova recuperação de senha.');
    }
  }, []);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
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
              <h1 className="text-base font-bold">CoE Hiperautomação</h1>
              <p className="text-xs opacity-75">Gestão de Automações · PSW Digital</p>
            </div>
          </div>
        </div>

        <form action={onSubmit} className="px-6 py-6 flex flex-col gap-4">
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

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-wide text-mut"
              >
                Senha
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-pri hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
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
            {pending ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="text-xs text-mut text-center">
            Recebeu um convite?{' '}
            <Link href="/signup" className="font-semibold text-pri hover:underline">
              Crie sua conta
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
