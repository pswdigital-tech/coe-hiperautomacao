---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 05
subsystem: testing
tags: [vitest, postgres, rls, supabase, multi-tenant, security]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-04"
    provides: "Migrations 0041/0042/0043 aplicadas em produção — SELECT/escrita aditiva nas 7 tabelas filhas + profiles + Storage, check_task_tenant_coherence() reescrito (ACCESS-11), invited_emails ajustado (ACCESS-09), guarda de coerência de tenant em notes/risks/documents/history"
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-06"
    provides: "resolveWriteTenantId() e os 4 smokes manuais recomendados (não cobertos por este plano — são de escopo de Server Action, este plano é de RLS)"
provides:
  - "tests/security/psw-staff-isolation.test.ts completo: 38 specs cobrindo as 7 tabelas filhas, profiles, os 2 triggers de coerência (4+3 casos), escrita escopada (positivo+negativo com releitura obrigatória), gate de viewer (D-13) e a barreira de invited_emails (ACCESS-09) — escritos e NÃO executados (.env.test ausente)"
  - "Fixture ampliada: uma linha por tabela filha sob X/Y/Z + um 4º tenant de controle sem nenhuma atribuição"
affects: ["17-07", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "it.each nomeado pelo texto da tabela para o describe 'tabelas filhas' — uma falha aponta exatamente qual tabela ficou sem policy aditiva ou com a policy escrita por tenant_id em vez de opportunity_id"
    - "Promoção temporária de role em describe aninhado (beforeAll/afterAll locais) para simular viewer/tenant_admin usando o usuário FGCoop compartilhado da suíte, revertendo antes do describe seguinte — mesmo padrão de tests/security/viewer-role-write-block.test.ts"
    - "Toda afirmação de escrita (positiva ou negativa) relê a linha via serviceRoleClient() — nunca conclui por error === null (Pitfall 1 do RESEARCH)"

key-files:
  created: []
  modified:
    - tests/security/psw-staff-isolation.test.ts

key-decisions:
  - "invited_emails: usei @ts-expect-error nos dois inserts com role:'psw_staff' em vez de editar lib/database.types.ts. O CHECK do banco já aceita 'psw_staff' desde a 0041, mas o tipo hand-maintained do Insert/Row/Update de invited_emails ainda só lista 'member'|'tenant_admin'|'viewer'. Corrigir o tipo é a solução certa a médio prazo, mas exigiria também atualizar Record<InviteRow['role'], string> em app/(app)/admin/invites/page.tsx (exaustivo) — fora de files_modified deste plano (só lista o arquivo de teste). Registrado como todo em WINDOWS.md (#14)."
  - "Split do diff em 2 commits por task DEPOIS de já ter escrito o arquivo inteiro (as duas tasks foram implementadas em sequência dentro do mesmo arquivo, sem parar para commitar entre elas). Reconstruí o estado intermediário pós-Task-1 (removendo os describes 'escrita escopada'/'gate de viewer'/'invited_emails' e revertendo o rodapé) para poder commitar as duas tasks separadamente, com typecheck+vitest rodando contra cada estado intermediário antes do commit — não é uma forma diferente do resultado final, só a ordem em que os commits foram criados."
  - "'check_assignee_tenant' caso c) (profile psw_staff aceita cross-tenant) reusa a fixture do topo (as atribuições X/Z do staff PSW) em vez de inserir uma 4ª oportunidade só para esse caso — o trigger já foi exercitado exatamente nesse cenário no beforeAll; o teste dedicado só torna essa prova explícita e nomeada, sem duplicar setup."
  - "Tenant de controle (describe 'profiles visíveis') usa um id novo (prefixo eeee0000, reservado) em vez de reaproveitar FGCoop/Acme/PSW — os três já têm atribuição, nenhum serviria de controle para o negativo (tenant SEM nenhuma atribuição)."

requirements-completed: [ACCESS-05, ACCESS-06, ACCESS-07, ACCESS-09, ACCESS-11]

coverage:
  - id: D1
    description: "describe('tabelas filhas'): 1 spec por tabela (it.each) provando que as 7 tabelas filhas propagam a visibilidade por atribuição — X visível, Y (mesmo tenant, sem atribuição) invisível, Z (outro tenant, atribuída) visível"
    requirement: ACCESS-05
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1 <verify>): os 7 nomes de tabela presentes no arquivo, grupo 'tabelas filhas' presente; npx tsc --noEmit limpo (só o erro pré-existente); npx vitest run tests/security/psw-staff-isolation.test.ts coleta 38 specs sem erro de coleção (todos skip por falta de .env.test)"
        status: pass
    human_judgment: true
    rationale: ".env.test continua ausente — os 38 specs entram em describe.skipIf e NUNCA rodaram contra um banco real nesta sessão. A verificação automatizada prova que o arquivo compila, coleta e tem a estrutura exigida (nomes de grupo, cobertura nominal das 7 tabelas), não que a RLS de fato se comporta como os specs afirmam. Precisa de execução real (ou pelo menos um smoke manual equivalente) antes de considerar ACCESS-05 empiricamente fechado."
  - id: D2
    description: "describe('profiles visíveis'): psw_staff enxerga profiles do tenant FGCoop (onde tem atribuição) e não do tenant de controle criado só para este teste (sem nenhuma atribuição)"
    requirement: ACCESS-05
    verification:
      - kind: other
        ref: "leitura de código + npx tsc --noEmit limpo; specs coletados (não executados) — mesma limitação de D1"
        status: pass
    human_judgment: true
    rationale: "Mesma limitação de D1 — sem .env.test, nenhuma prova comportamental real."
  - id: D3
    description: "describe('check_assignee_tenant'): os 4 casos do trigger reescrito (0032/0040) — mesmo tenant aceita, outro tenant sem o papel novo rejeita, papel novo em qualquer tenant aceita, tenant_id da linha divergente do da oportunidade rejeita para todos os papéis"
    requirement: ACCESS-05
    verification:
      - kind: other
        ref: "grep automatizado (Task 1 <verify>): grupo 'check_assignee_tenant' presente; leitura cruzada com o corpo da função em supabase/migrations/0040_psw_staff_access_core.sql confirmando que os 4 cenários dos specs correspondem exatamente aos 4 branches do trigger; specs coletados, não executados"
        status: pass
    human_judgment: true
    rationale: "O único caso que JÁ tem prova empírica real é uma variante do caso (c) — os 4 smokes manuais do 17-03-SUMMARY.md, rodados via SQL Editor antes da 0040 ir para produção. Os outros 3 casos (a, b, d) e a forma automatizada deste describe nunca rodaram."
  - id: D4
    description: "describe('assignee de tarefa'): os 3 casos de check_task_tenant_coherence() reescrito (0041/D-14) — psw_staff atribuído aceito como responsável, psw_staff não atribuído rejeitado, profile de outro tenant sem o papel novo rejeitado"
    requirement: ACCESS-11
    verification:
      - kind: other
        ref: "grep automatizado (Task 1 <verify>): grupo 'assignee de tarefa' presente; leitura cruzada com o corpo de check_task_tenant_coherence() em 0041 confirmando que os 3 cenários correspondem aos branches da função; specs coletados, não executados"
        status: pass
    human_judgment: true
    rationale: "ACCESS-11 era classificado como risco residual sem NENHUMA evidência empírica pelo 17-04-SUMMARY.md (D4: 'a função foi revisada estruturalmente mas NÃO tem prova comportamental em produção'). Este plano fecha a lacuna de COBERTURA DE SPEC, não a lacuna de EXECUÇÃO — os 3 casos continuam sem rodar contra o banco."
  - id: D5
    description: "describe('escrita escopada'): positivo (persiste, releitura confirma) e negativo (não persiste, releitura confirma valor original) para opportunities.observacao (UPDATE), opportunity_tasks e opportunity_risks (INSERT/UPDATE/DELETE), opportunity_notes e opportunity_documents (INSERT/DELETE) — nenhuma conclusão por error === null sozinho"
    requirement: ACCESS-06
    verification:
      - kind: other
        ref: "grep automatizado (Task 2 <verify>): grupo 'escrita escopada' presente, serviceRoleClient() presente em toda releitura; npm run test:security e npx tsc --noEmit no mesmo baseline documentado; specs coletados, não executados"
        status: pass
    human_judgment: true
    rationale: "Pitfall 1 do RESEARCH (o bug mais crítico da fase — sucesso silencioso com 0 linhas afetadas) é exatamente o que .env.test ausente impede de provar de fato. O 17-06-SUMMARY.md já registrava isso como risco residual real, não formalidade; este plano escreve a prova correta, mas ela continua sem rodar."
  - id: D6
    description: "it dedicado: mudança de opportunities.status por psw_staff propaga para opportunity_phases via sync_opportunity_phase() (trigger SECURITY DEFINER, sem policy de escrita própria — exceção verificada da 0041)"
    requirement: ACCESS-06
    verification:
      - kind: other
        ref: "leitura cruzada com supabase/migrations/0004_phase_sync_trigger.sql (mapeamento status→phase_key) e o comentário da 0041 Bloco 2 sobre a ausência deliberada de policy de escrita; spec coletado, não executado"
        status: pass
    human_judgment: true
    rationale: "Este é o spec que, segundo o próprio plano, 'transforma a premissa documentada em fato verificado' — mas só quando rodar de verdade. Sem .env.test, a premissa continua sendo apenas documentada, agora com um teste pronto para confirmá-la."
  - id: D7
    description: "describe('gate de viewer (D-13)'): afirma explicitamente que psw_staff passa no gate current_user_role() <> 'viewer', e prova que um viewer do FGCoop continua barrado na mesma mutação"
    requirement: ACCESS-06
    verification:
      - kind: other
        ref: "grep automatizado (Task 2 <verify>): grupo 'viewer' presente; leitura confirmando a promoção/reversão local de role no describe aninhado; spec coletado, não executado"
        status: pass
    human_judgment: true
    rationale: "Mesma limitação — D-13 fica AFIRMADO em código, não EXECUTADO contra o banco."
  - id: D8
    description: "describe('invited_emails'): tenant_admin recusado ao inserir role=psw_staff, platform_admin aceito (releitura confirma role='psw_staff' persistido), tenant_admin continua conseguindo convidar papel legítimo (regressão)"
    requirement: ACCESS-09
    verification:
      - kind: other
        ref: "grep automatizado (Task 2 <verify>): grupo 'invited_emails' presente; leitura cruzada com a policy invited_emails_insert_tenant_admin reescrita em 0041 (role not in ('platform_admin','psw_staff')); spec coletado, não executado"
        status: pass
    human_judgment: true
    rationale: "ACCESS-09 era outro risco residual sem prova empírica (17-04-SUMMARY.md D5). Mesma lacuna de execução das demais."
  - id: D9
    description: "Suítes de isolamento existentes (tenant-isolation, opportunity-risks-isolation, opportunity-tasks-isolation, platform-admin-cross-tenant, unidasul-isolation, v03-tables-isolation, viewer-role-write-block) continuam verdes sem NENHUMA edição"
    requirement: ACCESS-07
    verification:
      - kind: other
        ref: "npm run test:security"
        status: pass
    human_judgment: false
  - id: D10
    description: "npx tsc --noEmit mostra apenas o erro pré-existente documentado (tests/opportunities/report-strategic.test.ts:107, TS2322)"
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: ~50min de execução ativa (sem checkpoints)
completed: 2026-08-07
status: complete
---

# Phase 17 Plan 05: Specs de propagação, escrita escopada e triggers de coerência (não executados) Summary

**`tests/security/psw-staff-isolation.test.ts` ganha 38 specs cobrindo as 7 tabelas filhas, `profiles`, os 2 triggers de coerência de tenant (4+3 casos), escrita escopada com releitura obrigatória por service-role, o gate de `viewer` (D-13) e a barreira de `invited_emails` (ACCESS-09) — todos escritos contra banco real e NENHUM executado nesta sessão (`.env.test` continua ausente).**

## Performance

- **Duration:** ~50min de execução ativa
- **Started:** 2026-08-07T01:00:00Z (aprox.)
- **Completed:** 2026-08-07T01:55:00Z (aprox.)
- **Tasks:** 2 (ambas `auto`/`tdd="true"`, sem checkpoints)
- **Files modified:** 1 (`tests/security/psw-staff-isolation.test.ts`)

## Accomplishments

- **Fixture ampliada** (`beforeAll`): uma linha por tabela filha (fase, risco, tarefa, nota, documento, histórico, atribuição) sob CADA uma das 3 oportunidades X/Y/Z já existentes, mais uma linha de `opportunity_assignees` sob Y (com o profile do FGCoop) para dar ao describe `tabelas filhas` uma linha real a negar. Um 4º tenant de controle (`eeee0000-...`, prefixo reservado) foi criado sem nenhuma oportunidade atribuída, para provar o negativo de `profiles visíveis`.
- **`describe('tabelas filhas')`**: 1 spec por tabela via `it.each`, nomeado com o texto da tabela — as 7 tabelas (`opportunity_phases/risks/tasks/notes/documents/history/assignees`) cada uma provando X visível, Y (mesmo tenant, sem atribuição) invisível, Z (outro tenant, atribuída) visível.
- **`describe('profiles visíveis')`**: psw_staff enxerga pessoas do tenant FGCoop (onde tem atribuição) e não do tenant de controle.
- **`describe('check_assignee_tenant')`**: os 4 casos do trigger reescrito na 0040 — mesmo tenant aceita, outro tenant sem o papel novo rejeita, papel novo cross-tenant aceita (reusando a fixture já existente), `tenant_id` da linha divergente do da oportunidade rejeita para todos os papéis (D-10).
- **`describe('assignee de tarefa')`**: os 3 casos de `check_task_tenant_coherence()` reescrito na 0041 (ACCESS-11/D-14) — mensagens conferidas por substring.
- **`describe('escrita escopada')`**: positivo+negativo (sempre com releitura por `serviceRoleClient()`, nunca por `error === null`) para `opportunities.observacao` (UPDATE), `opportunity_tasks`/`opportunity_risks` (INSERT/UPDATE/DELETE) e `opportunity_notes`/`opportunity_documents` (INSERT/DELETE) — todos os verbos que a `0041` de fato concede ao papel novo.
- **`it` dedicado**: mudança de `opportunities.status` por psw_staff propaga para `opportunity_phases` via `sync_opportunity_phase()` — a exceção documentada da 0041 ("sem policy de escrita própria, quem escreve é o trigger SECURITY DEFINER") vira spec, não só comentário.
- **`describe('gate de viewer (D-13)')`**: afirma explicitamente que psw_staff passa no gate `current_user_role() <> 'viewer'`, e prova (promovendo/revertendo o FGCoop de teste em `beforeAll`/`afterAll` aninhados) que um `viewer` continua barrado na mesma mutação.
- **`describe('invited_emails')`**: `tenant_admin` recusado ao tentar `role='psw_staff'`, `platform_admin` aceito (com releitura confirmando o valor persistido), e `tenant_admin` continua conseguindo convidar papéis legítimos do próprio tenant (regressão).
- Rodapé do arquivo atualizado — dos 6 nomes de grupo reservados originalmente, só `lista unificada` (Plan 17-07) resta.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specs de propagação — tabelas filhas, `profiles` e os dois triggers** - `1d26dcd` (test)
2. **Task 2: Specs de escrita escopada, gate de `viewer` e barreira de convites** - `d48d06d` (test)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP + REQUIREMENTS + WINDOWS)

## Files Created/Modified

- `tests/security/psw-staff-isolation.test.ts` - de 6 describes/13 specs para 13 describes/38 specs; fixture ampliada com linhas em todas as 7 tabelas filhas + tenant de controle

## Decisions Made

- **`@ts-expect-error` em vez de editar `lib/database.types.ts`** para os inserts de `invited_emails` com `role: 'psw_staff'`. O CHECK do banco já aceita esse valor desde a `0041`, mas o tipo hand-maintained do `Insert`/`Row`/`Update` de `invited_emails` ainda só lista `'member'|'tenant_admin'|'viewer'`. Corrigir o tipo propriamente exigiria também atualizar `Record<InviteRow['role'], string>` em `app/(app)/admin/invites/page.tsx` (union exaustivo) — fora de `files_modified` deste plano (só lista o arquivo de teste). Registrado como débito em `.planning/WINDOWS.md` (#14) em vez de silenciosamente ignorado.
- **Reusar a fixture existente para o caso (c) de `check_assignee_tenant`** (profile psw_staff aceita cross-tenant) em vez de inserir uma 4ª oportunidade só para esse teste — as atribuições X/Z do staff PSW no `beforeAll` já exercitam exatamente esse cenário; o `it` dedicado só torna essa prova explícita e nomeada.
- **Tenant de controle com id novo (`eeee0000-...`, faixa reservada)** para o describe `profiles visíveis` — FGCoop/Acme/PSW já têm atribuição de X/Y/Z, nenhum serve de controle "tenant sem nenhuma atribuição".
- **Split do diff em 2 commits por task feito DEPOIS de escrever o arquivo inteiro** — as duas tasks foram implementadas em sequência dentro do mesmo arquivo sem parar para commitar entre elas (desvio do protocolo `task_commit_protocol`, corrigido antes do commit final). Reconstruí o estado intermediário pós-Task-1 (removendo os 3 describes da Task 2 e revertendo o rodapé à forma original) para poder rodar `typecheck`/`vitest` e commitar cada task separadamente, na ordem correta. O resultado final no disco é idêntico ao que teria sido produzido commitando task a task; só a ordem de criação dos commits foi ajustada retroativamente.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — o plano foi executado como escrito. O único ponto que exigiu uma escolha não-trivial (o gap de tipo do `invited_emails.role`) foi resolvido com `@ts-expect-error` local, dentro do escopo declarado do plano (`files_modified` só lista o arquivo de teste), e não como correção de bug/funcionalidade faltante em código de produção.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Nenhum. O plano foi executado integralmente conforme escrito, incluindo a extensão da fixture, os 2 describes de trigger, os 5 verbos de escrita cobertos e o rodapé atualizado.

## Issues Encountered

- **`.env.test` continua ausente — NENHUM dos 38 specs deste plano executou contra banco real nesta sessão.** Esta é a limitação estrutural documentada em `<baseline_from_orchestrator>` desde o início da execução: `describe.skipIf(!HAS_DB)` pula a suíte inteira. Todos os specs foram escritos "corretos por construção" — os valores esperados foram derivados diretamente do corpo das funções/triggers lidos em `supabase/migrations/0040_psw_staff_access_core.sql`, `0041_psw_staff_child_access.sql` e `0043_child_tenant_coherence.sql`, não de suposição. **Nenhum spec deste plano tem prova empírica.** Isto fecha a lacuna de COBERTURA (specs escritos, corretos por leitura cruzada do código-fonte SQL) que a fase carregava desde `17-04`/`17-06` para ACCESS-05/06/09/11 — não a lacuna de EXECUÇÃO, que segue aberta e é anterior a esta fase (Phase 7.5).
- **Baseline de falhas pré-existentes, fora de escopo, inalterado**: `npx vitest run` — os mesmos 7 testes falhando nos mesmos 3 arquivos (`tests/opportunities/v03-pure-logic.test.ts`, `tests/public-form/steps.test.ts`, `tests/wizard/state.test.ts`), confirmado idêntico antes e depois. `npx tsc --noEmit` — o mesmo 1 erro em `tests/opportunities/report-strategic.test.ts:107` (TS2322), confirmado idêntico antes e depois.
- **`scripts/qa/` (diretório untracked, não pertence a este plano) permanece intocado** — confirmado por `git status --short` antes e depois de cada commit.
- Registrados em `.planning/WINDOWS.md`: entrada #13 (unrun-verify, os 38 specs deste plano) e #14 (todo, o gap de tipo de `invited_emails.role`).

## Known Stubs

Nenhum stub — este plano só adiciona specs de teste, sem UI ou lógica de produção nova.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano — este plano é estritamente adição de testes; não cria endpoint, rota, tabela ou caminho de auth novo.

## User Setup Required

**`.env.test` apontando para um projeto Supabase Cloud DE TESTE** continua pendente desde a Phase 7.5, agora carregada por 7 plans consecutivos da Phase 17 (17-01 a 17-05). Sem ele, os 38 specs deste plano (e os specs decisivos das fases anteriores) nunca rodam de verdade. **Atenção adicional, herdada do `WINDOWS.md` #8**: as fixtures desta suíte (`FGCOOP_TEST_ID`, `ACME_TEST_ID` em `tests/setup/seed-test-tenants.ts`) COLIDEM com UUIDs de tenants reais de produção (`FGCOOP_TEST_ID = 11111111-...` é o mesmo id do tenant FGCoop real da migration `0002`) — apontar `.env.test` para o projeto de PRODUÇÃO em vez de um projeto de teste seria destrutivo na primeira execução (renomeia o FGCoop real via upsert, `cleanupTestTenants()` apaga as oportunidades reais dele). Isso não foi piorado por este plano (a instrução explícita foi "não corrigir a colisão aqui, é um todo separado") — só reforçado no fixture novo com um id de faixa claramente reservada (`eeee0000-...`) para não adicionar mais uma colisão.

## Next Phase Readiness

- Os 3 requisitos com risco residual "sem prova empírica" do `17-04-SUMMARY.md` (ACCESS-09, ACCESS-11, e a defesa em profundidade do `17-06-SUMMARY.md` para ACCESS-06) agora têm spec ESCRITO e correto por leitura cruzada do SQL aplicado — a lacuna que resta é puramente de EXECUÇÃO (`.env.test`), não de cobertura.
- `npm run test:security` continua verde (68 passed, 101 skipped incluindo os 38 novos) — ACCESS-07 preservado por construção, nenhum arquivo de `tests/security/` pré-existente foi tocado.
- `npx tsc --noEmit` mostra só o erro pré-existente documentado.
- Recomendo fortemente que, antes do fechamento da Phase 17, alguém rode esta suíte pelo menos uma vez contra um projeto Supabase Cloud de teste real (não produção — ver aviso de colisão de UUID acima) para transformar "correto por construção" em "provado". Os 4 smokes manuais recomendados pelo `17-06-SUMMARY.md` continuam sem cobertura automatizada (são de escopo de Server Action/HTTP, não de RLS pura) — ficam para o Plan 17-08 ou para o fechamento da fase.
- Plan 17-07 é o único consumidor restante do rodapé de nomes reservados (`lista unificada`).

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-07*

## Self-Check: PASSED

Arquivo declarado (`tests/security/psw-staff-isolation.test.ts`) existe no disco com as 38 specs. Commits declarados (`1d26dcd`, `d48d06d`) existem em `git log --oneline --all`.
