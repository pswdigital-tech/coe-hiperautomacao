'use client';

import Image from 'next/image';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { signUp } from './actions';
import PasswordStrength from '@/components/auth/password-strength';
import { PASSWORD_MIN_LENGTH, checkPassword } from '@/lib/auth/password-policy';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();

  const { isStrong } = checkPassword(password);

  // `?email=` vem do botão do e-mail de convite — só pré-preenche o campo.
  // A autorização real continua sendo a allowlist validada server-side.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('email');
    if (fromLink) setInvitedEmail(fromLink);
  }, []);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signUp(formData);
      if (result && 'error' in result) setError(result.error);
      else if (result && 'ok' in result) setDone(true);
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
              <h1 className="text-base font-bold">Criar conta</h1>
              <p className="text-xs opacity-75">CoE Hiperautomação · PSW Digital</p>
            </div>
          </div>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center flex flex-col gap-3">
            <div className="text-3xl">✉️</div>
            <p className="text-sm text-txt">
              Conta criada! Verifique seu e-mail para confirmar o cadastro e
              depois faça login.
            </p>
            <Link
              href="/login"
              className="mt-2 text-sm font-semibold text-pri hover:underline"
            >
              Ir para o login
            </Link>
          </div>
        ) : (
          <form action={onSubmit} className="px-6 py-6 flex flex-col gap-4">
            <p className="text-xs text-mut">
              Use o e-mail que foi liberado pelo administrador da sua empresa.
            </p>

            <div>
              <label
                htmlFor="full_name"
                className="text-xs font-bold uppercase tracking-wide text-mut"
              >
                Nome completo
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                autoComplete="name"
                autoFocus
                className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="text-xs font-bold uppercase tracking-wide text-mut"
              >
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                // key força o remount quando o e-mail do convite chega (efeito
                // pós-hidratação) — sem isso o defaultValue já teria sido fixado.
                key={invitedEmail}
                defaultValue={invitedEmail}
                className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-wide text-mut"
              >
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="password-requisitos"
                className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
              />
              <div id="password-requisitos">
                <PasswordStrength value={password} />
              </div>
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
              disabled={pending || !isStrong}
              className="w-full py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {pending ? 'Criando...' : 'Criar conta'}
            </button>

            <p className="text-center text-xs text-mut">
              Já tem conta?{' '}
              <Link href="/login" className="font-semibold text-pri hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
