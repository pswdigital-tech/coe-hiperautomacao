import { z } from 'zod';

// =============================================================================
// task-schema.ts — validação/tipos de input de `opportunity_tasks` (0037,
// Phase 16 — TASK-01/TASK-05)
// -----------------------------------------------------------------------------
// Analog exato: `risk-schema.ts` (.strict(), enums minúsculos, campos de texto
// opcionais como `.optional().or(z.literal(''))`) + o `.superRefine` de
// `schema.ts:136` (regra condicional, `ctx.addIssue({code:'custom', ...})`).
//
// `id`/`tenant_id`/`opportunity_id`/`created_by`/`created_at`/`updated_at` são
// server-derived → o `.strict()` os rejeita como chave não reconhecida
// (mass-assignment defense, T-16-02). `blocked_reason` é exigido pelo
// `.superRefine` quando `status === 'bloqueio'` (D-03) — a UI reflete a regra
// (TaskForm), o Zod e a constraint `opportunity_tasks_blocked_reason_chk` (0037)
// a impõem.
// =============================================================================

// 0060 — `homologacao` entrou como 5º valor; a ordem aqui não tem efeito de
// UI (quem ordena as colunas é `TASK_STATUS_ORDER`), mas segue a do fluxo para
// não divergir da leitura do Kanban.
export const taskStatusEnum = z.enum([
  'backlog',
  'em_andamento',
  'homologacao',
  'finalizado',
  'bloqueio',
]);

// 0049 — tag de prioridade. `.default('media')` espelha o default da coluna:
// um payload antigo (sem o campo) continua válido e cai no mesmo valor que o
// banco daria.
export const taskPriorityEnum = z.enum(['alta', 'media', 'baixa']);

export const taskInputSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Título obrigatório')
      .max(200, 'Máximo 200 caracteres'),
    description: z
      .string()
      .max(2000, 'Máximo 2000 caracteres')
      .optional()
      .or(z.literal('')),
    status: taskStatusEnum.default('backlog'),
    priority: taskPriorityEnum.default('media'),
    start_date: z.string().optional().or(z.literal('')),
    due_date: z.string().optional().or(z.literal('')),
    assignee_id: z.string().uuid('Responsável inválido').optional().or(z.literal('')),
    blocked_reason: z
      .string()
      .max(2000, 'Máximo 2000 caracteres')
      .optional()
      .or(z.literal('')),
    parent_task_id: z.string().uuid('Tarefa pai inválida').optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === 'bloqueio' && !(val.blocked_reason ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Motivo do bloqueio obrigatório quando o status é Bloqueio.',
        path: ['blocked_reason'],
      });
    }
  });

export type TaskInput = z.infer<typeof taskInputSchema>;
