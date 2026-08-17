'use server';

// =============================================================================
// phase-actions.ts — server action da ESTIMATIVA de fase (0048)
// -----------------------------------------------------------------------------
// Modela lib/opportunities/note-actions.ts: gate de papel → validação zod →
// escopo de escrita RESOLVIDO NO SERVIDOR (`resolveWriteTenantId()`, Phase 17
// D-11) → mutação.
//
// SÓ escreve `planned_start_at` / `planned_end_at`. O par realizado
// (`started_at`/`finished_at`) permanece território exclusivo da trigger
// `sync_opportunity_phase()` — por isso o upsert abaixo NÃO lista essas
// colunas: no caminho de conflito o `on conflict do update` só toca o que foi
// enviado, então o histórico realizado sobrevive intacto a uma edição de
// estimativa.
//
// O upsert (em vez de update puro) é obrigatório: a linha de uma fase só passa
// a existir quando o status chega nela, e estimar serve justamente para fases
// AINDA NÃO alcançadas.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { phasePlanInputSchema } from './phase-schema';
import { describeValidationError } from './validation-errors';

export type PhasePlanResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function savePhasePlan(
  opportunityId: string,
  input: unknown
): Promise<PhasePlanResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = phasePlanInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Para psw_staff o tenant correto é o da OPORTUNIDADE-ALVO, não o do profile
  // (que é sempre o da PSW). `null` = fora do escopo — recusa antes da mutação.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const supabase = await createClient();

  const { error } = await supabase.from('opportunity_phases').upsert(
    {
      opportunity_id: opportunityId, // server-derived
      tenant_id: tenantId, // server-derived
      phase_key: parsed.data.phase_key,
      planned_start_at: parsed.data.planned_start_at,
      planned_end_at: parsed.data.planned_end_at,
    },
    { onConflict: 'opportunity_id,phase_key' }
  );

  if (error) {
    return { ok: false, error: `Erro ao salvar estimativa: ${error.message}` };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}
