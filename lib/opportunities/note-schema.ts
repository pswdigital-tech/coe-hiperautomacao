import { z } from 'zod';

// =============================================================================
// note-schema.ts — validação de input de `opportunity_notes` (v0.3/0018)
// =============================================================================
// Anotações estruturadas (autor+data, geridos pelo servidor) substituem o
// padrão de texto único livre. `created_by`/`created_at`/`tenant_id`/
// `opportunity_id` são sempre server-derived — nunca no input do cliente.
// =============================================================================

export const noteInputSchema = z
  .object({
    texto: z.string().min(1, 'Escreva a anotação').max(4000, 'Máximo 4000 caracteres'),
  })
  .strict();

export type NoteInput = z.infer<typeof noteInputSchema>;
