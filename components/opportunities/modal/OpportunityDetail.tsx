'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityDocument,
  OpportunityNote,
  OpportunityTask,
} from '@/lib/opportunities/types';
import type {
  Assignee,
  AssignableProfile,
} from '@/lib/opportunities/assignee-types';
// A aba Histórico passou a ler a timeline unificada (audit_log 0038 + as linhas
// legadas de opportunity_history), não mais só `opportunity_history`.
import type { TimelineEntry } from '@/lib/audit/timeline';
import { updateOpportunity } from '@/lib/opportunities/actions';
import type { OpportunityInput } from '@/lib/opportunities/schema';
import {
  opportunityToFormData,
  validateStep,
  type WizardFormData,
} from '@/components/opportunities/wizard/state';
import { calcPriorityScore, priorityLevel } from '@/lib/opportunities/score';
import { deriveFteBucket } from '@/lib/opportunities/fte';
import { deriveRpaScore } from '@/lib/opportunities/rpa';
import { DetailHeader } from '@/components/opportunities/detail/DetailHeader';
import { SummarySidebar } from '@/components/opportunities/detail/SummarySidebar';
import { TasksPanel } from '@/components/opportunities/detail/TasksPanel';
import { TabsNav } from './TabsNav';
import type { TabDef, TabId } from './types';
import { AutomacaoTab } from './tabs/AutomacaoTab';
import { FasesTab } from './tabs/FasesTab';
import { ScoreTab } from './tabs/ScoreTab';
import { ProcessoTab } from './tabs/ProcessoTab';
import { CriteriosTab } from './tabs/CriteriosTab';
import { BeneficiosTab } from './tabs/BeneficiosTab';
import { ObservacaoTab } from './tabs/ObservacaoTab';
import { RiscoTab } from './tabs/RiscoTab';
import { DocumentosTab } from './tabs/DocumentosTab';
import { HistoricoTab } from './tabs/HistoricoTab';
import { TextField, SelectField } from '@/components/opportunities/wizard/steps/fields';
import { CriteriosStep } from '@/components/opportunities/wizard/steps/CriteriosStep';
import { BeneficiosStep } from '@/components/opportunities/wizard/steps/BeneficiosStep';
import { PriorizacaoStep } from '@/components/opportunities/wizard/steps/PriorizacaoStep';
import { ToolPicker } from '@/components/opportunities/wizard/steps/ToolPicker';
import { DynamicList } from '@/components/opportunities/wizard/steps/DynamicList';

// D-07/D-08/D-09: conjunto ÚNICO de 8 abas para QUALQUER oportunidade, na ordem
// do mockup (`_giba_wsi-dashboard.html:959-968`). Sem ramificação por `source`.
// As abas só-persona (Perfil/Desafios/CoE) saem da exibição — os arquivos
// permanecem no disco e os dados em `persona_extras`, apenas não são mais montados.
// v0.5: `tarefas` entra em PRIMEIRO e é a aba padrão — o Plano de Atividades
// é o conteúdo mais consultado do detalhe e custava um clique + uma navegação
// (o antigo card "Ver tarefas →") para ser alcançado.
const MODAL_TABS: TabDef[] = [
  { id: 'tarefas', label: 'Plano de Atividades', icon: '🗂️' },
  { id: 'processo', label: 'Processo', icon: '📋' },
  { id: 'criterios', label: 'Critérios', icon: '✅' },
  { id: 'automacao', label: 'Automação', icon: '🤖' },
  { id: 'beneficios', label: 'Benefícios', icon: '📈' },
  { id: 'score', label: 'Score', icon: '📊' },
  { id: 'fases', label: 'Fases', icon: '📅' },
  { id: 'risco', label: 'Risco', icon: '⚠️' },
  { id: 'observacao', label: 'Observações', icon: '💬' },
  // v0.3 — abas novas (documentos anexados + auditoria automática)
  { id: 'documentos', label: 'Documentos', icon: '📎' },
  { id: 'historico', label: 'Histórico', icon: '🕘' },
];

// Domínio de Frequência (fonte única do fator `tempo`, 0011). Espelha ProcessoStep.
const FREQUENCY_OPTIONS = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];
const FREQUENCY_LABEL: Record<string, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  anual: 'Anual',
};
// v0.3 — criticidade (separada do Score, input manual). Espelha ProcessoStep.
const CRITICIDADE_OPTIONS = [
  { value: 'baixa', label: '🟢 Baixa' },
  { value: 'media', label: '🟡 Média' },
  { value: 'alta', label: '🟠 Alta' },
  { value: 'critica', label: '🔴 Crítica' },
];

type Props = {
  opportunity: Opportunity;
  phases: OpportunityPhase[];
  risks: OpportunityRisk[];
  documents: OpportunityDocument[];
  notes: OpportunityNote[];
  history: TimelineEntry[];
  /** RBAC (v0.3) — viewer não edita nada; abas de mutação viram somente leitura. */
  readOnly?: boolean;
  /**
   * Nome da empresa dona desta oportunidade — sinalização de contexto para o
   * staff PSW (Phase 17): `null`/ausente para os demais papéis, cujo cabeçalho
   * não muda.
   */
  companyName?: string | null;
  // ── Plano de Atividades embutido (v0.5) ───────────────────────────────────
  /** Array PLANO de tarefas (raízes + subtarefas) já buscado pela página. */
  tasks: OpportunityTask[];
  /** Candidatos a responsável de TAREFA (inclui staff PSW atribuído, ACCESS-11). */
  taskAssignableProfiles: AssignableProfile[];
  /** Data de hoje (ISO) vinda do servidor — ver `lib/opportunities/task-summary.ts`. */
  today: string;
  // ── Responsáveis pela oportunidade (0032) ─────────────────────────────────
  assignees: Assignee[];
  assignableProfiles: AssignableProfile[];
  canAssign: boolean;
  /**
   * Reprocessar o enriquecimento por IA — privilégio de admin, resolvido no
   * servidor pelo mesmo predicado de `canAssign`. Repassado ao DetailHeader.
   */
  canReprocessAi?: boolean;
};

export function OpportunityDetail({
  opportunity,
  phases,
  risks,
  documents,
  notes,
  history,
  readOnly = false,
  companyName = null,
  tasks,
  taskAssignableProfiles,
  today,
  assignees,
  assignableProfiles,
  canAssign,
  canReprocessAi = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('tarefas');

  // ── Estado de edição global (recipe do WizardShell, D-12/D-13/D-15) ───────
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<WizardFormData>(
    opportunityToFormData(opportunity)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(p: Partial<WizardFormData>) {
    setForm((d) => ({ ...d, ...p }));
  }

  function onEdit() {
    setEditMode(true);
  }

  function onCancel() {
    setForm(opportunityToFormData(opportunity));
    setErrors({});
    setSubmitError(null);
    setEditMode(false);
  }

  function onSave() {
    // Pitfall 2: gate all-or-null dos 8 critérios antes do submit (espelha o
    // CHECK `opportunities_criterios_chk` + o .refine do Zod). Persona legada
    // intocada mantém criterios undefined/null — validateStep só bloqueia se
    // houver resposta parcial; criterios totalmente ausente também é bloqueado,
    // coerente com o gate do wizard (mensagem pt-BR "Responda todos os 8…").
    const cv = validateStep('criterios', form);
    if (!cv.ok) {
      setErrors(cv.errors);
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      // Deriva o 5º fator (bucket FTE) de fte_horas — fonte única (mesma fn do
      // display read-only) → impossível divergir preview × persistência. Derivado
      // NUNCA é input; só `prioridade_fte` (que a action mapeia p/ coluna `fte`).
      const payload = {
        ...form,
        prioridade_fte:
          form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined,
      };
      const result = await updateOpportunity(
        opportunity.id,
        payload as OpportunityInput
      );
      if (!result.ok) {
        setSubmitError(result.error);
        if (result.fieldErrors) {
          // fieldErrors do Zod são Record<string,string[]> — pega a 1ª mensagem.
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            if (Array.isArray(v) && v[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        return;
      }
      // Pitfall 4: o modal NÃO fecha (ao contrário do WizardShell, que navega
      // para trás). Sai do modo edição e repinta com valores DB-authoritative
      // (score/priority/rpa_score/fte recalculados no servidor após o update).
      setEditMode(false);
      router.refresh();
    });
  }

  // ── Derivados ao vivo (Shared Pattern C, read-only — D-15) ────────────────
  // Display-only: NUNCA inputs, NUNCA no payload. Em modo edição refletem o form;
  // em modo leitura o Header usa os valores DB-authoritative da row.
  const fteBucket =
    form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined;
  const liveScore = calcPriorityScore({
    prioridade: {
      esforco: form.esforco,
      complexidade: form.complexidade,
      tempo: form.tempo,
      objetivo: form.objetivo,
      fte: fteBucket,
    },
    criterios: form.criterios,
    beneficios: form.beneficios,
  });
  const livePriority = priorityLevel(liveScore);
  const liveRpaScore = deriveRpaScore(
    (form.criterios ?? null) as Record<string, string> | null
  );

  // A aba de tarefas não passa por `renderTab`: ela não é conteúdo do payload
  // de edição (D-12) e traz o seu próprio wrapper (toolbar + views + diálogo).
  const tabContent =
    activeTab === 'tarefas' ? null : renderTab({
    tab: activeTab,
    opp: opportunity,
    phases,
    risks,
    documents,
    notes,
    history,
    editMode,
    form,
    patch,
    errors,
    liveRpaScore,
    readOnly,
  });

  const isTarefas = activeTab === 'tarefas';

  return (
    <div className="flex flex-col gap-4">
      <DetailHeader
        opportunity={opportunity}
        companyName={companyName}
        editMode={editMode}
        pending={pending}
        submitError={submitError}
        liveScore={liveScore}
        livePriority={livePriority}
        onEdit={onEdit}
        onSave={onSave}
        onCancel={onCancel}
        readOnly={readOnly}
        assignees={assignees}
        assignableProfiles={assignableProfiles}
        canAssign={canAssign}
        canReprocessAi={canReprocessAi}
      />

      {/* Abas horizontais (v0.5) — o rail vertical saiu: com o Plano de
          Atividades no corpo, a largura vale mais que a lista de abas. */}
      <nav className="bg-wh border border-bdr rounded-2xl shadow-sm overflow-hidden">
        <TabsNav tabs={MODAL_TABS} activeTab={activeTab} onChange={setActiveTab} />
      </nav>

      {/* Corpo: conteúdo + coluna de resumo (só na aba do Plano — nas demais
          abas o próprio conteúdo já é a ficha da oportunidade, e repetir o
          resumo ao lado seria ruído). */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full">
          {isTarefas ? (
            <TasksPanel
              opportunityId={opportunity.id}
              tasks={tasks}
              assignableProfiles={taskAssignableProfiles}
              readOnly={readOnly}
            />
          ) : (
            <div className="bg-wh border border-bdr rounded-xl shadow-sm overflow-hidden min-h-[55vh]">
              {tabContent}
            </div>
          )}
        </div>

        {isTarefas && (
          <aside className="w-full xl:w-[340px] xl:shrink-0">
            <SummarySidebar
              opportunity={opportunity}
              tasks={tasks}
              today={today}
              opportunityId={opportunity.id}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function renderTab(args: {
  tab: TabId;
  opp: Opportunity;
  phases: OpportunityPhase[];
  risks: OpportunityRisk[];
  documents: OpportunityDocument[];
  notes: OpportunityNote[];
  history: TimelineEntry[];
  editMode: boolean;
  form: WizardFormData;
  patch: (p: Partial<WizardFormData>) => void;
  errors: Record<string, string>;
  liveRpaScore: number | null;
  readOnly: boolean;
}) {
  const {
    tab,
    opp,
    phases,
    risks,
    documents,
    notes,
    history,
    editMode,
    form,
    patch,
    errors,
    readOnly,
  } = args;

  // Fases, Risco, Documentos e Histórico têm sua própria interatividade (CRUD
  // inline gated só por `readOnly`) — independem do fluxo global Editar/Salvar
  // (D-12) e por isso NÃO fazem parte do payload de updateOpportunity.
  if (tab === 'fases')
    return <FasesTab opportunity={opp} phases={phases} readOnly={readOnly} />;
  if (tab === 'risco')
    return <RiscoTab opportunity={opp} risks={risks} readOnly={readOnly} />;
  if (tab === 'documentos')
    return (
      <DocumentosTab opportunityId={opp.id} documents={documents} readOnly={readOnly} />
    );
  if (tab === 'historico') return <HistoricoTab history={history} />;
  if (tab === 'observacao')
    return <ObservacaoTab opportunity={opp} notes={notes} readOnly={readOnly} />;

  // ── Modo LEITURA: abas de display do Plan 04 (inalteradas) ────────────────
  if (!editMode) {
    switch (tab) {
      case 'processo':
        return <ProcessoTab opportunity={opp} />;
      case 'criterios':
        return <CriteriosTab opportunity={opp} />;
      case 'automacao':
        return <AutomacaoTab opportunity={opp} />;
      case 'beneficios':
        return <BeneficiosTab opportunity={opp} />;
      case 'score':
        return <ScoreTab opportunity={opp} />;
      default:
        return null;
    }
  }

  // ── Modo EDIÇÃO: bodies puros do wizard contra UM payload (Shared Pattern D) ─
  switch (tab) {
    case 'processo':
      return (
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <TextField
              label="Processo"
              required
              value={form.processo ?? ''}
              onChange={(v) => patch({ processo: v })}
              error={errors.processo}
            />
            <TextField
              label="Área Responsável"
              required
              value={form.area ?? ''}
              onChange={(v) => patch({ area: v })}
              error={errors.area}
            />
            <TextField
              label="Subárea / Time"
              value={form.subarea ?? ''}
              onChange={(v) => patch({ subarea: v })}
            />
            <SelectField
              label="Frequência"
              value={form.tempo}
              onChange={(v) =>
                patch({
                  tempo: v as WizardFormData['tempo'],
                  frequencia: FREQUENCY_LABEL[v] ?? '',
                })
              }
              options={FREQUENCY_OPTIONS}
            />
            {/* Semântica: execuções = Frequência × Número de Execuções (ex.: Semanal × 4). */}
            <TextField
              label="Número de Execuções"
              value={form.volume_medio ?? ''}
              onChange={(v) => patch({ volume_medio: v })}
            />
            <TextField
              label="Tempo de Execução"
              value={form.tempo_execucao ?? ''}
              onChange={(v) => patch({ tempo_execucao: v })}
            />
            <TextField
              label="Pessoas Envolvidas"
              value={form.num_pessoas ?? ''}
              onChange={(v) => patch({ num_pessoas: v })}
            />
            <TextField
              label="E-mail do Solicitante"
              type="email"
              value={form.email ?? ''}
              onChange={(v) => patch({ email: v })}
              error={errors.email}
            />
            {/* "Responsável CoE" saiu daqui (0032): a atribuição virou vínculo
                com perfis reais, no painel do topo do detalhe. */}
            <SelectField
              label="Criticidade"
              value={form.criticidade ?? ''}
              onChange={(v) =>
                patch({ criticidade: (v || undefined) as WizardFormData['criticidade'] })
              }
              options={CRITICIDADE_OPTIONS}
            />
          </div>

          <div className="mt-2 pt-3 border-t border-bdr">
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Operacional (automação já implementada)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <TextField
                label="Código Azure Boards"
                value={form.azure_boards_codigo ?? ''}
                onChange={(v) => patch({ azure_boards_codigo: v })}
              />
              <TextField
                label="Linguagem"
                value={form.linguagem ?? ''}
                onChange={(v) => patch({ linguagem: v })}
                placeholder="Ex: Python, VBA, Power Automate"
              />
              <TextField
                label="Execução"
                value={form.execucao ?? ''}
                onChange={(v) => patch({ execucao: v })}
                placeholder="Ex: VM, servidor"
              />
              <TextField
                label="Usuários de Serviço"
                value={form.usuarios_servico ?? ''}
                onChange={(v) => patch({ usuarios_servico: v })}
              />
              <TextField
                label="Data de Conclusão"
                type="text"
                value={form.data_conclusao ?? ''}
                onChange={(v) => patch({ data_conclusao: v })}
                placeholder="AAAA-MM-DD"
              />
            </div>
          </div>
        </div>
      );
    case 'criterios':
      return <CriteriosStep data={form} onChange={patch} errors={errors} />;
    case 'beneficios':
      return <BeneficiosStep data={form} onChange={patch} />;
    case 'score':
      // PriorizacaoStep: 4 fatores manuais + bucket FTE read-only + ScorePreview
      // (o score/priority são DISPLAY-only — nunca inputs, D-15).
      return <PriorizacaoStep data={form} onChange={patch} errors={errors} />;
    case 'automacao':
      return (
        <div className="px-5 py-4 space-y-5">
          {/* 0055 — multi-seleção sobre o catálogo `automation_tools`, no lugar
              do select único de rpa/n8n/ambos. 'Ambos' saiu: marcar RPA e n8n
              diz o mesmo sem ambiguidade. */}
          <ToolPicker
            value={form.ferramentas ?? []}
            onChange={(next) => patch({ ferramentas: next })}
            opportunityId={opp.id}
          />

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Escopo do Projeto
            </div>
            <DynamicList
              items={form.escopo_automacao ?? ['']}
              onChange={(next) => patch({ escopo_automacao: next })}
              placeholder="Ex: Geração automática de relatório X"
              addLabel="+ Adicionar item ao escopo"
            />
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Benefícios Esperados
            </div>
            <DynamicList
              items={form.beneficios_esperados ?? ['']}
              onChange={(next) => patch({ beneficios_esperados: next })}
              placeholder="Ex: Redução de 60% no tempo"
              addLabel="+ Adicionar benefício"
            />
          </div>
        </div>
      );
    default:
      return null;
  }
}
