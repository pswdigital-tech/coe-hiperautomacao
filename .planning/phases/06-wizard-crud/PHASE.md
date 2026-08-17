---
phase: 06-wizard-crud
status: ready_to_execute
total_plans: 3
waves: 3
---

# Phase 6 — Wizard CRUD (Criar + Editar)

## Goal

Botão **"Nova Oportunidade"** na toolbar abre wizard multi-step que cria persona ou formulário no banco. Botão **"Editar"** no header do modal reusa o **mesmo wizard** pré-preenchido com os dados atuais, permitindo update completo do registro. Submissão chama Server Action que persiste + revalida.

## Decisão de UX importante

O mockup tem **dois patterns distintos**: wizard pra criar + "edit mode inline" no modal (lines 904-1052). Vamos **divergir do mockup nesse ponto** — usar o **mesmo wizard pra criar e editar**:

- **Vantagem**: um caminho de código, validação unificada, menos bugs
- **Custo**: edit ficar fora do modal (abre wizard sobre tudo) — vai contra o feel do mockup
- **Mitigação**: botão "Editar" no header do modal abre wizard em cima do modal (z-index maior); ao fechar, modal continua visível

Se ficar ruim na prática, refatorar pra inline edit em fase futura (Phase 8 polish). **Documentar essa decisão em SUMMARY.**

## Estrutura de execução (3 plans, 3 waves)

```
Wave 1  ──────────────────►  06-01: Backend (Server Actions + Zod schemas)
                              (lib/opportunities/schema.ts, actions.ts +=
                               createOpportunity, updateOpportunity)

Wave 2  ──────────────────►  06-02: Wizard de Criação (UI completa)
                              (WizardShell + state mgmt + 6 step components
                               + botão "Nova Oportunidade" na toolbar +
                               submit que chama createOpportunity)

Wave 3  ──────────────────►  06-03: Modo Edição (reusar wizard) + checkpoint
                              (botão "Editar" no modal abre wizard pré-preenchido,
                               submit chama updateOpportunity)
```

## Must-haves

**Truths observáveis:**
- Toolbar tem botão verde "➕ Nova Oportunidade" à direita dos botões de view
- Click no botão abre wizard sobre a página atual
- Wizard tem **step 0 universal**: escolher tipo (persona vs formulário). Próximos steps mudam conforme tipo escolhido
- Wizard de **persona**: 5 steps depois da escolha — Identificação, Processo, Automação, Priorização, Contexto
- Wizard de **formulário**: 6 steps — Identificação, Processo, Automação, Critérios, Benefícios, Priorização
- Navegação Anterior/Próximo entre steps; preview do score atualizada conforme campos preenchidos
- Validação por step bloqueia avanço se campos obrigatórios vazios
- Submit final cria a oportunidade; aparece imediatamente na lista (revalidatePath)
- Botão "Editar" no header do modal abre o mesmo wizard pré-preenchido
- Update altera os campos no banco e propaga (modal e lista atualizadas)
- Cancelar / fechar wizard descarta mudanças (`router.back()`)

**Artifacts necessários:**
- `lib/opportunities/schema.ts` (Zod schemas: persona, formulario, validação cross-field)
- `lib/opportunities/actions.ts` (+ `createOpportunity`, `updateOpportunity`)
- `components/opportunities/wizard/WizardShell.tsx` (overlay + steps nav + Previous/Next)
- `components/opportunities/wizard/steps/{TipoStep,IdentificacaoStep,ProcessoStep,AutomacaoStep,PriorizacaoStep,ContextoStep,CriteriosStep,BeneficiosStep}.tsx`
- `components/opportunities/wizard/state.ts` (form state shape + helpers)
- `components/opportunities/NovaOportunidadeButton.tsx` (botão na toolbar)
- `components/opportunities/modal/EditButton.tsx` (botão "Editar" no header)
- Update `components/opportunities/toolbar.tsx` (botão Nova Op)
- Update `components/opportunities/modal/Header.tsx` (botão Editar)

**Key links:**
- WizardShell chama `createOpportunity(formData)` ou `updateOpportunity(id, formData)`
- Actions usam Zod pra validar; retornam `{ ok: true, id }` ou `{ ok: false, error, fieldErrors? }`
- Tabela/Cards/Kanban atualizam via `revalidatePath('/opportunities')`

## Out of scope

- **Salvar rascunho** (draft) — wizard é fluxo de uma sessão, sem persistência intermediária
- **Validação assíncrona** (ex: email único) — não relevante; oportunidade não tem unique além de seq_id (auto-gerado)
- **Upload de anexos** — fora do MVP
- **Bulk create** (importar CSV) — pós-MVP
- **Histórico de edições** — pós-MVP

## Decisões prévias

- **Zod pra validação** — schema é fonte da verdade tanto no client (UX imediata) quanto no server (defesa em profundidade)
- **Form state em client puro** (useState) — wizard é fluxo curto, não justifica Zustand/Jotai
- **Persona e formulário compartilham 4 steps** (Identificação, Processo, Automação, Priorização); cada tipo adiciona 1-2 específicos
- **`seq_id` continua auto-gerado pelo trigger SQL** — wizard não toca
- **`tenant_id` injetado server-side** na Server Action via `current_tenant_id()`/`profiles` — client não precisa saber
- **`created_by` preenchido server-side** com `auth.uid()`
- **Após criar**: redirect pra `/opportunities/[novoId]` (abre modal com a oportunidade recém-criada)
- **Após editar**: fechar wizard, modal/lista refresham automaticamente via revalidatePath

## Mapeamento mockup

| Componente | Mockup |
|---|---|
| Botão "Nova Oportunidade" verde | linha 309 |
| FORM_STEPS_PERSONA (5 steps) | linha 1053 |
| FORM_STEPS_FORM (6 steps) | linha 1060 |
| renderStepBase (Identificação) | linha 1142 |
| renderStepProc (Processo) | linha 1241 |
| renderStepAuto (Automação) | linha 1325 |
| renderStepScore (Priorização) | linha 1396 |
| renderStepExtra (Contexto persona) | linha 1480 |
| renderStepCrit (Critérios formulário) | linha 1515 |
| renderStepBen (Benefícios formulário) | linha 1559 |

## Após esta fase

**Phase 7** (Filtros + Busca + Sort + KPIs) — toolbar ganha filtros funcionais; KPI bar recalcula sobre subset; sort interativo nos headers da tabela.
