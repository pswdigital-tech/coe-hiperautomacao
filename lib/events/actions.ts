'use server';

// =============================================================================
// events/actions.ts — escrita em `events` (0066)
// -----------------------------------------------------------------------------
// QUEM PODE: `platform_admin` (qualquer empresa), `tenant_admin` (a própria) e
// `psw_staff` COM concessão de admin naquela empresa (0045) — o mesmo predicado
// da importação em massa (`import-actions.ts`): gerir eventos é ato de
// administração da empresa, não de pipeline.
//
// Camadas (padrão do projeto):
//   1. Guard `isPlatformAdmin || isTenantAdminOf(profile, tenantAlvo)` — testa
//      o PAR pessoa × empresa; o tenant-alvo de create vem do formulário
//      (lista já recortada por `fetchImportableTenants()`), o de update/delete
//      vem da PRÓPRIA LINHA lida pelo client autenticado (RLS decide se ela
//      existe para quem pede).
//   2. RLS de `events` (0066) é o bloqueio real — WITH CHECK com o mesmo
//      predicado.
//   3. Toda mutação com `.select('id')` e checagem de linhas afetadas: UPDATE/
//      DELETE que a RLS filtra devolvem `error: null` e zero linhas — o
//      "sucesso silencioso" que `lib/security/role.ts` documenta. Aqui isso
//      vira erro explícito.
//   4. Regras do evento padrão (não encerra, não some) são TRIGGER no banco;
//      aqui só traduzimos a mensagem quando ela chega.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  ADMIN_SCOPE_DENIED_MESSAGE,
  type CurrentProfile,
} from '@/lib/security/role';
import { eventInputSchema, type EventInput } from './schema';
import { slugifyEventName, isValidEventSlug } from './slug';
import { fetchEventOptions } from './queries';
import type { EventOption, EventStatus } from './types';

export type EventActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function canAdminTenant(profile: CurrentProfile, tenantId: string): Promise<boolean> {
  return isPlatformAdmin(profile) || (await isTenantAdminOf(profile, tenantId));
}

/** Mensagens do Postgres que vale repassar (as dos triggers já são pt-BR). */
function translateDbError(message: string, code?: string): string {
  if (code === '23505' || /events_tenant_slug_unique/.test(message)) {
    return 'Já existe um evento com este slug nesta empresa. Escolha outro.';
  }
  if (code === '23503' || /opportunities_event_id_fkey/.test(message)) {
    return 'Este evento tem oportunidades vinculadas e não pode ser excluído. Encerre-o.';
  }
  if (/^[^\n]{0,200}$/.test(message) && /[a-zãéíóúç]/i.test(message)) {
    // Exceções curtas escritas por nós (triggers 0066) — repassar é útil.
    return message.replace(/^.*?:\s*/, '').trim() || 'Não foi possível concluir.';
  }
  return 'Não foi possível concluir. Tente novamente.';
}

/** Lê a linha (via RLS) e autoriza o par pessoa × empresa dela. */
async function loadAuthorizedEvent(
  profile: CurrentProfile,
  id: string,
): Promise<{ id: string; tenant_id: string; is_default: boolean; slug: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('id, tenant_id, is_default, slug')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  if (!(await canAdminTenant(profile, data.tenant_id))) return null;
  return data;
}

function normalize(input: EventInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    starts_at: input.starts_at,
    ends_at: input.ends_at || null,
  };
}

export async function createEvent(
  tenantId: string,
  rawInput: unknown,
): Promise<EventActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };
  if (!tenantId) return { ok: false, error: 'Escolha a empresa do evento.' };
  if (!(await canAdminTenant(profile, tenantId))) {
    return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };
  }

  const parsed = eventInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: 'Confira os campos destacados.',
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const slug = (input.slug || '').trim() || slugifyEventName(input.name);
  if (!isValidEventSlug(slug)) {
    return {
      ok: false,
      error: 'Não foi possível derivar um slug do nome. Informe um slug manualmente.',
      fieldErrors: { slug: ['Slug inválido'] },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .insert({
      tenant_id: tenantId,
      slug,
      created_by: profile.id,
      ...normalize(input),
    })
    .select('id, slug')
    .single();

  if (error || !data) {
    return { ok: false, error: translateDbError(error?.message ?? '', error?.code) };
  }

  revalidatePath('/eventos');
  return { ok: true, id: data.id, slug: data.slug };
}

export async function updateEvent(
  id: string,
  rawInput: unknown,
): Promise<EventActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  const current = await loadAuthorizedEvent(profile, id);
  if (!current) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };

  const parsed = eventInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: 'Confira os campos destacados.',
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  // O padrão não troca de slug: `registro-avulso` é a chave que o sistema usa
  // para reconhecê-lo em toda empresa; renomear o rótulo continua permitido.
  const slug = current.is_default
    ? current.slug
    : (input.slug || '').trim() || slugifyEventName(input.name);
  if (!isValidEventSlug(slug)) {
    return {
      ok: false,
      error: 'Não foi possível derivar um slug do nome. Informe um slug manualmente.',
      fieldErrors: { slug: ['Slug inválido'] },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .update({ slug, ...normalize(input) })
    .eq('id', id)
    .eq('tenant_id', current.tenant_id)
    .select('id, slug');

  if (error) return { ok: false, error: translateDbError(error.message, error.code) };
  if (!data || data.length === 0) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };

  revalidatePath('/eventos');
  return { ok: true, id, slug: data[0].slug };
}

/** Encerrar (o link público para de aceitar) ou reabrir um evento. */
export async function setEventStatus(
  id: string,
  status: EventStatus,
): Promise<EventActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };
  if (status !== 'active' && status !== 'closed') {
    return { ok: false, error: 'Status inválido.' };
  }

  const current = await loadAuthorizedEvent(profile, id);
  if (!current) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };
  if (current.is_default && status === 'closed') {
    return { ok: false, error: 'O evento padrão da empresa não pode ser encerrado.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', current.tenant_id)
    .select('id, slug');

  if (error) return { ok: false, error: translateDbError(error.message, error.code) };
  if (!data || data.length === 0) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };

  revalidatePath('/eventos');
  return { ok: true, id, slug: data[0].slug };
}

/**
 * Exclusão só de evento SEM oportunidades (a FK é `on delete restrict` e o
 * padrão é protegido por trigger). Com oportunidades, o caminho é encerrar.
 */
export async function deleteEvent(id: string): Promise<EventActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  const current = await loadAuthorizedEvent(profile, id);
  if (!current) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };
  if (current.is_default) {
    return { ok: false, error: 'O evento padrão da empresa não pode ser excluído.' };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: 'Este evento tem oportunidades vinculadas e não pode ser excluído. Encerre-o.',
    };
  }

  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', id)
    .eq('tenant_id', current.tenant_id)
    .select('id, slug');

  if (error) return { ok: false, error: translateDbError(error.message, error.code) };
  if (!data || data.length === 0) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };

  revalidatePath('/eventos');
  return { ok: true, id, slug: current.slug };
}

/**
 * Eventos da empresa ESCOLHIDA, para o seletor da tela de registro — só pode
 * ser buscado DEPOIS que o staff escolhe a empresa, daí ser uma action e não
 * um fetch de página. A RLS de `events` recorta (psw_staff só enxerga onde
 * tem concessão ou atribuição — o mesmo conjunto de `staff_writable_tenant_ids`).
 */
export async function listTenantEvents(tenantId: string): Promise<EventOption[]> {
  if (!tenantId) return [];
  const profile = await getCurrentProfile();
  if (!profile) return [];
  return fetchEventOptions(tenantId);
}
