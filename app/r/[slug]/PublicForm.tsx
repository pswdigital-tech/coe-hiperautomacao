'use client';

import { useRef, useState, useTransition } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import {
  createPublicOpportunity,
  type PublicSubmitInput,
} from '@/lib/opportunities/actions';
import type { PublicOpportunityOption, PublicTenant } from '@/lib/tenants/queries';
import {
  IntroStep,
  REQUEST_TYPE_LABEL,
  TYPES_REQUIRING_PROJECT,
  type PublicRequestType,
} from './IntroStep';
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

// Paridade literal com o fluxo autenticado da home (WizardShell mode='create',
// Phase 11/D-04): mesmos 5 steps, mesmos componentes de step, mesma máquina de
// estado (state.ts). Muda só o CHROME — aqui é uma PÁGINA pública split de duas
// colunas (não o modal flutuante da home) — e a action de submit (RPC anônima).
// Antes do wizard há a porta de entrada (IntroStep, 2026-07-31): tipo da
// solicitação e, em Melhoria/Incidente, a automação existente a que ela se
// refere. Ela NÃO é um step do wizard — mora no estado local desta página, para
// não mexer na máquina de estado compartilhada com o modal autenticado.

type Props = {
  tenant: PublicTenant;
  siteKey: string;
  /** Automações do tenant oferecidas no seletor de projeto (0035). */
  projects: PublicOpportunityOption[];
};

// Título + subtítulo por step (o chrome público; os componentes de step não
// renderizam heading próprio). Melhora a orientação de quem preenche de fora.
const STEP_COPY: Record<StepId, { title: string; subtitle: string }> = {
  identificacao: {
    title: 'Identificação',
    subtitle: 'Quem está registrando e qual processo será avaliado.',
  },
  processo: {
    title: 'Sobre o processo',
    subtitle: 'Frequência, volume, sistemas e detalhes operacionais.',
  },
  criterios: {
    title: 'Critérios',
    subtitle: 'Responda os 8 critérios para avaliarmos o encaixe da automação.',
  },
  beneficios: {
    title: 'Benefícios esperados',
    subtitle: 'Pontue de 1 a 5 cada benefício esperado.',
  },
  priorizacao: {
    title: 'Priorização',
    subtitle: 'Esforço, complexidade e alinhamento estratégico.',
  },
  // ids usados só no mode='edit' — nunca aparecem no fluxo público, mas o
  // Record precisa cobrir o union StepId.
  tipo: { title: '', subtitle: '' },
  classificacao: { title: '', subtitle: '' },
  automacao: { title: '', subtitle: '' },
  contexto: { title: '', subtitle: '' },
};

export function PublicForm({ tenant, siteKey, projects }: Props) {
  const [data, setData] = useState<WizardFormData>(defaultFormData());
  // Porta de entrada — `started` false enquanto o tipo não for confirmado.
  const [started, setStarted] = useState(false);
  const [requestType, setRequestType] = useState<PublicRequestType | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [introError, setIntroError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [reachedIdx, setReachedIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  // Phase 7.5 Bloco D — Turnstile invisível. Token gerado por challenge,
  // passado como 3º param ao Server Action. Single-use → reset após submit.
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  // Fluxo único de criação (paridade): 5 steps, independe de source.
  const steps: StepDef[] = stepsFor('formulario', 'create');
  const currentStep = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const copy = currentStep ? STEP_COPY[currentStep.id] : undefined;

  // A porta de entrada conta como passo 1 na barra e no tracker — para quem
  // preenche, "escolher o tipo" é um passo como qualquer outro.
  const totalSteps = steps.length + 1;
  const displayIdx = started ? stepIdx + 1 : 0;
  const progressPct = ((displayIdx + 1) / totalSteps) * 100;
  const needsProject =
    requestType != null && TYPES_REQUIRING_PROJECT.includes(requestType);

  function patch(p: Partial<WizardFormData>) {
    setData((d) => ({ ...d, ...p }));
    setErrors({});
  }

  // Validação do step atual + regra ESPECÍFICA do público: e-mail é OBRIGATÓRIO
  // (a RPC create_public_opportunity exige — é o contato do solicitante). No
  // wizard da home o e-mail é opcional, por isso a regra vive só aqui.
  function validateCurrent(): { ok: boolean; errors: Record<string, string> } {
    if (!currentStep) return { ok: true, errors: {} };
    const base = validateStep(currentStep.id, data);
    const errs: Record<string, string> = base.ok ? {} : { ...base.errors };
    if (currentStep.id === 'identificacao' && !errs.email) {
      if (!data.email || data.email.trim() === '') {
        errs.email = 'E-mail obrigatório';
      }
    }
    return { ok: Object.keys(errs).length === 0, errors: errs };
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
    // Voltar do primeiro step do wizard devolve à porta de entrada (o tipo e o
    // projeto continuam escolhidos — nada é perdido).
    if (stepIdx === 0) {
      setStarted(false);
      return;
    }
    setStepIdx(stepIdx - 1);
  }

  /** Índice na numeração de exibição (0 = porta de entrada). */
  function jump(displayTarget: number) {
    if (displayTarget === 0) {
      setErrors({});
      setStarted(false);
      return;
    }
    const i = displayTarget - 1;
    if (i <= reachedIdx) {
      setErrors({});
      setStepIdx(i);
      setStarted(true);
    }
  }

  /** Confirma a porta de entrada e entra no wizard. */
  function startWizard() {
    if (!requestType) {
      setIntroError('Escolha o tipo da sua solicitação.');
      return;
    }
    // Projeto só é exigível quando há projeto para escolher — tenant sem
    // automações cadastradas não pode ficar preso na primeira tela.
    if (needsProject && projects.length > 0 && !parentId) {
      setIntroError('Selecione a automação a que a solicitação se refere.');
      return;
    }
    setIntroError(null);
    setStarted(true);
  }

  function buildPayload(): PublicSubmitInput {
    // FTE CALCULADO (execuções/mês × horas/execução × pessoas), não digitado —
    // mesma fn do display em Priorização → display === persistência. (Idêntico
    // ao submit do WizardShell no fluxo create.)
    const fteHoras = computeFteHoras({
      execucoesMes: data.execucoes_mes,
      tempo: data.tempo,
      tempoExecucao: data.tempo_execucao,
      numPessoas: data.num_pessoas,
    });
    const fteBucket = fteHoras != null ? deriveFteBucket(fteHoras) : null;

    return {
      // Porta de entrada — a RPC valida o parent contra o tenant do slug e
      // ignora id alheio; o vínculo só é enviado nos tipos que o pedem.
      request_type: requestType ?? 'nova_oportunidade',
      parent_opportunity_id: needsProject ? parentId : null,
      solicitante: (data.solicitante ?? '').trim(),
      email: (data.email ?? '').trim(),
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
      // v0.2 first-class — sobrevivem ao enrichment (IA não toca).
      criterios: data.criterios ?? null,
      beneficios: data.beneficios ?? null,
      fte_horas: fteHoras,
      fte: fteBucket,
      // v0.3 operacionais — paridade literal com a home.
      responsavel: (data.responsavel ?? '').trim() || undefined,
      criticidade: data.criticidade ?? null,
      execucoes_mes: data.execucoes_mes ?? null,
      formulario_extras: {
        tipo_processo: data.formulario_extras?.tipo_processo || undefined,
        sistemas: data.formulario_extras?.sistemas || undefined,
        // Discovery v2 — perguntas de levantamento (viram insumo do enrichment).
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
    // Backstop: e-mail é exigido pela RPC. Se o usuário voltou e apagou depois de
    // passar pela Identificação, leva de volta ao step com mensagem clara (em vez
    // de deixar a RPC devolver o erro genérico).
    const emailOk =
      !!data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    if (!emailOk) {
      const idIdx = steps.findIndex((s) => s.id === 'identificacao');
      if (idIdx >= 0) setStepIdx(idIdx);
      setErrors({ email: 'E-mail obrigatório' });
      setSubmitError('Informe um e-mail válido para enviarmos o retorno.');
      return;
    }
    setSubmitError(null);

    // Phase 7.5 Bloco D — exige token Turnstile quando o widget estiver
    // configurado. Se `siteKey` não existir (deploy temporário), não bloqueia
    // o submit por token — a validação server-side também pode ser pulada.
    if (siteKey && !turnstileToken) {
      turnstileRef.current?.execute();
      setSubmitError('Aguarde a verificação anti-bot e tente novamente.');
      return;
    }

    const input = buildPayload();

    startTransition(async () => {
      try {
        const result = await createPublicOpportunity(
          tenant.slug,
          input,
          turnstileToken,
        );
        // Token é single-use — Cloudflare retorna `timeout-or-duplicate` se reusado.
        // Sempre resetar após resposta, mesmo em erro.
        turnstileRef.current?.reset();
        setTurnstileToken('');

        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }
        setSubmitted(true);
      } catch {
        // Falha fora do protocolo da action (BotID/script bloqueado, rede,
        // deploy no meio) — erro inline em vez do error boundary global.
        turnstileRef.current?.reset();
        setTurnstileToken('');
        setSubmitError(
          'Não foi possível enviar agora. Recarregue a página e tente novamente.'
        );
      }
    });
  }

  const initials = tenant.name.slice(0, 2).toUpperCase();

  if (submitted) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-wh rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
          <div className="bg-gradient-to-br from-acc to-emerald-600 text-white px-8 py-10 text-center">
            <div className="text-6xl mb-3">✅</div>
            <h1 className="text-2xl font-extrabold">Obrigado!</h1>
            <p className="text-sm opacity-90 mt-1.5">
              {requestType
                ? `Sua solicitação (${REQUEST_TYPE_LABEL[requestType]}) foi registrada.`
                : 'Sua solicitação foi registrada.'}
            </p>
          </div>
          <div className="p-8 text-center space-y-4">
            <p className="text-[15px] text-txt leading-relaxed">
              O time do CoE de Hiperautomação da <strong>{tenant.name}</strong> vai
              analisar sua solicitação. Se precisar, entrarão em contato pelo
              e-mail <strong>{data.email}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                setData(defaultFormData());
                setStepIdx(0);
                setReachedIdx(0);
                setSubmitted(false);
                // Volta à porta de entrada — a nova solicitação pode ser de
                // outro tipo, então tipo e projeto também zeram.
                setStarted(false);
                setRequestType(null);
                setParentId(null);
                setIntroError(null);
              }}
              className="px-5 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
            >
              ➕ Registrar outra solicitação
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-wh md:flex">
      {/* ─────────────────────────────────────────────────────────────
          Painel de marca (esquerda no desktop, topo no mobile).
          Full-height + sticky no desktop → sensação de página, não card. */}
      <aside className="bg-gradient-to-br from-pri to-pril text-white md:w-[320px] lg:w-[380px] md:shrink-0 md:sticky md:top-0 md:h-screen flex flex-col px-6 py-7 md:px-8 md:py-10">
        <div className="flex items-center gap-3">
          {tenant.logoUrl ? (
            // Logo da empresa (/configuracoes) no lugar das iniciais. <img> e
            // não next/image: host dinâmico do Storage do tenant.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="w-12 h-12 rounded-xl object-contain shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center font-black text-lg backdrop-blur-sm">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight truncate">
              {tenant.name}
            </h1>
            <p className="text-xs opacity-75">CoE de Hiperautomação</p>
          </div>
        </div>

        <div className="mt-6 md:mt-10">
          <h2 className="text-xl md:text-2xl font-extrabold leading-snug">
            Registrar solicitação ao CoE
          </h2>
          <p className="text-sm opacity-80 mt-2 leading-relaxed">
            Nova oportunidade de automação, melhoria, incidente ou treinamento.
            Leva cerca de 2 minutos.
          </p>
        </div>

        {/* Tracker vertical de steps (desktop) — também funciona como progresso. */}
        <nav className="hidden md:block mt-10 space-y-1">
          {[{ id: '__intro', label: 'Tipo', icon: '🔀' }, ...steps].map((s, i) => {
            const isActive = i === displayIdx;
            const isDone = i < displayIdx;
            // A porta de entrada é sempre alcançável (voltar para trocar o tipo).
            const reachable = i === 0 || (started && i - 1 <= reachedIdx);
            return (
              <button
                key={s.id}
                type="button"
                disabled={!reachable}
                onClick={() => jump(i)}
                className={
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ' +
                  (isActive
                    ? 'bg-white/15 font-bold'
                    : reachable
                      ? 'hover:bg-white/10 opacity-90 cursor-pointer'
                      : 'opacity-45 cursor-not-allowed')
                }
              >
                <span
                  className={
                    'w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ' +
                    (isActive
                      ? 'bg-white text-pri'
                      : isDone
                        ? 'bg-acc text-white'
                        : 'bg-white/20 text-white')
                  }
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden md:block mt-auto pt-8 text-[11px] opacity-60 leading-relaxed">
          Suas respostas vão direto para o time do CoE de Hiperautomação da{' '}
          {tenant.name}. Nenhum login necessário.
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          Coluna do formulário (direita). Página que cresce naturalmente. */}
      <section className="flex-1 flex flex-col min-w-0">
        <div className="w-full max-w-2xl mx-auto px-5 py-6 md:px-10 md:py-10 flex-1 flex flex-col">
          {/* Progresso (mobile mostra os números; desktop tem o tracker à esquerda) */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-mut">
                Passo {displayIdx + 1} de {totalSteps}
              </span>
              <span className="text-[11px] font-semibold text-mut md:hidden">
                {started ? `${currentStep?.icon} ${currentStep?.label}` : '🔀 Tipo'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-bg rounded-full overflow-hidden border border-bdr">
              <div
                className="h-full bg-gradient-to-r from-pri to-pril transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {!started ? (
            <IntroStep
              requestType={requestType}
              parentId={parentId}
              projects={projects}
              error={introError}
              onSelectType={(t) => {
                setRequestType(t);
                setIntroError(null);
                // Trocar para um tipo que não pede projeto limpa o vínculo —
                // senão um parent escolhido antes vazaria para o payload.
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
          {/* Cabeçalho do step */}
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
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {errors.processo}
                </div>
              ) : null}
            </div>
          )}

          {/* Corpo do step — mesmos componentes da home. `zoom` aumenta a
              densidade SÓ aqui (não afeta o modal da home, que compartilha os
              mesmos componentes de campo). */}
          <div className="flex-1" style={{ zoom: 1.12 }}>
            {renderStep(currentStep?.id, data, patch, errors)}
          </div>

          {/* Turnstile invisível — roda em background enquanto o usuário avança.
              Renderiza só se `siteKey` estiver configurada. Em deploys sem chave
              ou com chave placeholder o widget é omitido e o server pode optar
              por pular a validação (quando `TURNSTILE_SECRET_KEY` ausente). */}
          {siteKey ? (
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken('')}
              onExpire={() => setTurnstileToken('')}
              options={{ size: 'invisible', appearance: 'interaction-only' }}
            />
          ) : null}

          {submitError && (
            <div className="mt-5 text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
              {submitError}
            </div>
          )}

          {/* Navegação */}
          <footer className="mt-8 pt-5 border-t border-bdr flex items-center justify-between gap-3 flex-wrap">
            {/* Sempre há para onde voltar: do primeiro step, para a escolha do tipo. */}
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
                {pending ? 'Enviando...' : '✓ Enviar solicitação'}
              </button>
            )}
          </footer>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function renderStep(
  id: StepId | undefined,
  data: WizardFormData,
  patch: (p: Partial<WizardFormData>) => void,
  errors: Record<string, string>,
) {
  if (!id) return null;
  // Público é sempre fluxo de CRIAÇÃO → campos AI-owned ocultos e FTE calculado
  // (idêntico ao WizardShell mode='create').
  switch (id) {
    case 'identificacao':
      return (
        <IdentificacaoStep data={data} onChange={patch} errors={errors} emailRequired />
      );
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
