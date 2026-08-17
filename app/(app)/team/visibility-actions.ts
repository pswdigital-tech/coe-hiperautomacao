'use server';

// =============================================================================
// team/visibility-actions.ts — gravar o recorte de visibilidade de uma pessoa
// (migration 0053)
// -----------------------------------------------------------------------------
// Atores autorizados (decisão do PO, 2026-08-12): `platform_admin` da PSW,
// `tenant_admin` da empresa e `psw_staff` com concessão de admin naquela
// empresa. Esse conjunto já é exatamente `isPlatformAdmin() || isTenantAdminOf()`
// — nenhum predicado novo é inventado aqui, porque predicado de autorização
// duplicado é predicado que vai divergir.
//
// Os guards abaixo são falha-cedo (mensagem pt-BR em vez de um 42501 cru); o
// bloqueio REAL é a RLS das duas tabelas (0053), que exige o mesmo predicado.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, isPlatformAdmin, isTenantAdminOf } from '@/lib/security/role';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaveVisibilityResult = { ok: true } | { error: string };

/**
 * Grava o recorte de UMA pessoa: o interruptor (`scope`) e, quando restrito, a
 * lista de oportunidades liberadas.
 *
 * A lista é substituída inteira (delete + insert) em vez de um diff: o volume
 * é de dezenas de linhas, e um diff introduziria um caminho a mais para o
 * estado da tela divergir do banco sem que nada acuse.
 */
export async function saveProfileVisibility(formData: FormData): Promise<SaveVisibilityResult> {
  const actor = await getCurrentProfile();
  if (!actor) return { error: 'Acesso negado.' };

  const profileId = String(formData.get('profile_id') ?? '').trim();
  const scopeRaw = String(formData.get('scope') ?? '').trim();

  if (!UUID_RE.test(profileId)) return { error: 'Pessoa inválida.' };
  if (scopeRaw !== 'all' && scopeRaw !== 'restricted') {
    return { error: 'Tipo de acesso inválido.' };
  }
  const scope = scopeRaw;

  const supabase = await createClient();

  // O tenant-alvo vem SEMPRE da pessoa editada, nunca do seletor de empresa
  // nem do tenant de lotação de quem edita — para `psw_staff` esses dois são a
  // PSW, e usá-los aqui gravaria a autorização contra a empresa errada.
  const { data: target } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', profileId)
    .maybeSingle();

  if (!target) return { error: 'Pessoa não encontrada.' };

  const authorized = isPlatformAdmin(actor) || (await isTenantAdminOf(actor, target.tenant_id));
  if (!authorized) return { error: 'Acesso negado.' };

  if (scope === 'restricted' && (target.role === 'platform_admin' || target.role === 'psw_staff')) {
    return { error: 'O recorte por oportunidade não se aplica a este papel.' };
  }

  const ids = formData
    .getAll('opportunity_ids')
    .map((v) => String(v).trim())
    .filter((v) => UUID_RE.test(v));

  // 1. Interruptor. `upsert` porque a linha pode não existir (todo perfil
  //    anterior à 0053 não tem), e o padrão "sem linha ≡ vê tudo" faz do
  //    primeiro salvamento sempre um insert.
  const { error: scopeError } = await supabase.from('profile_visibility').upsert(
    {
      profile_id: profileId,
      tenant_id: target.tenant_id, // derivado por trigger de qualquer forma
      scope,
      updated_by: actor.id,
    },
    { onConflict: 'profile_id' },
  );

  if (scopeError) {
    // trigger `profile_visibility_tenant_guard` (0053) — papel incompatível.
    if (scopeError.code === '23514') {
      return { error: 'O recorte por oportunidade não se aplica a este papel.' };
    }
    return { error: 'Não foi possível salvar o acesso. Tente novamente.' };
  }

  // 2. Lista. Apagada em ambos os casos: voltar para "vê tudo" tem que deixar
  //    o banco limpo, senão a lista velha ressuscitaria numa restrição futura.
  const { error: delError } = await supabase
    .from('profile_opportunity_access')
    .delete()
    .eq('profile_id', profileId);

  if (delError) return { error: 'Não foi possível salvar o acesso. Tente novamente.' };

  if (scope === 'restricted' && ids.length > 0) {
    const { error: insError } = await supabase.from('profile_opportunity_access').insert(
      ids.map((opportunityId) => ({
        profile_id: profileId,
        opportunity_id: opportunityId,
        tenant_id: target.tenant_id, // derivado por trigger
        created_by: actor.id,
      })),
    );

    if (insError) {
      // trigger `profile_opportunity_access_tenant_guard` (0053) — oportunidade
      // de outra empresa. Só chega aqui com formulário adulterado.
      if (insError.code === '23514') {
        return { error: 'Alguma oportunidade selecionada não é desta empresa.' };
      }
      return { error: 'Não foi possível salvar a lista de oportunidades.' };
    }
  }

  revalidatePath('/team');
  revalidatePath(`/team/visibilidade/${profileId}`);
  return { ok: true };
}

/**
 * Irmã da de cima para um convite AINDA NÃO USADO (0054) — o recorte fica
 * esperando e é copiado por `handle_new_user()` no instante em que a pessoa
 * cria a conta.
 *
 * Convite já usado é recusado: a partir do primeiro login a fonte da verdade é
 * `profile_visibility`, e gravar aqui daria ao admin a impressão de ter mudado
 * algo que não muda nada. O caminho certo nesse caso é a tela do perfil.
 */
export async function saveInviteVisibility(formData: FormData): Promise<SaveVisibilityResult> {
  const actor = await getCurrentProfile();
  if (!actor) return { error: 'Acesso negado.' };

  const inviteId = String(formData.get('invite_id') ?? '').trim();
  const scopeRaw = String(formData.get('scope') ?? '').trim();

  if (!UUID_RE.test(inviteId)) return { error: 'Convite inválido.' };
  if (scopeRaw !== 'all' && scopeRaw !== 'restricted') {
    return { error: 'Tipo de acesso inválido.' };
  }
  const scope = scopeRaw;

  const supabase = await createClient();

  const { data: invite } = await supabase
    .from('invited_emails')
    .select('tenant_id, role, used_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (!invite) return { error: 'Convite não encontrado.' };
  if (invite.used_at) {
    return { error: 'Esta pessoa já criou a conta — ajuste o acesso pelo perfil dela.' };
  }

  const authorized = isPlatformAdmin(actor) || (await isTenantAdminOf(actor, invite.tenant_id));
  if (!authorized) return { error: 'Acesso negado.' };

  if (scope === 'restricted' && !['member', 'viewer', 'tenant_admin'].includes(invite.role)) {
    return { error: 'O recorte por oportunidade não se aplica a este papel.' };
  }

  const ids = formData
    .getAll('opportunity_ids')
    .map((v) => String(v).trim())
    .filter((v) => UUID_RE.test(v));

  // Uma linha só, com o array — sem a dança de delete + insert da versão de
  // perfil, porque aqui não existe tabela de lista separada (ver 0054).
  const { error } = await supabase.from('invite_visibility').upsert(
    {
      invited_email_id: inviteId,
      tenant_id: invite.tenant_id, // derivado por trigger de qualquer forma
      scope,
      opportunity_ids: scope === 'restricted' ? ids : [],
      updated_by: actor.id,
    },
    { onConflict: 'invited_email_id' },
  );

  if (error) {
    // trigger `invite_visibility_guard` (0054) — papel incompatível ou
    // oportunidade de outra empresa.
    if (error.code === '23514') {
      return { error: 'Seleção inválida para este convite.' };
    }
    return { error: 'Não foi possível salvar o acesso. Tente novamente.' };
  }

  revalidatePath('/team');
  revalidatePath('/admin/invites');
  revalidatePath(`/team/visibilidade/convite/${inviteId}`);
  return { ok: true };
}
