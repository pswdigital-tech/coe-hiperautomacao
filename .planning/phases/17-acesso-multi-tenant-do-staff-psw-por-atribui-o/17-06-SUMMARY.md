---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 06
subsystem: api
tags: [nextjs, server-actions, supabase, rls, multi-tenant, typescript]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-04"
    provides: "Migrations 0041/0042 aplicadas em produção (RLS aditiva das tabelas filhas + Storage + check_task_tenant_coherence); migration 0043 (fora do 17-04, aplicada depois) — guarda de coerência de tenant em opportunity_notes/opportunity_risks/opportunity_documents/opportunity_history"
provides:
  - "resolveWriteTenantId() em lib/security/role.ts — ponto único do escopo de escrita (D-11), com comportamento inalterado para papéis de cliente e derivação pela oportunidade-alvo para psw_staff"
  - "WRITE_SCOPE_DENIED_MESSAGE — texto pt-BR único para escopo não resolvido, consumido por todos os call sites"
  - "9 pontos de escopo de escrita (.eq('tenant_id', profile.tenant_id)) substituídos pelo escopo resolvido no servidor, com early return ANTES de qualquer mutação"
  - "5 pontos de INSERT (createRisk/createTask/createNote/addDocumentLink/uploadDocumentFile) também migrados para o escopo resolvido — extensão além do texto literal do plano (ver Deviations)"
  - "assignee-actions.ts aceita vínculo cross-tenant de psw_staff quando quem atribui é platform_admin (D-05, ACCESS-09)"
affects: ["17-05", "17-07", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escopo de escrita resolvido em ponto único (lib/security/role.ts::resolveWriteTenantId), consumido por todas as Server Actions de mutação em vez de cada call site reimplementar `.eq('tenant_id', profile.tenant_id)`"
    - "Early return explícito quando o escopo resolve `null`, sempre ANTES da mutação — elimina a classe de bug 'sucesso silencioso com zero linhas afetadas'"
    - "Para mutações sem opportunityId no contrato de chamada (updateTaskStatus), ler a linha-alvo primeiro (SELECT autenticado, RLS-filtrado) só para descobrir a oportunidade, e só então resolver o escopo"

key-files:
  created: []
  modified:
    - lib/security/role.ts
    - lib/supabase/server.ts
    - lib/opportunities/actions.ts
    - lib/opportunities/risk-actions.ts
    - lib/opportunities/task-actions.ts
    - lib/opportunities/note-actions.ts
    - lib/opportunities/document-actions.ts
    - lib/opportunities/assignee-actions.ts

key-decisions:
  - "Estendi resolveWriteTenantId() também aos 5 INSERTs (createRisk, createTask, createNote, addDocumentLink, uploadDocumentFile) que carimbavam tenant_id: profile.tenant_id — não estavam na lista literal de 9 pontos do plano (que cobria só UPDATE/DELETE, o sintoma de 'sucesso silencioso'). Sem essa extensão, D-04 ficaria quebrado especificamente para CRIAR tarefa/nota/risco/documento numa oportunidade atribuída de outro tenant: a guarda de coerência da 0043 (e o check_task_tenant_coherence pré-existente para tarefas) rejeitaria o insert com um erro cru do banco."
  - "updateTaskStatus não recebe opportunityId no contrato (é o formato que o Kanban consome) — adicionei um SELECT autenticado prévio (RLS-filtrado) só para descobrir a qual oportunidade a tarefa pertence, antes de chamar resolveWriteTenantId. Isso adiciona um round-trip extra a essa mutação específica, mas é o único jeito de resolver o escopo ANTES da mutação sem mudar o contrato de chamada do Kanban."
  - "document-actions.ts: resolveProfile() interno passou a receber opportunityId e devolver o tenant JÁ RESOLVIDO — usado tanto nos filtros de tabela quanto no path do Storage (T-17-33), garantindo que os dois nunca divirjam."
  - "Nos arquivos que faziam auth.getUser() + profiles.select('tenant_id') inline, troquei por getCurrentProfile() (já usado por assignee-actions.ts) — colapsa as duas mensagens de erro antigas ('Sessão expirada.' / 'Profile não encontrado.') numa só ('Sessão expirada.'). Simplificação de baixo risco: nenhum acceptance criteria do plano depende da distinção entre as duas mensagens."

requirements-completed: [ACCESS-06, ACCESS-09]

coverage:
  - id: D1
    description: "resolveWriteTenantId() exportado em lib/security/role.ts — profile de cliente retorna profile.tenantId sem ida ao banco; psw_staff retorna o tenant_id da oportunidade-alvo (via client autenticado, RLS-filtrado) ou null quando fora do escopo"
    requirement: ACCESS-06
    verification:
      - kind: other
        ref: "grep automatizado (Task 1 <verify>): export async function resolveWriteTenantId presente, ramifica por isPswStaff, lê a oportunidade via maybeSingle/single; npm run typecheck limpo (só o erro pré-existente documentado)"
        status: pass
    human_judgment: false
  - id: D2
    description: "9 pontos de escopo de escrita (.eq('tenant_id', profile.tenant_id)) substituídos pelo escopo resolvido, com early return antes da mutação: updateOpportunity, updateRisk, deleteRisk, updateTask, deleteTask, updateTaskStatus, deleteNote, deleteDocument (2 pontos via ctx.tenantId)"
    requirement: ACCESS-06
    verification:
      - kind: other
        ref: "grep automatizado (Task 2 <verify>): resolveWriteTenantId presente nos 5 módulos; zero ocorrências de .eq('tenant_id', profile.tenant_id|profile.tenantId) em lib/opportunities/*.ts; npm run typecheck e npm run test com o mesmo baseline documentado (1 erro TS pré-existente, 7 testes falhando pré-existentes em 3 arquivos não relacionados)"
        status: pass
    human_judgment: false
  - id: D3
    description: "5 INSERTs adicionais (createRisk, createTask, createNote, addDocumentLink, uploadDocumentFile) também usam o escopo resolvido — extensão além do plano literal, necessária para D-04"
    verification:
      - kind: other
        ref: "npm run typecheck e npm run test com o mesmo baseline; leitura manual confirmando que nenhum dos 5 pontos carimba mais tenant_id: profile.tenant_id"
        status: pass
    human_judgment: true
    rationale: "Não há teste automatizado de comportamento (o único suite de isolamento relevante, tests/security/psw-staff-isolation.test.ts, permanece describe.skipIf sem .env.test — não executou nesta sessão nem em nenhuma anterior da fase). A correção foi verificada por leitura de código + typecheck, não por execução real contra o banco com um psw_staff de verdade criando linhas numa oportunidade atribuída de outro tenant."
  - id: D4
    description: "assignee-actions.ts aceita psw_staff cross-tenant quando quem atribui é platform_admin, e continua recusando qualquer outro profile de tenant diferente"
    requirement: ACCESS-09
    verification:
      - kind: other
        ref: "grep automatizado (Task 3 <verify>): isPswStaff/psw_staff presente, isPlatformAdmin exige no ramo cross-tenant, query com whitelist de colunas (id, tenant_id, role), tenant_id da linha inserida continua vindo de opp.tenant_id; npm run typecheck e npm run test no mesmo baseline"
        status: pass
    human_judgment: true
    rationale: "Mesma limitação de D3 — nenhum teste automatizado real exercitou o vínculo cross-tenant contra o banco nesta sessão (suite de isolamento skipada por falta de .env.test). A correção estrutural foi revisada por leitura + grep, não por um platform_admin real vinculando um psw_staff a uma oportunidade de outro tenant em produção/staging."

# Metrics
duration: ~35min de execução ativa (3 tasks auto, sem checkpoints)
completed: 2026-08-07
status: complete
---

# Phase 17 Plan 06: Escopo de escrita resolvido no servidor — resolveWriteTenantId() Summary

**`resolveWriteTenantId()` centraliza em `lib/security/role.ts` a resolução do tenant de escrita (profile do cliente vs. oportunidade-alvo para `psw_staff`), substitui os 9 pontos de `.eq('tenant_id', profile.tenant_id)` das Server Actions de mutação (mais 5 INSERTs, por extensão), e `assignee-actions.ts` passa a aceitar vínculo cross-tenant de staff PSW quando quem atribui é `platform_admin`.**

## Performance

- **Duration:** ~35min de execução ativa
- **Started:** 2026-08-07T01:07:00Z (aprox., primeiro commit de task)
- **Completed:** 2026-08-07T01:32:08Z
- **Tasks:** 3 (todas `auto`, sem checkpoints)
- **Files modified:** 8

## Accomplishments

- `resolveWriteTenantId(profile, opportunityId)` exportado em `lib/security/role.ts`: para papéis de cliente (`member`/`viewer`/`tenant_admin`/`platform_admin`) retorna `profile.tenantId` sem nenhuma ida ao banco — comportamento idêntico ao `.eq('tenant_id', profile.tenant_id)` de hoje; para `psw_staff` lê o `tenant_id` da oportunidade-alvo pelo client autenticado (RLS-filtrado), colapsando "oportunidade inexistente" e "fora do escopo" no mesmo `null`.
- `WRITE_SCOPE_DENIED_MESSAGE` — mensagem pt-BR única para o caso `null`, consumida por todos os call sites (nenhum reescreve a mensagem à sua maneira, nenhum revela qual das duas causas ocorreu).
- Comentário-contrato de `lib/supabase/server.ts` (linhas ~41-60) atualizado com a nuance: a regra "toda mutação carrega um filtro defensivo de tenant" continua valendo, mas o `$TENANT_ID` das Server Actions de `lib/opportunities/*.ts` não pode mais vir de `profiles.tenant_id` cru — cita `resolveWriteTenantId()` como o ponto único.
- Os 9 pontos de escopo de escrita listados no plano (`updateOpportunity`; `updateRisk`/`deleteRisk`; `updateTask`/`deleteTask`/`updateTaskStatus`; a mutação de nota (`deleteNote`); `deleteDocument` — 2 pontos via `ctx.tenantId`) passam a resolver o tenant no servidor, com early return **antes** de qualquer mutação quando o escopo resolve `null`.
- `updateTaskStatus` (que não recebe `opportunityId` no contrato — é o formato que o Kanban consome) ganhou um SELECT autenticado prévio só para descobrir a qual oportunidade a tarefa pertence, e só então resolve o escopo — o único jeito de fazer o early return acontecer antes da mutação sem mudar a assinatura que o Kanban já consome.
- `document-actions.ts`: `resolveProfile()` interno passou a receber `opportunityId` e devolver o tenant já resolvido, usado tanto nos filtros de tabela quanto no path do Storage — os dois nunca divergem (T-17-33).
- `assignee-actions.ts`: a validação de profiles atribuíveis passa a aceitar um profile `psw_staff` de **qualquer** tenant quando quem atribui é `platform_admin` (D-05), mantendo a recusa para qualquer outro profile de tenant diferente. Query com whitelist de colunas (`id, tenant_id, role`); `tenant_id` da linha inserida continua vindo da **oportunidade** (D-10), nunca do profile atribuído.
- Extensão além do texto literal do plano: os 5 pontos de INSERT que carimbavam `tenant_id: profile.tenant_id` (`createRisk`, `createTask`, `createNote`, `addDocumentLink`, `uploadDocumentFile`) também passaram a usar `resolveWriteTenantId()` — ver seção "Deviations from Plan".

## Task Commits

Each task was committed atomically:

1. **Task 1: `resolveWriteTenantId()` em `lib/security/role.ts`** - `1995fe2` (feat)
2. **Task 2: Trocar os pontos de escopo de escrita nas seis Server Actions (+ 5 inserts por extensão)** - `3c42dfa` (feat)
3. **Task 3: `assignee-actions.ts` — aceitar staff PSW cross-tenant via `platform_admin`** - `4215849` (feat)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `lib/security/role.ts` - `resolveWriteTenantId()` + `WRITE_SCOPE_DENIED_MESSAGE`
- `lib/supabase/server.ts` - comentário-contrato atualizado (nenhum código executável mudou)
- `lib/opportunities/actions.ts` - `updateOpportunity` escopado pelo servidor
- `lib/opportunities/risk-actions.ts` - `createRisk`, `updateRisk`, `deleteRisk`
- `lib/opportunities/task-actions.ts` - `createTask`, `updateTask`, `deleteTask`, `updateTaskStatus`
- `lib/opportunities/note-actions.ts` - `createNote`, `deleteNote`
- `lib/opportunities/document-actions.ts` - `resolveProfile()` interno, `addDocumentLink`, `uploadDocumentFile`, `deleteDocument`
- `lib/opportunities/assignee-actions.ts` - validação de profiles atribuíveis ampliada para `psw_staff` cross-tenant

## Decisions Made

- **Estender `resolveWriteTenantId()` aos 5 INSERTs, além dos 9 pontos literalmente listados no plano.** Os `must_haves.truths` do plano dizem "Nenhuma mutação de oportunidade ou de tabela filha escopa por `profile.tenant_id` cru; todas passam pelo escopo resolvido" — mais amplo que a lista de "9 pontos" (que documentava especificamente o sintoma de sucesso silencioso em UPDATE/DELETE). Sem estender aos creates, um `psw_staff` criando tarefa/nota/risco/documento numa oportunidade atribuída de tenant diferente teria o insert **rejeitado com erro cru do banco** pela guarda de coerência da `0043` (ou pelo `check_task_tenant_coherence` pré-existente para tarefas) — quebrando D-04 ("psw_staff escreve como member: tarefas, notas, documentos, riscos") justamente no caso de uso central desta fase. Classifiquei como Rule 2 (funcionalidade crítica faltante) e documentei explicitamente aqui em vez de deixar como débito silencioso.
- **`updateTaskStatus` ganhou uma leitura prévia da tarefa.** Não recebe `opportunityId` (contrato do Kanban); sem saber a oportunidade não há como chamar `resolveWriteTenantId()` antes da mutação. Optei por um SELECT autenticado (RLS-filtrado, portanto seguro) em vez de mudar a assinatura da função — manteria o contrato que o componente Kanban já consome.
- **Colapsar `getCurrentProfile()` no lugar de `auth.getUser()` + `profiles.select('tenant_id')` inline** nos arquivos que ainda não usavam esse helper (`actions.ts`, `risk-actions.ts`, `task-actions.ts`, `note-actions.ts`). Necessário porque `resolveWriteTenantId()` precisa do `role` do profile (para `isPswStaff`), que o select inline antigo não buscava. Efeito colateral: as duas mensagens de erro antigas ("Sessão expirada." para sem-user, "Profile não encontrado." para user-sem-profile) colapsam em uma só ("Sessão expirada.") — nenhum acceptance criteria do plano depende dessa distinção.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Estendido `resolveWriteTenantId()` aos 5 pontos de INSERT que carimbavam `tenant_id: profile.tenant_id`**
- **Found during:** Task 2 (ao ler `createRisk`, `createTask`, `createNote`, `addDocumentLink`, `uploadDocumentFile` para entender o padrão a substituir)
- **Issue:** Esses 5 INSERTs não estavam na lista literal de "9 pontos" do plano (que cobre só UPDATE/DELETE — o sintoma de sucesso silencioso). Mas eles carimbam `tenant_id: profile.tenant_id` na linha inserida — para `psw_staff` criando um risco/tarefa/nota/documento numa oportunidade atribuída de OUTRO tenant, isso grava o `tenant_id` da PSW numa linha cujo `opportunity_id` pertence a outro tenant. Antes da `0043` isso silenciosamente poluía dados (exatamente o defeito que a 17-04 encontrou); depois da `0043`, o insert simplesmente falha com um `check_violation` cru do Postgres. De qualquer forma, D-04 ("psw_staff escreve como member") ficaria quebrado para o caso de uso mais comum: criar coisas novas numa oportunidade atribuída.
- **Fix:** `createRisk`, `createTask` e `createNote` passaram a chamar `getCurrentProfile()` + `resolveWriteTenantId(profile, opportunityId)`, com early return usando `WRITE_SCOPE_DENIED_MESSAGE` antes do insert. Em `document-actions.ts`, o `resolveProfile()` interno (usado por `addDocumentLink`, `uploadDocumentFile` e `deleteDocument`) passou a receber `opportunityId` e devolver o tenant já resolvido — usado tanto no insert quanto (crucialmente) no path do Storage.
- **Files modified:** `lib/opportunities/risk-actions.ts`, `lib/opportunities/task-actions.ts`, `lib/opportunities/note-actions.ts`, `lib/opportunities/document-actions.ts`
- **Verification:** `npm run typecheck` limpo (mesmo baseline); `npm run test` no mesmo baseline; leitura manual confirmando ausência de `tenant_id: profile.tenant_id` nesses 5 pontos.
- **Committed in:** `3c42dfa` (parte do commit da Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 2 — funcionalidade crítica faltante, escopo ampliado dentro dos mesmos arquivos/mesma causa raiz do plano).
**Impact on plan:** Amplia a Task 2 além da lista literal de "9 pontos", mas dentro dos mesmos 5 arquivos já listados em `files_modified` e na mesma direção que o plano já apontava (D-04, o `must_haves.truths` mais amplo). Nenhum arquivo fora do escopo do plano foi tocado; nenhuma prohibição do plano foi violada.

## Issues Encountered

- **`tests/security/psw-staff-isolation.test.ts` continua em `describe.skipIf` — `.env.test` continua ausente.** Nenhuma spec desta fase (nem desta sessão) executou contra o banco real. Isso significa que **nada neste plano tem prova comportamental empírica** — toda a verificação foi feita por `npm run typecheck`, `npm run test` (que não cobre estes arquivos com specs de escrita reais) e leitura de código/grep. Em particular, o caso mais crítico do plano — um `psw_staff` realmente escrevendo numa oportunidade atribuída de outro tenant e recebendo erro explícito quando fora do escopo — **não foi exercitado contra o banco** nesta sessão.
- **Baseline de falhas pré-existentes, fora de escopo, inalterado**: `npx vitest run` → 7 testes falhando em 3 arquivos (`tests/opportunities/v03-pure-logic.test.ts`, `tests/public-form/steps.test.ts`, `tests/wizard/state.test.ts`) — confirmado idêntico ao baseline documentado antes e depois das 3 tasks. `npx tsc --noEmit` → 1 erro em `tests/opportunities/report-strategic.test.ts:107` (TS2322) — confirmado idêntico antes e depois. Nenhum dos dois foi tocado ou investigado por este plano.
- **`scripts/qa/` (diretório untracked, não pertence a este plano) permanece intocado** — confirmado por `git status --short` antes e depois de cada commit.

## Known Stubs

Nenhum stub introduzido por este plano. Todas as mudanças são lógica de servidor (Server Actions + helper de segurança) sem UI nova.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano — todas as mudanças são substituições de fonte de valor (`profile.tenant_id` → escopo resolvido) dentro de call sites já existentes, sem novo endpoint, novo caminho de auth, ou nova tabela.

## User Setup Required

None - nenhuma configuração de serviço externo requerida por este plano. Este plano não escreve migration (a Task 3 consome o trigger `check_assignee_tenant()` já reescrito e aplicado na `0040`).

## Next Phase Readiness

- Os 3 requisitos centrais do plano (ponto único de escopo, 9+5 call sites migrados, `assignee-actions.ts` cross-tenant) estão implementados e passam em `typecheck`/`test` no mesmo baseline documentado.
- **Risco residual real, não apenas formalidade:** nenhuma prova comportamental contra o banco real. Recomendo fortemente que o Plan 17-07 (ou o fechamento da fase) inclua, ainda que manualmente, os 4 smokes que provariam este plano de fato: (1) `psw_staff` editando/criando risco-tarefa-nota-documento numa oportunidade atribuída → sucesso real (releitura confirma o valor novo); (2) `psw_staff` tentando o mesmo numa oportunidade NÃO atribuída → erro explícito, nunca `{ ok: true }`; (3) `member` de tenant fazendo as mesmas operações no próprio tenant → comportamento idêntico ao de antes; (4) `platform_admin` atribuindo um `psw_staff` a uma oportunidade de outro tenant → sucesso, e um `tenant_admin` tentando o mesmo → recusado.
- `.env.test` continua ausente — mesma pendência de Phase 7.5, agora carregada por 6 plans consecutivos de Phase 17 (17-01 a 17-06) sem veredito automatizado real dos specs decisivos de segurança.
- Nenhum arquivo de `tests/security/` pré-existente foi editado.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-07*

## Self-Check: PASSED

Todos os arquivos declarados (`lib/security/role.ts`, `lib/supabase/server.ts`, `lib/opportunities/actions.ts`, `lib/opportunities/risk-actions.ts`, `lib/opportunities/task-actions.ts`, `lib/opportunities/note-actions.ts`, `lib/opportunities/document-actions.ts`, `lib/opportunities/assignee-actions.ts`) existem no disco. Todos os commits declarados (`1995fe2`, `3c42dfa`, `4215849`) existem em `git log --oneline --all`.
