---
schema_version: 1
open_count: 37
waived_count: 0
fixed_count: 1
total_count: 38
last_updated: 2026-08-07T20:03:56.525Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 16 | deviation | tests/opportunities/report-strategic.test.ts | 107 | typecheck pre-existente TS2322 (null not assignable), nao relacionado a 16-01, confirmado no main antes das alteracoes | open |  | 2026-08-05T13:32:43.937Z |  |
| 2 | 16 | unrun-verify | tests/schema/task-depth-guard.test.ts |  | Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real | open |  | 2026-08-05T13:54:59.404Z |  |
| 3 | 16 | unrun-verify | tests/schema/task-tenant-coherence.test.ts |  | Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real | open |  | 2026-08-05T13:54:59.460Z |  |
| 4 | 16 | unrun-verify | tests/security/opportunity-tasks-isolation.test.ts |  | Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real | open |  | 2026-08-05T13:54:59.510Z |  |
| 5 | 16 | unrun-verify | tests/security/opportunity-tasks-viewer-write.test.ts |  | Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real | open |  | 2026-08-05T13:54:59.558Z |  |
| 6 | 17 | lint-warning | tests/opportunities/report-strategic.test.ts | 107 | npm run typecheck falha (TS2322 null vs number\|undefined) — pre-existente ao Plan 17-01, fora de escopo (introduzido em aaf8e5a) | open |  | 2026-08-06T18:26:26.914Z |  |
| 7 | 17 | unrun-verify | tests/security/psw-staff-isolation.test.ts |  | Suite skipada localmente (sem .env.test) — os 5 specs decisivos (inclusive o negativo ACCESS-04) ficam em describe.skipIf ate .env.test ser populado; RED esperado com banco real ate a 0040 ser aplicada (Plan 17-03) | open |  | 2026-08-06T18:54:13.525Z |  |
| 8 | 17 | unrun-verify | tests/security/psw-staff-isolation.test.ts |  | Migration 0040 ja aplicada e os 4 smoke tests do trigger + o negativo decisivo (1 de 43) rodaram via SQL manual na Task 3, mas a suite Vitest continua em describe.skipIf: .env.test ausente. CORRIGIDO pelo orquestrador: as fixtures COLIDEM com UUIDs de producao — FGCOOP_TEST_ID e 11111111-... , o mesmo id do tenant FGCoop real da migration 0002, e aaaaaaaa-... e o admin.fgcoop@pswdigital.com.br. Com upsert onConflict:'id', apontar .env.test para producao RENOMEIA o FGCoop real e cleanupTestTenants() APAGA as oportunidades reais dele. Nao e 'perigoso', e destrutivo na primeira execucao. Exige projeto Supabase separado E, antes disso, trocar os UUIDs das fixtures por faixa que nao colida. Ver .planning/todos/pending/fixtures-colidem-com-producao.md | open |  | 2026-08-06T21:03:11.047Z |  |
| 9 | 17 | unrun-verify | .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-03-PLAN.md |  | Task 4 <human-check> (fecho visual do tracer: login como psw_staff em /opportunities mostrando as 2 oportunidades atribuidas de tenants distintos e ocultando a nao atribuida) nao foi executado nesta sessao — sem acesso a browser interativo. A prova comportamental equivalente foi feita via SQL (smoke 7: 1 de 43), mas o fecho visual explicito da UI segue pendente de confirmacao humana. | open |  | 2026-08-06T21:03:11.095Z |  |
| 10 | 17 | unrun-verify | .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-04-MIGRATION-HANDOFF.md |  | As 9 verificacoes pos-apply do handoff (contagem exata de policies _psw_staff com lista nominal, presenca de todas as policies pre-existentes por tabela D-09, storage.objects, CHECK e policy de invited_emails, os 2 triggers de opportunity_tasks, smoke de responsavel de tarefa ACCESS-11 com 3 casos, smoke de Storage D-12 com 403, verificacao condicional da 0042/audit_log) NAO foram executadas. O apply foi confirmado por uma verificacao de vazamento diferente, escrita pelo orquestrador (contagem de linhas visiveis/vazadas por tabela filha), mais 3 diagnosticos sem RLS apos a anomalia. ACCESS-11, ACCESS-09, Storage (D-12) e a 0042 permanecem sem prova empirica em producao. | open |  | 2026-08-07T01:04:46.792Z |  |
| 11 | 17 | todo | supabase/migrations/0041_psw_staff_child_access.sql |  | profiles_select_psw_staff (0041, Bloco 3) expoe TODAS as pessoas dos tenants onde o psw_staff tem oportunidade atribuida, nao so as pessoas de fato ligadas as oportunidades atribuidas (assignee/created_by). Funcional e justificado no arquivo (sem ela o select de responsavel de tarefa ACCESS-11 fica vazio), mas e uma exposicao mais larga que o resto da fase. Considerar estreitamento futuro. | open |  | 2026-08-07T01:04:46.843Z |  |
| 12 | 17 | todo | supabase/migrations/0043_tenant_coherence_notes_risks_documents.sql |  | Defeito PRE-EXISTENTE (0011/0018, nao introduzido pela Phase 17) descoberto na verificacao pos-apply da 0041: opportunity_notes, opportunity_risks e opportunity_documents nao tem guarda de coerencia de tenant (equivalente a check_assignee_tenant/check_task_tenant_coherence) — qualquer usuario nao-viewer pode pendurar nota/risco/documento em oportunidade de OUTRO tenant, carimbando o proprio tenant_id. 7 linhas de producao afetadas (5 notas + 2 riscos, tenant_id=PSW penduradas em oportunidades da Unidasul) — integridade/poluicao de dados, nao vazamento de confidencialidade. PO decidiu: migration 0043 (fora do escopo do Plan 17-04) vai adicionar a guarda e corrigir as 7 linhas. | open |  | 2026-08-07T01:04:46.894Z |  |
| 13 | 17 | unrun-verify | tests/security/psw-staff-isolation.test.ts |  | Todos os specs de propagacao/escrita/triggers do Plan 17-05 (tabelas filhas, profiles, check_assignee_tenant, assignee de tarefa, escrita escopada, gate de viewer D-13, invited_emails) foram escritos mas NAO executados nesta sessao — .env.test continua ausente, mesma pendencia carregada desde 17-01. describe.skipIf pula os 38 specs; nenhuma prova empirica contra banco real. | open |  | 2026-08-07T01:55:27.440Z |  |
| 14 | 17 | todo | lib/database.types.ts |  | invited_emails.Insert/Row/Update.role (hand-maintained) ainda e 'member'\|'tenant_admin'\|'viewer' — nao reflete o CHECK ampliado pela 0041 (aceita 'psw_staff' desde entao). tests/security/psw-staff-isolation.test.ts usa @ts-expect-error nos dois inserts com role:'psw_staff' para compilar. Corrigir o tipo exige tambem atualizar app/(app)/admin/invites/page.tsx (Record<InviteRow['role'], string> exaustivo) — fora do escopo do Plan 17-05 (files_modified so lista o arquivo de teste). | fixed |  | 2026-08-07T01:55:39.816Z | 2026-08-07T10:08:51.113Z |
| 15 | 18 | unrun-verify | supabase/migrations/0045_psw_tenant_admins_grant.sql |  | Handoff V10-V13 (nao-regressao member / smokes D-B / EXPLAIN inlining / smoke UPDATE autorizado) nao executadas nesta wave | open |  | 2026-08-07T17:01:12.370Z |  |
| 16 | 18 | skipped-test | tests/security/psw-staff-admin-grant.test.ts |  | 14 testes em describe.skipIf (sem NEXT_PUBLIC_SUPABASE_URL) — modo de prova revertido para prova-por-sql-no-handoff (colisao de UUID entre fixtures e tenant real de producao impede env-test-populado); prova substituta = handoff 18-02 + observacao direta pelo app | open |  | 2026-08-07T17:01:21.633Z |  |
| 17 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | V2/D2 nao executada pelo PO: as 7 restritivas reemitidas com o 3o disjunto (current_admin_tenant_ids) nao foram confirmadas em producao via pg_policies.qual | open |  | 2026-08-07T17:56:40.931Z |  |
| 18 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | V3/D3 nao executada pelo PO: contagem total de policies por tabela filha (nao-perda das pre-existentes) nao comparada antes/depois do apply | open |  | 2026-08-07T17:56:40.980Z |  |
| 19 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | V5/D6 nao executada pelo PO: propagacao positiva (staff-admin ve as 7 filhas de uma oportunidade de A nao atribuida) sem prova em runtime; verificacao recomendada via app registrada como pendente | open |  | 2026-08-07T17:56:41.028Z |  |
| 20 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | V6/D7 nao executada pelo PO: negativo do tenant de controle nas 7 filhas (deteccao de vazamento cross-tenant) sem prova em runtime | open |  | 2026-08-07T17:56:41.076Z |  |
| 21 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | V7 nao executada pelo PO: nao-regressao de member/tenant_admin do FGCoop nas 7 filhas (antes/depois do apply) sem prova em runtime | open |  | 2026-08-07T17:56:41.124Z |  |
| 22 | 18 | unrun-verify | supabase/migrations/0046_psw_admin_child_tables.sql |  | Prova de idempotencia (rodar 0046 duas vezes) nao confirmada explicitamente pelo PO no handoff | open |  | 2026-08-07T17:56:41.172Z |  |
| 23 | 18 | skipped-test | tests/security/psw-staff-admin-grant.test.ts |  | Suite inteira (31 specs, incl. c4/c8/c9 escritos neste plano) em skip — .env.test nao existe, modo de prova prova-por-sql-no-handoff | open |  | 2026-08-07T17:56:41.220Z |  |
| 24 | 18 | deviation | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | Baseline pre-apply das 11 policies (query A1) foi rodada pelo PO DEPOIS do apply da 0047, nao antes — o texto vivo antigo das 11 policies nao foi capturado como snapshot. Sem impacto no rollback (reaplica arquivos versionados 0029/0033/0038/bloco-0041, nao depende do snapshot); impacto real e que a Decisiva #1 (byte-equivalencia por amostragem) nao pode ser julgada por comparacao empirica — foi substituida por prova por construcao (leitura das definicoes de effective_admin_tenant_ids/is_tenant_admin_of/current_admin_tenant_ids via pg_get_functiondef), mais forte porque vale para todo tenant_admin, nao so o amostrado. | open |  | 2026-08-07T18:27:43.737Z |  |
| 25 | 18 | deviation | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | DIVIDA DE METODO: impersonacao de sessao via set local role authenticated + set_config('request.jwt.claims', ..., true) NAO funciona no SQL Editor do Supabase Cloud — cada statement roda em transacao propria, descartando o set local. Diagnostico: select auth.uid(), current_user_role(), current_tenant_id() apos o set_config retornou null/null/null. Consequencia: toda verificacao estilo D5/D6/D7 baseada em set_config nos handoffs 18-02, 18-03 e 18-05 e artefato, nao medicao — nao prova nem desprova nada (ex.: a query A2 do 18-05 que devolveu 0,0,0,0). Handoffs futuros desta fase NAO devem usar impersonacao por set_config no SQL Editor; alternativas que funcionam: (a) inspecao estatica da definicao de funcoes/policies via pg_get_functiondef/pg_policies, (b) observacao pelo app com login real. | open |  | 2026-08-07T18:27:43.788Z |  |
| 26 | 18 | unrun-verify | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | DECISIVA #3 (poderes do staff-admin em A: inserir convite legitimo aceito, inserir psw_staff rejeitado, atualizar branding aceito, ler log de A) nao executada pelo PO apos o apply da 0047. | open |  | 2026-08-07T18:27:43.837Z |  |
| 27 | 18 | unrun-verify | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | Negativo em B (as mesmas tentativas de leitura/escrita do staff-admin num tenant sem concessao) nao executado pelo PO apos o apply da 0047. | open |  | 2026-08-07T18:27:43.887Z |  |
| 28 | 18 | unrun-verify | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | C3 (3 policies novas do bucket privado opportunity-documents presentes em producao, sem verbo de update) nao confirmada via pg_policies apos o apply — verificada apenas no texto da migration antes do apply. | open |  | 2026-08-07T18:27:43.935Z |  |
| 29 | 18 | unrun-verify | .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md |  | C5 (CHECK invited_emails_role_check inalterado apos o apply) nao confirmada via pg_constraint pelo PO. | open |  | 2026-08-07T18:27:43.986Z |  |
| 30 | 18 | unrun-verify | supabase/migrations/0047_tenant_admin_predicate_swap.sql |  | Prova de idempotencia (rodar o arquivo 0047 uma segunda vez no SQL Editor) nao confirmada explicitamente pelo PO. | open |  | 2026-08-07T18:27:44.038Z |  |
| 31 | 18 | skipped-test | tests/security/psw-staff-admin-grant.test.ts |  | Grupo d (16 specs novos: d1-d6, d7a-f, d8a-d) em skip — .env.test nao existe, modo de prova prova-por-sql-no-handoff; suite inteira 47/47 em skip (68 passed \| 151 skipped (219) na suite tests/security completa). | open |  | 2026-08-07T18:27:44.087Z |  |
| 32 | 18 | unrun-verify | app/(app)/configuracoes/actions.ts |  | Human-check da Task 3 (18-06) nao executado: staff-admin salvando cor/logo/remocao em A pela UI real, e escopo negado com 'todas as empresas' selecionado — sem acesso a browser/servidor autenticado nesta sessao. | open |  | 2026-08-07T18:55:05.885Z |  |
| 33 | 18 | unrun-verify | tests/security/admin-actions-tenant-scope.test.ts |  | 17 specs novos (team/actions.ts + configuracoes/actions.ts, Plan 18-06) em describe.skipIf(!HAS_DB) — .env.test nao existe (prova-por-sql-no-handoff); nunca executados contra DB real nesta sessao, incluindo o proprio import dinamico de app/(app)/team\|configuracoes/actions.ts sob os mocks de next/headers. | open |  | 2026-08-07T18:55:05.934Z |  |
| 34 | 18 | deviation | app/(app)/team/actions.ts |  | npm run test:security bloqueado pelo classificador de auto-mode do harness (consistente com o binding_proof_mode do plano, que proibe rodar essa suite/integracao contra producao); verificacao substituida por execucao direta dos arquivos de teste afetados via npx vitest run <arquivo>. | open |  | 2026-08-07T18:55:05.982Z |  |
| 35 | 18 | unrun-verify | app/(app)/team/page.tsx |  | Human-check da Task 2 (18-07) nao executado: staff-admin com concessao em A abrindo /team e /configuracoes com A selecionada (dados de A, chip visivel, formulario ativo) e com 'todas as empresas' selecionada (controles desabilitados, aviso pt-BR); e confirmacao de que tenant_admin de cliente ve as duas telas identicas a antes — sem acesso a browser/servidor autenticado nesta sessao. | open |  | 2026-08-07T19:26:20.649Z |  |
| 36 | 18 | unrun-verify | app/(app)/logs/page.tsx |  | Human-check da Task 3 (18-07) nao executado: staff-admin com concessao em DUAS empresas abrindo /logs (recorte limitado as duas, filtragem por uma delas), staff-admin com UMA concessao (sem recorte, chip com o nome dela), tenant_admin de cliente inalterado, e /admin/invites como super-admin com o chip no cabecalho — sem acesso a browser/servidor autenticado nesta sessao. | open |  | 2026-08-07T19:26:20.698Z |  |
| 37 | 18 | unrun-verify | app/(app)/admin/staff/page.tsx |  | Roteiro visual A-H (18-08 Task 3, checkpoint bloqueante) nao executado: conceder, diagnostico, ver o que passou a ver, exercer os poderes, estado sem empresa, revogar com impacto, nao-regressao dos papeis existentes, concessao orfa — sem acesso a browser/servidor autenticado nesta sessao. Fecha a fase inteira (18-01..18-08). | open |  | 2026-08-07T20:03:45.126Z |  |
| 38 | 18 | deviation | tests/security/assignee-actions-tenant-scope.test.ts |  | npm test / npm run test:security (suite inteira ou diretorio) NAO executados nesta sessao, por instrucao explicita do binding_proof_mode do plano 18-08 ('never the whole suite'). Auditoria de nao-regressao da Task 3 rodou npx vitest run em 8 arquivos individuais relevantes a fase (psw-staff-restrictive-rule, resolve-admin-tenant, tenant-admin-parity, admin-actions-tenant-scope, assignee-actions-tenant-scope, psw-staff-admin-grant, psw-staff-isolation, staff-access-origins): 40 passed \| 111 skipped, 0 failed (151 total). Nenhum resultado desses skips e lido como verde. | open |  | 2026-08-07T20:03:56.525Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "16",
    "file": "tests/opportunities/report-strategic.test.ts",
    "line": 107,
    "description": "typecheck pre-existente TS2322 (null not assignable), nao relacionado a 16-01, confirmado no main antes das alteracoes",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T13:32:43.937Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "16",
    "file": "tests/schema/task-depth-guard.test.ts",
    "line": null,
    "description": "Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T13:54:59.404Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "16",
    "file": "tests/schema/task-tenant-coherence.test.ts",
    "line": null,
    "description": "Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T13:54:59.460Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "16",
    "file": "tests/security/opportunity-tasks-isolation.test.ts",
    "line": null,
    "description": "Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T13:54:59.510Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "16",
    "file": "tests/security/opportunity-tasks-viewer-write.test.ts",
    "line": null,
    "description": "Suíte skipada localmente (sem .env.test) — precisa rodar contra Supabase Cloud de teste para veredito verde real",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-05T13:54:59.558Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "lint-warning",
    "phase": "17",
    "file": "tests/opportunities/report-strategic.test.ts",
    "line": 107,
    "description": "npm run typecheck falha (TS2322 null vs number|undefined) — pre-existente ao Plan 17-01, fora de escopo (introduzido em aaf8e5a)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-06T18:26:26.914Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "tests/security/psw-staff-isolation.test.ts",
    "line": null,
    "description": "Suite skipada localmente (sem .env.test) — os 5 specs decisivos (inclusive o negativo ACCESS-04) ficam em describe.skipIf ate .env.test ser populado; RED esperado com banco real ate a 0040 ser aplicada (Plan 17-03)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-06T18:54:13.525Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "tests/security/psw-staff-isolation.test.ts",
    "line": null,
    "description": "Migration 0040 ja aplicada e os 4 smoke tests do trigger + o negativo decisivo (1 de 43) rodaram via SQL manual na Task 3, mas a suite Vitest continua em describe.skipIf: .env.test ausente. CORRIGIDO pelo orquestrador: as fixtures COLIDEM com UUIDs de producao — FGCOOP_TEST_ID e 11111111-... , o mesmo id do tenant FGCoop real da migration 0002, e aaaaaaaa-... e o admin.fgcoop@pswdigital.com.br. Com upsert onConflict:'id', apontar .env.test para producao RENOMEIA o FGCoop real e cleanupTestTenants() APAGA as oportunidades reais dele. Nao e 'perigoso', e destrutivo na primeira execucao. Exige projeto Supabase separado E, antes disso, trocar os UUIDs das fixtures por faixa que nao colida. Ver .planning/todos/pending/fixtures-colidem-com-producao.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-06T21:03:11.047Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "17",
    "file": ".planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-03-PLAN.md",
    "line": null,
    "description": "Task 4 <human-check> (fecho visual do tracer: login como psw_staff em /opportunities mostrando as 2 oportunidades atribuidas de tenants distintos e ocultando a nao atribuida) nao foi executado nesta sessao — sem acesso a browser interativo. A prova comportamental equivalente foi feita via SQL (smoke 7: 1 de 43), mas o fecho visual explicito da UI segue pendente de confirmacao humana.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-06T21:03:11.095Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "17",
    "file": ".planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-04-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "As 9 verificacoes pos-apply do handoff (contagem exata de policies _psw_staff com lista nominal, presenca de todas as policies pre-existentes por tabela D-09, storage.objects, CHECK e policy de invited_emails, os 2 triggers de opportunity_tasks, smoke de responsavel de tarefa ACCESS-11 com 3 casos, smoke de Storage D-12 com 403, verificacao condicional da 0042/audit_log) NAO foram executadas. O apply foi confirmado por uma verificacao de vazamento diferente, escrita pelo orquestrador (contagem de linhas visiveis/vazadas por tabela filha), mais 3 diagnosticos sem RLS apos a anomalia. ACCESS-11, ACCESS-09, Storage (D-12) e a 0042 permanecem sem prova empirica em producao.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T01:04:46.792Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "todo",
    "phase": "17",
    "file": "supabase/migrations/0041_psw_staff_child_access.sql",
    "line": null,
    "description": "profiles_select_psw_staff (0041, Bloco 3) expoe TODAS as pessoas dos tenants onde o psw_staff tem oportunidade atribuida, nao so as pessoas de fato ligadas as oportunidades atribuidas (assignee/created_by). Funcional e justificado no arquivo (sem ela o select de responsavel de tarefa ACCESS-11 fica vazio), mas e uma exposicao mais larga que o resto da fase. Considerar estreitamento futuro.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T01:04:46.843Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "todo",
    "phase": "17",
    "file": "supabase/migrations/0043_tenant_coherence_notes_risks_documents.sql",
    "line": null,
    "description": "Defeito PRE-EXISTENTE (0011/0018, nao introduzido pela Phase 17) descoberto na verificacao pos-apply da 0041: opportunity_notes, opportunity_risks e opportunity_documents nao tem guarda de coerencia de tenant (equivalente a check_assignee_tenant/check_task_tenant_coherence) — qualquer usuario nao-viewer pode pendurar nota/risco/documento em oportunidade de OUTRO tenant, carimbando o proprio tenant_id. 7 linhas de producao afetadas (5 notas + 2 riscos, tenant_id=PSW penduradas em oportunidades da Unidasul) — integridade/poluicao de dados, nao vazamento de confidencialidade. PO decidiu: migration 0043 (fora do escopo do Plan 17-04) vai adicionar a guarda e corrigir as 7 linhas.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T01:04:46.894Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "tests/security/psw-staff-isolation.test.ts",
    "line": null,
    "description": "Todos os specs de propagacao/escrita/triggers do Plan 17-05 (tabelas filhas, profiles, check_assignee_tenant, assignee de tarefa, escrita escopada, gate de viewer D-13, invited_emails) foram escritos mas NAO executados nesta sessao — .env.test continua ausente, mesma pendencia carregada desde 17-01. describe.skipIf pula os 38 specs; nenhuma prova empirica contra banco real.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T01:55:27.440Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "todo",
    "phase": "17",
    "file": "lib/database.types.ts",
    "line": null,
    "description": "invited_emails.Insert/Row/Update.role (hand-maintained) ainda e 'member'|'tenant_admin'|'viewer' — nao reflete o CHECK ampliado pela 0041 (aceita 'psw_staff' desde entao). tests/security/psw-staff-isolation.test.ts usa @ts-expect-error nos dois inserts com role:'psw_staff' para compilar. Corrigir o tipo exige tambem atualizar app/(app)/admin/invites/page.tsx (Record<InviteRow['role'], string> exaustivo) — fora do escopo do Plan 17-05 (files_modified so lista o arquivo de teste).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-07T01:55:39.816Z",
    "resolved_at": "2026-08-07T10:08:51.113Z"
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0045_psw_tenant_admins_grant.sql",
    "line": null,
    "description": "Handoff V10-V13 (nao-regressao member / smokes D-B / EXPLAIN inlining / smoke UPDATE autorizado) nao executadas nesta wave",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:01:12.370Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "skipped-test",
    "phase": "18",
    "file": "tests/security/psw-staff-admin-grant.test.ts",
    "line": null,
    "description": "14 testes em describe.skipIf (sem NEXT_PUBLIC_SUPABASE_URL) — modo de prova revertido para prova-por-sql-no-handoff (colisao de UUID entre fixtures e tenant real de producao impede env-test-populado); prova substituta = handoff 18-02 + observacao direta pelo app",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:01:21.633Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "V2/D2 nao executada pelo PO: as 7 restritivas reemitidas com o 3o disjunto (current_admin_tenant_ids) nao foram confirmadas em producao via pg_policies.qual",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:40.931Z",
    "resolved_at": null
  },
  {
    "id": 18,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "V3/D3 nao executada pelo PO: contagem total de policies por tabela filha (nao-perda das pre-existentes) nao comparada antes/depois do apply",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:40.980Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "V5/D6 nao executada pelo PO: propagacao positiva (staff-admin ve as 7 filhas de uma oportunidade de A nao atribuida) sem prova em runtime; verificacao recomendada via app registrada como pendente",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:41.028Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "V6/D7 nao executada pelo PO: negativo do tenant de controle nas 7 filhas (deteccao de vazamento cross-tenant) sem prova em runtime",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:41.076Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "V7 nao executada pelo PO: nao-regressao de member/tenant_admin do FGCoop nas 7 filhas (antes/depois do apply) sem prova em runtime",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:41.124Z",
    "resolved_at": null
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0046_psw_admin_child_tables.sql",
    "line": null,
    "description": "Prova de idempotencia (rodar 0046 duas vezes) nao confirmada explicitamente pelo PO no handoff",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:41.172Z",
    "resolved_at": null
  },
  {
    "id": 23,
    "kind": "skipped-test",
    "phase": "18",
    "file": "tests/security/psw-staff-admin-grant.test.ts",
    "line": null,
    "description": "Suite inteira (31 specs, incl. c4/c8/c9 escritos neste plano) em skip — .env.test nao existe, modo de prova prova-por-sql-no-handoff",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:56:41.220Z",
    "resolved_at": null
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "Baseline pre-apply das 11 policies (query A1) foi rodada pelo PO DEPOIS do apply da 0047, nao antes — o texto vivo antigo das 11 policies nao foi capturado como snapshot. Sem impacto no rollback (reaplica arquivos versionados 0029/0033/0038/bloco-0041, nao depende do snapshot); impacto real e que a Decisiva #1 (byte-equivalencia por amostragem) nao pode ser julgada por comparacao empirica — foi substituida por prova por construcao (leitura das definicoes de effective_admin_tenant_ids/is_tenant_admin_of/current_admin_tenant_ids via pg_get_functiondef), mais forte porque vale para todo tenant_admin, nao so o amostrado.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.737Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "deviation",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "DIVIDA DE METODO: impersonacao de sessao via set local role authenticated + set_config('request.jwt.claims', ..., true) NAO funciona no SQL Editor do Supabase Cloud — cada statement roda em transacao propria, descartando o set local. Diagnostico: select auth.uid(), current_user_role(), current_tenant_id() apos o set_config retornou null/null/null. Consequencia: toda verificacao estilo D5/D6/D7 baseada em set_config nos handoffs 18-02, 18-03 e 18-05 e artefato, nao medicao — nao prova nem desprova nada (ex.: a query A2 do 18-05 que devolveu 0,0,0,0). Handoffs futuros desta fase NAO devem usar impersonacao por set_config no SQL Editor; alternativas que funcionam: (a) inspecao estatica da definicao de funcoes/policies via pg_get_functiondef/pg_policies, (b) observacao pelo app com login real.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.788Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "unrun-verify",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "DECISIVA #3 (poderes do staff-admin em A: inserir convite legitimo aceito, inserir psw_staff rejeitado, atualizar branding aceito, ler log de A) nao executada pelo PO apos o apply da 0047.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.837Z",
    "resolved_at": null
  },
  {
    "id": 27,
    "kind": "unrun-verify",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "Negativo em B (as mesmas tentativas de leitura/escrita do staff-admin num tenant sem concessao) nao executado pelo PO apos o apply da 0047.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.887Z",
    "resolved_at": null
  },
  {
    "id": 28,
    "kind": "unrun-verify",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "C3 (3 policies novas do bucket privado opportunity-documents presentes em producao, sem verbo de update) nao confirmada via pg_policies apos o apply — verificada apenas no texto da migration antes do apply.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.935Z",
    "resolved_at": null
  },
  {
    "id": 29,
    "kind": "unrun-verify",
    "phase": "18",
    "file": ".planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md",
    "line": null,
    "description": "C5 (CHECK invited_emails_role_check inalterado apos o apply) nao confirmada via pg_constraint pelo PO.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:43.986Z",
    "resolved_at": null
  },
  {
    "id": 30,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "supabase/migrations/0047_tenant_admin_predicate_swap.sql",
    "line": null,
    "description": "Prova de idempotencia (rodar o arquivo 0047 uma segunda vez no SQL Editor) nao confirmada explicitamente pelo PO.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:44.038Z",
    "resolved_at": null
  },
  {
    "id": 31,
    "kind": "skipped-test",
    "phase": "18",
    "file": "tests/security/psw-staff-admin-grant.test.ts",
    "line": null,
    "description": "Grupo d (16 specs novos: d1-d6, d7a-f, d8a-d) em skip — .env.test nao existe, modo de prova prova-por-sql-no-handoff; suite inteira 47/47 em skip (68 passed | 151 skipped (219) na suite tests/security completa).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:27:44.087Z",
    "resolved_at": null
  },
  {
    "id": 32,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "app/(app)/configuracoes/actions.ts",
    "line": null,
    "description": "Human-check da Task 3 (18-06) nao executado: staff-admin salvando cor/logo/remocao em A pela UI real, e escopo negado com 'todas as empresas' selecionado — sem acesso a browser/servidor autenticado nesta sessao.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:55:05.885Z",
    "resolved_at": null
  },
  {
    "id": 33,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "tests/security/admin-actions-tenant-scope.test.ts",
    "line": null,
    "description": "17 specs novos (team/actions.ts + configuracoes/actions.ts, Plan 18-06) em describe.skipIf(!HAS_DB) — .env.test nao existe (prova-por-sql-no-handoff); nunca executados contra DB real nesta sessao, incluindo o proprio import dinamico de app/(app)/team|configuracoes/actions.ts sob os mocks de next/headers.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:55:05.934Z",
    "resolved_at": null
  },
  {
    "id": 34,
    "kind": "deviation",
    "phase": "18",
    "file": "app/(app)/team/actions.ts",
    "line": null,
    "description": "npm run test:security bloqueado pelo classificador de auto-mode do harness (consistente com o binding_proof_mode do plano, que proibe rodar essa suite/integracao contra producao); verificacao substituida por execucao direta dos arquivos de teste afetados via npx vitest run <arquivo>.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T18:55:05.982Z",
    "resolved_at": null
  },
  {
    "id": 35,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "app/(app)/team/page.tsx",
    "line": null,
    "description": "Human-check da Task 2 (18-07) nao executado: staff-admin com concessao em A abrindo /team e /configuracoes com A selecionada (dados de A, chip visivel, formulario ativo) e com 'todas as empresas' selecionada (controles desabilitados, aviso pt-BR); e confirmacao de que tenant_admin de cliente ve as duas telas identicas a antes — sem acesso a browser/servidor autenticado nesta sessao.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T19:26:20.649Z",
    "resolved_at": null
  },
  {
    "id": 36,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "app/(app)/logs/page.tsx",
    "line": null,
    "description": "Human-check da Task 3 (18-07) nao executado: staff-admin com concessao em DUAS empresas abrindo /logs (recorte limitado as duas, filtragem por uma delas), staff-admin com UMA concessao (sem recorte, chip com o nome dela), tenant_admin de cliente inalterado, e /admin/invites como super-admin com o chip no cabecalho — sem acesso a browser/servidor autenticado nesta sessao.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T19:26:20.698Z",
    "resolved_at": null
  },
  {
    "id": 37,
    "kind": "unrun-verify",
    "phase": "18",
    "file": "app/(app)/admin/staff/page.tsx",
    "line": null,
    "description": "Roteiro visual A-H (18-08 Task 3, checkpoint bloqueante) nao executado: conceder, diagnostico, ver o que passou a ver, exercer os poderes, estado sem empresa, revogar com impacto, nao-regressao dos papeis existentes, concessao orfa — sem acesso a browser/servidor autenticado nesta sessao. Fecha a fase inteira (18-01..18-08).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T20:03:45.126Z",
    "resolved_at": null
  },
  {
    "id": 38,
    "kind": "deviation",
    "phase": "18",
    "file": "tests/security/assignee-actions-tenant-scope.test.ts",
    "line": null,
    "description": "npm test / npm run test:security (suite inteira ou diretorio) NAO executados nesta sessao, por instrucao explicita do binding_proof_mode do plano 18-08 ('never the whole suite'). Auditoria de nao-regressao da Task 3 rodou npx vitest run em 8 arquivos individuais relevantes a fase (psw-staff-restrictive-rule, resolve-admin-tenant, tenant-admin-parity, admin-actions-tenant-scope, assignee-actions-tenant-scope, psw-staff-admin-grant, psw-staff-isolation, staff-access-origins): 40 passed | 111 skipped, 0 failed (151 total). Nenhum resultado desses skips e lido como verde.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T20:03:56.525Z",
    "resolved_at": null
  }
]
````
