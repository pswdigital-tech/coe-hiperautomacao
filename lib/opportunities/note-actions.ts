'use server';

// =============================================================================
// note-actions.ts — server actions de `opportunity_notes` (v0.3/0018)
// -----------------------------------------------------------------------------
// Modela lib/opportunities/risk-actions.ts. Anotações são append+delete —
// SEM update (editar apaga e recria, preserva autor/data honestos — mesma
// decisão da migration 0018).
//
// `tenant_id` (insert e filtro de delete) vem do escopo de escrita RESOLVIDO
// NO SERVIDOR (Phase 17, D-11, `resolveWriteTenantId()`) — para papéis de
// cliente é o tenant do profile; para `psw_staff` (multi-tenant por
// atribuição) é o tenant da OPORTUNIDADE-ALVO, nunca o do profile. Escopo
// `null` recusa ANTES da mutação, em vez de um `.eq()` casando zero linhas
// silenciosamente ou de um insert carimbado com o tenant errado.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { noteInputSchema } from './note-schema';
import { describeValidationError } from './validation-errors';

export type NoteActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type MutationResult = { ok: true } | { ok: false; error: string };

export async function createNote(
  opportunityId: string,
  input: unknown
): Promise<NoteActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. Sem isso, um psw_staff anotando numa oportunidade atribuída de
  // outro tenant carimbaria `tenant_id` da PSW na linha (a guarda de
  // coerência de 0043 rejeitaria com erro cru do banco em vez desta mensagem
  // pt-BR clara).
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { data: inserted, error } = await supabase
    .from('opportunity_notes')
    .insert({
      opportunity_id: opportunityId, // server-derived
      tenant_id: tenantId, // server-derived — da oportunidade quando psw_staff
      texto: parsed.data.texto,
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: `Erro ao adicionar anotação: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}

export async function deleteNote(
  noteId: string,
  opportunityId: string
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = anotação/oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { error } = await supabase
    .from('opportunity_notes')
    .delete()
    .eq('id', noteId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: `Erro ao excluir anotação: ${error.message}` };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}
