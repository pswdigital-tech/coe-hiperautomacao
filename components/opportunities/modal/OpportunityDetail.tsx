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
import { VisaoGeralPanel } from '@/components/opportunities/detail/VisaoGeralPanel';
import type { OverviewTarget } from '@/lib/opportunities/overview';
import { TabsNav } from './TabsNav';
import type { TabDef, TabId } from './types';
import { SolucaoTab } from './tabs/SolucaoTab';
import { FasesTab } from './tabs/FasesTab';
import { ProcessoAtualTab } from './tabs/ProcessoAtualTab';
import { GovernancaTab, type GovernancaSub } from './tabs/GovernancaTab';
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
  // 0061 — painel executivo. Entra ANTES do Plano porque é a resposta de quem
  // só quer saber como o projeto está; quem trabalha nele não perde nada,
  // porque a aba inicial continua sendo o Plano para todo perfil que edita
  // (ver `activeTab` abaixo).
  { id: 'visao-geral', label: 'Visão Geral', icon: '🏠' },
  { id: 'tarefas', label: 'Plano de Atividades', icon: '🗂️' },
  // Substitui "Fases": mesma edição de estimativa por dentro (FasesTab), mais
  // o Gantt do projeto e os indicadores de prazo.
  { id: 'cronograma', label: 'Cronograma', icon: '📅' },
  { id: 'solucao', label: 'Solução', icon: '⚙️' },
  { id: 'processo', label: 'Processo Atual', icon: '📋' },
  { id: 'governanca', label: 'Governança', icon: '🛡️' },
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
  // Aba inicial POR PAPEL: o perfil somente-leitura (o cliente) abre na Visão
  // Geral — é a única seção pensada para quem não trabalha na oportunidade
  // todo dia. Quem edita continua caindo no Plano de Atividades, preservando o
  // ganho deliberado da v0.5 (o Plano é o conteúdo mais consultado do detalhe).
  const [activeTab, setActiveTab] = useState<TabId>(
    readOnly ? 'visao-geral' : 'tarefas'
  );
  // Sub-item da Governança. Vive aqui, e não dentro dela, porque a Visão Geral
  // navega direto para "riscos"/"histórico" — o alvo precisa ser ajustável de
  // fora da seção.
  const [govSub, setGovSub] = useState<GovernancaSub>('riscos');

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

  // Tarefas e Visão Geral não passam por `renderTab`: trazem o próprio wrapper
  // (o Plano tem toolbar/views/diálogo; a Visão Geral é uma grade de cartões,
  // não uma ficha dentro de um cartão branco).
  const tabContent =
    activeTab === 'tarefas' ||
    activeTab === 'visao-geral' ||
    activeTab === 'governanca'
      ? null
      : renderTab({
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
  const isVisaoGeral = activeTab === 'visao-geral';
  // Solução monta os próprios cartões (o conteúdo é heterogêneo demais para
  // uma ficha única) — então NÃO entra na casca branca das abas de ficha, pelo
  // mesmo motivo da Visão Geral: cartão dentro de cartão embaralha as
  // fronteiras em vez de marcá-las.
  // Solução e Processo Atual montam os próprios cartões (conteúdo heterogêneo
  // demais para uma ficha única) — não entram na casca branca das abas de
  // ficha: cartão dentro de cartão embaralha as fronteiras em vez de marcá-las.
  const isSolucao = activeTab === 'solucao' || activeTab === 'processo';
  const isGovernanca = activeTab === 'governanca';

  // Alertas e "ver todos" da Visão Geral levam à aba dona do assunto — os
  // alvos são abas que já existem, não rotas.
  function goTo(target: OverviewTarget) {
    // `risco` e `historico` deixaram de ser abas: são sub-itens da Governança.
    if (target === 'risco' || target === 'historico') {
      setGovSub(target === 'risco' ? 'riscos' : 'historico');
      setActiveTab('governanca');
      return;
    }
    setActiveTab(target as TabId);
  }

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
          {isVisaoGeral ? (
            <VisaoGeralPanel
              opportunity={opportunity}
              tasks={tasks}
              phases={phases}
              risks={risks}
              history={history}
              today={today}
              onNavigate={goTo}
              editMode={editMode}
              objetivoProjeto={form.objetivo_projeto ?? ''}
              onObjetivoChange={(v) => patch({ objetivo_projeto: v })}
            />
          ) : isTarefas ? (
            <TasksPanel
              opportunityId={opportunity.id}
              tasks={tasks}
              assignableProfiles={taskAssignableProfiles}
              readOnly={readOnly}
            />
          ) : isGovernanca ? (
            <GovernancaTab
              opportunity={opportunity}
              risks={risks}
              notes={notes}
              documents={documents}
              history={history}
              tasks={tasks}
              assignees={assignees}
              sub={govSub}
              onSubChange={setGovSub}
              readOnly={readOnly}
            />
          ) : isSolucao ? (
            tabContent
          ) : (
            <div className="bg-wh border border-bdr rounded-xl shadow-sm overflow-hidden min-h-[55vh]">
              {tabContent}
            </div>
          )}
        </div>

        {isTarefas && (
          <aside className="w-full xl:w-[340px] xl:shrink-0">
            <SummarySidebar
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

  // Cronograma, Risco, Documentos e Histórico têm sua própria interatividade
  // (CRUD inline gated só por `readOnly`) — independem do fluxo global
  // Editar/Salvar (D-12) e por isso NÃO fazem parte do payload de
  // updateOpportunity. "Cronograma" é a antiga aba "Fases", renomeada.
  if (tab === 'cronograma')
    return <FasesTab opportunity={opp} phases={phases} readOnly={readOnly} />;

  // ── Modo LEITURA: abas de display do Plan 04 (inalteradas) ────────────────
  if (!editMode) {
    switch (tab) {
      case 'processo':
        return <ProcessoAtualTab opportunity={opp} />;
      case 'solucao':
        return <SolucaoTab opportunity={opp} />;
      default:
        return null;
    }
  }

  // ── Modo EDIÇÃO: bodies puros do wizard contra UM payload (Shared Pattern D) ─
  switch (tab) {
    case 'processo':
      return (
        <div className="bg-wh border border-bdr rounded-xl shadow-sm px-5 py-4">
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

          {/* Os 8 critérios são o DIAGNÓSTICO deste processo — editam-se no
              mesmo formulário, não numa aba à parte. */}
          <div className="mt-4 pt-4 border-t border-bdr">
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Diagnóstico de automação
            </div>
            <CriteriosStep data={form} onChange={patch} errors={errors} />
          </div>

          {/* Os 5 fatores de priorização fecham a avaliação: critérios dizem se
              dá para automatizar, os fatores dizem em que ordem entra. Score e
              faixa continuam DISPLAY-only — nunca inputs (D-15). */}
          <div className="mt-4 pt-4 border-t border-bdr">
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Fatores de priorização
            </div>
            <PriorizacaoStep data={form} onChange={patch} errors={errors} />
          </div>
        </div>
      );
    case 'solucao':
      return (
        <div className="bg-wh border border-bdr rounded-xl shadow-sm px-5 py-4 space-y-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Objetivo do Projeto
            </div>
            {/* MESMO campo editado na Visão Geral: um só `objetivo_projeto`,
                dois lugares de edição, zero chance de divergirem. */}
            <textarea
              value={form.objetivo_projeto ?? ''}
              onChange={(e) => patch({ objetivo_projeto: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder="Para que este projeto existe e o que a automação faz, em linguagem de negócio."
              className="w-full px-3 py-2 border border-bdr rounded-lg text-[13px] bg-bg text-txt leading-relaxed"
            />
            <p className="text-[10px] text-mut mt-1">
              O mesmo texto aparece na Visão Geral.
            </p>
          </div>

          {/* 0055 — multi-seleção sobre o catálogo `automation_tools`. */}
          <ToolPicker
            value={form.ferramentas ?? []}
            onChange={(next) => patch({ ferramentas: next })}
            opportunityId={opp.id}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                Fora do Escopo
              </div>
              <DynamicList
                items={form.fora_escopo ?? ['']}
                onChange={(next) => patch({ fora_escopo: next })}
                placeholder="Ex: Integração com o sistema legado Y"
                addLabel="+ Adicionar exclusão"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Critérios de Aceite
            </div>
            <DynamicList
              items={form.criterios_aceite ?? ['']}
              onChange={(next) => patch({ criterios_aceite: next })}
              placeholder="Ex: Relatório gerado em até 5 minutos"
              addLabel="+ Adicionar critério"
            />
          </div>

          {/* Benefícios: a pontuação das 8 dimensões e o texto livre ficam
              JUNTOS, no mesmo lugar em que são exibidos. Antes a lista era
              editada aqui e mostrada na aba Benefícios — display e edição em
              telas diferentes é como um dos dois envelhece sem ninguém notar. */}
          <div className="pt-3 border-t border-bdr">
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

          <BeneficiosStep data={form} onChange={patch} />

        </div>
      );
    default:
      return null;
  }
}
