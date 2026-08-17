'use server';

// =============================================================================
// configuracoes/actions.ts — cor principal + logo da empresa (v0.4 → v0.5)
// -----------------------------------------------------------------------------
// Mesmo padrão de defesa de team/actions.ts (Phase 18, Plan 06):
//   1. Guard `requireBrandingAdmin()` resolve o tenant-ALVO e valida a
//      concessão ANTES de qualquer coisa (falha cedo, mensagem pt-BR única).
//   2. `tenant_id` SEMPRE o tenant-alvo resolvido — nunca o tenant de LOTAÇÃO
//      da pessoa logada. Um `psw_staff` administrando N empresas tem o
//      tenant de lotação sempre igual ao da PSW; usar essa lotação aqui
//      gravaria (ou leria) o branding da PSW em vez do da empresa
//      administrada.
//   3. RLS (0033, `tenants_update_own_admin` reemitida pela fonte única
//      `is_tenant_admin_of()` na 0047) é o bloqueio real: trigger
//      `tenants_branding_only_guard` (gate de coluna) + policies do bucket
//      'tenant-branding' escopadas pela pasta = tenant_id.
//
// O SINTOMA QUE ISSO ELIMINA (D-K — três das quatro escritas eram sucesso
// silencioso): o filtro pelo tenant de lotação da pessoa logada casava ZERO
// LINHAS para um staff-admin (essa lotação é sempre a da PSW, nunca a da
// empresa administrada) — o Supabase devolvia `error: null`, a action respondia
// `{ ok: true }`, a tela mostrava "salvo" e NADA mudava no banco. Na logo, o
// arquivo novo ficava ÓRFÃO no bucket (upload deu certo, o registro que
// deveria apontar pra ele nunca foi atualizado).
//
// ORDEM IMPORTA na ação de upload: a validação de escopo (`requireBrandingAdmin`)
// acontece ANTES de qualquer envio ao bucket. Se validasse depois, um
// staff-admin fora do escopo deixaria um arquivo órfão pago e não referenciado
// — a mesma classe de falha que hoje acontece por outro caminho, quando o
// UPDATE do registro casa zero linhas depois de o upload já ter dado certo.
//
// Na remoção da logo, leitura do caminho anterior, exclusão do objeto e
// atualização do registro usam o MESMO tenant-alvo — as três operações
// compartilhavam a mesma origem errada antes desta fase; trocar só uma delas
// apagaria o arquivo de uma empresa enquanto limpa o registro de outra.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  resolveAdminTenantIdFromSelector,
  ADMIN_SCOPE_DENIED_MESSAGE,
  type CurrentProfile,
} from '@/lib/security/role';
import { normalizeHexColor } from '@/lib/branding/theme';
import { BRANDING_BUCKET } from '@/lib/branding/queries';

export type BrandingResult = { error: string } | { ok: true };

const MAX_LOGO_BYTES = 512 * 1024; // 512 KB — é uma logo, não um banner
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

type BrandingAdmin = { profile: CurrentProfile; tenantAlvo: string };

/**
 * Admin da empresa ADMINISTRADA (tenant-alvo resolvido pelo seletor da
 * Sidebar, D-K) OU super-admin da PSW (que também tem um tenant próprio —
 * `resolveAdminTenantIdFromSelector` devolve o tenant de lotação dele direto,
 * sem consulta, comportamento idêntico ao de antes desta fase).
 * Devolve `null` quando não há tenant-alvo (sem empresa selecionada) ou
 * quando a pessoa não administra o tenant pedido — o chamador trata `null`
 * como `ADMIN_SCOPE_DENIED_MESSAGE`, ANTES de qualquer mutação ou upload.
 */
async function requireBrandingAdmin(): Promise<BrandingAdmin | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const tenantAlvo = await resolveAdminTenantIdFromSelector(profile);
  if (!tenantAlvo) return null;

  if (!isPlatformAdmin(profile) && !(await isTenantAdminOf(profile, tenantAlvo))) {
    return null;
  }

  return { profile, tenantAlvo };
}

export async function updateBrandColor(formData: FormData): Promise<BrandingResult> {
  const guard = await requireBrandingAdmin();
  if (!guard) return { error: ADMIN_SCOPE_DENIED_MESSAGE };
  const { tenantAlvo } = guard;

  const raw = String(formData.get('brand_color') ?? '').trim();
  // Campo vazio = voltar ao padrão PSW (null no banco).
  const color = raw === '' ? null : normalizeHexColor(raw);
  if (raw !== '' && !color) {
    return { error: 'Cor inválida — use o formato #RRGGBB.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('tenants')
    .update({ brand_color: color })
    .eq('id', tenantAlvo); // tenant-alvo resolvido e validado (D-K)

  if (error) return { error: `Erro ao salvar a cor: ${error.message}` };

  revalidatePath('/', 'layout'); // o <style> do tema vive no layout do app
  return { ok: true };
}

export async function updateTenantLogo(formData: FormData): Promise<BrandingResult> {
  // Validação de escopo ANTES do envio ao bucket — ver cabeçalho do arquivo.
  const guard = await requireBrandingAdmin();
  if (!guard) return { error: ADMIN_SCOPE_DENIED_MESSAGE };
  const { tenantAlvo } = guard;

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo de imagem.' };
  }
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: 'Formato não suportado — use PNG, JPG, WEBP ou SVG.' };
  if (file.size > MAX_LOGO_BYTES) return { error: 'Arquivo muito grande (máx. 512 KB).' };

  const supabase = await createClient();

  // Path escopado pelo tenant-alvo — a policy do bucket (0033/0047) exige que
  // o 1º segmento seja o tenant. Timestamp no nome porque o bucket é público e
  // com cache de CDN: sobrescrever o mesmo path serviria a logo antiga.
  const path = `${tenantAlvo}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: `Erro ao enviar a logo: ${uploadError.message}` };

  // Guarda o path anterior pra apagar depois de a troca dar certo — mesmo
  // tenant-alvo do upload e do update abaixo.
  const { data: before } = await supabase
    .from('tenants')
    .select('logo_path')
    .eq('id', tenantAlvo)
    .maybeSingle();

  const { error } = await supabase
    .from('tenants')
    .update({ logo_path: path })
    .eq('id', tenantAlvo);

  if (error) {
    await supabase.storage.from(BRANDING_BUCKET).remove([path]); // não deixa órfão
    return { error: `Erro ao salvar a logo: ${error.message}` };
  }

  if (before?.logo_path && before.logo_path !== path) {
    await supabase.storage.from(BRANDING_BUCKET).remove([before.logo_path]);
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function removeTenantLogo(): Promise<BrandingResult> {
  const guard = await requireBrandingAdmin();
  if (!guard) return { error: ADMIN_SCOPE_DENIED_MESSAGE };
  const { tenantAlvo } = guard;

  const supabase = await createClient();
  // Leitura, exclusão do objeto e atualização do registro usam o MESMO
  // tenant-alvo — ver cabeçalho do arquivo.
  const { data: before } = await supabase
    .from('tenants')
    .select('logo_path')
    .eq('id', tenantAlvo)
    .maybeSingle();

  const { error } = await supabase
    .from('tenants')
    .update({ logo_path: null })
    .eq('id', tenantAlvo);
  if (error) return { error: `Erro ao remover a logo: ${error.message}` };

  if (before?.logo_path) {
    await supabase.storage.from(BRANDING_BUCKET).remove([before.logo_path]);
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
