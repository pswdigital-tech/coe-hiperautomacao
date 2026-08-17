// =============================================================================
// filters-storage.ts — lembra a última URL da listagem de Oportunidades (view +
// filtros) durante a navegação, isolada por empresa selecionada.
// -----------------------------------------------------------------------------
// Cobre dois problemas reais (2026-08-14):
// (1) abrir uma oportunidade e voltar pela trilha/sidebar jogava a pessoa de
//     volta pra Lista sem filtro nenhum — esses links usavam `/opportunities`
//     cru, sem querystring (ver DetailHeader.tsx e Sidebar.tsx);
// (2) staff PSW/platform_admin trocando de empresa pelo seletor carregava os
//     filtros da empresa anterior para a nova — cada empresa precisa da sua
//     própria memória (ver CompanySelector.tsx).
//
// sessionStorage, não localStorage: memória "desta navegação", não um estado
// permanente que sobrevive a semanas de uso e confunde quem volta bem depois.
// =============================================================================

const PREFIX = 'coe:opportunities:list:';
const LAST_KEY = `${PREFIX}_last_`;

function companyKey(companySlug: string): string {
  return `${PREFIX}${companySlug || '_all_'}`;
}

/**
 * Guarda a URL completa (`/opportunities?...`) da listagem — tanto na chave
 * "última visita" (usada por quem só quer voltar pra onde estava, sem saber
 * de qual empresa) quanto na chave da empresa (usada para isolar a memória
 * de cada empresa entre si).
 */
export function saveListState(companySlug: string, url: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LAST_KEY, url);
    window.sessionStorage.setItem(companyKey(companySlug), url);
  } catch {
    // sessionStorage indisponível (modo privado, quota) — degrada sem persistir
  }
}

/** Última URL de listagem visitada, de qualquer empresa. */
export function getLastListUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Última URL de listagem visitada especificamente para esta empresa. */
export function getListUrlForCompany(companySlug: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(companyKey(companySlug));
  } catch {
    return null;
  }
}
