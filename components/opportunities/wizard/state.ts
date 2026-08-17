import type { OpportunityInput } from '@/lib/opportunities/schema';
import type { Opportunity } from '@/lib/opportunities/types';

type PersonaInput = Extract<OpportunityInput, { source: 'persona' }>;
type FormularioInput = Extract<OpportunityInput, { source: 'formulario' }>;

/**
 * Estado intermediário do form durante o wizard.
 * Mantém AMBOS persona_extras e formulario_extras disponíveis ao mesmo tempo
 * — submit final filtra um deles conforme `source` antes de enviar pro server.
 */
export type WizardFormData = Partial<
  Omit<PersonaInput, 'persona_extras' | 'source'> &
    Omit<FormularioInput, 'formulario_extras' | 'source'> & {
      source: 'persona' | 'formulario';
      persona_extras: PersonaInput['persona_extras'];
      formulario_extras: FormularioInput['formulario_extras'];
    }
>;

export type StepId =
  | 'tipo'
  | 'classificacao'
  | 'identificacao'
  | 'processo'
  | 'automacao'
  | 'priorizacao'
  | 'contexto'
  | 'criterios'
  | 'beneficios';

// As 8 chaves de `criterios` (camelCase, espelham schema.ts §245 e o CHECK
// `opportunities_criterios_chk` de 0011). O banco exige null OU as 8 presentes.
const CRITERIO_KEYS = [
  'causaReclamacoes',
  'totalmenteManual',
  'regrasClaras',
  'decisaoHumana',
  'padronizacaoDocs',
  'validacaoDados',
  'schedulable',
  'temDocumentacao',
] as const;

export type StepDef = {
  id: StepId;
  label: string;
  icon: string;
};

const STEP_TIPO: StepDef = { id: 'tipo', label: 'Tipo', icon: '🔀' };
const STEP_CLASSIFICACAO: StepDef = {
  id: 'classificacao',
  label: 'Classificação',
  icon: '🏷️',
};
// Phase 7.6: step 'automacao' removido do fluxo create — agora é output de IA
// (lib/ai/enrichment.ts). Componente AutomacaoStep.tsx PRESERVADO; usado em
// mode='edit' do modal de detalhe (Plan 06).
const STEPS_COMMON: StepDef[] = [
  { id: 'identificacao', label: 'Identificação', icon: '👤' },
  { id: 'processo', label: 'Processo', icon: '📋' },
];
// Phase 7.6: step 'priorizacao' removido. PriorizacaoStep.tsx PRESERVADO
// (reaproveitado em mode='edit' — Plan 06).
const STEPS_PERSONA_EXTRA: StepDef[] = [
  { id: 'contexto', label: 'Contexto', icon: '💬' },
];
// Phase 7.6: step 'priorizacao' removido (mesmo motivo de STEPS_PERSONA_EXTRA).
const STEPS_FORMULARIO_EXTRA: StepDef[] = [
  { id: 'criterios', label: 'Critérios', icon: '✅' },
  { id: 'beneficios', label: 'Benefícios', icon: '📈' },
];

// Phase 7.6 (hotfix pós-execute): admin precisa editar os 9 campos preenchidos
// pela IA. Steps Automação + Priorização voltam SÓ em mode='edit' (continuam
// invisíveis no fluxo create, que é IA-only).
const STEPS_EDIT_AI_FIELDS: StepDef[] = [
  { id: 'automacao', label: 'Automação', icon: '🤖' },
  { id: 'priorizacao', label: 'Priorização', icon: '🎯' },
];

// Phase 11 (D-04): fluxo ÚNICO de criação — 5 steps na ordem canônica do mockup
// (`_giba_wsi-dashboard.html:1504-1597`). Sem Tipo/Classificação: a criação
// SEMPRE grava `source='formulario'`. Os steps Critérios/Benefícios/Priorização
// voltam ao create (haviam saído na 7.6 IA-only). O split persona/formulário e os
// STEP_TIPO/STEP_CLASSIFICACAO/STEPS_PERSONA_EXTRA/STEPS_EDIT_AI_FIELDS continuam
// vivos APENAS no mode='edit' (legado FGCoop read/edit-only — escopo Phase 13, D-05).
const STEPS_CREATE: StepDef[] = [
  { id: 'identificacao', label: 'Identificação', icon: '👤' },
  { id: 'processo', label: 'Processo', icon: '📋' },
  { id: 'criterios', label: 'Critérios', icon: '✅' },
  { id: 'beneficios', label: 'Benefícios', icon: '📈' },
  { id: 'priorizacao', label: 'Priorização', icon: '🎯' },
];

/**
 * Sequência de steps por modo+source.
 * - mode='create': fluxo ÚNICO de 5 steps (Phase 11 / D-04) — independe de source,
 *   sempre Identificação → Processo → Critérios → Benefícios → Priorização.
 * - mode='edit':   Classificação → Identificação → ... → Automação → Priorização
 *   (admin corrige IA / edita legado FGCoop — INTOCADO nesta fase, escopo Phase 13).
 */
export function stepsFor(
  source: 'persona' | 'formulario' | undefined,
  mode: 'create' | 'edit'
): StepDef[] {
  // Fluxo único de criação (D-04): 5 steps, independe de source.
  if (mode === 'create') {
    return STEPS_CREATE;
  }
  // mode='edit' — preservado exatamente como antes (escopo Phase 13).
  if (!source) {
    return [];
  }
  const extras =
    source === 'persona' ? STEPS_PERSONA_EXTRA : STEPS_FORMULARIO_EXTRA;
  const prefix = [STEP_CLASSIFICACAO];
  const suffix = STEPS_EDIT_AI_FIELDS;
  return [...prefix, ...STEPS_COMMON, ...extras, ...suffix];
}

export function defaultFormData(): WizardFormData {
  return {
    // Phase 11 (D-04): criação SEMPRE grava formulário (split persona aposentado
    // do create; permanece só p/ ler/editar legado FGCoop — D-05).
    source: 'formulario',
    request_type: 'nova_oportunidade',
    // Phase 11 (D-08): escopo_automacao[]/beneficios_esperados[] saem do create
    // (ficam null/vazios; preenchíveis por IA/edição depois — REALIGN-7.6 deferido).
    esforco: 'medio',
    complexidade: 'medio',
    // tempo (frequência, 0011) não tem default no create — Priorização define a
    // partir da frequência do step Processo (fonte única).
    objetivo: 3,
    status: 'novo',
  };
}

/**
 * Converte uma `Opportunity` (row do banco) em `WizardFormData` editável.
 * Trata null → '' (string vazia) ou [] (array vazio) pra compat com inputs.
 *
 * Phase 13 (Plan 05 / D-12/D-15): este é o SEED da edição global do modal —
 * o payload de `updateOpportunity` deriva direto daqui. Duas garantias críticas:
 *   1. `fte_horas` é semeado (era omitido antes) — sem isto o bucket FTE derivado
 *      nunca recalcula ao editar e o submit perde a coluna `fte`.
 *   2. APENAS o extras correspondente ao `source` entra (persona XOR formulário).
 *      O `opportunityInputSchema` é discriminatedUnion `.strict()`: semear ambos
 *      faz a variante `persona` rejeitar `formulario_extras` como `unrecognized_keys`.
 *      As demais coerções camelCase (criterios/beneficios) seguem first-class.
 */
export function opportunityToFormData(opp: Opportunity): WizardFormData {
  const base: WizardFormData = {
    source: opp.source,
    request_type: opp.request_type ?? 'nova_oportunidade',
    solicitante: opp.solicitante,
    email: opp.email ?? '',
    area: opp.area,
    subarea: opp.subarea ?? '',
    processo: opp.processo,
    frequencia: opp.frequencia ?? '',
    volume_medio: opp.volume_medio ?? '',
    tempo_execucao: opp.tempo_execucao ?? '',
    num_pessoas: opp.num_pessoas ?? '',
    // 0055 — a seleção multi-ferramenta. `ferramenta` (enum legado) NÃO é
    // semeado: é derivado no banco, e mandá-lo de volta no update seria ruído.
    ferramentas: opp.ferramentas ?? [],
    escopo_automacao:
      opp.escopo_automacao && opp.escopo_automacao.length > 0
        ? opp.escopo_automacao
        : [''],
    beneficios_esperados:
      opp.beneficios_esperados && opp.beneficios_esperados.length > 0
        ? opp.beneficios_esperados
        : [''],
    esforco: opp.esforco ?? 'medio',
    complexidade: opp.complexidade ?? 'medio',
    tempo: opp.tempo ?? undefined,
    objetivo: opp.objetivo ?? 3,
    status: opp.status,
    responsavel: opp.responsavel ?? '',
    notas: opp.notas ?? '',
    observacao: opp.observacao ?? '',
    risco: opp.risco ?? '',
    // v0.2 first-class — necessários para a edição global do modal (Phase 13):
    fte_horas: opp.fte_horas ?? undefined,
    criterios:
      (opp.criterios as WizardFormData['criterios']) ?? undefined,
    beneficios:
      (opp.beneficios as WizardFormData['beneficios']) ?? undefined,
    // v0.3 — operacionais/criticidade (edição global do modal):
    criticidade: opp.criticidade ?? undefined,
    azure_boards_codigo: opp.azure_boards_codigo ?? '',
    linguagem: opp.linguagem ?? '',
    execucao: opp.execucao ?? '',
    usuarios_servico: opp.usuarios_servico ?? '',
    execucoes_mes: opp.execucoes_mes ?? undefined,
    data_conclusao: opp.data_conclusao ?? '',
  };

  // Apenas o extras da variante (discriminatedUnion .strict() — XOR).
  if (opp.source === 'persona') {
    base.persona_extras = opp.persona_extras ?? undefined;
  } else {
    base.formulario_extras = opp.formulario_extras ?? undefined;
  }

  return base;
}

/**
 * Valida apenas os campos relevantes do step atual.
 * Retorna erros campo-a-campo (string única por campo).
 */
export function validateStep(
  step: StepId,
  data: WizardFormData
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (step === 'tipo') {
    if (!data.source) errors.source = 'Escolha um tipo';
  }

  if (step === 'classificacao') {
    if (!data.request_type) errors.request_type = 'Escolha uma classificação';
  }

  if (step === 'identificacao') {
    // Phase 11 (D-11 / WIZARD-04): Identificação valida nome + área + e-mail.
    // O campo `processo` também pertence ao step Identificação, então deve ser
    // validado aqui para dar feedback imediato ao usuário.
    if (!data.solicitante || data.solicitante.length < 2)
      errors.solicitante = 'Nome obrigatório';
    if (!data.area || data.area.length < 2) errors.area = 'Área obrigatória';
    if (!data.processo || data.processo.length < 3)
      errors.processo = 'Nome do processo obrigatório';
    if (
      data.email &&
      data.email !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    )
      errors.email = 'E-mail inválido';
  }

  if (step === 'processo') {
    // Phase 11 (D-11 / WIZARD-04): Processo obrigatório (≥ 3 chars), pt-BR.
    // Aqui mantemos a validação como defesa em profundidade, mas o campo é
    // efetivamente preenchido no step anterior.
    if (!data.processo || data.processo.length < 3)
      errors.processo = 'Nome do processo obrigatório';
  }

  if (step === 'criterios') {
    // Decisão de produto: exigir os 8 critérios respondidos (sem parcial). O CHECK
    // `opportunities_criterios_chk` (0011) recusa subconjunto — bloquear "Próximo"
    // aqui dá feedback claro em vez de estourar a constraint no submit.
    const c = data.criterios ?? {};
    const missing = CRITERIO_KEYS.filter((k) => c[k] == null);
    if (missing.length > 0) {
      errors.criterios = `Responda todos os 8 critérios (${missing.length} faltando).`;
    }
  }

  // Phase 7.6: branch de validação do step de Priorização removido — campos
  // esforco/complexidade/tempo/objetivo agora são output de IA (não input do
  // user). Type StepId mantém o literal correspondente para compatibilidade
  // com WizardShell renderStep() em mode='edit'.

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}
