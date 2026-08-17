/**
 * Extrai iniciais de um nome (até 2 caracteres maiúsculos).
 *   "Maria Silva" → "MS"
 *   "João" → "JO"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Color helper para Score (paridade com scColor() do mockup linha 414).
 *   ≥70 → verde
 *   ≥40 → amarelo
 *   <40 → vermelho
 */
export function scoreColor(score: number): string {
  if (score >= 70) return 'var(--color-grn)';
  if (score >= 40) return 'var(--color-yel)';
  return 'var(--color-red)';
}
