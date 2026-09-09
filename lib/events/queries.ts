import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { EventOption, EventWithCount, PublicEvent } from './types';

// =============================================================================
// events/queries.ts — leituras de `events` (0066)
// -----------------------------------------------------------------------------
// Nenhuma função aqui filtra por papel: quem recorta é a RLS de `events`
// (membros do tenant, super-admin, psw_staff com concessão ou atribuição —
// espelho de quem lê as oportunidades da empresa). Whitelist de colunas em
// todo select (HARDEN-E-06); falha de leitura de rótulo degrada para vazio,
// falha da lista principal propaga (a tela precisa saber).
// =============================================================================

const EVENT_COLUMNS =
  'id, tenant_id, name, slug, description, starts_at, ends_at, status, ' +
  'is_default, created_by, created_at, updated_at';

const EVENT_OPTION_COLUMNS = 'id, tenant_id, name, slug, is_default, status, starts_at';

/** Padrão primeiro, depois os demais do mais recente ao mais antigo. */
function sortEvents<T extends Pick<EventOption, 'is_default' | 'starts_at' | 'name'>>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    if (a.starts_at !== b.starts_at) return a.starts_at < b.starts_at ? 1 : -1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

/**
 * A lista da tela /eventos: eventos + contagem de oportunidades visíveis.
 * `tenantIds` recorta às empresas administradas (a page já resolveu o
 * conjunto via `fetchImportableTenants()`); sem ele, a RLS decide sozinha.
 */
export async function fetchEventsWithCounts(
  tenantIds?: string[],
): Promise<EventWithCount[]> {
  if (tenantIds && tenantIds.length === 0) return [];
  const supabase = await createClient();
  let q = supabase
    .from('events_with_counts')
    .select(`${EVENT_COLUMNS}, opportunities_count`);
  if (tenantIds) q = q.in('tenant_id', tenantIds);
  const { data, error } = await q.returns<EventWithCount[]>();
  if (error) throw new Error(`Erro ao buscar eventos: ${error.message}`);
  return sortEvents(data ?? []);
}

/**
 * Opções de evento de UMA empresa, para seletores (registro manual, filtro da
 * listagem). Encerrados entram por padrão — o CoE ainda registra demanda
 * levantada num workshop depois de ele fechar, e a listagem precisa filtrar
 * pelo que já aconteceu; `activeOnly` serve ao que só faz sentido em aberto.
 */
export async function fetchEventOptions(
  tenantId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<EventOption[]> {
  const supabase = await createClient();
  let q = supabase
    .from('events')
    .select(EVENT_OPTION_COLUMNS)
    .eq('tenant_id', tenantId);
  if (opts.activeOnly) q = q.eq('status', 'active');
  const { data, error } = await q.returns<EventOption[]>();
  if (error) {
    console.error('[events/queries] fetchEventOptions:', error.message);
    return [];
  }
  return sortEvents(data ?? []);
}

/**
 * Todos os eventos que o usuário enxerga, sem recorte de empresa — para o
 * filtro "Evento" do super-admin em "Todas as empresas" (a RLS de `events`
 * decide o conjunto; para papéis de cliente devolve só a própria empresa).
 */
export async function fetchAllEventOptions(): Promise<EventOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_OPTION_COLUMNS)
    .returns<EventOption[]>();
  if (error) {
    console.error('[events/queries] fetchAllEventOptions:', error.message);
    return [];
  }
  return sortEvents(data ?? []);
}

/** Rótulos para a coluna/detalhe — ids vindos de linhas já filtradas pela RLS. */
export async function fetchEventsByIds(ids: string[]): Promise<EventOption[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_OPTION_COLUMNS)
    .in('id', uniqueIds)
    .returns<EventOption[]>();
  if (error) {
    console.error('[events/queries] fetchEventsByIds:', error.message);
    return [];
  }
  return data ?? [];
}

/** Um evento completo (tela de edição). `null` = inexistente ou fora do escopo. */
export async function fetchEventById(id: string): Promise<EventWithCount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events_with_counts')
    .select(`${EVENT_COLUMNS}, opportunities_count`)
    .eq('id', id)
    .maybeSingle()
    .returns<EventWithCount>();
  if (error) throw new Error(`Erro ao buscar evento: ${error.message}`);
  return data;
}

/**
 * Resolve `?evento=<slug>` → ids. Com `tenantId` (empresa selecionada ou
 * tenant do usuário) devolve no máximo 1; sem ele (super-admin em "Todas as
 * empresas") pode devolver vários — o mesmo slug existe em empresas
 * diferentes. Vazio = não encontrado/fora do escopo (os dois colapsam de
 * propósito). Mantém o UUID fora da URL, como `fetchTenantIdBySlug`.
 */
export async function resolveEventIdsBySlug(
  slug: string,
  tenantId?: string,
): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase.from('events').select('id').eq('slug', slug);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) {
    console.error('[events/queries] resolveEventIdsBySlug:', error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id);
}

type PublicEventRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: 'active' | 'closed';
};

/**
 * Porta anônima do formulário por evento (RPC SECURITY DEFINER, 0066). Nunca
 * devolve o evento padrão nem eventos de empresa suspensa. `status` vem junto
 * para a página mostrar "encerrado" em vez de 404.
 */
export async function fetchPublicEvent(
  tenantSlug: string,
  eventSlug: string,
): Promise<PublicEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fetch_public_event', {
    p_tenant_slug: tenantSlug,
    p_event_slug: eventSlug,
  });
  if (error) throw new Error(`Erro ao buscar evento: ${error.message}`);
  const row = (data as PublicEventRow[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}
