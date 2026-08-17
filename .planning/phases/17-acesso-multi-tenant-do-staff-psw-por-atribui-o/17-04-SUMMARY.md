---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 04
subsystem: database
tags: [postgres, rls, supabase, multi-tenant, security-definer, trigger, storage, audit]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-03"
    provides: "current_assigned_opportunity_ids() (helper), check_assignee_tenant() reescrito, 2 policies aditivas de SELECT (opportunities/tenants) — aplicadas e provadas em produção"
provides:
  - "Migration 0041 aplicada em produção: SELECT aditivo nas 7 tabelas filhas + profiles (8 policies), escrita aditiva espelhando os verbos do member (11 policies), 3 policies de Storage no bucket opportunity-documents, check_task_tenant_coherence() reescrito (ACCESS-11), CHECK + policy de invited_emails ajustados (ACCESS-09)"
  - "Migration 0042 aplicada em produção: policy condicional de audit_log e gate ampliado de opportunity_audit_trail(uuid), ambos atrás de to_regclass/to_regprocedure (D-15)"
  - "Achado principal: vazamento aparente em opportunity_notes/opportunity_risks investigado e EXONERADO — a 0041 não concedeu nenhuma das 7 linhas suspeitas; causa raiz é um defeito PRÉ-EXISTENTE (falta de guarda de coerência de tenant em opportunity_notes/opportunity_risks/opportunity_documents, ausente desde 0011/0018). PO decidiu escrever uma migration 0043 (fora do escopo deste plano) para corrigir a guarda e as 7 linhas."
  - "17-04-MIGRATION-HANDOFF.md com roteiro de 9 verificações ESCRITO mas NÃO EXECUTADO — o apply foi validado por uma rota diferente (ver Issues Encountered)."
affects: ["17-05", "17-06", "17-07", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expansão mecânica de um padrão de RLS aditiva já provado (0040) para N tabelas, com short-circuit current_user_role() = 'psw_staff' e escopo sempre por opportunity_id, nunca por tenant_id"
    - "Blocos condicionais em migration (to_regclass/to_regprocedure + EXECUTE dinâmico dentro de DO $$) para tornar um objeto novo inerte em ambientes onde sua dependência (audit_log/0038) ainda não existe"
    - "Verificação pós-apply por contagem+diagnóstico ad-hoc (não o roteiro do handoff) como o que efetivamente validou o apply desta vez — registrado como padrão a NÃO repetir sem necessidade: o roteiro escrito deveria ter sido a fonte de verdade"

key-files:
  created:
    - supabase/migrations/0041_psw_staff_child_access.sql
    - supabase/migrations/0042_psw_staff_audit_trail.sql
    - .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-04-MIGRATION-HANDOFF.md
  modified:
    - .planning/WINDOWS.md

key-decisions:
  - "checkpoint:decision (Task 3) resolvido pelo PO: aplicar-as-duas. O contra que motivava as alternativas (cópia da RPC de auditoria divergir de uma 0038 instável) deixou de existir: a 0038 já estava commitada (f3d2846), anterior a todo o trabalho desta fase — achado verificado de forma independente pelo executor e confirmado pelo orquestrador. commitar-a-0038-antes era, portanto, um no-op; so-a-0041 deixaria a aba Histórico vazia-sem-erro, o sintoma que a fase existe para eliminar."
  - "Achado mais importante do plano: o vazamento aparente reportado pela verificação do orquestrador (7 linhas entre notas e riscos, aparentemente fora do conjunto atribuído) foi investigado e EXONERA a migration 0041 — nenhuma policy nova concedeu essas linhas. Causa raiz: opportunity_notes/opportunity_risks/opportunity_documents nunca tiveram guarda de coerência de tenant (equivalente a check_assignee_tenant/check_task_tenant_coherence), então qualquer usuário não-viewer sempre pôde pendurar nota/risco/documento em oportunidade de OUTRO tenant, carimbando o próprio tenant_id — defeito pré-existente desde 0011/0018, não introduzido por esta fase. PO decidiu corrigir via migration 0043, fora do escopo deste plano."
  - "invited_emails (Bloco 6 da 0041): ampliar o CHECK e apertar a policy de INSERT do tenant_admin na MESMA migration foi decisão de segurança deliberada — fazer isso em dois passos separados abriria uma janela real de escalação de privilégio (CHECK aberto sem a policy barrando ainda o papel novo)."
  - "Storage (Bloco 4 da 0041): comparar o 2º segmento do path como TEXTO em vez de castar para uuid foi decisão deliberada — um objeto fora da convenção de path derrubaria a policy inteira com erro de cast, para TODOS os usuários, não só para o psw_staff."
  - "opportunity_assignees (Bloco 2 da 0041): nenhuma policy de escrita para psw_staff — decisão confirmada (não omissão): atribuir é prerrogativa exclusiva do platform_admin (D-05); dar escrita aqui permitiria auto-atribuição."

requirements-completed: [ACCESS-05, ACCESS-06, ACCESS-09, ACCESS-11]

coverage:
  - id: D1
    description: "Migrations 0041 e 0042 escritas: estrutura completa (8 policies de SELECT nominais, 11 de escrita espelhando os verbos vigentes, 3 de Storage, check_task_tenant_coherence() reescrito, ajustes de invited_emails; bloco condicional de audit_log/opportunity_audit_trail)"
    requirement: ACCESS-05
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1/2 <verify>): todas as policies nominais presentes; toda drop policy nomeia sufixo _psw_staff exceto a exceção documentada; nenhuma escrita indevida em opportunities/opportunity_assignees/opportunity_history; blocos da 0042 condicionais a to_regclass/to_regprocedure"
        status: pass
    human_judgment: false
  - id: D2
    description: "0041 e 0042 aplicadas em produção pelo PO, em Runs separados, nessa ordem"
    requirement: ACCESS-05
    verification:
      - kind: manual_procedural
        ref: "Confirmação direta do PO/orquestrador: 'APLICADAS'. NENHUMA das 9 verificações do 17-04-MIGRATION-HANDOFF.md foi executada para confirmar isso — ver rationale."
        status: unknown
    human_judgment: true
    rationale: "O apply foi confirmado pelo PO, mas por uma rota DIFERENTE da que este plano preparou: uma verificação de vazamento escrita pelo orquestrador (contagem de linhas visíveis por tabela filha, impersonando o profile de QA) mais 3 diagnósticos ad-hoc sem RLS, disparados depois que a verificação acusou uma anomalia. O roteiro de 9 verificações do handoff (contagem exata de policies, presença nominal D-09, storage, invited_emails, triggers, os 3 smokes de responsável de tarefa, o smoke de Storage com 403, e a verificação condicional da 0042) permanece ESCRITO e NÃO EXECUTADO. Não afirmo que ele validou nada — só o apply, mais a verificação de vazamento e o diagnóstico subsequente, sustentam este plano."
  - id: D3
    description: "Vazamento aparente (7 linhas entre opportunity_notes/opportunity_risks) investigado e exonerado quanto à 0041; causa raiz identificada como defeito pré-existente em opportunity_notes/opportunity_risks/opportunity_documents (sem guarda de coerência de tenant)"
    verification:
      - kind: manual_procedural
        ref: "3 queries de diagnóstico sem RLS rodadas pelo orquestrador/PO após a anomalia da verificação de vazamento — confirmaram tenant_id=PSW nas 7 linhas, opportunity_id não-nulo/não-órfão (FK NOT NULL + CASCADE torna órfã impossível), e ausência de trigger de coerência nas 3 tabelas (inventário de triggers do repo)"
        status: pass
    human_judgment: true
    rationale: "A investigação foi feita pelo orquestrador via leitura de schema + 3 queries pontuais, não por um teste automatizado repetível. O veredito (0041 inocente, defeito pré-existente) é registrado aqui como achado do plano, mas a correção (migration 0043) e sua verificação são trabalho FUTURO, fora do escopo desta plano."
  - id: D4
    description: "check_task_tenant_coherence() (ACCESS-11) aceita psw_staff atribuído como responsável de tarefa, e continua rejeitando profile de outro tenant sem o papel novo"
    requirement: ACCESS-11
    verification: []
    human_judgment: true
    rationale: "Os 3 casos do smoke de responsável de tarefa (verificação 7 do handoff) NÃO foram executados. A tabela opportunity_tasks aparece com 0 linhas visíveis na verificação de vazamento do orquestrador (nenhuma tarefa nas 2 oportunidades atribuídas ao profile de QA hoje), o que não prova nem desmente a branch nova do trigger. A função foi revisada estruturalmente (grep + leitura) mas NÃO tem prova comportamental em produção."
  - id: D5
    description: "invited_emails: CHECK aceita psw_staff; policy de INSERT do tenant_admin passa a excluir psw_staff explicitamente"
    requirement: ACCESS-09
    verification: []
    human_judgment: true
    rationale: "Verificações 4 e 5 do handoff (conteúdo do CHECK e do with_check da policy) NÃO foram executadas. Nenhuma tentativa real de INSERT como tenant_admin com role='psw_staff' foi feita para confirmar rejeição. Revisão estrutural (grep + leitura do SQL) confirma a intenção do código; produção não foi testada neste ponto específico."
  - id: D6
    description: "Storage (D-12): psw_staff baixa anexo de oportunidade atribuída e recebe 403 em anexo de oportunidade não atribuída"
    requirement: ACCESS-05
    verification: []
    human_judgment: true
    rationale: "A verificação de vazamento do orquestrador mostrou 0 documentos visíveis para o profile de QA nas 2 oportunidades atribuídas hoje — não há dado real para exercitar a policy de storage.objects. O smoke de Storage (verificação 8 do handoff, positivo + negativo com 403) NÃO foi executado. Este é o maior risco residual do plano: a peça mais frágil do RESEARCH (Pitfall de Storage) é a única sem qualquer evidência empírica, positiva ou negativa."
  - id: D7
    description: "0042: policy condicional de audit_log e gate ampliado de opportunity_audit_trail(uuid) funcionam corretamente (retorna linhas para oportunidade atribuída, vazio para não atribuída)"
    verification: []
    human_judgment: true
    rationale: "A verificação de vazamento do orquestrador NÃO cobriu audit_log/opportunity_audit_trail — só as 6 tabelas filhas de domínio. A verificação 9 do handoff (a única que provaria a 0042 de fato) NÃO foi executada. Sabe-se apenas que o apply da 0042 não gerou erro reportado. Nenhuma evidência funcional de que a trilha de auditoria está corretamente escopada para o psw_staff."

# Metrics
duration: ~45min de execução ativa (mais o tempo de espera de dois checkpoints humanos — decisão do PO na Task 3 e apply manual na Task 4)
completed: 2026-08-06
status: complete
---

# Phase 17 Plan 04: Tabelas filhas, Storage, responsável de tarefa e convites — migrations 0041/0042 aplicadas, vazamento aparente investigado e exonerado Summary

**Migrations `0041` (7 tabelas filhas + `profiles` + Storage + `check_task_tenant_coherence()` + `invited_emails`) e `0042` (trilha de auditoria condicional) escritas, verificadas estruturalmente e aplicadas em produção; uma verificação de vazamento pós-apply encontrou 7 linhas aparentemente fora de escopo, investigação exonerou a `0041` e revelou um defeito pré-existente (sem relação com esta fase) em `opportunity_notes`/`opportunity_risks`/`opportunity_documents`, que o PO decidiu corrigir numa migration `0043` separada.**

## Performance

- **Duration:** ~45min de execução ativa (mais o tempo de espera dos dois checkpoints humanos: `checkpoint:decision` da Task 3 e `checkpoint:human-action` da Task 4)
- **Started:** 2026-08-06T21:19:00-03:00 (aprox., primeiro commit de task)
- **Completed:** 2026-08-06 (apply confirmado pelo PO)
- **Tasks:** 4 (2 `auto`, 1 `checkpoint:decision`, 1 `checkpoint:human-action`)
- **Files modified:** 4 (3 criados, 1 ledger atualizado)

## Accomplishments

- `supabase/migrations/0041_psw_staff_child_access.sql`: 8 policies de SELECT aditivas (as 7 tabelas filhas + `profiles`), 11 policies de escrita espelhando exatamente os verbos que cada tabela já concede ao `member` (`opportunities` só UPDATE; `opportunity_tasks`/`opportunity_risks` INSERT+UPDATE+DELETE; `opportunity_notes`/`opportunity_documents` INSERT+DELETE), 3 policies de Storage no bucket `opportunity-documents` casando o 2º segmento do path como texto, `check_task_tenant_coherence()` reescrito (ACCESS-11/D-14) e os 2 ajustes de `invited_emails` (ACCESS-09/D-17) — **aplicada em produção**.
- `supabase/migrations/0042_psw_staff_audit_trail.sql`: policy condicional de `audit_log` e gate ampliado de `opportunity_audit_trail(uuid)`, ambos atrás de `to_regclass`/`to_regprocedure` (D-15) — **aplicada em produção**.
- `checkpoint:decision` (Task 3) resolvido pelo PO: `aplicar-as-duas`, com o achado (verificado de forma independente pelo executor, confirmado pelo orquestrador) de que `0038_audit_log.sql` já estava commitada (`f3d2846`) desde antes do início desta fase — eliminando o risco de divergência que motivava as alternativas.
- `17-04-MIGRATION-HANDOFF.md` escrito com um roteiro de 9 verificações pós-apply (contagem exata de policies com lista nominal, presença de todas as policies pré-existentes por tabela, Storage, `invited_emails`, triggers de `opportunity_tasks`, 3 smokes de responsável de tarefa, smoke de Storage com 403, e verificação condicional da `0042`) — **este roteiro NÃO foi executado** (ver Issues Encountered).
- **Achado mais importante do plano**: uma verificação de vazamento escrita pelo orquestrador (impersonando o profile de QA `fa5f0000-0000-4000-8000-000000000002`) apontou 7 linhas "fora de escopo" em `opportunity_notes`/`opportunity_risks`. A investigação subsequente **exonera a `0041`** — nenhuma policy nova concede essas linhas — e revela um **defeito pré-existente**, sem relação com esta fase: `opportunity_notes`, `opportunity_risks` e `opportunity_documents` nunca tiveram guarda de coerência de tenant, então qualquer usuário não-`viewer` sempre pôde pendurar nota/risco/documento em oportunidade de OUTRO tenant. O PO decidiu escrever uma migration `0043` (fora do escopo deste plano) para fechar essa lacuna e corrigir as 7 linhas.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0041 — tabelas filhas, profiles, Storage, tarefa, convites** - `fb35c2c` (feat)
2. **Task 2: Migration 0042 — trilha de auditoria condicional** - `abbe5cb` (feat)
3. **Task 3 [DECISÃO one-way]: aplicar-as-duas** - sem commit próprio (decisão registrada neste SUMMARY; a `action` da task diz "nada é aplicado nesta task")
4. **Task 4 [BLOCKING]: Handoff de apply manual** - `2ef88e1` (docs) — apply em si feito pelo PO fora do controle de versão (SQL Editor do Supabase Cloud)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `supabase/migrations/0041_psw_staff_child_access.sql` - policies aditivas + trigger reescrito + ajustes de invited_emails (aplicado em produção)
- `supabase/migrations/0042_psw_staff_audit_trail.sql` - bloco condicional de audit_log/opportunity_audit_trail (aplicado em produção)
- `.planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-04-MIGRATION-HANDOFF.md` - roteiro de 9 verificações (escrito, não executado)
- `.planning/WINDOWS.md` - 3 novas entradas: roteiro de verificação não executado, ressalva de escopo de `profiles_select_psw_staff`, e o defeito pré-existente que motivará a `0043`

## Decisions Made

- **Task 3 — `aplicar-as-duas` confirmado pelo PO.** A `0038_audit_log.sql` já estava commitada (`f3d2846`) desde antes do início da Phase 17 — achado que o executor verificou de forma independente (`git ls-files --error-unmatch` + `git log`) e que o orquestrador confirmou como correto. Isso elimina o "contra" que motivava `so-a-0041`/`commitar-a-0038-antes`: a cópia do corpo da RPC em `0042` não corre risco de divergir de uma fonte instável, porque a fonte já é estável.
- **`invited_emails` Bloco 6 — ampliar o CHECK e apertar a policy de INSERT do `tenant_admin` na MESMA migration.** Fazer isso em dois passos deixaria uma janela intermediária vulnerável (CHECK aberto para `psw_staff` sem a policy ainda barrando o `tenant_admin` de usá-lo) — decisão de segurança, não detalhe de implementação.
- **Storage — comparar o 2º segmento do path como TEXTO, sem cast para uuid.** Um objeto fora da convenção de nomenclatura derrubaria a policy inteira com erro de cast, para TODOS os usuários (não só `psw_staff`) — decisão deliberada de robustez.
- **`opportunity_assignees` sem policy de escrita para `psw_staff`.** Confirmado como decisão (não omissão): atribuir pessoas a oportunidades é prerrogativa exclusiva do `platform_admin` (D-05); dar escrita aqui permitiria o staff PSW se auto-atribuir.
- **Achado mais importante — exoneração da 0041 e descoberta de defeito pré-existente.** Ver seção dedicada abaixo.
- **PO decidiu: migration `0043`, DENTRO desta fase mas FORA do escopo deste plano**, replicando a guarda de coerência de tenant para `opportunity_notes`/`opportunity_risks`/`opportunity_documents` e corrigindo as 7 linhas já existentes com `tenant_id` incorreto. Este plano (17-04) **não** escreve essa migration.

## Achado Mais Importante — Vazamento Aparente Exonerado, Defeito Pré-Existente Encontrado

**Resultado bruto da verificação de vazamento** (escrita pelo orquestrador, impersonando o profile de QA `fa5f0000-0000-4000-8000-000000000002`, contando linhas visíveis por tabela filha e, para cada uma, quantas pertencem a oportunidade fora do conjunto atribuído):

| tabela | visíveis | vazamentos |
|---|---|---|
| oportunidades | 6 | (n/a) |
| tarefas | 0 | 0 |
| riscos | 2 | 2 |
| notas | 5 | 5 |
| documentos | 0 | 0 |
| fases | 4 | 0 |

**Análise, linha por linha:**

- **`oportunidades = 6`**: 4 do tenant da própria PSW (via a policy pré-existente por tenant, `tenant_id = current_tenant_id()`) + 2 atribuídas (via a policy nova `opportunities_select_psw_staff`, 0040). Não é vazamento — é o mesmo padrão já observado no smoke da `0040` com o FGCoop (o profile via as oportunidades do próprio tenant SOMADAS às atribuídas).
- **Os 7 "vazamentos" são 5 notas + 2 riscos**, todos com `tenant_id = cccccccc-cccc-cccc-cccc-cccccccccccc` (tenant da PSW) porém pendurados em oportunidades do tenant `55551da5-0000-0000-0000-000000000001` (Unidasul). As oportunidades referenciadas **existem** — não são órfãs (`opportunity_id` é `not null references opportunities(id) on delete cascade`; órfã é estruturalmente impossível).
- **Nenhuma policy da `0041` concedeu essas linhas.** Todas as policies de SELECT que a `0041` cria usam `opportunity_id in (select current_assigned_opportunity_ids())` — essa condição não alcança essas 7 linhas (suas oportunidades não estão no conjunto atribuído ao profile de QA). Quem concede a visibilidade é a policy **PRÉ-EXISTENTE** `opportunity_notes_select`/`opportunity_risks_select` (`tenant_id = current_tenant_id()`, de `0018`/`0011`) — o profile de QA é do tenant PSW, e essas 7 linhas TAMBÉM têm `tenant_id` = PSW, então a policy antiga (não tocada por esta fase) as concede legitimamente, segundo seu próprio critério.
- **Causa raiz, confirmada no schema do repositório:** não existe guarda de coerência de tenant em `opportunity_notes`, `opportunity_risks` nem `opportunity_documents`. O inventário de triggers do repo mostra guarda de coerência apenas em `opportunity_assignees` (`check_assignee_tenant`, 0032) e `opportunity_tasks` (`check_task_tenant_coherence`, 0037). As policies de INSERT dessas três tabelas (`0011`/`0015`/`0018`) validam apenas que o `tenant_id` **da linha** bate com `current_tenant_id()` — nunca que o `opportunity_id` referenciado de fato pertence a esse tenant.
- **Efeito prático:** qualquer usuário não-`viewer`, de qualquer tenant, sempre pôde inserir uma nota/risco/documento apontando para o `opportunity_id` de QUALQUER oportunidade do sistema (bastando conhecer o id), carimbando o próprio `tenant_id` na linha. A linha fica visível para o tenant de quem escreveu, e invisível para o tenant dono da oportunidade referenciada.
- **Severidade, com precisão — nem inflada nem minimizada:** isto **não exfiltra dado do tenant vítima** (o conteúdo da nota/risco pertence a quem escreveu, não ao tenant da oportunidade). É um problema de **integridade/poluição de dados**, mais um oráculo fraco de existência de `id` de oportunidade (confirma que um `opportunity_id` existe, sem revelar seu conteúdo). Não é um vazamento de confidencialidade no sentido do docs/PROJETO.md §1.
- **Origem provável:** alguém da PSW, com perfil no tenant PSW, anotando em oportunidades de cliente pelo app, com a server action carimbando `tenant_id: profile.tenant_id` — **exatamente o cenário que originou esta fase** (pessoa da PSW cadastrada fora do tenant do cliente, mas ainda tocando dados dele).
- **Este defeito é PRÉ-EXISTENTE, anterior a esta fase (0011/0018) — não foi introduzido pela `0041` nem por qualquer plano da Phase 17.** A `0041` está estruturalmente correta quanto ao que se propôs a fazer (RLS aditiva por atribuição); o gap está numa camada diferente (ausência de guarda de coerência), que nenhuma decisão travada do CONTEXT.md desta fase cobria.
- **Decisão do PO a partir deste achado:** escrever uma migration `0043`, replicando o padrão de `check_assignee_tenant()`/`check_task_tenant_coherence()` para `opportunity_notes`/`opportunity_risks`/`opportunity_documents`, e corrigir as 7 linhas já existentes. **Isto é trabalho FUTURO, fora do escopo deste plano (17-04)** — não escrito aqui.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — as Tasks 1 e 2 (`auto`) foram executadas conforme escrito no plano, sem necessidade de correção de bug/funcionalidade faltante/bloqueio (Rules 1-3) além do que o próprio plano já previa (ex.: o Bloco 6 de `invited_emails` já estava especificado no plano como decisão de segurança, não como correção emergente).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Nenhum desvio de execução das Tasks 1/2. O "desvio" real desta sessão não foi de código, foi de **verificação**: o roteiro de 9 checks do handoff (Task 4) não foi seguido — ver Issues Encountered.

## Issues Encountered

- **O roteiro de 9 verificações do `17-04-MIGRATION-HANDOFF.md` NÃO foi executado.** O que de fato sustentou o fechamento deste plano foi: (1) o apply de `0041` e depois `0042` em produção, confirmado pelo PO; (2) uma verificação de vazamento **diferente**, escrita pelo orquestrador (não pelo executor), impersonando o profile de QA e contando linhas visíveis vs. "vazadas" por tabela filha; (3) 3 queries de diagnóstico sem RLS, disparadas depois que (2) acusou uma anomalia. **Não afirmo que as 9 verificações passaram — elas simplesmente não rodaram.** Ficam registradas em `.planning/WINDOWS.md` como roteiro disponível e não executado, junto às demais não-execuções desta fase.
- **Consequência direta da não-execução do roteiro**: os itens mais frágeis do RESEARCH desta fase — a policy de `storage.objects` (Pitfall de Storage) e a branch nova de `check_task_tenant_coherence()` (ACCESS-11) — **não têm nenhuma evidência empírica em produção**, nem positiva nem negativa. A verificação de vazamento do orquestrador mostrou 0 documentos e 0 tarefas visíveis nas 2 oportunidades atribuídas ao profile de QA hoje, o que é consistente com "sem vazamento" mas também consistente com "sem dado para exercitar a policy" — os dois cenários são indistinguíveis com os dados atuais. Recomendo fortemente que o Plan 17-05 (specs de propagação/escrita) cubra isso com dado real antes do fecho da fase.
- **`0042` (trilha de auditoria) não foi verificada por nenhuma rota** — nem pelo handoff, nem pela verificação de vazamento do orquestrador (que cobriu só as 6 tabelas de domínio, não `audit_log`). Sabe-se apenas que o apply não reportou erro.
- **Vazamento aparente investigado e exonerado quanto à `0041`; defeito pré-existente descoberto** — ver seção dedicada acima. Resultou na decisão do PO de escrever a migration `0043` (fora do escopo deste plano).
- **`tests/security/psw-staff-isolation.test.ts` continua em `describe.skipIf`.** `.env.test` continua ausente (mesma pendência desde a Phase 7.5, carregada por 17-01/17-02/17-03). **Nenhuma spec desta fase executou nesta sessão** — nem antes, nem depois do apply. Este plano não muda esse estado.
- **Baseline de falhas pré-existentes, fora de escopo, inalterado**: `npx vitest run` — 7 testes falhando em 3 arquivos (`tests/opportunities/v03-pure-logic.test.ts`, `tests/public-form/steps.test.ts`, `tests/wizard/state.test.ts`); `npx tsc --noEmit` — 1 erro em `tests/opportunities/report-strategic.test.ts:107` (TS2322). Nenhum dos dois foi tocado ou investigado por este plano — não relacionados aos arquivos modificados aqui.

## User Setup Required

None — nenhuma configuração de serviço externo requerida por este plano. O apply das migrations já foi feito pelo PO diretamente no Supabase Cloud SQL Editor.

## Next Phase Readiness

- `0041` e `0042` aplicadas em produção. Os planos **17-05 em diante estão destravados**, conforme o bloqueio explícito do handoff.
- **Risco residual real, não apenas formalidade**: a policy de `storage.objects` (D-12) e a branch nova de `check_task_tenant_coherence()` (ACCESS-11) não têm prova empírica em produção. Recomenda-se fortemente que o Plan 17-05 (specs de propagação/escrita, próxima wave do ROADMAP) inclua dado real (um documento de teste anexado, uma tarefa com responsável psw_staff) e rode — ainda que manualmente via SQL Editor, no mesmo padrão do handoff não executado — antes de considerar esses dois requisitos (parte de ACCESS-05/ACCESS-11) genuinamente fechados.
- **`0043` decidida, não escrita**: replicar a guarda de coerência de tenant para `opportunity_notes`/`opportunity_risks`/`opportunity_documents` e corrigir as 7 linhas com `tenant_id` incorreto encontradas nesta sessão. Não é bloqueador dos planos 17-05+ (o defeito é pré-existente e de integridade, não de confidencialidade), mas deveria ser priorizada antes do fechamento da Phase 17 para não ficar como débito silencioso.
- **`.env.test` continua ausente** — mesma pendência de Phase 7.5, agora carregada por 5 plans consecutivos de Phase 17 (17-01 a 17-04) sem veredito automatizado real dos specs decisivos.
- Nenhum arquivo de `tests/security/` pré-existente foi editado — ACCESS-07 preservado por construção.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-06*

## Self-Check: PASSED

Todos os arquivos declarados (`supabase/migrations/0041_psw_staff_child_access.sql`, `supabase/migrations/0042_psw_staff_audit_trail.sql`, `17-04-MIGRATION-HANDOFF.md`, `17-04-SUMMARY.md`) existem no disco. Todos os commits declarados (`fb35c2c`, `abbe5cb`, `2ef88e1`) existem em `git log --oneline --all`.
