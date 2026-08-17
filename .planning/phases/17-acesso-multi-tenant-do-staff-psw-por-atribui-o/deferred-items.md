# Deferred Items — Phase 17

Itens fora de escopo descobertos durante a execução, não corrigidos por não
serem causados pelas mudanças do plano corrente (SCOPE BOUNDARY).

## 17-01

- **`npm run typecheck` — erro pré-existente, não relacionado a este plano**
  `tests/opportunities/report-strategic.test.ts(107,77): error TS2322: Type
  'null' is not assignable to type 'number | undefined'.`
  Confirmado pré-existente: reproduz igualmente com `git stash` aplicado
  (nenhuma mudança do Plan 17-01 tocou `tests/opportunities/` nem qualquer
  arquivo relacionado a relatório estratégico). Introduzido no commit
  `aaf8e5a` ("feat(opportunities): redesign estratégico da aba Relatório"),
  antes do início da Phase 17. Todos os greps de verificação específicos do
  Plan 17-01 (`psw_staff` em `TenantRole`, `isPswStaff`, rótulos pt-BR,
  ausência em `cargo.ts`, gate `platform_admin` preservado) passam
  isoladamente. Não corrigido aqui — fora do escopo dos arquivos deste plano.
