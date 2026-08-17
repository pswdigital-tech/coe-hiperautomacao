// =============================================================================
// inline-image-schema.ts — limites do upload de imagem colada/arrastada em
// campos de texto livre (Descrição de tarefa/subtarefa, Anotações de
// oportunidade)
// =============================================================================
// Mimes compartilhados com document-schema.ts (IMAGE_ALLOWED_MIME) — mesma
// política de formato aceito (sem SVG, risco de XSS). Tamanho máximo menor
// que o de documentos (5 MB vs 8 MB): é uma imagem inline num texto, não um
// anexo de arquivo.
// =============================================================================
import { IMAGE_ALLOWED_MIME } from './document-schema';

export const INLINE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const INLINE_IMAGE_ALLOWED_MIME = IMAGE_ALLOWED_MIME;
