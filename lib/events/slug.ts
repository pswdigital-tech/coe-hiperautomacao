// =============================================================================
// events/slug.ts — slug e caminho público de um evento (0066)
// -----------------------------------------------------------------------------
// Puro e sem `server-only`: o formulário de criação (client) mostra o slug
// derivado do nome enquanto a pessoa digita, e a tela de eventos monta o link
// a copiar. A validação AUTORITATIVA é o CHECK `events_slug_format` do banco —
// `EVENT_SLUG_RE` é o espelho dele, para a UI recusar antes do round-trip.
// =============================================================================

/** Slug do evento padrão de toda empresa ("Registro avulso", 0066). */
export const DEFAULT_EVENT_SLUG = 'registro-avulso';
export const DEFAULT_EVENT_NAME = 'Registro avulso';

/** Espelho do CHECK `events_slug_format` (0066). */
export const EVENT_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const EVENT_SLUG_MAX = 80;

/**
 * "Workshop Financeiro — Set/2026" → "workshop-financeiro-set-2026".
 * Remove acentos, baixa caixa, troca tudo que não é [a-z0-9] por hífen único
 * e apara as pontas. Pode devolver '' (nome só de símbolos) — o chamador
 * decide o que fazer (o formulário mostra erro).
 */
export function slugifyEventName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, EVENT_SLUG_MAX)
    .replace(/-+$/g, '');
}

export function isValidEventSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= EVENT_SLUG_MAX && EVENT_SLUG_RE.test(slug);
}

/** Caminho (sem origem) do formulário público do evento. */
export function publicEventPath(tenantSlug: string, eventSlug: string): string {
  return `/r/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(eventSlug)}`;
}
