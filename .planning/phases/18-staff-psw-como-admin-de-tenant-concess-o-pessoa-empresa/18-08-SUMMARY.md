---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 08
subsystem: auth
tags: [nextjs, rsc, rbac, multi-tenant, supabase, rls, ui, shell]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-04, 18-06, 18-07)
    provides: "isTenantAdminOf/resolveAdminTenantId (18-06), ScopeBadge/NoScopeBanner/Icon.Building (18-07), a tela /admin/staff (18-04) e a leitura escopada das 4 telas de admin (18-07) — este plano fecha a fase conectando a navegação a tudo isso e alinhando o último gate divergente (atribuição de oportunidade)."
provides:
  - "app/(app)/layout.tsx: lista do seletor de empresa estendida ao psw_staff que administra ≥1 empresa (união administradas + alcançadas por atribuição, por ids via fetchTenantsByIds — nunca varredura); sinalizador canAdminister calculado no servidor; decisão registrada de manter a identidade visual do shell no tenant de lotação"
  - "components/shell/Sidebar.tsx: gate de Equipe/Configurações/Logs trocado de papel isolado (profile.role === 'tenant_admin') para o prop canAdminister; novo item de navegação 'Staff PSW' (/admin/staff) no bloco de administração de plataforma, visível só ao super-admin"
  - "lib/opportunities/assignee-actions.ts: setOpportunityAssignees() alinhado com a RLS de 0047 — gate platform_admin OU isTenantAdminOf(profile, tenant-da-oportunidade), com early return de WRITE_SCOPE_DENIED_MESSAGE antes de qualquer mutação"
  - "app/(app)/opportunities/[id]/page.tsx: gate visual do AssigneesPanel usa o mesmo critério tenant-aware da ação"
  - "tests/security/assignee-actions-tenant-scope.test.ts: 6 specs dos casos de <behavior> da Task 2, em skip (prova-por-sql-no-handoff)"
  - "Auditoria de não-regressão da fase inteira: varredura de derivação de tenant, varredura de ponto único de escrita de atribuição, confirmação de que psw-staff-isolation.test.ts não foi editado, e o mapa requisito → evidência de GRANT-01 a GRANT-10"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sinalizador de autorização calculado NO SERVIDOR (app/(app)/layout.tsx, uma camada acima) e passado como prop para um client component (Sidebar.tsx) — a Sidebar nunca consulta concessão (psw_tenant_admins) por conta própria, mesmo padrão de resolveAdminTenantId/isTenantAdminOf não vazarem para o client"
    - "Lista de opções de um seletor multi-tenant montada por UNIÃO de ids (administrados + alcançados por atribuição) via fetchTenantsByIds — nunca por SELECT aberto em tenants — mesmo padrão já usado pela coluna/filtro 'Empresa' da listagem de oportunidades (D-03, Phase 17) e por /logs (18-07)"
    - "Gate de escrita e gate visual usando o MESMO predicado (isTenantAdminOf contra o tenant do recurso) em vez de duas formas divergentes — interface nunca mais restrita nem mais permissiva que a RLS"
    - "Mensagem de escopo única (WRITE_SCOPE_DENIED_MESSAGE) cobrindo tanto 'recurso não encontrado' quanto 'fora do escopo' — nunca revela qual dos dois casos ocorreu, mesma disciplina de ADMIN_SCOPE_DENIED_MESSAGE (18-06)"

key-files:
  created:
    - tests/security/assignee-actions-tenant-scope.test.ts
  modified:
    - app/(app)/layout.tsx
    - components/shell/Sidebar.tsx
    - lib/opportunities/assignee-actions.ts
    - app/(app)/opportunities/[id]/page.tsx

key-decisions:
  - "Identidade visual do shell (app/(app)/layout.tsx) permanece a do tenant de LOTAÇÃO da pessoa, nunca a da empresa selecionada no seletor — decisão explícita, revisável. Racional: trocar o tema do app inteiro em função do seletor seria mudança visível para um papel existente (platform_admin já usa este layout) e não foi pedida; a empresa de atuação já é comunicada pelo ScopeBadge no cabeçalho das 4 telas de admin, onde a ambiguidade de fato importa. Ponto de mudança se a decisão for revista: trocar o argumento de fetchTenantBranding(profile.tenantId) pela origem do tenant-alvo (resolveAdminTenantIdFromSelector)."
  - "Item de navegação novo rotulado 'Staff PSW' (não 'Admin de empresa' nem outro texto) — o plano não fixa a copy; escolhido por ecoar o próprio H1 da tela ('Staff PSW como admin de tenant', 18-04) e manter o padrão de rótulos curtos e substantivos dos irmãos (Proposta, Convites, Rastreabilidade, Configurações). Reusa Icon.Building (criado em 18-07 para o ScopeBadge) — nenhum ícone novo, nenhuma lib externa."
  - "canAdminister é 'tenant_admin de cliente (sempre a própria empresa) OU psw_staff com ≥1 concessão em psw_tenant_admins' — NÃO inclui psw_staff que só tem atribuições individuais sem nenhuma concessão de admin. Isso é literal ao texto do plano ('oferecido também ao psw_staff que administra ao menos uma empresa') e mantém o comportamento de um psw_staff puramente-atribuído idêntico ao da Phase 17 (D-J/SC-12)."
  - "Lista do seletor de empresa para o staff-admin é a UNIÃO de administradas + alcançadas por atribuição (não só administradas) porque o mesmo ?empresa=/cookie coe_empresa já é consumido por app/(app)/opportunities/page.tsx (Phase 17, D-03) para filtrar a listagem cross-tenant — restringir a lista só às administradas quebraria essa filtragem preexistente para tenants só-atribuídos. O gate de MENU (Equipe/Config/Logs), por outro lado, usa só as administradas (canAdminister) — os dois sinalizadores são deliberadamente diferentes."
  - "Mensagem de erro do gate de atribuição unificada para WRITE_SCOPE_DENIED_MESSAGE (não ADMIN_SCOPE_DENIED_MESSAGE) — o recurso em questão é uma OPORTUNIDADE, não uma empresa; WRITE_SCOPE_DENIED_MESSAGE é a mensagem já estabelecida por resolveWriteTenantId (Phase 17) para exatamente este tipo de recurso, mantendo consistência textual com o resto da aplicação."

patterns-established:
  - "Auditoria de fase (Task 3): varredura de derivação de tenant a partir do profile classificada em 3 categorias — exclusões documentadas em RESEARCH §6, decisões explícitas registradas pelo próprio plano em curso, e infraestrutura interna do resolvedor (lib/security/role.ts) — em vez de tratar 'qualquer ocorrência além de N' como regressão automática, que produziria falsos positivos contra código correto e já revisado."

requirements-completed: [GRANT-04, GRANT-09, GRANT-10]

coverage:
  - id: D1
    description: "Shell estendido ao staff-admin: seletor de empresa recortado (união administradas + atribuídas, por ids) e itens de menu Equipe/Configurações/Logs gateados por canAdminister; item de navegação 'Staff PSW' visível só ao super-admin; mecanismo de preservação do ?empresa= intocado"
    requirement: GRANT-04
    verification:
      - kind: other
        ref: "grep estrutural do <verify> da Task 1 (admin/staff presente, role === 'tenant_admin' ausente, sem @/components/ui/, 'empresa' presente) — bash inline, exit 0 (uma checagem do <verify> literal não roda neste ugrep local por incompatibilidade de motor de regex — intenção confirmada manualmente, ver corpo do SUMMARY)"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) após a Task 1"
        status: pass
    human_judgment: true
    rationale: "O <human-check> da Task 1 (login como staff-admin com/sem concessão, super-admin, tenant_admin de cliente, verificando o que cada um vê na Sidebar) exige browser/servidor autenticado, indisponível nesta sessão (binding_proof_mode). Faz parte do roteiro A–H (itens C/D) registrado como pendente no WINDOWS.md (id 37)."
  - id: D2
    description: "Gate de atribuição em oportunidade (ação e visual) alinhado com a RLS de 0047: platform_admin OU isTenantAdminOf(profile, tenant-da-oportunidade); AssigneesPanel continua o único ponto de escrita"
    requirement: GRANT-09
    verification:
      - kind: unit
        ref: "tests/security/assignee-actions-tenant-scope.test.ts — 6 specs cobrindo os 6 casos de <behavior> (super-admin, tenant_admin, staff-admin em A, staff-admin negado em B, psw_staff sem concessão mesmo atribuído, member/viewer) — describe.skipIf(!HAS_DB), 6 skipped, exit 0"
        status: unknown
      - kind: other
        ref: "grep estrutural do <verify> da Task 2 (isTenantAdminOf presente nos 2 arquivos, isTenantAdmin(profile) ausente, WRITE_SCOPE_DENIED_MESSAGE presente, fetchAssignableProfilesForPlatformAdmin intacta, zero escrita em opportunity_assignees sob admin/staff) — bash inline, exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) após a Task 2"
        status: pass
    human_judgment: true
    rationale: "Os 6 specs nunca rodaram contra DB real — .env.test não existe (prova-por-sql-no-handoff, decisão vinculante da fase). A forma do código foi confirmada por typecheck/build/grep estrutural; o comportamento fim-a-fim não tem prova de runtime nesta wave. Registrado como padrão já estabelecido pelas suítes irmãs (resolve-admin-tenant, admin-actions-tenant-scope) desde 18-06."
  - id: D3
    description: "Auditoria de não-regressão da fase inteira: suíte relevante executada por arquivo (nunca a suíte completa, per binding_proof_mode), psw-staff-isolation.test.ts confirmado não-editado, varredura de derivação de tenant e de ponto único de escrita, mapa GRANT-01..10 → evidência"
    requirement: GRANT-10
    verification:
      - kind: unit
        ref: "npx vitest run em 8 arquivos relevantes à fase (psw-staff-restrictive-rule, resolve-admin-tenant, tenant-admin-parity, admin-actions-tenant-scope, assignee-actions-tenant-scope, psw-staff-admin-grant, psw-staff-isolation, staff-access-origins): 40 passed | 111 skipped, 0 failed (151 total)"
        status: pass
      - kind: other
        ref: "git diff --name-status <base>..HEAD -- tests/security/psw-staff-isolation.test.ts — vazio (arquivo não aparece na lista de alterados durante a fase)"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) no estado final da fase"
        status: pass
    human_judgment: true
    rationale: "npm test / npm run test:security (suíte inteira) NÃO foram executados nesta sessão por instrução explícita do binding_proof_mode ('never the whole suite') — ver seção de Auditoria abaixo. O roteiro visual A–H (itens G e H em particular, que provam a não-regressão dos papéis existentes e a concessão órfã) é o gate humano bloqueante deste plano, pendente de execução pelo PO — registrado no WINDOWS.md (id 37)."

# Metrics
duration: ~45min
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 08: Shell estendido ao staff-admin + gate de atribuição alinhado com a RLS + auditoria final Summary

**O staff-admin alcança as telas de admin pela navegação (seletor de empresa recortado à união administradas+atribuídas, itens Equipe/Configurações/Logs gateados por `canAdminister`), o gate de atribuição em oportunidade passa a concordar com a RLS de `0047` (`isTenantAdminOf` contra o tenant-alvo em vez de papel isolado), e a fase é fechada com uma auditoria de não-regressão (varreduras + 40 specs executados) — o roteiro visual A–H fica registrado como pendente de verificação do PO.**

## Performance

- **Duration:** ~45min
- **Completed:** 2026-08-07
- **Tasks:** 2 automáticas + 1 checkpoint bloqueante (não executável nesta sessão)
- **Files modified:** 5 (1 criado, 4 modificados)

## Accomplishments

- `app/(app)/layout.tsx`: a lista de empresas do seletor passa a carregar também para `psw_staff` que administra ≥1 empresa — a união (por ids, via `fetchTenantsByIds`) das empresas administradas (`psw_tenant_admins`) com as já alcançadas por atribuição (`opportunity_assignees`), nunca a carteira completa de clientes (T-18-70). Novo sinalizador `canAdminister` (tenant_admin sempre, OU psw_staff com ≥1 concessão) calculado no servidor. Identidade visual do shell mantida no tenant de lotação — decisão registrada com racional e ponto de mudança (ver `key-decisions`).
- `components/shell/Sidebar.tsx`: o gate local `profile.role === 'tenant_admin'` que decidia Equipe/Configurações/Logs foi substituído pelo prop `canAdminister` — a Sidebar (client component) não consulta concessão por conta própria. Novo item de navegação **"Staff PSW"** (`/admin/staff`) dentro do bloco de administração de plataforma, visível só ao super-admin, usando `Icon.Building` (já existente desde 18-07). O mecanismo de preservação do `?empresa=` entre abas não foi tocado.
- `lib/opportunities/assignee-actions.ts`: `setOpportunityAssignees()` troca o gate por papel isolado (`tenant_admin | platform_admin`) por `platform_admin` OU `isTenantAdminOf(profile, tenant-da-oportunidade)` — o par pessoa × empresa contra o tenant-ALVO. `tenant_id` continua sendo lido da oportunidade ANTES do gate (o critério agora depende dele); "não encontrada" e "fora do escopo" colapsam na mesma mensagem (`WRITE_SCOPE_DENIED_MESSAGE`) antes de qualquer mutação.
- `app/(app)/opportunities/[id]/page.tsx`: o gate visual do `AssigneesPanel` usa o mesmo critério tenant-aware — interface e ação concordam. O 2º argumento de `fetchAssignableProfilesForPlatformAdmin` (uma das três exclusões documentadas) não foi tocado.
- `tests/security/assignee-actions-tenant-scope.test.ts` (novo): 6 specs cobrindo os 6 casos de `<behavior>` da Task 2, com persistência confirmada por releitura via `serviceRoleClient()` — nunca `error === null`. Em `describe.skipIf(!HAS_DB)` (`.env.test` ausente).
- **Auditoria de não-regressão da fase inteira** (Task 3, antes do gate humano): ver seção dedicada abaixo.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Shell — seletor de empresa e menus para o staff-admin, e a rota de concessão na navegação** — `996f27d` (feat)
2. **Task 2: Alinhar o gate de atribuição em oportunidade com o que a RLS já permite** — `aa188b2` (fix)
3. **Task 3: Auditoria de não-regressão e verificação visual A–H** — sem commit de código (auditoria + documentação); ver seção dedicada. O único artefato desta task é este SUMMARY + as entradas no `WINDOWS.md`.

## Files Created/Modified

- `app/(app)/layout.tsx` — seletor estendido ao staff-admin, decisão de identidade visual registrada
- `components/shell/Sidebar.tsx` — gate `canAdminister`, item "Staff PSW"
- `lib/opportunities/assignee-actions.ts` — gate de atribuição tenant-aware
- `app/(app)/opportunities/[id]/page.tsx` — gate visual tenant-aware
- `tests/security/assignee-actions-tenant-scope.test.ts` — 6 specs novos (skip)

## Decisions Made

Ver `key-decisions` no frontmatter para o texto completo. Resumo:

1. **Identidade visual do shell = tenant de lotação, sempre** (não a empresa selecionada) — decisão explícita, revisável, com ponto de mudança documentado.
2. **Item de navegação rotulado "Staff PSW"** (copy não fixada pelo plano) — ecoa o H1 da própria tela, reusa `Icon.Building`.
3. **`canAdminister` exclui psw_staff só-atribuído** (sem nenhuma concessão) — preserva o comportamento de Phase 17 para esse caso, literal ao texto do plano.
4. **Lista do seletor é a união (administradas + atribuídas), não só administradas** — porque o mesmo `?empresa=`/cookie já filtra a listagem de oportunidades cross-tenant desde a Phase 17 (D-03); o gate de MENU usa só administradas — os dois sinalizadores são deliberadamente diferentes um do outro.
5. **Mensagem de erro do gate de atribuição = `WRITE_SCOPE_DENIED_MESSAGE`** (não `ADMIN_SCOPE_DENIED_MESSAGE`) — o recurso é uma oportunidade, não uma empresa; mantém a mensagem já estabelecida por `resolveWriteTenantId` (Phase 17) para este tipo de recurso.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma. O `<action>` de cada task foi seguido; os únicos ajustes foram de ferramenta/ambiente (ver abaixo), não de comportamento.

### Desvios de execução, não de código

**1. [Ferramenta] Uma condição do `<verify>` da Task 1 não roda neste ambiente por incompatibilidade de motor de regex**
- **Found during:** Task 1, ao rodar o `<verify>` automatizado literal.
- **Issue:** O comando local `grep` neste ambiente é `ugrep` (não GNU grep nem BSD grep) e recusa o padrão `grep -q "fetchTenantsByIds\|\.in\("` com erro `mismatched ( )` — a alternação `\|` combinada com `\(` desbalanceado (fora de `-E`) é interpretada de forma mais estrita.
- **Fix:** A intenção do check (layout.tsx não vira uma varredura da carteira inteira SEM ter `fetchTenantsByIds` em algum lugar) foi verificada manualmente com greps separados (`grep -qE "from\('tenants'\)[^)]*select\("` → encontrado, uso legítimo do `platform_admin`; `grep -q "fetchTenantsByIds"` → encontrado, uso do staff-admin). Ambos os greps individuais confirmam a condição real do check.
- **Files modified:** nenhum (achado de ferramenta, não de código).
- **Verification:** greps individuais equivalentes, exit 0 nos dois.

**2. [Reportado, não decidido unilateralmente] `npm test`/`npm run test:security` (suíte inteira) não executados na Task 3**
- **O que aconteceu:** o `<verify>` literal da Task 3 pede `npm test`. O `binding_proof_mode` deste plano instrui explicitamente: "NEVER run npm run test:security or any integration spec against production... To run a spec, run that specific file with npx vitest run <file> — never the whole suite."
- **Por que isso é esperado, não um bug:** mesma restrição já aplicada em 18-06 (registrada no `WINDOWS.md` id 34) — mesmo com `.env.test` ausente tornando a suíte inteira tecnicamente segura (o `global-setup.ts` cai em modo `unit-only` sem URL configurada), a instrução do plano é taxativa sobre nunca invocar o comando de suíte completa.
- **Como foi contornado:** rodei `npx vitest run` com os 8 arquivos de teste relevantes à fase inteira, nomeados individualmente (nunca um diretório nem o comando sem escopo) — ver seção de Auditoria abaixo para os números.
- **Impact:** a cobertura "suíte inteira" do `<verify>` da Task 3 foi substituída por uma cobertura "todos os arquivos relevantes à fase, nomeados", que é o que o `binding_proof_mode` permite. Registrado no `WINDOWS.md` (id 38).

---

**Total deviations:** 0 de código (Rules 1-4 não se aplicaram); 2 desvios de execução (1 incompatibilidade de ferramenta local, 1 restrição de ambiente já precedente na fase).
**Impact on plan:** Nenhum impacto de escopo ou comportamento — os dois desvios são de como a VERIFICAÇÃO foi executada, não do que foi implementado.

## Auditoria de Não-Regressão (Task 3)

### 1. Suíte e verificação de tipos

`npm run typecheck` → exit 0. `npm run build` → exit 0 (22 rotas geradas, incluindo `/admin/staff`).

`npm test` / `npm run test:security` (suíte/diretório completo) **não foram executados** nesta sessão — proibido pelo `binding_proof_mode` deste plano ("never the whole suite"), mesma restrição que bloqueou 18-06. Em vez disso, rodei `npx vitest run` nomeando individualmente os 8 arquivos relevantes à fase inteira:

```
tests/schema/psw-staff-restrictive-rule.test.ts        7 passed
tests/security/resolve-admin-tenant.test.ts            12 passed | 2 skipped  (14)
tests/schema/tenant-admin-parity.test.ts                5 passed | 4 skipped  (9)
tests/security/admin-actions-tenant-scope.test.ts             0 | 11 skipped (11)
tests/security/assignee-actions-tenant-scope.test.ts           0 | 6 skipped  (6)
tests/security/psw-staff-admin-grant.test.ts                   0 | 47 skipped (47)
tests/security/psw-staff-isolation.test.ts                     0 | 41 skipped (41)
tests/opportunities/staff-access-origins.test.ts       16 passed

TOTAL: 40 passed | 111 skipped, 0 failed (151 tests, 8 files)
```

**Isto NÃO é lido como "verde" para os 111 specs em skip** — `.env.test` não existe (`prova-por-sql-no-handoff`, decisão vinculante desde 18-02). É o mesmo estado estável documentado em cada plano desta fase desde então.

### 2. `tests/security/psw-staff-isolation.test.ts` não foi editado durante a fase

```
git diff --name-status dbddce9~1..HEAD -- tests/security/psw-staff-isolation.test.ts
```
→ saída vazia. O arquivo não aparece na lista de alterados em nenhum commit da Phase 18. Continua em `describe.skipIf(!HAS_DB)`, mesmo estado de antes da fase.

(`tests/security/psw-staff-admin-grant.test.ts` aparece no diff da fase, mas como arquivo **novo** — `git diff --name-status` mostra `A`, adicionado no Plan 18-01 — não uma edição de arquivo pré-existente.)

### 3. Varredura de derivação de tenant a partir do profile

```
grep -rn "profile[!.]*\.tenantId" "app/(app)" lib components
```

Ocorrências encontradas e classificação de cada uma:

| Arquivo:linha | Classificação |
|---|---|
| `app/(app)/admin/invites/actions.ts:113` | **Exclusão documentada #1** (RESEARCH §6) — regra de lotação do staff PSW no convite |
| `app/(app)/opportunities/[id]/page.tsx` (2º arg de `fetchAssignableProfilesForPlatformAdmin`) | **Exclusão documentada #2** — tenant da PSW por construção, intocado por design |
| `app/(app)/layout.tsx` (carga de `fetchTenantBranding`) | **Decisão desta própria fase (Task 1, 18-08)** — identidade visual do shell = tenant de lotação, registrada acima; pré-existente ao código desta fase, revisada e mantida deliberadamente, não uma exclusão herdada |
| `app/(app)/logs/page.tsx:153` (`isTenantAdminOf(profile, profile.tenantId)`) | **Uso correto introduzido por 18-07** — não deriva o tenant-ALVO de terceiros a partir do profile; usa o par tenant-aware para testar "é admin do PRÓPRIO tenant" (branch `tenant_admin`), byte-equivalente e sem ida ao banco — mesmo padrão que `resolveAdminTenantId`/`resolveWriteTenantId` usam internamente para todo papel de cliente |
| `lib/security/role.ts` (5 ocorrências, dentro de `resolveWriteTenantId`/`resolveAdminTenantId`/`isTenantAdminOf`) | **Infraestrutura do próprio resolvedor** (Phase 17/18-06) — é a implementação da regra "para papéis de cliente, o tenant-alvo É `profile.tenantId`, sem ida ao banco"; não é um call site de aplicação a auditar, é a fonte única que os call sites acima consomem |

`lib/opportunities/{note,risk,task,document}-actions.ts` (**exclusão documentada #3**, "já usam o resolvedor de escopo por oportunidade") não aparecem no grep porque não referenciam `profile.tenantId` diretamente — usam `resolveWriteTenantId(profile, opportunityId)`, confirmando que já delegam corretamente.

**Conclusão:** a varredura não encontrou nenhuma ocorrência NÃO explicada. O texto do `<verify>` da Task 3 antecipava "só as três exclusões" porque foi escrito antes de saber que esta própria Task 1 acrescentaria uma quarta ocorrência decidida por escrito (o shell) e que 18-07 já tinha introduzido uma quinta, correta por construção (`/logs`). Nenhuma delas é regressão.

### 4. Varredura do ponto único de escrita de atribuição

```
grep -rln "opportunity_assignees" app/ lib/ components/ | xargs grep -lE "\.insert\(|\.update\(|\.upsert\(|\.delete\("
```
→ `lib/database.types.ts` (falso positivo — são os tipos `Insert`/`Update` da tabela, comentários e chaves de objeto TypeScript, não chamadas Supabase reais, confirmado por `grep -nE` linha a linha) e `lib/opportunities/assignee-actions.ts` (o ponto sancionado). Nenhum arquivo sob `app/(app)/admin/staff` executa verbo de escrita — confirmado também pelo grep restrito do `<verify>` da Task 2.

### 5. Mapa de requisitos — GRANT-01 a GRANT-10

| Requisito | Evidência |
|---|---|
| GRANT-01 (concessão N:N) | Migration `0045` (18-02), `lib/database.types.ts` (18-01) — verificação estrutural no handoff `18-02-MIGRATION-HANDOFF.md` |
| GRANT-02 (sem concessão = baseline `0044` intocado) | `tests/security/psw-staff-admin-grant.test.ts` specs `a1`/`a1b`/`a2`/`c4-baseline` (skip) + verificação numerada dos handoffs `18-02`/`18-03` |
| GRANT-03 (com concessão em A, vê tudo de A + atribuídas alhures) | RLS aditiva de `0045` (`opportunities`) — spec `c1`/`c2` (skip) + observação direta pelo app registrada em `18-02-SUMMARY.md` |
| GRANT-04 (mesmos poderes de tenant_admin dentro de onde administra) | `lib/security/role.ts` (`isTenantAdminOf`/`resolveAdminTenantId`, 18-06) + `team/actions.ts`/`configuracoes/actions.ts` (18-06) + leitura escopada das 4 telas (18-07) + **este plano** (shell alcançável: seletor + itens de menu, Task 1) — specs `d1`-`d8d` (skip) + `resolve-admin-tenant.test.ts` (12 passed) |
| GRANT-05 (tenant-alvo explícito, validado, nunca zero-linhas-sucesso) | `resolveAdminTenantId`/`ADMIN_SCOPE_DENIED_MESSAGE` (18-06) — `tests/security/resolve-admin-tenant.test.ts` (12 passed, sem banco) + `admin-actions-tenant-scope.test.ts` (11 specs, skip, persistência por releitura) |
| GRANT-06 (só platform_admin concede/revoga) | RLS de `psw_tenant_admins` (0045) restrita a `platform_admin` no insert/delete — spec `c6`/`c7` (skip, "staff-admin NÃO consegue conceder/revogar") |
| GRANT-07 (`/admin/staff`, duas origens separadas) | `app/(app)/admin/staff/page.tsx` (18-04) + `lib/staff-admin/origins.ts` — `tests/opportunities/staff-access-origins.test.ts` (16 passed, puro, sem banco) |
| GRANT-08 (revogação quantificada, atribuição sobrevive) | `RevokeGrantButton`/`countOpportunitiesLostOnRevoke`/`formatRevokeImpact` (18-04) — cobertos nos mesmos 16 specs de `staff-access-origins.test.ts` |
| GRANT-09 (atribuição só em `AssigneesPanel`) | **Este plano** — gate de `assignee-actions.ts`/`opportunities/[id]/page.tsx` alinhado com a RLS (Task 2); varredura de ponto único de escrita (seção 4 acima, zero ocorrências fora do painel) + `assignee-actions-tenant-scope.test.ts` (6 specs, skip) |
| GRANT-10 (zero regressão em papéis existentes) | Baseline decisivo `18-01` + specs `b1`-`b5`/`d8a`-`d8d` (skip) + **este plano**, seção "Varredura de derivação de tenant" (nenhuma ocorrência não explicada) + **pendente:** item G do roteiro visual A–H (ver abaixo) |

## Roteiro Visual A–H — PENDENTE de verificação do PO

**Esta sessão não tem acesso a browser.** Todo o trabalho de código e a auditoria automatizada acima foram concluídos; o gate humano abaixo é o único item que falta para fechar a Phase 18 inteira. Registrado como `unrun-verify` no `WINDOWS.md` (id 37).

Preparar dois usuários de teste: um `psw_staff` **sem** concessão e um `psw_staff` **com** concessão em duas empresas (concedidas pela própria tela, no passo A).

- **A — Conceder.** Super-admin abre `/admin/staff` pelo menu (novo item "Staff PSW"). Concede a uma pessoa da PSW acesso de admin em duas empresas. **Esperado:** as duas linhas aparecem; o formulário volta ao estado inicial; nenhuma mensagem de erro.
- **B — Diagnóstico.** Ainda como super-admin, expande a linha dessa pessoa. **Esperado:** os DOIS blocos aparecem separados ("Admin nas empresas" / "Atribuições individuais"); atribuições numa empresa administrada vêm marcadas "já coberta pelo admin" com a contagem entre parênteses; bloco vazio mostra seu próprio texto, nunca some. Atribuições só têm link de leitura, nenhum controle de edição.
- **C — Ver o que passou a ver.** Login como a pessoa com concessão, abrir `/opportunities`. **Esperado:** aparecem oportunidades das duas empresas administradas (mesmo as não atribuídas a ela) + as atribuídas em outras empresas; coluna "Empresa" com os nomes; nada de empresa sem concessão nem atribuição. Abrir uma oportunidade não atribuída de empresa administrada: anotações/tarefas/riscos/documentos/histórico carregam. **Também confirmar (Task 1 deste plano):** o seletor de empresa aparece na Sidebar, listando só as empresas administradas + atribuídas; os itens Equipe/Configurações/Logs aparecem; o item "Staff PSW" NÃO aparece (é do super-admin).
- **D — Exercer os poderes.** Com a empresa A selecionada no seletor: em Equipe, convidar e revogar convite pendente; em Configurações, trocar cor e subir logo; em Logs, ver o log de A. **Esperado:** tudo funciona e o efeito é real (recarregar e conferir); o ScopeBadge mostra A no cabeçalho das 4 telas.
- **E — Estado sem empresa.** Selecionar "todas as empresas", voltar a Equipe/Configurações. **Esperado:** controles de escrita desabilitados e visíveis com o aviso pt-BR acima; nada é gravado; leitura não mostra dados de outra empresa.
- **F — Revogar com impacto.** Super-admin revoga uma concessão. **Esperado:** diálogo informa quantas oportunidades a pessoa deixa de enxergar, com concordância singular/plural correta; cancelar não muda nada; confirmar remove a linha. Login como a pessoa: oportunidades daquela empresa somem, EXCETO as atribuídas nominalmente.
- **G — Não-regressão.** Login como `member`, `viewer` e `tenant_admin` de cliente. **Esperado:** tudo idêntico a antes da fase — mesma lista, mesmas telas, mesmos menus, sem ScopeBadge. `tenant_admin` de cliente ainda gerencia convites/equipe/branding da própria empresa. **Este é o item que fecha GRANT-10 do lado visual** (o lado automatizado já foi coberto pela auditoria acima).
- **H — Concessão órfã.** Super-admin despromove a pessoa de `psw_staff` para outro papel (ou por SQL). **Esperado:** a linha de concessão PERMANECE em `/admin/staff`, sinalizada como órfã (badge + linha esvaecida); a pessoa deixa de enxergar as oportunidades daquela empresa. Repromover: acesso volta sozinho, sem reconceder.

**Itens C, F, G e H são os que provam, respectivamente:** a concessão funcionando, a revogação quantificada com atribuição sobrevivente, a não-regressão dos papéis existentes, e a concessão órfã inerte e sinalizada — são os quatro que a `acceptance_criteria` do plano marca como obrigatórios.

## Issues Encountered

1. **`<human-check>` da Task 1 e o roteiro A–H da Task 3 não executados** — sem acesso a browser/servidor autenticado nesta sessão. Ver seção dedicada acima. Registrado no `WINDOWS.md` (id 37).
2. **Especificação incompatível de `grep` local (`ugrep`) com um padrão do `<verify>` literal da Task 1** — achado de ferramenta, não de código; intenção confirmada manualmente (ver Deviations #1).
3. **`npm test`/`npm run test:security` não executados na Task 3** — restrição explícita do `binding_proof_mode`, já precedente em 18-06. Registrado no `WINDOWS.md` (id 38).
4. **Nenhum novo bug ou lacuna de segurança encontrado** pela auditoria de derivação de tenant nem pela de ponto único de escrita — ambas fecharam limpas (seções 3 e 4 acima).

## User Setup Required

Nenhuma ação de ambiente pendente. `.env.test` continua intencionalmente ausente (decisão vinculante da fase, `prova-por-sql-no-handoff`).

**Ação necessária do PO, ÚNICA pendência para fechar a Phase 18 inteira:**
1. Executar o roteiro visual A–H acima (seção dedicada) e colar o resultado de cada item.
2. Enquanto isso, os itens já registrados em `WINDOWS.md` das Tasks 2/3 de 18-06 e 18-07 (ids 32, 33, 35, 36) continuam abertos — o roteiro A–H, se executado, cobre a maior parte do que eles pedem (D/E cobrem os `<human-check>` de team/configuracoes; C cobre parte do de `/logs`). Recomenda-se rodá-lo como o fechamento único de toda a fase, não item por item.
3. Se o resultado divergir do esperado em qualquer item, descrever a divergência em vez de "aprovado" — ver `<resume-signal>` do plano.

## Next Phase Readiness

- A Phase 18 está **funcionalmente completa e auditada estruturalmente**: todas as 3 migrations aplicadas e verificadas, todo o código de servidor e de shell escrito e com `typecheck`/`build` limpos, a suíte relevante (40 passed | 111 skipped, 0 failed) sem regressão detectável, e o mapa de requisitos GRANT-01..10 com evidência nomeada.
- **Falta exclusivamente o roteiro visual A–H** (gate humano bloqueante) para selar a fase — nenhum trabalho de código pendente.
- **Fase 17 permanece não-selada** (`17-08` Task 3, roteiros A–G, nunca executado — mesma limitação de ambiente). Se o PO rodar os dois roteiros (17 e 18) na mesma sessão de browser, ambas as fases podem ser seladas juntas.
- 2 novas entradas em `WINDOWS.md` (ids 37-38: 1 `unrun-verify` bloqueante + 1 `deviation` de ferramenta) — o ledger acumula e bloqueia `/gsd-ship` até resolvidas.

## Self-Check: PASSED

- FOUND: `app/(app)/layout.tsx` (canAdminister, staffAdministeredIds, fetchTenantsByIds, decisão de identidade visual comentada)
- FOUND: `components/shell/Sidebar.tsx` (canAdminister prop, item "Staff PSW", admin/staff, sem `role === 'tenant_admin'`)
- FOUND: `lib/opportunities/assignee-actions.ts` (isTenantAdminOf, WRITE_SCOPE_DENIED_MESSAGE, sem isTenantAdmin(profile))
- FOUND: `app/(app)/opportunities/[id]/page.tsx` (isTenantAdminOf, fetchAssignableProfilesForPlatformAdmin intacta)
- FOUND: `tests/security/assignee-actions-tenant-scope.test.ts`
- FOUND: commit `996f27d` (Task 1)
- FOUND: commit `aa188b2` (Task 2)
- `npm run typecheck` → exit 0 (confirmado após cada task e no final)
- `npm run build` → exit 0 (confirmado após cada task e no final, 22 rotas geradas incl. `/admin/staff`)
- `npx vitest run` (8 arquivos nomeados individualmente) → 40 passed | 111 skipped, 0 failed (151)
- `git diff --name-status dbddce9~1..HEAD -- tests/security/psw-staff-isolation.test.ts` → vazio (não editado)
- Varredura de derivação de tenant e de ponto único de escrita → ambas fechadas sem ocorrência não explicada
- `.planning/WINDOWS.md` → 2 entradas novas confirmadas (ids 37-38)

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
