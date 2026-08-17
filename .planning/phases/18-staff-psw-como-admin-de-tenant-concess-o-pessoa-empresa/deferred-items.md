# Deferred Items — Phase 18

Itens fora do escopo do plano 18-01, descobertos durante execução, e propositalmente NÃO corrigidos (SCOPE BOUNDARY — só é escopo o que a task atual mudou).

## `npm run typecheck` — erro pré-existente em `tests/opportunities/report-strategic.test.ts`

- **Onde:** `tests/opportunities/report-strategic.test.ts:107` — `TS2322: Type 'null' is not assignable to type 'number | undefined'`.
- **Origem:** commit `aaf8e5a` ("feat(opportunities): redesign estratégico da aba Relatório"), anterior a qualquer trabalho da Phase 18.
- **Por que não foi corrigido aqui:** nenhum arquivo do plano 18-01 (`lib/database.types.ts`, `tests/schema/psw-staff-restrictive-rule.test.ts`, `tests/security/psw-staff-admin-grant.test.ts`) toca `report-strategic.test.ts` nem o código que ele exercita. É pré-existente e fora do raio da Task 2/3.
- **Impacto na Task 2:** o `<verify>` da Task 2 roda `npm run typecheck` "sai 0" como parte do gate — o comando encadeado (`npm run typecheck && npx vitest run ...`) falharia por causa deste erro alheio. Verificado isoladamente que o bloco `psw_tenant_admins` novo compila limpo (nenhum erro TS aponta para `lib/database.types.ts` nem para os arquivos desta task); o exit code não-zero do `tsc --noEmit` global vem inteiramente deste arquivo pré-existente.
- **Ação recomendada:** corrigir em uma task/fase que efetivamente toque `report-strategic.test.ts` (ou uma passada de tech-debt dedicada), não aqui.
- **Status (2026-08-07, Plan 18-02):** RESOLVIDO fora desta fase — commit `69cd621` ("fix(tests): tipa a fábrica opp() para aceitar null nas colunas computadas") corrigiu o erro. `npm run typecheck` confirmado saindo `0` na execução do Plan 18-02. Item mantido aqui apenas como registro histórico.

## Colisão de UUID entre fixtures de teste e tenants reais de produção

- **Onde:** `tests/setup/seed-test-tenants.ts` — `FGCOOP_TEST_ID = '11111111-1111-1111-1111-111111111111'` (e, por extensão, os prefixos `2222…`/`3333…` usados por `ACME_TEST_ID`/`PSW_TEST_ID`).
- **Descoberto durante:** Plan 18-02, ao investigar por que `.env.test` não podia ser populado apontando para o Supabase de produção (única URL disponível no momento). O PO reverteu a decisão `env-test-populado` do Plan 18-01 para `prova-por-sql-no-handoff` por causa deste achado.
- **O problema:** `11111111-1111-1111-1111-111111111111` é o UUID de um tenant **real** de produção chamado "FGCoop", com 32 oportunidades reais — não um tenant fictício de teste. Combinado com `tests/setup/seed-test-tenants.ts:98`, que faz `delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID, PSW_TEST_ID])` usando o **service-role** (que ignora RLS), rodar a suíte de segurança contra o banco de produção **apagaria dados reais de cliente** no `beforeAll`/`afterAll` de limpeza.
- **Por que não foi corrigido aqui:** é uma dívida de infraestrutura de teste pré-existente à Phase 18 (os UUIDs de fixture foram fixados em fases anteriores) e sua correção — trocar os prefixos de fixture por UUIDs garantidamente fora de produção, ou provisionar um projeto Supabase de teste dedicado — não é escopo de nenhuma task do plano 18-02.
- **Impacto:** enquanto esta colisão existir, a suíte `tests/security/*` **nunca pode ser apontada para o Supabase de produção**, sob nenhuma circunstância — e, sem um projeto de teste dedicado, o modo de prova `env-test-populado` (Plan 18-01) permanece inviável para toda a Phase 18. Ver a nota de supersessão em `18-01-SUMMARY.md`.
- **Ação recomendada:** antes de qualquer tentativa futura de reabilitar `env-test-populado`, (a) provisionar um projeto Supabase de teste dedicado (local ou cloud), OU (b) trocar os UUIDs de fixture de `tests/setup/seed-test-tenants.ts` por valores garantidamente inexistentes em produção e auditar todo `delete()`/`upsert()` que os referencia. Fora do escopo desta fase — registrar como item de backlog de infraestrutura de teste.
