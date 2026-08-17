# Phase 9: Schema Evolution + Score/Risk/Contract Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões são capturadas em 09-CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-06-04
**Phase:** 9 — Schema Evolution + Score/Risk/Contract Foundation
**Areas discussed:** Backfill FGCoop, Forma de armazenar critérios+benefícios, rpaScore (coluna vs derivado + regra), Tipagem da opportunity_risks

---

## Seleção de áreas

| Área | Selecionada |
|------|-------------|
| Backfill dados FGCoop | ✓ |
| Forma de armazenar critérios + benefícios | ✓ |
| rpaScore: coluna vs derivado + a regra | ✓ |
| Tipagem da tabela opportunity_risks | ✓ |

**Escolha do usuário:** todas as 4.

---

## Backfill dados FGCoop

### Backfill de `prioridade.tempo`
| Opção | Selecionada |
|-------|-------------|
| Derivar de `frequencia`; personas → NULL | ✓ |
| Derivar de `frequencia`; personas → 'mensal' | |
| Tudo NULL (re-preencher depois) | |

### Defaults de `fte_horas` / `prioridade.fte` no legado
| Opção | Selecionada |
|-------|-------------|
| fteHoras NULL + fte NULL (fallback score) | ✓ |
| fteHoras 0 + fte 'muito_baixo' | |
| fteHoras NULL + fte 'medio' | |

### Valor de `fonte` no legado
| Opção | Selecionada |
|-------|-------------|
| 'FGCoop' (ou nome do tenant) | ✓ |
| NULL | |
| 'Migração v0.1' | |

**Notas:** Achado-chave durante a discussão — a coluna `frequencia` (texto) já existe e mapeia 1:1 para o novo `tempo`-frequência (Diário/Semanal/Quinzenal/Mensal/Anual idênticos ao vocabulário do `_giba`). 20 formulário têm frequencia; 9 persona não. Critérios remapeiam quase 1:1 (8/8 chaves batem; 2 antigas descartadas; 'NAO'→'nao').

---

## Forma de armazenar critérios + benefícios

### 8 critérios (SIM/NÃO/PARCIAL)
| Opção | Selecionada |
|-------|-------------|
| 8 colunas tipadas (enum) — *recomendada* | |
| 1 jsonb `criterios` (shape + CHECK) | ✓ |

### 8 benefícios (escala 1–5)
| Opção | Selecionada |
|-------|-------------|
| 1 jsonb `beneficios` (shape + CHECK) | ✓ |
| 8 colunas smallint (1–5) | |

### Rótulos dos valores de critério
| Opção | Selecionada |
|-------|-------------|
| lowercase sem acento: sim/nao/parcial | ✓ |
| Exato como exibido: SIM/NÃO/PARCIAL | |

**Notas:** O PO optou por jsonb dedicado em vez das colunas escalares recomendadas. "First-class" (MODEL-06) passa a significar coluna jsonb própria e validada (CHECK), não 8 colunas. Implicação registrada: regra de rpaScore em SQL lê do jsonb (`criterios->>'...'`); plan-checker não deve tratar como gap de MODEL-06.

---

## rpaScore: coluna vs derivado + a regra

### Forma do `rpa_score` no schema
| Opção | Selecionada |
|-------|-------------|
| Coluna GENERATED dos critérios | ✓ |
| Só na view (igual ao score) | |
| Coluna comum + função de derivação | |

### Origem da regra de derivação 0–6
| Opção | Selecionada |
|-------|-------------|
| Engenharia reversa do seed `_giba` | ✓ |
| Eu forneço a regra | |
| Regra simples agora, refinar depois | |

**Notas:** Achado — o `_giba` NÃO contém fórmula de rpaScore; aparece só como dado pronto no seed. GENERATED column resolve a tensão MODEL-02 (armazena) × SCORE-03 (derivado, não manual). Restrição: expressão GENERATED deve ser IMMUTABLE. A regra inferida deve reproduzir os valores do seed (validação p/ Phase 15).

---

## Tipagem da tabela opportunity_risks

### Vocabulário fixo (tipo/impacto/probabilidade/status)
| Opção | Selecionada |
|-------|-------------|
| Enums Postgres | ✓ |
| text + CHECK | |

### `responsavel` (PSW/UnidaSul é tenant-específico)
| Opção | Selecionada |
|-------|-------------|
| text livre (tenant-agnóstico) | ✓ |
| enum global PSW/UnidaSul | |
| enum 'PSW' + 'cliente' | |

### `prioridade` do risco (matriz impacto×probabilidade)
| Opção | Selecionada |
|-------|-------------|
| Coluna GENERATED da matriz | ✓ |
| Computada na view/função | |
| Coluna + trigger | |

**Notas:** `responsavel` text livre evita amarrar o schema ao tenant Unidasul. `priority` GENERATED simétrica com rpa_score. RLS + 4 policies + teste cruzado A≠B obrigatórios.

---

## Executor's Discretion

- Nomes exatos de enums/colunas (convenção snake_case do 0001).
- Rótulos ASCII vs exatos nos enums de risco (pender p/ ASCII salvo conflito com reprodução do `_giba` na P15).
- Índices novos, CHECK preciso dos jsonb, estrutura do handoff de apply manual.

## Deferred Ideas

- Thresholds `fte_horas` → bucket `prioridade.fte` (P11 ou 2º momento).
- IA dos campos derivados (AI-GEN / REALIGN-7.6, fora do v0.2).
- `responsavel` → FK futura.
- Destino das colunas legadas `risco`/`observacao` (0009) vs nova tabela.
