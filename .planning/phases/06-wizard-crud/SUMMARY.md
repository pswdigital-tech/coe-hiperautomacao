---
phase: 06-wizard-crud
status: complete
completed_at: 2026-05-21
plans_completed: 3
extras: ["delete-opportunity"]
---

# Phase 6 — Wizard CRUD (Criar + Editar + Excluir) · SUMMARY

## Goal atingido

Sistema agora suporta CRUD completo de oportunidades:
- **Criar** via wizard multi-step (botão "➕ Nova Oportunidade" na toolbar)
- **Editar** reutilizando o mesmo wizard (botão "✏️ Editar" no header do modal)
- **Excluir** com popup de confirmação (botão "🗑️ Excluir" no header do modal)

## Plans entregues

| Plan | Entrega | Status |
|---|---|---|
| **06-01** Backend (Zod + Server Actions) | schemas, createOpportunity, updateOpportunity, deleteOpportunity | ✅ |
| **06-02** Wizard de Criação | WizardShell + 8 steps + StepsNav + ScorePreview + rotas + botão toolbar | ✅ aprovado |
| **06-03** Modo Edição | EditButton + rotas /[id]/edit + opportunityToFormData | ✅ aprovado |
| (extra) | DeleteButton + popup confirmação + Server Action delete | ✅ aprovado |

## Estrutura resultante

```
components/opportunities/
├── modal/
│   ├── Header.tsx                  ← agora com [StatusSelector, EditButton, DeleteButton]
│   ├── EditButton.tsx              ← novo
│   └── DeleteButton.tsx            ← novo + popup confirmação inline
└── wizard/
    ├── WizardShell.tsx             ← orquestrador (create | edit)
    ├── StepsNav.tsx                ← nav horizontal
    ├── ScorePreview.tsx            ← banner ao vivo no Priorização step
    ├── state.ts                    ← WizardFormData, stepsFor, validateStep, opportunityToFormData
    └── steps/
        ├── DynamicList.tsx
        ├── fields.tsx              ← TextField/TextareaField/SelectField
        ├── TipoStep.tsx
        ├── IdentificacaoStep.tsx
        ├── ProcessoStep.tsx
        ├── AutomacaoStep.tsx
        ├── PriorizacaoStep.tsx
        ├── ContextoStep.tsx        ← persona-only
        ├── CriteriosStep.tsx       ← formulário-only
        └── BeneficiosStep.tsx      ← formulário-only

lib/opportunities/
├── schema.ts                       ← Zod schemas + discriminated union
└── actions.ts                      ← + create, update, delete

app/(app)/
├── opportunities/
│   ├── new/page.tsx                ← fullscreen criação
│   └── [id]/edit/page.tsx          ← fullscreen edição
└── @modal/
    └── (.)opportunities/
        ├── new/page.tsx            ← intercepting criação
        └── [id]/edit/page.tsx      ← intercepting edição
```

## Descobertas técnicas

- **Discriminated union + Partial** não funciona limpo no client (cada ramo do union perde os campos do outro). Solução: tipo intermediário `WizardFormData` que tem ambos `*_extras` opcionais, filtrado no submit.
- **Intercepting routes pós-delete**: `notFound()` no slot derruba a página inteira. Fix: trocar por `return null` na rota interceptada; manter `notFound()` apenas na rota fullscreen.
- **`router.refresh()` após `router.replace`** garante que o slot do modal re-renderiza com dados atualizados (cache invalidation manual).
- **Zod 4** funciona com Next 16 + Server Actions sem ajuste; `discriminatedUnion('source', [...])` é a forma idiomática de modelar persona vs formulário.

## Must-haves verificados

- ✅ Botão "Nova Oportunidade" abre wizard
- ✅ Persona tem 6 steps, formulário tem 7 steps
- ✅ Validação Zod bloqueia avanço com campos vazios
- ✅ Score preview atualiza em tempo real no step Priorização
- ✅ Finalizar cria + redirect pra modal da nova oportunidade
- ✅ Botão "Editar" no modal abre wizard pré-preenchido (sem step Tipo)
- ✅ "Salvar Alterações" volta pro modal de detalhe atualizado
- ✅ Botão "Excluir" abre popup de confirmação
- ✅ Confirmar exclusão remove + volta pra lista sem 404

## Decisão UX confirmada

**Não replicar "edit mode inline" do mockup** — wizard pra criar + editar deu UX consistente e código mais simples. Se algum cliente reclamar, refatoramos na Phase 8.

## Pendências carregadas

Nenhuma — CRUD completo do MVP entregue.

## Próximo

**Phase 7 — Filtros + Busca + Sort + KPIs reativos**. Toolbar ganha busca livre + 4 dropdowns; KPI bar recalcula sobre subset filtrado; sort interativo nos headers da tabela.
