import type { Database, EventStatus } from '@/lib/database.types';

export type { EventStatus };

/** Linha de `events` (0066). */
export type EventRow = Database['public']['Tables']['events']['Row'];

/** Linha de `events_with_counts` — a lista da tela /eventos. */
export type EventWithCount = Database['public']['Views']['events_with_counts']['Row'];

/**
 * Recorte para seletores (registro manual, filtro da listagem): o mínimo para
 * rotular e ordenar. `is_default` deixa a UI marcar "Registro avulso" como a
 * opção neutra; `status` deixa esconder/assinalar os encerrados.
 */
export type EventOption = Pick<
  EventRow,
  'id' | 'tenant_id' | 'name' | 'slug' | 'is_default' | 'status' | 'starts_at'
>;

/** O que a porta anônima `fetch_public_event` devolve (camelCase para a UI). */
export type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
};
