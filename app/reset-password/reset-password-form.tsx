'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { resetPassword } from './actions';
import PasswordStrength from '@/components/auth/password-strength';
import { PASSWORD_MIN_LENGTH, checkPassword } from '@/lib/auth/password-policy';

export default function ResetPasswordForm({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  const { isStrong } = checkPassword(password);
  const matches = password.length > 0 && password === confirm;

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await resetPassword(formData);
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
              <h1 className="text-base font-bold">Definir nova senha</h1>
              <p className="text-xs opacity-75">{email}</p>
            </div>
          </div>
        </div>

        <form action={onSubmit} className="px-6 py-6 flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="text-xs font-bold uppercase tracking-wide text-mut">
              Nova senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-requisitos"
              className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
            />
            <div id="password-requisitos">
              <PasswordStrength value={password} />
            </div>
          </div>

          <div>
            <label
              htmlFor="password_confirm"
              className="text-xs font-bold uppercase tracking-wide text-mut"
            >
              Confirmar nova senha
            </label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-bdr rounded-lg text-sm bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
            />
            {confirm.length > 0 && (
              <p
                aria-live="polite"
                className={`mt-1 text-[11px] font-semibold ${
                  matches
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {matches ? '✓ As senhas conferem' : '✗ As senhas não conferem'}
              </p>
            )}
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
            disabled={pending || !isStrong || !matches}
            className="w-full py-2.5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {pending ? 'Salvando...' : 'Salvar nova senha'}
          </button>

          <p className="text-xs text-mut text-center">
            <Link href="/forgot-password" className="font-semibold text-pri hover:underline">
              Solicitar outro link
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
