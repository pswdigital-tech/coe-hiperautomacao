/**
 * Política de senha — espelha a configuração do projeto no Supabase Auth
 * (Minimum password length = 8, Password requirements = "Lowercase, uppercase
 * letters, digits and symbols"). Manter os dois lados em sincronia: se mudar
 * aqui, mudar no painel do Supabase (e vice-versa), senão o usuário vê o
 * indicador verde e mesmo assim leva erro do servidor.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Conjunto de símbolos aceito pelo Supabase Auth. */
const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export type PasswordRuleKey =
  | 'length'
  | 'lowercase'
  | 'uppercase'
  | 'digit'
  | 'symbol';

export type PasswordRule = {
  key: PasswordRuleKey;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: 'length',
    label: `Ao menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: 'lowercase',
    label: 'Uma letra minúscula (a-z)',
    test: (p) => /[a-z]/.test(p),
  },
  {
    key: 'uppercase',
    label: 'Uma letra maiúscula (A-Z)',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    key: 'digit',
    label: 'Um número (0-9)',
    test: (p) => /[0-9]/.test(p),
  },
  {
    key: 'symbol',
    label: 'Um símbolo (!@#$%…)',
    test: (p) => p.split('').some((c) => SYMBOLS.includes(c)),
  },
];

export type PasswordCheck = {
  /** Regras satisfeitas, na ordem de PASSWORD_RULES. */
  passed: Record<PasswordRuleKey, boolean>;
  satisfied: number;
  total: number;
  isStrong: boolean;
  /** Primeira regra pendente — usada na mensagem de erro server-side. */
  firstMissing: PasswordRule | null;
};

export function checkPassword(password: string): PasswordCheck {
  const passed = {} as Record<PasswordRuleKey, boolean>;
  let satisfied = 0;
  let firstMissing: PasswordRule | null = null;

  for (const rule of PASSWORD_RULES) {
    const ok = rule.test(password);
    passed[rule.key] = ok;
    if (ok) satisfied += 1;
    else if (!firstMissing) firstMissing = rule;
  }

  return {
    passed,
    satisfied,
    total: PASSWORD_RULES.length,
    isStrong: satisfied === PASSWORD_RULES.length,
    firstMissing,
  };
}

/**
 * Mensagem única para validação server-side — mantém o mesmo vocabulário do
 * indicador visual do formulário.
 */
export function passwordPolicyError(password: string): string | null {
  const { isStrong, firstMissing } = checkPassword(password);
  if (isStrong) return null;
  return `Senha fraca: falta ${firstMissing!.label.toLowerCase()}.`;
}
