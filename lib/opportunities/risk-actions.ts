'use server';

// =============================================================================
// risk-actions.ts — server actions de `opportunity_risks` (Phase 12, RISK-01/03)
// -----------------------------------------------------------------------------
// Modela lib/opportunities/actions.ts (createOpportunity/updateOpportunity/
// deleteOpportunity). Camadas de defesa mass-assignment (T-12-01/02):
//   1. `riskInputSchema.strict()` rejeita priority/id/tenant_id/opportunity_id
//      no input (parse falha com `unrecognized_keys`).
//   2. insert/update enumeram colunas explicitamente — sem spread cego de
//      `data`/`input`. `tenant_id` vem do escopo de escrita RESOLVIDO NO
//      SERVIDOR (Phase 17, D-11, `resolveWriteTenantId()`) — para papéis de
//      cliente é o tenant do profile; para `psw_staff` (multi-tenant por
//      atribuição) é o tenant da OPORTUNIDADE-ALVO, nunca o do profile.
//      `opportunity_id` vem do arg da rota (não do payload).
//   3. `priority` NUNCA é enviado — o trigger `set_risk_priority()` (matriz
//      impacto×probabilidade, _giba:1180-1185) é a única autoridade. É
//      `before insert OR update` (0011:294) → editar impacto/probabilidade
//      recalcula `priority` automaticamente no UPDATE (RISK-02 / D-04).
//   4. update/delete escopam por `.eq('tenant_id', tenantId)`, onde
//      `tenantId` é o escopo resolvido acima — defesa em profundidade sobre
//      o RLS (USING + WITH CHECK). Se a oportunidade não estiver no escopo do
//      ator, o escopo resolve `null` e a action recusa ANTES da mutação, em
//      vez de um `.eq()` casando zero linhas silenciosamente.
//   5. `requireEditorRole()` barra role='viewer' antes de qualquer escrita
//      (mesmo padrão de actions.ts). A RLS (0015) já bloqueia, mas falhar aqui
//      devolve mensagem pt-BR em vez do 42501 cru do Postgres.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { riskInputSchema } from './risk-schema';
import { describeValidationError } from './validation-errors';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';

export type RiskActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type MutationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// =============================================================================
// createRisk — insere novo risco após validação Zod (priority via trigger)
// =============================================================================
export async function createRisk(
  opportunityId: string,
  input: unknown
): Promise<RiskActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = riskInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. Sem isso, um psw_staff criando risco numa oportunidade atribuída
  // de outro tenant carimbaria `tenant_id` da PSW na linha (a guarda de
  // coerência de 0043 rejeitaria com erro cru do banco em vez desta mensagem
  // pt-BR clara).
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { data: inserted, error } = await supabase
    .from('opportunity_risks')
    .insert({
      opportunity_id: opportunityId, // server-derived (do arg da rota, não do payload)
      tenant_id: tenantId, // server-derived — da oportunidade quando psw_staff
      descricao: data.descricao,
      tipo: data.tipo,
      responsavel: data.responsavel || null,
      impacto: data.impacto,
      probabilidade: data.probabilidade,
      status: data.status,
      resposta: data.resposta || null,
      descricao_impacto: data.descricao_impacto || null,
      created_by: profile.id,
      // priority NÃO enviado — trigger set_risk_priority() calcula (RISK-02 / D-04)
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error: `Erro ao criar risco: ${error?.message ?? 'desconhecido'}`,
    };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}

// =============================================================================
// updateRisk — atualiza campos do risco (priority recalculada pelo trigger)
// -----------------------------------------------------------------------------
// `opportunityId` é recebido apenas para o revalidatePath da rota do modal.
// =============================================================================
export async function updateRisk(
  riskId: string,
  opportunityId: string,
  input: unknown
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = riskInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = risco/oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { error } = await supabase
    .from('opportunity_risks')
    .update({
      descricao: data.descricao,
      tipo: data.tipo,
      responsavel: data.responsavel || null,
      impacto: data.impacto,
      probabilidade: data.probabilidade,
      status: data.status,
      resposta: data.resposta || null,
      descricao_impacto: data.descricao_impacto || null,
      // priority/tenant_id/opportunity_id NÃO enviados — trigger recalcula
      // priority no UPDATE (0011:294); tenant/opportunity são imutáveis.
    })
    .eq('id', riskId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: `Erro ao atualizar risco: ${error.message}` };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}

// =============================================================================
// deleteRisk — remove um risco (RLS + .eq('tenant_id') defesa em profundidade)
// =============================================================================
export async function deleteRisk(
  riskId: string,
  opportunityId: string
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` = risco/oportunidade fora do escopo do usuário.
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const { error } = await supabase
    .from('opportunity_risks')
    .delete()
    .eq('id', riskId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: `Erro ao excluir risco: ${error.message}` };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}
