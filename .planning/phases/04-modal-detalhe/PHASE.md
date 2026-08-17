---
phase: 04-modal-detalhe
status: ready_to_execute
total_plans: 4
waves: 3
---

# Phase 4 — Modal de Detalhe (read-only)

## Goal

Usuário clica numa linha da tabela `/opportunities` → abre **modal lateral** sobre a lista mostrando todos os detalhes da oportunidade em **6 abas**, com layout adaptado por `source` (persona vs formulário). URL muda pra `/opportunities/[id]`; refresh nessa URL mostra **fullscreen**; voltar (back) fecha o modal sem perder a posição na lista.

Tudo **read-only nesta fase**. Botão "Editar", dropdown de status no header, e CRUD na aba Fases → ficam pra Phase 5 e 6.

## Padrão técnico: Parallel Routes + Intercepting Routes

Convenção idiomática Next 16 App Router pra modais:

```
app/(app)/
├── layout.tsx                              ← aceita slot `modal`
├── @modal/
│   ├── default.tsx                         ← renderiza null (slot vazio default)
│   └── (.)opportunities/[id]/page.tsx      ← INTERCEPTA link da tabela → modal
└── opportunities/
    ├── page.tsx                            ← lista
    └── [id]/page.tsx                       ← fullscreen (acesso direto/refresh)
```

Mecânica:
- Lista renderiza `<Link href={\`/opportunities/${id}\`}>` ao invés do botão desabilitado
- Click via JS soft-nav → o intercepting `@modal/(.)opportunities/[id]/page.tsx` é montado **em cima** da lista
- Refresh ou acesso direto → cai no `opportunities/[id]/page.tsx` (fullscreen)
- Os dois reusam os **mesmos componentes de tabs** — UI quase idêntica, só o wrapper muda

## Estrutura de execução (4 plans, 3 waves)

```
Wave 1  ──────────────────►  04-01: Foundation
                              (rota /opportunities/[id], parallel routes, modal shell,
                               tabs nav, tabs comuns Automação/Fases/Score)

Wave 2  ──┬───────────────►  04-02: Tabs específicas de Persona
          │                   (Perfil, Desafios, CoE)
          │
          └───────────────►  04-03: Tabs específicas de Formulário
                              (Processo, Critérios, Benefícios)
                              ↑ Wave 2 plans rodam em paralelo (arquivos disjuntos)

Wave 3  ──────────────────►  04-04: Link da tabela + smoke + checkpoint
                              (substituir botão disabled por Link, validar fluxo E2E)
```

## Must-haves

**Truths observáveis:**
- Click em qualquer linha da tabela abre modal sobre a lista (URL muda)
- Modal mostra header com avatar (iniciais), nome, role/área, score circle
- Modal de **persona** tem abas: `Perfil`, `Desafios`, `Automação`, `CoE`, `Fases`, `Score`
- Modal de **formulário** tem abas: `Processo`, `Critérios Técnicos`, `Benefícios`, `Automação`, `Fases`, `Score`
- Aba clicada muda o conteúdo (estado local do modal)
- X / ESC / click no overlay fecham o modal
- Refresh em `/opportunities/[id]` mostra fullscreen (mesma estrutura, sem overlay)
- Voltar do browser (back) fecha o modal sem perder scroll da lista
- Tab "Fases" mostra timeline com 7 fases, todas sem datas (pois `opportunity_phases` está vazia)
- Tab "Score" mostra 4 componentes (esforço, complexidade, tempo, objetivo) + score final + cor
- Tab "Automação" mostra `ferramenta`, lista `escopo_automacao`, lista `beneficios_esperados`

**Artifacts necessários:**
- `app/(app)/opportunities/[id]/page.tsx` (fullscreen fallback)
- `app/(app)/@modal/default.tsx`
- `app/(app)/@modal/(.)opportunities/[id]/page.tsx` (interceptor)
- `app/(app)/layout.tsx` aceita slot `modal`
- `components/opportunities/modal/ModalShell.tsx` (client — overlay, ESC, close)
- `components/opportunities/modal/TabsNav.tsx` (client — estado da aba ativa)
- `components/opportunities/modal/tabs/AutomacaoTab.tsx`
- `components/opportunities/modal/tabs/FasesTab.tsx`
- `components/opportunities/modal/tabs/ScoreTab.tsx`
- `components/opportunities/modal/tabs/PerfilTab.tsx` (persona)
- `components/opportunities/modal/tabs/DesafiosTab.tsx` (persona)
- `components/opportunities/modal/tabs/CoeTab.tsx` (persona)
- `components/opportunities/modal/tabs/ProcessoTab.tsx` (formulário)
- `components/opportunities/modal/tabs/CriteriosTab.tsx` (formulário)
- `components/opportunities/modal/tabs/BeneficiosTab.tsx` (formulário)
- `lib/opportunities/queries.ts` ganha `fetchOpportunityById(id)`
- `components/opportunities/table.tsx` substitui botão por `<Link>`

**Key links:**
- Tabela → `<Link href={\`/opportunities/${id}\`}>` é interceptado pelo `@modal/(.)opportunities/[id]/page.tsx`
- Modal shell consome `opportunity` da query → distribui pros tabs corretos via discriminator `source`

## Out of scope (próximas fases)

- **Botão "Editar"** com edit mode inline → Phase 6 (CRUD)
- **Dropdown de status** que faz UPDATE → Phase 5 (kanban + mudança de status)
- **Edição de datas das fases** (inputs date) → Phase 8 (trigger SQL + UI)
- **Sliders de score editáveis** → Phase 6
- **Botão "Excluir"** → não tem no MVP

## Decisões prévias

- **Modal abre via URL** (parallel + intercepting routes), não state client puro — permite share/bookmark
- **Read-only nesta fase** — sem zero mutações
- **Tabs como state client local** dentro do modal (não query params), pra não poluir URL com `?tab=foo`
- **Header do modal não tem dropdown de status ainda** — mostra StatusBadge estático (read-only)
- **Aba "Fases" sempre aparece**, mesmo que `opportunity_phases` esteja vazia — mostra timeline com 7 phase_keys e estado "não iniciada"
- **Aba "Score"** lê os 4 componentes da própria oportunidade + score da view, sem permitir mudar (sliders desabilitados ou apenas display)

## Mapeamento do mockup → tabs

| Tab no mockup | Source | Campos exibidos | Origem mockup |
|---|---|---|---|
| 👤 Perfil | persona | cargo, tempo_funcao, local, sistemas, objetivos, metricas, dados, papel, responsavel, notas | linha 690-712 |
| ⚠️ Desafios | persona | desafios, automacao_atual | linha 713-719 |
| 🎯 CoE | persona | expectativas, priorizacao_desc, observacoes | linha 729-735 |
| 📋 Processo | formulário | frequencia, volume_medio, tempo_execucao, num_pessoas, email, area, subarea, formulario_extras.tipo_processo, formulario_extras.sistemas, responsavel, notas | linha 749-779 |
| ✅ Critérios | formulário | 10 critérios SIM/NAO/PARCIAL com ícone | linha 781-795 |
| 📈 Benefícios | formulário | 8 benefícios em barra 1-5 com cor | linha 796-808 |
| 🤖 Automação | ambos | ferramenta, escopo_automacao[], beneficios_esperados[] | linha 720-728 (persona), 811-821 (formulário) |
| 📅 Fases | ambos | 7 phase_keys com datas | linha 809-840 |
| 📊 Score | ambos | esforco, complexidade, tempo, objetivo, score final | linha 842-886 |

## Após esta fase

- **Phase 5** (Cards/Kanban + mudança de status) — ativa o dropdown de status no header do modal
- **Phase 6** (Wizard CRUD) — ativa o botão "Editar" no header do modal
