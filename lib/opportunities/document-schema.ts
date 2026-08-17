import { z } from 'zod';

// =============================================================================
// document-schema.ts — validação de input de `opportunity_documents` (v0.3/0018)
// =============================================================================
// Dois modos: link externo (Zod normal) e upload de arquivo (validado à parte
// em document-actions.ts — tamanho/mime não cabem bem num schema Zod porque o
// valor é um `File`, não JSON serializável vindo de um formulário comum).
//
// `kind`/`storage_path`/`size_bytes`/`tipo` são SEMPRE server-derived — nunca
// aparecem no input do cliente (mass-assignment defense, mesmo padrão de
// risk-schema.ts).
// =============================================================================

export const documentLinkInputSchema = z
  .object({
    nome: z.string().max(200, 'Máximo 200 caracteres').optional().or(z.literal('')),
    url: z
      .string()
      .min(1, 'Informe o link')
      .max(2000, 'Máximo 2000 caracteres')
      .refine((v) => /^https?:\/\//i.test(v), 'Link deve começar com http:// ou https://'),
  })
  .strict();

export type DocumentLinkInput = z.infer<typeof documentLinkInputSchema>;

/**
 * Mimes de imagem aceitos — compartilhado entre upload de documento (aqui) e
 * upload de imagem colada/arrastada na Descrição de tarefas (task-image-
 * schema.ts). SVG fica de fora de propósito: é o único formato de imagem que
 * carrega conteúdo ativo (script embutido), risco de XSS ao abrir o arquivo
 * diretamente pela signed URL.
 */
export const IMAGE_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Limites do upload de arquivo (validados em document-actions.ts, não aqui). */
export const DOCUMENT_MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const DOCUMENT_ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  ...IMAGE_ALLOWED_MIME,
] as const;
