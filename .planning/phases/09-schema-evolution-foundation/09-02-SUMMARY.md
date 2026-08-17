# Plan 09-02 — Summary

**Plan:** Troca de contrato visual/modelo para v0.2 (`_giba_wsi-dashboard.html`)
**Status:** ✅ Complete
**Requirements:** CONTRACT-01, CONTRACT-02, MODEL-10

## What was built

- **docs/PROJETO.md** atualizado para o contrato v0.2:
  - Intro + §2: `_giba_wsi-dashboard.html` como fonte da verdade visual/modelo; `fgcoop-coe-v2.html` marcado deprecated.
  - §3: fórmula de score substituída pela de **5 fatores × 20 = 100** (`_giba:483-490`, com complexidade invertida e fallbacks 14/13/16/12/12); nota de que `rpa_score` e `opportunity_risks.priority` são colunas GENERATED.
  - Modelo de dados atualizado: novas colunas (`fte_horas`, `rpa_score`, `fonte`, `tipo_processo`, `beneficio_qualitativo`, `criterios`, `beneficios`, `fte`) + tabela `opportunity_risks`; `tempo` = frequência.
  - Subseções novas: Wizard 5-steps, Matriz de risco, nota MODEL-10 (compat IA).
- **fgcoop-coe-v2.html**: banner de deprecação no topo do `<body>` + comentário HTML (`<!-- DEPRECATED ... -->`) para detecção por grep/agente.

## Key files
- Modified: `docs/PROJETO.md`, `fgcoop-coe-v2.html`

## Verification
- `grep _giba_wsi-dashboard.html docs/PROJETO.md` ✓ · fórmula antiga `pequeno:25...` removida ✓ · `opportunity_risks`/`deprecated`/`fte_horas` presentes ✓
- `fgcoop-coe-v2.html` contém `DEPRECATED` + referência ao `_giba` ✓ · conteúdo original intacto ✓

## Deviations
None.

## Self-Check: PASSED
