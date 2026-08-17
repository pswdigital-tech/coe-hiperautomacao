import 'server-only';
import { z } from 'zod';

// =============================================================================
// OpportunityEnrichedFieldsSchema — resposta esperada da OpenAI no enrichment
// pós-INSERT de oportunidades (Phase 7.6).
//
// REGRAS de strict mode (OpenAI structured outputs / zodResponseFormat):
//   1. TODOS os campos top-level são REQUIRED — para "vazio", use string vazia
//      ou array vazio, NUNCA .optional() / .nullable().
//      (Pitfall 3 do 07.6-RESEARCH.md — strict rejeita schemas onde algum
//       field não está em "required".)
//   2. additionalProperties:false é injetado automaticamente pelo helper
//      `zodResponseFormat()` quando o schema é convertido para JSON Schema.
//   3. Enums precisam ser literal — usar z.enum() com strings.
//
// Os enums batem com os domains do DB (effort_level, complexity_level,
// time_bucket, automation_tool — todos definidos em 0001_init.sql). NÃO
// importamos de lib/opportunities/schema.ts para evitar ciclo de deps e
// porque estes enums aqui são contrato com a OpenAI, não com o input do user.
// =============================================================================

export const OpportunityEnrichedFieldsSchema = z.object({
  ferramenta: z.enum(['rpa', 'n8n', 'ambos']),
  escopo_automacao: z.array(z.string().min(1).max(200)).max(20),
  beneficios_esperados: z.array(z.string().min(1).max(200)).max(20),
  observacao: z.string().max(2000), // string vazia OK
  risco: z.string().max(2000), // string vazia OK
  esforco: z.enum(['baixo', 'medio', 'alto']),
  complexidade: z.enum(['baixo', 'medio', 'alto']),
  tempo: z.enum(['pequeno', 'medio', 'grande']),
  objetivo: z.number().int().min(1).max(5),
});

export type OpportunityEnrichedFields = z.infer<typeof OpportunityEnrichedFieldsSchema>;
