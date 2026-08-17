'use server';

// =============================================================================
// inline-image-actions.ts — upload de imagem colada/arrastada em campos de
// texto livre (Descrição de tarefa/subtarefa, Anotações de oportunidade)
// -----------------------------------------------------------------------------
// Reusa o bucket privado 'opportunity-documents' (0018) sob o path
// "{tenant_id}/{opportunity_id}/inline-images/{arquivo}" — o 1º segmento
// continua sendo tenant_id, então a policy de storage já existente (0018,
// mais o ramo platform_admin fechado pela 0057) cobre este caso sem policy
// nova.
//
// Diferente de document-actions.ts (uploadDocumentFile), esta ação NÃO insere
// linha em tabela nenhuma: a referência à imagem vive embutida no próprio
// texto (task.description ou opportunity_notes.texto), como
// `![nome](inline-image:{path})` (lib/opportunities/description-images.ts
// monta/lê essa sintaxe; components/opportunities/DescriptionImageField.tsx e
// InlineImageThumbs.tsx resolvem a signed URL sob demanda via
// getDocumentDownloadUrl, reaproveitado de document-actions.ts).
//
// Mesmas 3 camadas de defesa de document-actions.ts:
//   1. requireEditorRole() barra viewer antes de qualquer upload.
//   2. tenant_id do path vem do escopo de escrita RESOLVIDO NO SERVIDOR
//      (resolveWriteTenantId) — nunca do payload.
//   3. Mime/tamanho validados no servidor (a validação client-side em
//      DescriptionImageField.tsx é só UX, nunca a defesa real).
//
// Tradeoff aceito conscientemente: se o formulário/anotação for descartado
// (ou a submissão falhar depois do upload), a imagem já enviada fica órfã no
// Storage — não há job de limpeza. Mesma categoria de tradeoff que apps como
// GitHub/Slack aceitam para imagens coladas em rascunhos descartados; fora de
// escopo criar esse job agora.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { INLINE_IMAGE_MAX_SIZE_BYTES, INLINE_IMAGE_ALLOWED_MIME } from './inline-image-schema';

export type InlineImageUploadResult =
  | { ok: true; path: string; nome: string }
  | { ok: false; error: string };

export async function uploadInlineImage(
  opportunityId: string,
  formData: FormData
): Promise<InlineImageUploadResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecione uma imagem.' };
  }
  if (file.size > INLINE_IMAGE_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Imagem acima de 5 MB.' };
  }
  if (!INLINE_IMAGE_ALLOWED_MIME.includes(file.type as (typeof INLINE_IMAGE_ALLOWED_MIME)[number])) {
    return { ok: false, error: 'Formato não permitido (JPEG, PNG, GIF ou WebP).' };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (D-11) — mesmo padrão de
  // document-actions.ts/task-actions.ts/note-actions.ts. `null` = oportunidade
  // fora do escopo do usuário (psw_staff sem atribuição, tenant errado, etc.).
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const supabase = await createClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const storagePath = `${tenantId}/${opportunityId}/inline-images/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('opportunity-documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { ok: false, error: `Falha no upload: ${uploadError.message}` };
  }

  return { ok: true, path: storagePath, nome: file.name };
}
