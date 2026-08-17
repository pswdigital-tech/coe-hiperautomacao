---
phase: 06-wizard-crud
plan: 03
status: complete
completed_at: 2026-05-21
---

# 06-03 — Modo Edição · SUMMARY

## Entregue

Modo edição reutilizando o WizardShell em `mode="edit"`.

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/modal/EditButton.tsx` | Link `/opportunities/[id]/edit` no header do modal |
| `components/opportunities/modal/Header.tsx` | Plugou `<EditButton>` antes do `<DeleteButton>` |
| `components/opportunities/wizard/state.ts` | + `opportunityToFormData(opp)` — converte Row → WizardFormData |
| `app/(app)/opportunities/[id]/edit/page.tsx` | Fullscreen edit (acesso direto/refresh) |
| `app/(app)/@modal/(.)opportunities/[id]/edit/page.tsx` | Intercepting edit (overlay) |

## Decisões

- **Reutilização total do WizardShell** — `mode='edit'` ativa:
  - Skip do step Tipo (source é imutável após criação)
  - Texto "Editar Oportunidade" no header
  - Botão "💾 Salvar Alterações" em vez de "Finalizar"
  - Submit chama `updateOpportunity(id, data)` em vez de `createOpportunity`
  - Em sucesso: `router.back()` (volta pro modal de detalhe, não pra lista)
- **Conversão Row → FormData isolada** em `opportunityToFormData` — Single source of truth, reusada em ambas as rotas (fullscreen e intercepting)
- **`null` → `''`** nos campos texto pra evitar input "uncontrolled" warning do React
- **Intercepting route retorna `null`** se opportunity não existe (mesmo padrão da rota de detalhe + delete fix)

## Validação

- `npm run typecheck` ✅
- `npm run build` ✅ (12 rotas geradas, incluindo `/(.)opportunities/[id]/edit`)
- **Checkpoint visual: APROVADO** pelo usuário
