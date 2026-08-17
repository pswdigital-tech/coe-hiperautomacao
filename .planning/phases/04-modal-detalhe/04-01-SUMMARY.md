---
phase: 04-modal-detalhe
plan: 01
status: complete
completed_at: 2026-05-21
---

# 04-01 — Modal Foundation · SUMMARY

## Entregue

| Arquivo | Papel |
|---|---|
| `lib/opportunities/queries.ts` | + `fetchOpportunityById(id)` |
| `lib/opportunities/utils.ts` | `getInitials()`, `scoreColor()` extraídos pra reuso |
| `app/(app)/layout.tsx` | Aceita prop `modal` via `LayoutProps<'/'>` (tipo gerado pelo Next 16) |
| `app/(app)/@modal/default.tsx` | Slot default (retorna null) |
| `app/(app)/opportunities/[id]/page.tsx` | Fullscreen fallback com botão "Voltar" |
| `app/(app)/@modal/(.)opportunities/[id]/page.tsx` | Intercepting route — monta modal sobre a lista |
| `components/opportunities/modal/ModalShell.tsx` | Client: overlay + ESC + click-outside + X + `router.back()` |
| `components/opportunities/modal/Header.tsx` | Header com avatar, nome, role, status badge, score circle |
| `components/opportunities/modal/TabsNav.tsx` | Client: nav de tabs (recebe activeTab + onChange) |
| `components/opportunities/modal/types.ts` | `TabId`, `TabDef` |
| `components/opportunities/modal/OpportunityDetail.tsx` | Client wrapper que gerencia activeTab e renderiza header + nav + tab content |
| `components/opportunities/modal/tabs/AutomacaoTab.tsx` | Comum — ferramenta + escopo + benefícios |
| `components/opportunities/modal/tabs/FasesTab.tsx` | Comum — timeline com 7 fases (vazias por enquanto) |
| `components/opportunities/modal/tabs/ScoreTab.tsx` | Comum — 4 componentes do score + banner final + priority pill |

## Notas técnicas

- **`LayoutProps<'/'>`** é o tipo gerado pelo Next 16 em `.next/dev/types/routes.d.ts`. Inclui automaticamente o slot `modal` porque a pasta `@modal/` existe. Tentar usar tipo manual quebra build.
- **Bloqueio de scroll do body** ao abrir modal — `useEffect` aplica `overflow:hidden` e restaura no cleanup.
- **`router.back()`** ao fechar — preserva histórico, lista mantém scroll. Se usuário acessou direto via URL, back leva pra `/opportunities` igual.
- **Placeholders** nos tabs específicos (perfil/desafios/coe/processo/criterios/beneficios) vão ser substituídos por componentes reais nos plans 04-02 e 04-03.

## Validação

- `npm run typecheck` ✅
- Dev server sobe + rota intercepta corretamente
