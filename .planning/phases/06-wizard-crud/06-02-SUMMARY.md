---
phase: 06-wizard-crud
plan: 02
status: complete
completed_at: 2026-05-21
---

# 06-02 — Wizard de Criação · SUMMARY

## Entregue

Wizard completo de criação (6 steps persona / 7 steps formulário).

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/wizard/state.ts` | `WizardFormData` (intersecção dos dois ramos do union), `stepsFor`, `defaultFormData`, `validateStep` |
| `components/opportunities/wizard/steps/DynamicList.tsx` | Lista de inputs editáveis (add/remove/edit) |
| `components/opportunities/wizard/steps/fields.tsx` | TextField/TextareaField/SelectField reusáveis |
| `components/opportunities/wizard/steps/TipoStep.tsx` | Step 0: escolha Persona vs Formulário |
| `components/opportunities/wizard/steps/IdentificacaoStep.tsx` | solicitante, email, area, subarea, processo |
| `components/opportunities/wizard/steps/ProcessoStep.tsx` | frequência/volume/tempo/pessoas + extras tipo-específicos |
| `components/opportunities/wizard/steps/AutomacaoStep.tsx` | ferramenta (radio cards) + DynamicList escopo + DynamicList benefícios |
| `components/opportunities/wizard/steps/PriorizacaoStep.tsx` | 4 campos (esforço, complexidade, tempo, objetivo) + ScorePreview ao vivo |
| `components/opportunities/wizard/steps/ContextoStep.tsx` | textareas persona-only (papel, desafios, expectativas, etc.) |
| `components/opportunities/wizard/steps/CriteriosStep.tsx` | 10 toggles tri-estado SIM/NAO/PARCIAL (formulário) |
| `components/opportunities/wizard/steps/BeneficiosStep.tsx` | 8 ratings 1-5 com cor (formulário) |
| `components/opportunities/wizard/StepsNav.tsx` | Nav horizontal com chips numerados + ✓ no concluído |
| `components/opportunities/wizard/ScorePreview.tsx` | Banner azul com score + barra + pill, recalcula em runtime |
| `components/opportunities/wizard/WizardShell.tsx` | Orquestrador: state, validação, navegação, submit |
| `app/(app)/opportunities/new/page.tsx` | Fullscreen do wizard (acesso direto) |
| `app/(app)/@modal/(.)opportunities/new/page.tsx` | Intercepting route (click na toolbar) |
| `components/opportunities/toolbar.tsx` | + botão verde "➕ Nova Oportunidade" |

## Decisões

- **`WizardFormData` como intersecção** — tipo discriminated union `OpportunityInput` não permite Partial limpo com ambos `*_extras` ao mesmo tempo. Wizard mantém ambos no estado e filtra um conforme `source` ao submeter.
- **Validação Zod no client (parcial) + server (completa)** — validateStep só checa campos do step atual com lógica manual; Server Action faz parse completo via Zod
- **Steps reachable progressively** — usuário só pode pular pra step que já visitou; previne navegar pra step "vazio" no meio do fluxo
- **ScorePreview client-side puro** — não chama o banco; replica fórmula `opportunity_score` localmente. Garante feedback instantâneo
- **Submit cria + redireciona pro modal da nova oportunidade** — `router.replace('/opportunities/[id]')` mostra ela aberta direto, ótima UX

## Extensão not-no-plan: DeleteButton

Adicionado fora do escopo planejado:
- `lib/opportunities/actions.ts` → `deleteOpportunity(id)`
- `components/opportunities/modal/DeleteButton.tsx` (com popup de confirmação inline)
- Plugado no Header do modal

Bug fix relacionado: o `notFound()` no intercepting route do modal derrubava a página depois do delete. Trocado por `return null` (graceful) — mantém `notFound()` apenas no fullscreen.

## Validação

- `npm run typecheck` ✅
- `npm run build` ✅ (10 rotas geradas, incluindo intercepting `/(.)opportunities/new`)
- **Checkpoint visual: APROVADO** pelo usuário (com pequeno fix do delete)
