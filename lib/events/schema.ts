import { z } from 'zod';
import { EVENT_SLUG_MAX, EVENT_SLUG_RE } from './slug';

// =============================================================================
// events/schema.ts — validação do formulário de evento (0066)
// -----------------------------------------------------------------------------
// Espelha os CHECKs da tabela (`events_name_len`, `events_slug_format`,
// `events_description_len`, `events_ends_after_starts`) para a UI recusar com
// mensagem legível antes do round-trip. O banco continua sendo a autoridade.
// `.strict()`: `tenant_id`, `is_default` e `status` NUNCA vêm do formulário —
// o tenant é resolvido/autorizado na action e os outros dois têm ação própria.
// =============================================================================

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Data inválida');

export const eventInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Nome deve ter ao menos 2 caracteres')
      .max(120, 'Nome deve ter no máximo 120 caracteres'),
    /** Vazio = derivado do nome na action. */
    slug: z
      .string()
      .trim()
      .max(EVENT_SLUG_MAX, `Slug deve ter no máximo ${EVENT_SLUG_MAX} caracteres`)
      .refine(
        (v) => v === '' || EVENT_SLUG_RE.test(v),
        'Slug só aceita letras minúsculas, números e hífens (ex.: workshop-financeiro)',
      )
      .optional()
      .or(z.literal('')),
    description: z
      .string()
      .trim()
      .max(1000, 'Descrição deve ter no máximo 1000 caracteres')
      .optional()
      .or(z.literal('')),
    starts_at: dateStr,
    ends_at: dateStr.optional().or(z.literal('')),
  })
  .strict()
  .refine(
    (v) => !v.ends_at || v.ends_at >= v.starts_at,
    { message: 'Data final não pode ser anterior à inicial', path: ['ends_at'] },
  );

export type EventInput = z.infer<typeof eventInputSchema>;
