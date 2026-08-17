import { z } from 'zod';
import { MAX_TOOLS_PER_OPPORTUNITY } from './tools';

// =============================================================================
// Mass Assignment defense — Bloco B (Phase 7.5)
// -----------------------------------------------------------------------------
// Campos derivados do servidor — JAMAIS aparecem nos schemas de input do cliente.
// Se algum deles vier no payload, o `.strict()` aplicado em cada variant do
// `opportunityInputSchema` rejeita o parse inteiro com `unrecognized_keys`.
//
// Campos server-derived (NÃO whitelist):
//   - `id`          → gerado pelo DB (`default gen_random_uuid()`)
//   - `tenant_id`   → vem de `profiles.tenant_id` lookup via `auth.uid()`
//   - `created_by`  → vem de `auth.uid()` no Server Action
//   - `seq_id`      → vem do trigger SQL `trg_opportunities_seq_id`
//   - `created_at`  → `default now()` no DB
//   - `updated_at`  → mantido por trigger
//
// Length limits ampliados (CONTEXT.md §Bloco B):
//   - `processo`: max 2000 chars
//   - `solicitante`, `email`, `area`, `subarea`, `responsavel`: max 200 chars
//   - `notas`: max 2000 chars
//   - `escopo_automacao[]`, `beneficios_esperados[]`: max 20 itens × max 200 chars
//   - `formulario_extras` (JSONB): max ~8KB serializado (validado via .superRefine)
//
// Mensagens em pt-BR. Os testes que cobrem este contrato vivem em
// `tests/security/mass-assignment.test.ts` (HARD-B-01..04).
// =============================================================================

// =============================================================================
// Enums — espelham os enums Postgres
// =============================================================================
export const sourceEnum = z.enum(['persona', 'formulario']);
export const statusEnum = z.enum([
  'novo',
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
  // v0.3 (0016) — fora do fluxo linear datado
  'gestao',
  'manutencao',
  'descontinuado',
]);
// v0.3 (0017): criticidade — manual, separada do Score.
export const criticidadeEnum = z.enum(['baixa', 'media', 'alta', 'critica']);
export const toolEnum = z.enum(['rpa', 'n8n', 'ambos']);
export const effortEnum = z.enum(['baixo', 'medio', 'alto']);
export const complexityEnum = z.enum(['baixo', 'medio', 'alto']);
// v0.2 (0011): `tempo` migrou de duração para FREQUÊNCIA (D-05).
export const frequencyEnum = z.enum(['diario', 'semanal', 'quinzenal', 'mensal', 'anual']);
// v0.2 (0011): 5º fator de score — bucket de FTE.
export const fteBucketEnum = z.enum(['muito_baixo', 'baixo', 'medio', 'alto', 'muito_alto']);
// Novo domínio dos 8 critérios first-class (D-08, minúsculo).
export const criterioEnum = z.enum(['sim', 'nao', 'parcial']);
// Legado: critérios aninhados em `formulario_extras` (v0.1, uppercase) — preservado até P11.
export const legacyCriterioEnum = z.enum(['SIM', 'NAO', 'PARCIAL']);
export const requestTypeEnum = z.enum([
  'nova_oportunidade',
  'melhoria_automacao',
  'duvidas_terceiros',
  'incidente',
  'treinamento',
]);

// =============================================================================
// Sub-schemas (JSONB) — `.strict()` para bloquear campos extras nos objetos
// aninhados também. Sub-objetos (criterios, beneficios) também `.strict()`.
// =============================================================================
export const personaExtrasSchema = z
  .object({
    cargo: z.string().max(200, 'Máximo 200 caracteres').optional(),
    tempo_funcao: z.string().max(60, 'Máximo 60 caracteres').optional(),
    local: z.string().max(200, 'Máximo 200 caracteres').optional(),
    papel: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    sistemas: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    objetivos: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    metricas: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    desafios: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    dados: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    automacao_atual: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    expectativas: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    priorizacao_desc: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    observacoes: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
  })
  .strict()
  .partial();

export const formularioExtrasSchema = z
  .object({
    tipo_processo: z.string().max(200, 'Máximo 200 caracteres').optional(),
    sistemas: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    // Discovery v2 — perguntas de levantamento (só o solicitante sabe; NÃO são
    // AI-owned). Guardadas em formulario_extras (jsonb) → viram insumo do
    // enrichment (prompts.ts serializa o objeto) sem exigir migration. Promover
    // a colunas first-class é follow-up se virarem facetas de dashboard.
    gatilho: z.string().max(60, 'Máximo 60 caracteres').optional(),
    formato_entrada: z.string().max(40, 'Máximo 40 caracteres').optional(),
    descricao: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    dor: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    dados_sensiveis: z.string().max(20, 'Máximo 20 caracteres').optional(),
    criterios: z
      .object({
        regras_claras: legacyCriterioEnum.optional(),
        totalmente_manual: legacyCriterioEnum.optional(),
        processo_uniforme: legacyCriterioEnum.optional(),
        digitacao_manual: legacyCriterioEnum.optional(),
        causa_reclamacoes: legacyCriterioEnum.optional(),
        padronizacao_docs: legacyCriterioEnum.optional(),
        validacao_dados: legacyCriterioEnum.optional(),
        schedulable: legacyCriterioEnum.optional(),
        tem_documentacao: legacyCriterioEnum.optional(),
        decisao_humana: legacyCriterioEnum.optional(),
      })
      .strict()
      .partial()
      .optional(),
    beneficios: z
      .object({
        reducao_tempo: z.number().int().min(1).max(5).optional(),
        eliminacao_erros: z.number().int().min(1).max(5).optional(),
        produtividade: z.number().int().min(1).max(5).optional(),
        qualidade_dados: z.number().int().min(1).max(5).optional(),
        reducao_custos: z.number().int().min(1).max(5).optional(),
        reducao_retrabalho: z.number().int().min(1).max(5).optional(),
        compliance: z.number().int().min(1).max(5).optional(),
        objetivos_estrategicos: z.number().int().min(1).max(5).optional(),
      })
      .strict()
      .partial()
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Limite de tamanho serializado — defesa contra storage exhaustion.
    // ~8KB conforme CONTEXT.md §Bloco B.
    if (JSON.stringify(val).length > 8192) {
      ctx.addIssue({
        code: 'custom',
        message: 'formulario_extras excede 8KB serializado',
      });
    }
  });

// =============================================================================
// Base shared schema — limits ampliados conforme CONTEXT.md §Bloco B.
//
// NÃO aplicar `.strict()` aqui — `.extend()` precisa do object schema sem
// `unknownKeys: 'strict'` ainda. O `.strict()` é aplicado por variant do
// discriminatedUnion abaixo (linha 138-148) para que campos server-derived
// extras (tenant_id, created_by, seq_id, id) sejam rejeitados no nível final.
// =============================================================================
const baseSchema = z.object({
  solicitante: z
    .string()
    .min(2, 'Nome muito curto')
    .max(200, 'Máximo 200 caracteres'),
  email: z
    .string()
    .email('E-mail inválido')
    .max(200, 'Máximo 200 caracteres')
    .or(z.literal(''))
    .optional(),
  area: z
    .string()
    .min(2, 'Área obrigatória')
    .max(200, 'Máximo 200 caracteres'),
  subarea: z
    .string()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .or(z.literal('')),
  processo: z
    .string()
    .min(3, 'Processo obrigatório')
    .max(2000, 'Máximo 2000 caracteres'),
  request_type: requestTypeEnum.default('nova_oportunidade'),
  frequencia: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  volume_medio: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  tempo_execucao: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  num_pessoas: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  // 0055 — coluna DERIVADA no banco (trigger `sync_opportunity_ferramentas`).
  // Continua aceita no input só para não quebrar chamadas antigas: o que for
  // enviado aqui é ignorado quando `ferramentas` vem preenchido.
  ferramenta: toolEnum.nullable().optional(),
  // 0055 — a seleção de verdade: slugs de `automation_tools` (multi-escolha).
  // Formato espelha `automation_tools_slug_chk`; o teto de 12, o CHECK
  // `opportunities_ferramentas_chk`.
  ferramentas: z
    .array(
      z
        .string()
        .regex(
          /^[a-z0-9][a-z0-9_-]{0,39}$/,
          'Ferramenta inválida (use o seletor para escolher ou registrar)',
        ),
    )
    .max(MAX_TOOLS_PER_OPPORTUNITY, `Máximo ${MAX_TOOLS_PER_OPPORTUNITY} ferramentas`)
    .default([]),
  escopo_automacao: z
    .array(z.string().max(200, 'Item excede 200 caracteres'))
    .max(20, 'Máximo 20 itens')
    .default([]),
  beneficios_esperados: z
    .array(z.string().max(200, 'Item excede 200 caracteres'))
    .max(20, 'Máximo 20 itens')
    .default([]),
  // ─── Campos enriquecidos pela IA (Phase 7.6) ────────────────────────────
  // esforco/complexidade/tempo/objetivo viram opcionais no INPUT do user:
  //   - Wizard interno (Plan 04) não coleta mais (steps "Automação"+"Priorização" removidos)
  //   - DB tem defaults (NOT NULL DEFAULT 'medio'/3) — `.insert` sem o campo usa default
  //   - Após INSERT, `enrichOpportunity()` via after() sobrescreve com valores da IA
  esforco: effortEnum.optional(),
  complexidade: complexityEnum.optional(),
  tempo: frequencyEnum.optional(),
  objetivo: z.number().int().min(1).max(5).optional(),
  status: statusEnum.default('novo'),
  responsavel: z
    .string()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .or(z.literal('')),
  notas: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),
  observacao: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),
  risco: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),
  // ─── Campos v0.2 (0011) — aditivos, todos opcionais (compat enrichment manual/IA, MODEL-10) ───
  // rpa_score NÃO entra aqui: é GENERATED no DB (derivado de criterios) — só leitura/saída.
  fte_horas: z.number().min(0, 'FTE não pode ser negativo').nullable().optional(),
  fonte: z
    .string()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .or(z.literal('')),
  tipo_processo: z
    .array(z.string().max(200, 'Item excede 200 caracteres'))
    .max(20, 'Máximo 20 itens')
    .optional()
    .default([]),
  beneficio_qualitativo: z
    .string()
    .max(2000, 'Máximo 2000 caracteres')
    .optional()
    .or(z.literal('')),
  // bucket de FTE como 5º fator de score (o wizard P11 mapeia fte_horas → bucket)
  prioridade_fte: fteBucketEnum.optional(),
  // 8 critérios first-class (espelham a coluna jsonb de 0011; D-08 minúsculo)
  criterios: z
    .object({
      causaReclamacoes: criterioEnum.optional(),
      totalmenteManual: criterioEnum.optional(),
      regrasClaras: criterioEnum.optional(),
      decisaoHumana: criterioEnum.optional(),
      padronizacaoDocs: criterioEnum.optional(),
      validacaoDados: criterioEnum.optional(),
      schedulable: criterioEnum.optional(),
      temDocumentacao: criterioEnum.optional(),
    })
    .strict()
    .partial()
    // Defesa em profundidade: o CHECK `opportunities_criterios_chk` (0011) exige
    // null OU as 8 chaves presentes (`?&`). Se um payload trouxer `criterios`
    // parcial, recusar aqui com fieldError limpo em vez de deixar o INSERT
    // estourar a constraint do banco ("violates check constraint"). null/ausente
    // continua válido (personas/legado). Espelha a validação do wizard.
    .refine(
      (c) =>
        (
          [
            'causaReclamacoes',
            'totalmenteManual',
            'regrasClaras',
            'decisaoHumana',
            'padronizacaoDocs',
            'validacaoDados',
            'schedulable',
            'temDocumentacao',
          ] as const
        ).every((k) => c[k] != null),
      { message: 'Responda todos os 8 critérios de RPA Fit antes de salvar.' }
    )
    .optional(),
  // 8 benefícios first-class (escala 1–5, espelham a coluna jsonb de 0011)
  beneficios: z
    .object({
      reducaoTempo: z.number().int().min(1).max(5).optional(),
      eliminacaoErros: z.number().int().min(1).max(5).optional(),
      produtividade: z.number().int().min(1).max(5).optional(),
      qualidadeDados: z.number().int().min(1).max(5).optional(),
      reducaoCustos: z.number().int().min(1).max(5).optional(),
      reducaoRetrabalho: z.number().int().min(1).max(5).optional(),
      compliance: z.number().int().min(1).max(5).optional(),
      objetivosEstrategicos: z.number().int().min(1).max(5).optional(),
    })
    .strict()
    .partial()
    .optional(),
  // ─── Campos v0.3 — operacionais + criticidade ───────────────────────────
  // Preenchidos pelo time do CoE (não pelo solicitante) — o wizard de criação
  // só coleta `criticidade`; os demais entram via edição do modal (Phase 13
  // recipe). Todos opcionais, sem default (compat MODEL-10, mesmo espírito
  // dos campos v0.2 acima).
  criticidade: criticidadeEnum.nullable().optional(),
  azure_boards_codigo: z
    .string()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .or(z.literal('')),
  linguagem: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  execucao: z
    .string()
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  usuarios_servico: z
    .string()
    .max(200, 'Máximo 200 caracteres')
    .optional()
    .or(z.literal('')),
  execucoes_mes: z
    .number()
    .int()
    .min(0, 'Não pode ser negativo')
    .nullable()
    .optional(),
  data_conclusao: z
    .string()
    .max(20, 'Data inválida')
    .optional()
    .or(z.literal('')),
});

// =============================================================================
// Discriminated union — persona vs formulário
//
// `.strict()` em CADA variant bloqueia Mass Assignment:
//   - rejeita campos server-derived no input (tenant_id, created_by, seq_id, id)
//   - rejeita formulario_extras em payload `source: 'persona'` (variant mismatch)
//   - rejeita persona_extras  em payload `source: 'formulario'` (variant mismatch)
//
// Zod 4.x: `.strict()` em discriminatedUnion variants funciona via
// `unknownKeys: 'strict'` no nível do object schema final (após `.extend()`).
// =============================================================================
export const opportunityInputSchema = z.discriminatedUnion('source', [
  baseSchema
    .extend({
      source: z.literal('persona'),
      persona_extras: personaExtrasSchema.optional(),
    })
    .strict(),
  baseSchema
    .extend({
      source: z.literal('formulario'),
      formulario_extras: formularioExtrasSchema.optional(),
    })
    .strict(),
]);

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;
