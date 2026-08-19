'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, isPlatformAdmin } from '@/lib/security/role';
import { parseCargo } from '@/lib/security/cargo';
import { getSiteUrl } from '@/lib/site-url';
import { sendEmail } from '@/lib/email/send';
import {
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
} from '@/lib/email/templates/invite';

/** `emailSent: false` → convite gravado, mas o e-mail não saiu (UI avisa + oferece reenvio). */
export type InviteResult = { error: string } | { ok: true; emailSent: boolean };

/**
 * Dispara o e-mail de convite. Nunca lança — o convite na allowlist é a fonte
 * da verdade; o e-mail é conveniência. Decisão de produto (2026-07-31): falha
 * de envio NÃO desfaz o convite, só avisa o admin.
 */
async function sendInviteEmail(params: {
  email: string;
  tenantId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<boolean> {
  const { data: tenant } = await params.supabase
    .from('tenants')
    .select('name')
    .eq('id', params.tenantId)
    .single();

  const siteUrl = await getSiteUrl();
  // `?email=` só pré-preenche o campo — a autorização real é o trigger
  // handle_new_user (0022) validando a allowlist server-side.
  const signupUrl = `${siteUrl}/signup?email=${encodeURIComponent(params.email)}`;

  const tpl = {
    email: params.email,
    companyName: tenant?.name ?? 'sua empresa',
    role: params.role,
    signupUrl,
  };

  const result = await sendEmail({
    to: params.email,
    subject: inviteEmailSubject(tpl.companyName),
    html: inviteEmailHtml(tpl),
    text: inviteEmailText(tpl),
  });

  return result.ok;
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Cria um convite (allowlist). Opcionalmente cria uma nova empresa (tenant)
 * antes. Toda escrita passa pelo RLS — só platform_admin chega aqui (guard
 * server-side + WITH CHECK is_platform_admin()).
 */
export async function createInvite(formData: FormData): Promise<InviteResult> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  // Allowlist explícita — nunca confiar no <select> do client. 'platform_admin'
  // é intencionalmente inconvidável (CHECK no DB reforça; ver 0028). 'psw_staff'
  // (Phase 17, D-17) só existe NESTA allowlist — esta é a tela do
  // `platform_admin`; a allowlist de convite do `tenant_admin`
  // (`app/(app)/team/actions.ts` / `lib/security/cargo.ts`) NÃO recebe este
  // valor (D-05). A policy do banco (`invited_emails_insert_tenant_admin`,
  // 0041) é a barreira final caso esta UI algum dia falhe.
  const roleRaw = String(formData.get('role') ?? 'member');
  const role: 'member' | 'tenant_admin' | 'viewer' | 'psw_staff' =
    roleRaw === 'tenant_admin' || roleRaw === 'viewer' || roleRaw === 'psw_staff'
      ? roleRaw
      : 'member';
  // `cargo` é rótulo organizacional — não influencia permissão nenhuma.
  const cargo = parseCargo(formData.get('cargo'));
  const tenantMode = String(formData.get('tenant_mode') ?? 'existing');
  const existingTenantId = String(formData.get('tenant_id') ?? '').trim();
  const newCompanyName = String(formData.get('new_company') ?? '').trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'E-mail inválido.' };
  }

  const supabase = await createClient();
  let tenantId = existingTenantId;

  if (role === 'psw_staff') {
    // D-02/D-08: staff PSW é sempre lotado no tenant da PSW, nunca no tenant
    // do cliente escolhido no formulário — a empresa do formulário (e o
    // caminho de "criar empresa nova" logo abaixo) são ignorados neste papel.
    // PREMISSA (mesma de `fetchAssignableProfilesForPlatformAdmin`, em
    // `lib/opportunities/assignees.ts`): o tenant da PSW é o tenant do
    // `platform_admin` logado, por construção — deixaria de valer se existisse
    // um `platform_admin` lotado num tenant de cliente, caso em que o caminho
    // correto é uma marcação explícita do tenant da PSW, não um palpite.
    tenantId = profile!.tenantId;
  } else if (tenantMode === 'new') {
    if (!newCompanyName) return { error: 'Informe o nome da empresa.' };
    const base = slugify(newCompanyName) || 'empresa';

    // tenta inserir; em colisão de slug, sufixa e tenta de novo (poucas vezes)
    let inserted: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await supabase
        .from('tenants')
        .insert({ name: newCompanyName, slug })
        .select('id')
        .single();
      if (!error && data) {
        inserted = data;
        break;
      }
      if (error && error.code !== '23505') {
        return { error: `Erro ao criar empresa: ${error.message}` };
      }
    }
    if (!inserted) return { error: 'Não foi possível gerar um slug único para a empresa.' };
    tenantId = inserted.id;
  } else if (!tenantId) {
    return { error: 'Selecione uma empresa.' };
  }

  // Criar o convite ----------------------------------------------------------
  const { error } = await supabase.from('invited_emails').insert({
    email,
    tenant_id: tenantId,
    role,
    cargo,
    invited_by: profile!.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'Já existe um convite pendente para esse e-mail.' };
    }
    return { error: `Erro ao criar convite: ${error.message}` };
  }

  const emailSent = await sendInviteEmail({ email, tenantId, role, supabase });

  revalidatePath('/admin/invites');
  return { ok: true, emailSent };
}

/**
 * Reenvia o e-mail de um convite ainda pendente. Só platform_admin (guard +
 * RLS na leitura). Não recria nem altera o convite.
 */
export async function resendInvite(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { error: 'Convite inválido.' };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from('invited_emails')
    .select('email, tenant_id, role, used_at')
    .eq('id', id)
    .single();

  if (!invite) return { error: 'Convite não encontrado.' };
  if (invite.used_at) return { error: 'Esse convite já foi utilizado.' };

  const sent = await sendInviteEmail({
    email: invite.email,
    tenantId: invite.tenant_id,
    role: invite.role,
    supabase,
  });

  if (!sent) {
    return { error: 'Não foi possível enviar o e-mail. Verifique a configuração do provedor.' };
  }
  return { ok: true };
}

/**
 * Revoga (apaga) um convite pendente. Só platform_admin (guard + RLS).
 * Retorna void: usado direto como `action` de <form> num Server Component.
 */
export async function revokeInvite(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return;

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('invited_emails').delete().eq('id', id);

  revalidatePath('/admin/invites');
}

/**
 * Troca o papel de uma pessoa entre os três papéis de CLIENTE (Membro, Leitor,
 * Admin da empresa) — pedido do PO (2026-08-19), lista "Pessoas com conta".
 *
 * A escrita NÃO é um update direto: `profiles` só tem `profiles_update_self`
 * (0001) como policy de UPDATE, e a 0053 documentou por que ela nunca foi
 * alargada. Quem grava é a RPC `set_profile_role` (0064), security definer,
 * que carrega TODAS as invariantes (só platform_admin; só member/viewer/
 * tenant_admin, tanto no papel novo quanto no atual; nunca a própria linha).
 * O guard abaixo é defesa em profundidade — falha cedo e com a mesma mensagem
 * dos outros erros de auth desta tela, sem round-trip ao banco.
 */
export async function setProfileRole(
  formData: FormData
): Promise<{ ok: true; role: string } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  const profileId = String(formData.get('profile_id') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  if (!profileId) return { error: 'Pessoa inválida.' };
  if (role !== 'member' && role !== 'viewer' && role !== 'tenant_admin') {
    return { error: 'Papel inválido.' };
  }
  if (profileId === profile!.id) {
    return { error: 'Você não pode alterar o seu próprio papel.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_profile_role', {
    p_profile_id: profileId,
    p_role: role,
  });

  // As exceções da 0064 já vêm em pt-BR e são exibíveis como estão.
  if (error) return { error: error.message };

  revalidatePath('/admin/invites');
  return { ok: true, role: String(data ?? role) };
}

/**
 * Troca o papel de um convite AINDA PENDENTE. Diferente de `setProfileRole`,
 * aqui não é preciso RPC: `invited_emails` já tem `invited_emails_update_admin`
 * (0022) — `for update using (is_platform_admin())` — então o próprio RLS é a
 * barreira. As três checagens abaixo são regra de PRODUTO, não de permissão, e
 * por isso vivem aqui (relidas do banco, nunca confiando no que a UI mandou):
 *
 *   • convite JÁ USADO não muda: depois do primeiro login quem manda é
 *     `profiles.role` — o convite virou histórico. Editá-lo pareceria surtir
 *     efeito e não surtiria nenhum; o caminho certo é a linha da pessoa em
 *     "Pessoas com conta". Mesmo racional do recorte de visibilidade (0054).
 *   • convite `psw_staff` não muda: o tenant dele foi derivado como o da PSW
 *     (D-02/D-08). Virar 'member' faria a pessoa nascer como membro DA PSW, e
 *     não de uma empresa cliente — provisionamento errado, em silêncio.
 *   • papel novo restrito aos três de cliente, espelhando `set_profile_role`
 *     (0064): 'psw_staff' é lotação e 'platform_admin' o topo da cadeia.
 */
export async function setInviteRole(
  formData: FormData
): Promise<{ ok: true; role: string } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  const id = String(formData.get('invite_id') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  if (!id) return { error: 'Convite inválido.' };
  if (role !== 'member' && role !== 'viewer' && role !== 'tenant_admin') {
    return { error: 'Papel inválido.' };
  }

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from('invited_emails')
    .select('role, used_at')
    .eq('id', id)
    .single();

  if (!invite) return { error: 'Convite não encontrado.' };
  if (invite.used_at) {
    return { error: 'Convite já usado — troque o papel na lista de pessoas.' };
  }
  if (invite.role === 'psw_staff') {
    return { error: 'Convite de Staff PSW não muda de papel.' };
  }

  const { error } = await supabase
    .from('invited_emails')
    .update({ role })
    .eq('id', id)
    .is('used_at', null);

  if (error) return { error: `Erro ao trocar o papel: ${error.message}` };

  revalidatePath('/admin/invites');
  return { ok: true, role };
}
