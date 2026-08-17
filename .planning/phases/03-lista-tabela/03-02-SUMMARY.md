---
phase: 03-lista-tabela
plan: 02
status: complete
completed_at: 2026-05-21
---

# 03-02 — Cell Components · SUMMARY

## Entregue

[components/opportunities/cells.tsx](../../../components/opportunities/cells.tsx) com 7 Server Components reutilizáveis:

| Componente | Renderiza | Cores |
|---|---|---|
| `SourceBadge` | persona/formulário | violeta / esmeralda |
| `ToolBadge` | RPA/n8n/ambos | violeta / laranja / ciano (tokens `--color-rpa/n8n/both`) |
| `StatusBadge` | 8 status com ícone | extraído literalmente do `STATUS_INFO` do mockup (linhas 388-396) |
| `ComplexityBadge` | Baixa/Média/Alta | verde / amarelo / vermelho |
| `ScoreDisplay` | número + dot colorido | semáforo: ≥70 verde, ≥40 amarelo, <40 vermelho |
| `PriorityPill` | Alta/Média/Baixa | verde / âmbar / vermelho preenchidos |
| `SeqIdDisplay` | `#0001` zero-padded a 4 dígitos | azul `--color-pri` |

## Decisões

- **Sem `'use client'`** — todos são Server Components puros. Reduce JS bundle, melhor performance.
- **Mix de classe Tailwind + CSS vars** intencional: cores de marca via classe; semáforos via var pra trocar tema sem rebuild.
- **Treatment de `null` em ToolBadge/ComplexityBadge**: renderiza `—` (em-dash) ao invés de erro.

## Validação

- `npm run typecheck` ✅
- Tipos de input batem com `Opportunity['source' | 'ferramenta' | 'status' | 'complexidade' | 'priority_level']`
