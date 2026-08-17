'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createStaffOpportunity,
  listTenantProjects,
  type StaffSubmitInput,
} from '@/lib/opportunities/actions';
import type {
  PublicOpportunityOption,
  TenantSummary,
} from '@/lib/tenants/queries';
import {
  IntroStep,
  REQUEST_TYPE_LABEL,
  TYPES_REQUIRING_PROJECT,
  type PublicRequestType,
} from '@/app/r/[slug]/IntroStep';
import { TenantStep } from './TenantStep';
import { computeFteHoras, deriveFteBucket } from '@/lib/opportunities/fte';
import {
  defaultFormData,
  stepsFor,
  validateStep,
  type StepDef,
  type StepId,
  type WizardFormData,
} from '@/components/opportunities/wizard/state';
import { IdentificacaoStep } from '@/components/opportunities/wizard/steps/IdentificacaoStep';
import { ProcessoStep } from '@/components/opportunities/wizard/steps/ProcessoStep';
import { CriteriosStep } from '@/components/opportunities/wizard/steps/CriteriosStep';
import { BeneficiosStep } from '@/components/opportunities/wizard/steps/BeneficiosStep';
import { PriorizacaoStep } from '@/components/opportunities/wizard/steps/PriorizacaoStep';

// =============================================================================
// Registro de oportunidade EM NOME de uma empresa cliente (staff PSW / super-
// admin). PARIDADE LITERAL de etapas com o formulário público (`/r/<slug>`):
// mesmos componentes de step, mesma máquina de estado (`wizard/state.ts`),
// mesma porta de entrada de tipo (`IntroStep`) — importada DAQUELE módulo, e
// não copiada, justamente para que uma evolução do formulário do cliente
// chegue aqui sem ninguém precisar lembrar de replicar.
//
// A ÚNICA diferença de fluxo é a etapa que vem ANTES de tudo: escolher a
// empresa (`TenantStep`). Ela não existe — e não deve existir — no formulário
// público: lá o tenant vem do slug da URL. Por isso ela mora nesta rota, o
// wizard compartilhado não sabe que ela existe, e nada no público muda.
//
// A outra diferença, invisível para quem preenche, é o submit: em vez da RPC
// anônima com Turnstile/BotID (proteções de porta aberta, sem sentido atrás
// do login), vai por `createStaffOpportunity`, que autoriza o tenant-alvo no
// banco e grava `created_by` — a autoria real, que o formulário público não
// tem como registrar.
// =============================================================================

type Props = { tenants: TenantSummary[] };

const STEP_COPY: Record<StepId, { title: string; subtitle: string }> = {
  identificacao: {
    title: 'Identificação',
    subtitle: 'Quem solicitou e qual processo será avaliado.',
  },
  processo: {
    title: 'Sobre o processo',
    subtitle: 'Frequência, volume, sistemas e detalhes operacionais.',
  },
  criterios: {
    title: 'Critérios',
    subtitle: 'Responda os 8 critérios para avaliar o encaixe da automação.',
  },
  beneficios: {
    title: 'Benefícios esperados',
    subtitle: 'Pontue de 1 a 5 cada benefício esperado.',
  },
  priorizacao: {
    title: 'Priorização',
    subtitle: 'Esforço, complexidade e alinhamento estratégico.',
  },
  // ids usados só no mode='edit' — nunca aparecem aqui, mas o Record precisa
  // cobrir o union StepId.
  tipo: { title: '', subtitle: '' },
  classificacao: { title: '', subtitle: '' },
  automacao: { title: '', subtitle: '' },
  contexto: { title: '', subtitle: '' },
};

/** Etapas que antecedem o wizard, nesta ordem. */
type Stage = 'empresa' | 'tipo' | 'wizard';

export function StaffRegisterForm({ tenants }: Props) {
  const router = useRouter();
  const [data, setData] = useState<WizardFormData>(defaultFormData());
  const [stage, setStage] = useState<Stage>('empresa');

  // Etapa 1 — empresa
  const [tenantId, setTenantId] = useState<string | null>(
    tenants.length === 1 ? tenants[0].id : null,
  );
  const [tenantError, setTenantError] = useState<string | null>(null);

  // Etapa 2 — tipo (idêntica ao público)
  const [requestType, setRequestType] = useState<PublicRequestType | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [introError, setIntroError] = useState<string | null>(null);
  const [projects, setProjects] = useState<PublicOpportunityOption[]>([]);

  const [stepIdx, setStepIdx] = useState(0);
  const [reachedIdx, setReachedIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const steps: StepDef[] = stepsFor('formulario', 'create');
  const currentStep = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const copy = currentStep ? STEP_COPY[currentStep.id] : undefined;
  const tenant = tenants.find((t) => t.id === tenantId) ?? null;

  // Empresa e Tipo contam como passos 1 e 2 na barra e no tracker.
  const totalSteps = steps.length + 2;
  const displayIdx =
    stage === 'empresa' ? 0 : stage === 'tipo' ? 1 : stepIdx + 2;
  const progressPct = ((displayIdx + 1) / totalSteps) * 100;
  const needsProject =
    requestType != null && TYPES_REQUIRING_PROJECT.includes(requestType);

  function patch(p: Partial<WizardFormData>) {
    setData((d) => ({ ...d, ...p }));
    setErrors({});
  }

  /** Confirma a empresa e carrega as automações dela (seletor de projeto). */
  function confirmTenant() {
    if (!tenantId) {
      setTenantError('Escolha a empresa deste registro.');
      return;
    }
    setTenantError(null);
    setStage('tipo');
    // As automações do seletor de projeto dependem da empresa escolhida — só
    // dá para buscá-las agora. Falha vira lista vazia: o IntroStep já trata
    // "não há automações cadastradas" sem travar ninguém.
    const slug = tenants.find((t) => t.id === tenantId)?.slug;
    if (!slug) return;
    startTransition(async () => {
      try {
        setProjects(await listTenantProjects(slug));
      } catch {
        setProjects([]);
      }
    });
  }

  function validateCurrent(): { ok: boolean; errors: Record<string, string> } {
    if (!currentStep) return { ok: true, errors: {} };
    const base = validateStep(currentStep.id, data);
    return base.ok
      ? { ok: true, errors: {} }
      : { ok: false, errors: { ...base.errors } };
  }

  function next() {
    if (!currentStep) return;
    const v = validateCurrent();
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    const nextIdx = Math.min(stepIdx + 1, steps.length - 1);
    setStepIdx(nextIdx);
    if (nextIdx > reachedIdx) setReachedIdx(nextIdx);
  }

  function prev() {
    setErrors({});
    if (stage === 'tipo') {
      setStage('empresa');
      return;
    }
    if (stepIdx === 0) {
      setStage('tipo');
      return;
    }
    setStepIdx(stepIdx - 1);
  }

  /** Índice na numeração de exibição (0 = empresa, 1 = tipo). */
  function jump(displayTarget: number) {
    setErrors({});
    if (displayTarget === 0) {
      setStage('empresa');
      return;
    }
    if (displayTarget === 1) {
      // Só alcançável depois que a empresa foi confirmada.
      if (tenantId) setStage('tipo');
      return;
    }
    const i = displayTarget - 2;
    if (requestType && i <= reachedIdx) {
      setStepIdx(i);
      setStage('wizard');
    }
  }

  /** Confirma o tipo e entra no wizard (mesma regra do público). */
  function startWizard() {
    if (!requestType) {
      setIntroError('Escolha o tipo da solicitação.');
      return;
    }
    if (needsProject && projects.length > 0 && !parentId) {
      setIntroError('Selecione a automação a que a solicitação se refere.');
      return;
    }
    setIntroError(null);
    setStage('wizard');
  }

  function buildPayload(): StaffSubmitInput {
    // FTE CALCULADO (execuções/mês × horas/execução × pessoas), não digitado —
    // mesma fn do display em Priorização → display === persistência.
    const fteHoras = computeFteHoras({
      execucoesMes: data.execucoes_mes,
      tempo: data.tempo,
      tempoExecucao: data.tempo_execucao,
      numPessoas: data.num_pessoas,
    });
    const fteBucket = fteHoras != null ? deriveFteBucket(fteHoras) : null;

    return {
      request_type: requestType ?? 'nova_oportunidade',
      parent_opportunity_id: needsProject ? parentId : null,
      solicitante: (data.solicitante ?? '').trim(),
      email: (data.email ?? '').trim() || undefined,
      area: (data.area ?? '').trim(),
      subarea: (data.subarea ?? '').trim() || undefined,
      processo: (data.processo ?? '').trim(),
      frequencia: (data.frequencia ?? '').trim() || undefined,
      volume_medio: (data.volume_medio ?? '').trim() || undefined,
      tempo_execucao: (data.tempo_execucao ?? '').trim() || undefined,
      num_pessoas: (data.num_pessoas ?? '').trim() || undefined,
      ferramenta: data.ferramenta ?? null,
      tempo: data.tempo,
      esforco: data.esforco,
      complexidade: data.complexidade,
      objetivo: data.objetivo ?? 3,
      criterios: data.criterios ?? null,
      beneficios: data.beneficios ?? null,
      fte_horas: fteHoras,
      fte: fteBucket,
      responsavel: (data.responsavel ?? '').trim() || undefined,
      criticidade: data.criticidade ?? null,
      execucoes_mes: data.execucoes_mes ?? null,
      formulario_extras: {
        tipo_processo: data.formulario_extras?.tipo_processo || undefined,
        sistemas: data.formulario_extras?.sistemas || undefined,
        descricao: data.formulario_extras?.descricao || undefined,
        gatilho: data.formulario_extras?.gatilho || undefined,
        formato_entrada: data.formulario_extras?.formato_entrada || undefined,
        dor: data.formulario_extras?.dor || undefined,
        dados_sensiveis: data.formulario_extras?.dados_sensiveis || undefined,
      },
    };
  }

  function submit() {
    const v = validateCurrent();
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    if (!tenantId) {
      setStage('empresa');
      setTenantError('Escolha a empresa deste registro.');
      return;
    }
    setSubmitError(null);

    const input = buildPayload();
    startTransition(async () => {
      try {
        const result = await createStaffOpportunity(tenantId, input);
        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }
        setCreatedId(result.id);
      } catch {
        setSubmitError(
          'Não foi possível registrar agora. Recarregue a página e tente novamente.',
        );
      }
    });
  }

  function resetAll() {
    setData(defaultFormData());
    setStepIdx(0);
    setReachedIdx(0);
    setCreatedId(null);
    setRequestType(null);
    setParentId(null);
    setIntroError(null);
    setSubmitError(null);
    // A empresa é mantida: registrar várias demandas da MESMA empresa em
    // sequência (saída de workshop) é o caso comum. Quem quiser trocar volta
    // ao passo 1 pelo tracker.
    setStage('tipo');
  }

  if (createdId) {
    return (
      <div className="max-w-lg mx-auto mt-10 bg-wh rounded-2xl border border-bdr shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-acc to-emerald-600 text-white px-8 py-10 text-center">
          <div className="text-6xl mb-3">✅</div>
          <h1 className="text-2xl font-extrabold">Oportunidade registrada</h1>
          <p className="text-sm opacity-90 mt-1.5">
            {requestType ? REQUEST_TYPE_LABEL[requestType] : 'Solicitação'} ·{' '}
            {tenant?.name}
          </p>
        </div>
        <div className="p-8 text-center space-y-4">
          <p className="text-[15px] text-txt leading-relaxed">
            Ela já está no pipeline da empresa <strong>{tenant?.name}</strong>,
            com status <strong>Novo</strong>.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => router.push(`/opportunities/${createdId}`)}
              className="px-5 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
            >
              Abrir oportunidade
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="px-5 py-2.5 bg-bg border border-bdr hover:bg-slate-100 dark:hover:bg-slate-800 text-txt text-sm font-semibold rounded-lg"
            >
              ➕ Registrar outra
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md:flex md:gap-8">
      {/* Tracker vertical (desktop) — Empresa e Tipo à frente dos 5 steps. */}
      <nav className="hidden md:block w-56 shrink-0 space-y-1 pt-2">
        {[
          { id: '__empresa', label: 'Empresa', icon: '🏢' },
          { id: '__tipo', label: 'Tipo', icon: '🔀' },
          ...steps,
        ].map((s, i) => {
          const isActive = i === displayIdx;
          const isDone = i < displayIdx;
          const reachable =
            i === 0 ||
            (i === 1 && !!tenantId) ||
            (i >= 2 && !!requestType && i - 2 <= reachedIdx);
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reachable}
              onClick={() => jump(i)}
              className={
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ' +
                (isActive
                  ? 'bg-pri/10 text-pri font-bold'
                  : reachable
                    ? 'text-txt hover:bg-bg cursor-pointer'
                    : 'text-mut opacity-50 cursor-not-allowed')
              }
            >
              <span
                className={
                  'w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ' +
                  (isActive
                    ? 'bg-pri text-white'
                    : isDone
                      ? 'bg-acc text-white'
                      : 'bg-bg border border-bdr text-mut')
                }
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 max-w-2xl">
        {/* Progresso */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-mut">
              Passo {displayIdx + 1} de {totalSteps}
            </span>
            {tenant && (
              <span className="text-[11px] font-semibold text-pri">
                🏢 {tenant.name}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full bg-bg rounded-full overflow-hidden border border-bdr">
            <div
              className="h-full bg-gradient-to-r from-pri to-pril transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {stage === 'empresa' ? (
          <TenantStep
            tenants={tenants}
            selectedId={tenantId}
            error={tenantError}
            onSelect={(id) => {
              setTenantId(id);
              setTenantError(null);
              // Trocar de empresa invalida o vínculo de projeto: o parent
              // escolhido é de OUTRO tenant e a RPC o descartaria em silêncio.
              setParentId(null);
              setProjects([]);
            }}
            onContinue={confirmTenant}
          />
        ) : stage === 'tipo' ? (
          <IntroStep
            requestType={requestType}
            parentId={parentId}
            projects={projects}
            error={introError}
            onSelectType={(t) => {
              setRequestType(t);
              setIntroError(null);
              if (!TYPES_REQUIRING_PROJECT.includes(t)) setParentId(null);
            }}
            onSelectParent={(id) => {
              setParentId(id);
              setIntroError(null);
            }}
            onContinue={startWizard}
          />
        ) : (
          <>
            {copy && (
              <div className="mb-5">
                {requestType && (
                  <span className="inline-block mb-2 px-2.5 py-1 rounded-full bg-pri/10 text-pri text-[11px] font-bold">
                    {REQUEST_TYPE_LABEL[requestType]}
                  </span>
                )}
                <h2 className="text-xl md:text-2xl font-extrabold text-txt leading-tight">
                  {copy.title}
                </h2>
                <p className="text-sm text-mut mt-1">{copy.subtitle}</p>
                {errors.processo && currentStep?.id === 'processo' ? (
                  <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
                    {errors.processo}
                  </div>
                ) : null}
              </div>
            )}

            <div>{renderStep(currentStep?.id, data, patch, errors)}</div>

            {submitError && (
              <div className="mt-5 text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
                {submitError}
              </div>
            )}
          </>
        )}

        {/* Navegação — a etapa de empresa e a de tipo trazem o próprio
            "Continuar"; aqui é só o par Anterior/Próximo do wizard. */}
        {stage === 'wizard' && (
          <footer className="mt-8 pt-5 border-t border-bdr flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={prev}
              disabled={pending}
              className="px-4 py-2.5 bg-bg border border-bdr hover:bg-slate-100 dark:hover:bg-slate-800 text-txt text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              ← Anterior
            </button>
            {!isLast ? (
              <button
                type="button"
                onClick={next}
                className="px-6 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
              >
                Próximo →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="px-7 py-2.5 bg-acc hover:opacity-90 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                {pending ? 'Registrando...' : '✓ Registrar oportunidade'}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function renderStep(
  id: StepId | undefined,
  data: WizardFormData,
  patch: (p: Partial<WizardFormData>) => void,
  errors: Record<string, string>,
) {
  if (!id) return null;
  // Fluxo de CRIAÇÃO → campos AI-owned ocultos e FTE calculado, idêntico ao
  // formulário público e ao WizardShell mode='create'.
  switch (id) {
    case 'identificacao':
      return <IdentificacaoStep data={data} onChange={patch} errors={errors} />;
    case 'processo':
      return <ProcessoStep data={data} onChange={patch} hideEnriched />;
    case 'criterios':
      return <CriteriosStep data={data} onChange={patch} errors={errors} />;
    case 'beneficios':
      return <BeneficiosStep data={data} onChange={patch} hideEnriched />;
    case 'priorizacao':
      return (
        <PriorizacaoStep data={data} onChange={patch} errors={errors} hideEnriched />
      );
    default:
      return null;
  }
}
