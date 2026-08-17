'use server';

// =============================================================================
// document-actions.ts — server actions de `opportunity_documents` (v0.3/0018)
// -----------------------------------------------------------------------------
// Modela lib/opportunities/risk-actions.ts. Duas formas de anexo:
//   - addDocumentLink: link externo (Zod .strict())
//   - uploadDocumentFile: arquivo real no Supabase Storage (bucket privado
//     'opportunity-documents', path "{tenant_id}/{opportunity_id}/{arquivo}" —
//     a policy de storage (0018) escopa pelo 1º segmento do path = tenant_id)
//   - deleteDocument: remove a row E o objeto no Storage (se for arquivo)
//
// Mass Assignment defense (mesmas 4 camadas de risk-actions.ts):
//   1. documentLinkInputSchema.strict() rejeita kind/storage_path/tenant_id/etc.
//   2. insert enumera colunas explicitamente — sem spread cego.
//   3. tenant_id/opportunity_id são server-derived, via o escopo de escrita
//      RESOLVIDO NO SERVIDOR (Phase 17, D-11, `resolveWriteTenantId()`) —
//      nunca do payload. Para papéis de cliente é o tenant do profile; para
//      `psw_staff` (multi-tenant por atribuição) é o tenant da
//      OPORTUNIDADE-ALVO, nunca o do profile. Isto também alimenta o path do
//      Storage (`{tenant_id}/{opportunity_id}/{arquivo}`) — usar o tenant
//      errado ali apagaria/gravaria no caminho errado (T-17-33).
//   4. insert/delete escopam por `.eq('tenant_id', ctx.tenantId)` — defesa em
//      profundidade sobre a RLS (0018). Escopo `null` recusa ANTES de
//      qualquer mutação (inclusive antes do upload no Storage), em vez de um
//      `.eq()` casando zero linhas silenciosamente ou de um insert/upload
//      carimbado com o tenant errado.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import {
  documentLinkInputSchema,
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_ALLOWED_MIME,
} from './document-schema';
import { describeValidationError } from './validation-errors';

export type DocumentActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Resolve profile + client + escopo de escrita para a oportunidade-alvo, num
 * único ponto usado pelas três mutações deste arquivo (Phase 17, D-11). O
 * `tenantId` devolvido é o escopo RESOLVIDO NO SERVIDOR — não `profile.tenant_id`
 * cru — e é o mesmo valor usado tanto nos filtros de tabela quanto no path do
 * Storage, para as duas coisas nunca divergirem (T-17-33).
 */
async function resolveProfile(opportunityId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false as const, error: 'Sessão expirada.' };

  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false as const, error: WRITE_SCOPE_DENIED_MESSAGE };

  const supabase = await createClient();
  return { ok: true as const, supabase, user: { id: profile.id }, tenantId };
}

// =============================================================================
// addDocumentLink — anexa um link externo
// =============================================================================
export async function addDocumentLink(
  opportunityId: string,
  input: unknown
): Promise<DocumentActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = documentLinkInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const ctx = await resolveProfile(opportunityId);
  if (!ctx.ok) return ctx;

  const nome = parsed.data.nome?.trim() || parsed.data.url;

  const { data: inserted, error } = await ctx.supabase
    .from('opportunity_documents')
    .insert({
      opportunity_id: opportunityId, // server-derived (arg da rota, não do payload)
      tenant_id: ctx.tenantId, // server-derived
      kind: 'link',
      nome,
      url: parsed.data.url,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, error: `Erro ao anexar link: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}

// =============================================================================
// uploadDocumentFile — envia um arquivo real (Supabase Storage)
// -----------------------------------------------------------------------------
// Recebe FormData (não JSON) porque carrega um File — Server Actions do Next
// aceitam FormData nativamente vindo de <form action={...}> ou de um `submit`
// programático que monte um FormData no client.
// =============================================================================
export async function uploadDocumentFile(
  opportunityId: string,
  formData: FormData
): Promise<DocumentActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecione um arquivo.' };
  }
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Arquivo acima de 8 MB.' };
  }
  if (!DOCUMENT_ALLOWED_MIME.includes(file.type as (typeof DOCUMENT_ALLOWED_MIME)[number])) {
    return {
      ok: false,
      error: 'Tipo de arquivo não permitido (PDF, Word, PPT, Excel, texto, imagem).',
    };
  }

  const nomeRaw = formData.get('nome');
  const nome = (typeof nomeRaw === 'string' && nomeRaw.trim()) || file.name;

  const ctx = await resolveProfile(opportunityId);
  if (!ctx.ok) return ctx;

  // path escopado por tenant_id — a policy de storage.objects (0018) exige
  // que o 1º segmento da pasta seja exatamente current_tenant_id().
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const storagePath = `${ctx.tenantId}/${opportunityId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await ctx.supabase.storage
    .from('opportunity-documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { ok: false, error: `Falha no upload: ${uploadError.message}` };
  }

  const { data: inserted, error } = await ctx.supabase
    .from('opportunity_documents')
    .insert({
      opportunity_id: opportunityId,
      tenant_id: ctx.tenantId,
      kind: 'arquivo',
      nome,
      storage_path: storagePath,
      tipo: file.type,
      size_bytes: file.size,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    // Row falhou depois do upload — remove o objeto órfão do Storage.
    await ctx.supabase.storage.from('opportunity-documents').remove([storagePath]);
    return { ok: false, error: `Erro ao registrar documento: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}

// =============================================================================
// getDocumentDownloadUrl — signed URL de download (bucket privado, sem login
// não abre) — chamado sob demanda, não guardada. `expiresIn` default 60s
// (download imediato); a miniatura de imagem colada na Descrição de tarefas
// (DescriptionField.tsx) pede um TTL maior (3600s) porque a URL fica visível
// na tela enquanto a pessoa preenche o formulário, não só no instante do clique.
// =============================================================================
export async function getDocumentDownloadUrl(
  storagePath: string,
  expiresIn = 60
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('opportunity-documents')
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data) {
    return { ok: false, error: 'Não foi possível gerar o link de download.' };
  }
  return { ok: true, url: data.signedUrl };
}

// =============================================================================
// deleteDocument — remove a row + o objeto no Storage (se for arquivo)
// =============================================================================
export async function deleteDocument(
  documentId: string,
  opportunityId: string
): Promise<MutationResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const ctx = await resolveProfile(opportunityId);
  if (!ctx.ok) return ctx;

  const { data: doc } = await ctx.supabase
    .from('opportunity_documents')
    .select('kind, storage_path')
    .eq('id', documentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from('opportunity_documents')
    .delete()
    .eq('id', documentId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    return { ok: false, error: `Erro ao excluir documento: ${error.message}` };
  }

  if (doc?.kind === 'arquivo' && doc.storage_path) {
    await ctx.supabase.storage.from('opportunity-documents').remove([doc.storage_path]);
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}
