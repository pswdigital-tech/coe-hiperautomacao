---
phase: 04-modal-detalhe
plan: 02
status: complete
completed_at: 2026-05-21
---

# 04-02 — Tabs Persona · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/modal/tabs/Field.tsx` | Helper `<Field label value multiline hideIfEmpty>` reutilizado pelos tabs de detalhe |
| `components/opportunities/modal/tabs/PerfilTab.tsx` | Grid 2 cols: Cargo, Tempo na Função, Localidade, Sistemas / Objetivos, Métricas, Dados; full-width: Papel, Responsável, Notas |
| `components/opportunities/modal/tabs/DesafiosTab.tsx` | Desafios + Automação Atual (ambos multiline) |
| `components/opportunities/modal/tabs/CoeTab.tsx` | Expectativas, Priorização Indicada, Observações (hideIfEmpty) |
| `components/opportunities/modal/OpportunityDetail.tsx` | Switch case dos 3 tabs persona |

## Decisões

- **`Field` helper** centraliza tratamento de em-dash, multiline, hideIfEmpty — evita duplicação nos 3 tabs
- **Fallback `cargo`** → `subarea` quando JSONB não tem cargo (mockup faz isso na linha 695)
- **`responsavel` e `notas` ficam ocultos quando vazios** (não vai mostrar em-dash pra slots operacionais não preenchidos)

## Validação

- `npm run typecheck` ✅
