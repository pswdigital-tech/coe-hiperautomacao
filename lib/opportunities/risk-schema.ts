import { z } from 'zod';

// =============================================================================
// risk-schema.ts — validação/tipos de input de `opportunity_risks` (0011)
// =============================================================================
// Phase 10 entrega APENAS validação + tipos (D-03). As queries de leitura e as
// server actions de mutação (create/update/delete) de riscos ficam na Phase 12
// (junto da UI da aba Risco). Satisfaz a parte de "validação" da dependência
// declarada da P12.
//
// `priority` é GENERATED (trigger set_risk_priority(), matriz impacto×probabilidade
// — _giba:1180-1185) → NUNCA entra no input. `id`/`tenant_id`/`opportunity_id` são
// server-derived (a rota da P12 deriva opportunity_id) → rejeitados pelo `.strict()`.
// =============================================================================

export const riskTypeEnum = z.enum(['impedimento', 'risco', 'oportunidade']);
export const riskImpactEnum = z.enum(['alto', 'significativo', 'moderado', 'baixo']);
export const riskProbabilityEnum = z.enum(['provavel', 'possivel', 'improvavel', 'remota']);
export const riskStatusEnum = z.enum(['novo', 'gerenciado', 'mitigado', 'ocorrido']);

export const riskInputSchema = z
  .object({
    descricao: z.string().min(1, 'Descrição obrigatória').max(2000, 'Máximo 2000 caracteres'),
    tipo: riskTypeEnum,
    responsavel: z
      .string()
      .max(200, 'Máximo 200 caracteres')
      .optional()
      .or(z.literal('')),
    impacto: riskImpactEnum,
    probabilidade: riskProbabilityEnum,
    status: riskStatusEnum.default('novo'),
    resposta: z
      .string()
      .max(2000, 'Máximo 2000 caracteres')
      .optional()
      .or(z.literal('')),
    descricao_impacto: z
      .string()
      .max(2000, 'Máximo 2000 caracteres')
      .optional()
      .or(z.literal('')),
  })
  .strict();

export type RiskInput = z.infer<typeof riskInputSchema>;
