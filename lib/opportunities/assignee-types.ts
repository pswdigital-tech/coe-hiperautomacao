import type { TenantRole } from './types';

// =============================================================================
// assignee-types.ts — tipos e formatação de assignees, SEM `server-only`
// -----------------------------------------------------------------------------
// Existe separado de assignees.ts (que é server-only por causa do client
// Supabase) para que os componentes client possam importar tipo e rótulo sem
// arrastar o módulo de servidor junto.
// =============================================================================

/** Pessoa atribuída, já achatada com os dados de exibição do profile. */
export type Assignee = {
  profileId: string;
  email: string;
  fullName: string | null;
  cargo: string | null;
  role: TenantRole;
};

/** Candidato a ser atribuído (alguém do tenant da oportunidade). */
export type AssignableProfile = {
  id: string;
  email: string;
  fullName: string | null;
  cargo: string | null;
  role: TenantRole;
};

/** Rótulo curto de exibição — nome, ou o e-mail sem domínio como fallback. */
export function assigneeName(a: Pick<Assignee, 'fullName' | 'email'>): string {
  return a.fullName?.trim() || a.email.split('@')[0];
}

/** Iniciais para o avatar (1–2 letras), a partir do mesmo rótulo. */
export function assigneeInitials(a: Pick<Assignee, 'fullName' | 'email'>): string {
  const parts = assigneeName(a).split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
