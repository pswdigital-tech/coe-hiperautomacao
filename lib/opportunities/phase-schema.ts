import { z } from 'zod';
import type { PhaseKey } from '@/lib/database.types';

// =============================================================================
// phase-schema.ts — validação do input de ESTIMATIVA de fase (0048)
// =============================================================================
// Só as datas estimadas entram por aqui. `started_at`/`finished_at` (o
// REALIZADO) continuam exclusivos da trigger `sync_opportunity_phase()` — não
// são aceitos como input do cliente em hipótese nenhuma.
// =============================================================================

export const PHASE_KEYS = [
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
] as const satisfies readonly PhaseKey[];

/** `yyyy-mm-dd` ou vazio (limpar a estimativa) → `null`. */
const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

export const phasePlanInputSchema = z
  .object({
    phase_key: z.enum(PHASE_KEYS),
    planned_start_at: dateOrNull,
    planned_end_at: dateOrNull,
  })
  .strict()
  .refine(
    (v) =>
      !v.planned_start_at || !v.planned_end_at || v.planned_end_at >= v.planned_start_at,
    { message: 'O fim estimado não pode ser anterior ao início estimado.', path: ['planned_end_at'] }
  );

export type PhasePlanInput = z.infer<typeof phasePlanInputSchema>;
