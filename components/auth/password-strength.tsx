'use client';

import { PASSWORD_RULES, checkPassword } from '@/lib/auth/password-policy';

/** Rótulo + cor da barra por quantidade de regras satisfeitas (0–5). */
const LEVELS = [
  { label: 'Muito fraca', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { label: 'Muito fraca', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { label: 'Fraca', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  { label: 'Média', bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  { label: 'Quase lá', bar: 'bg-lime-500', text: 'text-lime-600 dark:text-lime-400' },
  { label: 'Forte', bar: 'bg-green-600', text: 'text-green-600 dark:text-green-400' },
] as const;

/**
 * Indicador de força de senha: barra de progresso + checklist do que já foi
 * atendido e do que falta. As regras vêm de lib/auth/password-policy, a mesma
 * fonte usada na validação server-side.
 */
export default function PasswordStrength({ value }: { value: string }) {
  const { passed, satisfied, total, isStrong } = checkPassword(value);
  const level = LEVELS[satisfied];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" role="presentation">
        {PASSWORD_RULES.map((rule, i) => (
          <span
            key={rule.key}
            className={`h-1 flex-1 rounded-full transition-colors ${
              value && i < satisfied ? level.bar : 'bg-bdr'
            }`}
          />
        ))}
      </div>

      <p className="mt-1.5 text-[11px] font-semibold">
        {value ? (
          <span className={level.text}>
            {isStrong ? '✓ Senha forte' : `Força: ${level.label} (${satisfied}/${total})`}
          </span>
        ) : (
          <span className="text-mut">A senha precisa atender aos {total} requisitos:</span>
        )}
      </p>

      <ul className="mt-1 flex flex-col gap-0.5">
        {PASSWORD_RULES.map((rule) => {
          const ok = passed[rule.key];
          return (
            <li
              key={rule.key}
              className={`flex items-center gap-1.5 text-[11px] ${
                ok ? 'text-green-600 dark:text-green-400' : 'text-mut'
              }`}
            >
              <span aria-hidden="true" className="w-3 shrink-0 text-center">
                {ok ? '✓' : '○'}
              </span>
              <span className={ok ? 'line-through opacity-70' : ''}>{rule.label}</span>
              <span className="sr-only">{ok ? '(atendido)' : '(pendente)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
