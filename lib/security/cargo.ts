// =============================================================================
// cargo.ts — CARGO (função na equipe), deliberadamente separado de `role`
// -----------------------------------------------------------------------------
// `role` (tenant_role: member | viewer | tenant_admin | platform_admin) é o que
// a RLS enxerga e a única coisa que concede ou nega escrita — ver role.ts.
// `cargo` é rótulo organizacional: aparece na tela de Equipe, não muda nada de
// permissão. Se um dia um cargo precisar de permissão diferente, isso vira uma
// mudança de `role`/policy, nunca uma leitura de `cargo` no backend.
//
// Os valores são espelhados pelo CHECK da migration 0031 — mexer aqui exige
// mexer lá.
// =============================================================================

export const CARGOS = [
  'tech_lead',
  'coe_manager',
  'dev',
  'arquiteto',
  'devops',
  'engenheiro_dados',
  'pm',
  'scrum_master',
  'outro',
] as const;

export type Cargo = (typeof CARGOS)[number];

export const CARGO_LABEL: Record<Cargo, string> = {
  tech_lead: 'Tech Lead',
  coe_manager: 'CoE Manager',
  dev: 'Dev',
  arquiteto: 'Arquiteto',
  devops: 'DevOps',
  engenheiro_dados: 'Engenheiro de Dados',
  pm: 'PM',
  scrum_master: 'Scrum Master',
  outro: 'Outro',
};

/** Allowlist server-side — nunca confiar no <select> do client. */
export function parseCargo(raw: unknown): Cargo | null {
  const value = String(raw ?? '').trim();
  return (CARGOS as readonly string[]).includes(value) ? (value as Cargo) : null;
}

/** Rótulo para exibição; aceita o que vier do banco (inclusive null/legado). */
export function cargoLabel(cargo: string | null | undefined): string {
  if (!cargo) return '—';
  return CARGO_LABEL[cargo as Cargo] ?? cargo;
}

// -----------------------------------------------------------------------------
// Dropdown único (Papel + Cargo) — /team
// -----------------------------------------------------------------------------
// O form de convite mostra UMA lista com os 3 níveis de acesso e os 8 cargos.
// Para não colapsar as duas dimensões, o <option> de cargo carrega um valor
// prefixado (`cargo:dev`) que o servidor traduz para role='member' + cargo.
// Os níveis de acesso continuam com o valor cru do enum ('member', 'viewer',
// 'tenant_admin'), então nada muda para quem já era convidado assim.
//
// REGRA: todo cargo dá acesso de MEMBRO (cria e edita, não convida). Para
// alguém ser admin ou leitor, escolhe-se o nível de acesso — não um cargo.

export const CARGO_OPTION_PREFIX = 'cargo:';

export type AccessRole = 'member' | 'viewer' | 'tenant_admin';

const ACCESS_ROLES: readonly AccessRole[] = ['member', 'viewer', 'tenant_admin'];

/**
 * Traduz o valor do dropdown único em (role, cargo). Allowlist de verdade:
 * qualquer coisa fora das duas listas cai no default seguro member/sem cargo.
 */
export function parseRoleAndCargo(raw: unknown): { role: AccessRole; cargo: Cargo | null } {
  const value = String(raw ?? '').trim();

  if (value.startsWith(CARGO_OPTION_PREFIX)) {
    const cargo = parseCargo(value.slice(CARGO_OPTION_PREFIX.length));
    return { role: 'member', cargo };
  }

  return {
    role: (ACCESS_ROLES as readonly string[]).includes(value)
      ? (value as AccessRole)
      : 'member',
    cargo: null,
  };
}
