# Deferred Items — Phase 16

Itens descobertos durante a execução que estão **fora do escopo** do task atual
(scope boundary da execução GSD) e não foram corrigidos.

## Plan 16-01

- **`npm run typecheck` falha em `tests/opportunities/report-strategic.test.ts:107`**
  (`error TS2322: Type 'null' is not assignable to type 'number | undefined'`).
  Pré-existente — confirmado rodando `npm run typecheck` no `main` antes de
  qualquer alteração desta task (mesmo erro, mesma linha). Arquivo não tocado
  por nenhum task de 16-01. Fora de escopo; não corrigido aqui.
