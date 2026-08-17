'use server';

// =============================================================================
// team/actions.ts — convites gerenciados pelo ADMIN DA EMPRESA (v0.4 → v0.5)
// -----------------------------------------------------------------------------
// Irmã de app/(app)/admin/invites/actions.ts, com uma diferença essencial de
// escopo: lá o platform_admin escolhe a empresa (e pode até criar uma nova);
// aqui o `tenant_id` NUNCA vem do formulário — nem, a partir da Phase 18, do
// tenant de LOTAÇÃO de quem está logado. Um `psw_staff` pode administrar N
// empresas ao mesmo tempo (concessão em `psw_tenant_admins`, migration 0045),
// e o tenant do PROFILE dele é sempre o da PSW — nunca o da empresa que ele
// administra. Por isso o tenant-alvo agora vem do SELETOR DE EMPRESA da
// Sidebar (`resolveAdminTenantIdFromSelector`), resolvido e validado contra a
// concessão no servidor, antes de qualquer outra coisa.
//
// O SINTOMA QUE ISSO ELIMINA (D-K, o caso canônico da fase): antes da Phase
// 18, o filtro de tenant da revogação usava o tenant de LOTAÇÃO da pessoa
// logada, que casava ZERO LINHAS para um staff-admin (o tenant de lotação
// dele é o da PSW, nunca o da empresa administrada) — o Supabase devolvia
// `error: null`, a action retornava void, `revalidatePath` rodava, e a tela
// recarregava com o convite AINDA LÁ. Um sucesso silencioso mentiroso, sem
// nenhum erro em lugar nenhum.
//
// Camadas de defesa atualizadas (mesmo padrão do resto do projeto):
//   1. Tenant-alvo resolvido no SERVIDOR via `resolveAdminTenantIdFromSelector`
//      (seletor de empresa: `?empresa=` na URL, com queda para o cookie
//      `coe_empresa`) e VALIDADO contra a concessão — nunca um campo de form.
//   2. Guard `isTenantAdminOf(profile, tenantAlvo)` — testa o PAR pessoa ×
//      empresa, não a pessoa isolada. Byte-equivalente ao `isTenantAdmin()`
//      de ontem para todo `tenant_admin` de cliente (D-J, zero regressão).
//   3. Allowlist explícita de `role` — 'platform_admin' inconvidável.
//   4. RLS (0029, reemitida pela fonte única `is_tenant_admin_of()` na 0047) é
//      o bloqueio real: WITH CHECK exige `is_tenant_admin_of(tenant_id)` e
//      `role not in ('platform_admin', 'psw_staff')`. O `.eq('tenant_id', …)`
//      da revogação CONTINUA existindo como defesa em profundidade sobre a
//      RLS — o que mudou é a FONTE do valor, não a remoção do filtro.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isTenantAdminOf,
  resolveAdminTenantIdFromSelector,
  ADMIN_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { parseRoleAndCargo } from '@/lib/security/cargo';

export type InviteResult = { error: string } | { ok: true };

export async function inviteTeamMember(formData: FormData): Promise<InviteResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: 'Sessão expirada.' };

  // Tenant-alvo resolvido no servidor ANTES de qualquer outra coisa — é este
  // early return que elimina o sucesso silencioso (D-K).
  const tenantAlvo = await resolveAdminTenantIdFromSelector(profile);
  if (!tenantAlvo) return { error: ADMIN_SCOPE_DENIED_MESSAGE };

  if (!(await isTenantAdminOf(profile, tenantAlvo))) return { error: 'Acesso negado.' };

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  // Dropdown único: o mesmo campo carrega nível de acesso OU cargo. `cargo` é
  // rótulo organizacional; quem manda na permissão continua sendo só `role`, e
  // todo cargo resolve para 'member' — 'platform_admin' segue inconvidável.
  const { role, cargo } = parseRoleAndCargo(formData.get('role'));

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'E-mail inválido.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('invited_emails').insert({
    email,
    tenant_id: tenantAlvo, // server-derived + validado — NUNCA do formulário
    role,
    cargo,
    invited_by: profile.id,
  });

  if (error) {
    // O índice parcial `invited_emails_pending_email_uniq` (0022) é global, não
    // por tenant: um e-mail com convite pendente em OUTRA empresa também colide
    // aqui. A mensagem é deliberadamente vaga — confirmar "essa pessoa foi
    // convidada pela empresa X" vazaria informação de outro tenant.
    if (error.code === '23505') {
      return { error: 'Já existe um convite pendente para esse e-mail.' };
    }
    return { error: `Erro ao criar convite: ${error.message}` };
  }

  revalidatePath('/team');
  return { ok: true };
}

/**
 * Revoga um convite pendente da empresa ADMINISTRADA (não necessariamente a
 * de lotação — D-K). Retorna void: usado direto como `action` de <form> num
 * Server Component, então não há canal de erro. Se o tenant-alvo não puder
 * ser resolvido (sem empresa selecionada, ou sem concessão nela), a action
 * simplesmente NÃO MUTA — a interface precisa impedir o disparo nesse caso
 * (desabilitar a ação quando não há empresa selecionada), o que é o assunto
 * do próximo plano da fase (18-07). A RLS (0029/0047) recusa qualquer id de
 * outro tenant ou já usado — o delete simplesmente não afeta linhas.
 */
export async function revokeTeamInvite(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const tenantAlvo = await resolveAdminTenantIdFromSelector(profile);
  if (!tenantAlvo) return;

  if (!(await isTenantAdminOf(profile, tenantAlvo))) return;

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from('invited_emails')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantAlvo); // defesa em profundidade sobre a RLS

  revalidatePath('/team');
}
