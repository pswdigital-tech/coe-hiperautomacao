---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 07
subsystem: auth
tags: [nextjs, rsc, rbac, multi-tenant, supabase, rls, ui]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-06)
    provides: "lib/security/role.ts: isTenantAdminOf(profile, tenantId), resolveAdminTenantId(profile, requestedTenantId), ADMIN_SCOPE_DENIED_MESSAGE — o par tenant-aware que este plano reusa na LEITURA das 4 telas (a Server Action já usava na escrita)"
provides:
  - "components/admin/ScopeBadge.tsx: chip neutro 'Agindo em: {Empresa}', servidor, renderiza só quando `multiple=true` E há um nome resolvido — nunca para tenant_admin/platform_admin (sempre 1 empresa possível)"
  - "components/admin/NoScopeBanner.tsx: aviso amber role=alert, texto fixo do §Copywriting Contract, com o racional de 'desabilitado ≠ escondido' e 'aviso ≠ autorização' documentado no cabeçalho"
  - "components/shell/icons.tsx: Icon.Building (novo, só para o ScopeBadge)"
  - "app/(app)/team/page.tsx: convites e equipe lidos do tenant-alvo (não da lotação); guard vira isTenantAdminOf; psw_staff sem NENHUMA concessão continua redirecionado"
  - "app/(app)/configuracoes/page.tsx: branding lido do tenant-alvo; guard vira isPlatformAdmin || isTenantAdminOf, super-admin inalterado"
  - "app/(app)/logs/page.tsx: guard admite psw_staff-com-concessão; recorte por empresa estendido a quem administra 2+ empresas, lista limitada às administradas (nunca a carteira completa)"
  - "app/(app)/admin/invites/page.tsx: ScopeBadge no cabeçalho, sempre inerte (super-admin não tem ambiguidade aqui) — nenhuma consulta mudou"
affects: [18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composição de tenant-alvo NA LEITURA replicada por página (resolveEmpresaSlug(sp) -> fetchTenantIdBySlug -> resolveAdminTenantId), a mesma já usada em opportunities/page.tsx e nas Server Actions do plano 18-06 — sem extrair um helper novo, para não tocar lib/security/role.ts (já com cobertura de teste fechada em 18-06) fora do escopo deste plano"
    - "`<fieldset disabled={!tenantAlvo} className=\"contents\">` envolvendo TeamInviteForm/BrandingForm — cascata nativa do HTML para desabilitar TODOS os controles de um Client Component filho sem editar o arquivo dele (nenhum dos dois estava em files_modified do plano)"
    - "ScopeBadge só renderiza quando `multiple && tenantName` — nunca 'Agindo em: —' para o estado de concessão múltipla sem seleção (esse estado é coberto pelo NoScopeBanner nas telas de escrita, e por `showTenant` por linha em /logs)"
    - "Contagem/lista de concessões (`psw_tenant_admins` filtrado por `profile_id`) consultada inline em cada página que precisa dela (team/configuracoes: só contagem; logs: lista com nome, para o recorte) — mesma policy de auto-leitura já usada por `isTenantAdminOf`, sem client privilegiado"

key-files:
  created:
    - components/admin/ScopeBadge.tsx
    - components/admin/NoScopeBanner.tsx
  modified:
    - components/shell/icons.tsx
    - app/(app)/team/page.tsx
    - app/(app)/configuracoes/page.tsx
    - app/(app)/logs/page.tsx
    - app/(app)/admin/invites/page.tsx

key-decisions:
  - "/team NÃO ganhou acesso para platform_admin (ao contrário de configuracoes/logs, que já o tinham). O texto do plano (\"guard passa a ser: super-admin entra sempre\") colide com a prohibitions list do próprio plano (\"NÃO alterar o comportamento... nem para super-admin\") e com SC-12 — hoje /team redireciona platform_admin (ele usa /admin/invites). Resolvido a favor de zero-regressão: guard de /team ficou só isTenantAdminOf (cobre tenant_admin + psw_staff-com-concessão), sem isPlatformAdmin. Os greps do <verify> não distinguem as duas leituras (só exigem isTenantAdminOf presente e isTenantAdmin(profile) ausente), então ambas passam a checagem automatizada — a escolha foi por interpretação do texto, documentada aqui para revisão do PO."
  - "Nenhum helper novo em lib/ — a contagem/lista de concessões (`psw_tenant_admins` por `profile_id`) foi escrita inline em cada uma das 3 páginas que precisam dela, para respeitar o `files_modified` exato do frontmatter do plano (que não lista lib/security/role.ts nem lib/tenants/queries.ts). Duplicação pequena (4-15 linhas por página) aceita em troca de não reabrir um arquivo com suíte de testes fechada em 18-06 fora do escopo planejado."
  - "`<fieldset disabled>` em vez de prop `disabled` em TeamInviteForm/BrandingForm — os dois Client Components não estavam em `files_modified`, mas o plano exige 'TODOS os controles de escrita desabilitados'. `<fieldset disabled>` cascata nativamente (HTML, não React) para todo input/select/button descendente, incluindo os de um Client Component filho, sem editar o arquivo dele."
  - "ScopeBadge em /admin/invites recebe `multiple={false}` fixo (nunca calculado) — a tela é platform_admin-only (guard de admin/layout.tsx) e o super-admin escolhe a empresa DENTRO do próprio formulário, não pelo seletor da Sidebar; não existe ambiguidade 'em qual empresa estou agindo' a resolver ali. O componente está presente para consistência visual entre as 4 abas (exigência literal do plano), mas é sempre inerte."
  - "/logs: ScopeBadge só mostra nome quando há UMA empresa em foco (seleção feita, ou staff-admin com exatamente 1 concessão) — com 2+ concessões e nenhuma selecionada, o badge fica mudo (tenantName null) e a separação visual vem de `showTenant` por linha, evitando 'Agindo em: —'."
  - "Validação defensiva de `?empresa=` em /logs via `isTenantAdminOf` antes de usá-lo como filtro — mesmo a lista de opções nunca oferecendo um valor fora da carteira administrada, um valor forjado na URL é ignorado em vez de repassado cru ao filtro (RLS já bloquearia os dados, isto é defesa em profundidade adicional, coerente com T-18-60)."

requirements-completed: [GRANT-04, GRANT-05]

coverage:
  - id: D1
    description: "ScopeBadge e NoScopeBanner criados com o contrato visual do 18-UI-SPEC.md (chip neutro truncado com title, aviso amber role=alert, sem shadcn/ui, sem peso 600 em elemento novo)"
    requirement: GRANT-05
    verification:
      - kind: other
        ref: "grep estrutural do <verify> da Task 1 (title=, truncate, role=\"alert\", ausência de bg-pri/text-pri/bg-red-/font-semibold/@/components/ui/) — bash inline, exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) após a Task 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "/team e /configuracoes leem convites/equipe/branding do tenant-alvo (nunca da lotação); guard vira isTenantAdminOf; sem tenant-alvo nenhuma lista é buscada; NoScopeBanner + fieldset disabled cobrem os controles de escrita; ScopeBadge só para quem tem 2+ empresas possíveis"
    requirement: GRANT-04
    verification:
      - kind: other
        ref: "grep estrutural do <verify> da Task 2 (6 condições por arquivo: ausência de profile.tenantId, presença de isTenantAdminOf, ausência de isTenantAdmin(profile), presença de ScopeBadge/NoScopeBanner/disabled) — bash inline, exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) após a Task 2"
        status: pass
    human_judgment: true
    rationale: "O <human-check> da Task 2 (staff-admin de A abrindo /team e /configuracoes com A selecionada e com 'todas as empresas', e tenant_admin de cliente inalterado) exige browser/servidor autenticado, indisponível nesta sessão (binding_proof_mode). Registrado em .planning/WINDOWS.md (id 35)."
  - id: D3
    description: "/logs acessível a psw_staff-com-concessão; recorte por empresa estendido a quem administra 2+ empresas, lista limitada às administradas; /admin/invites recebe só o ScopeBadge, nenhuma consulta muda"
    requirement: GRANT-04
    verification:
      - kind: other
        ref: "grep estrutural do <verify> da Task 3 (isTenantAdminOf presente, isTenantAdmin(profile) ausente, ScopeBadge presente nas duas telas, NoScopeBanner ausente em invites, nenhum segundo seletor) — bash inline, exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (exit 0) e npm run build (exit 0) após a Task 3"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/security/resolve-admin-tenant.test.ts tests/schema/tenant-admin-parity.test.ts — 17 passed | 6 skipped (23), sem regressão no par isTenantAdminOf/resolveAdminTenantId usado por este plano"
        status: pass
    human_judgment: true
    rationale: "O <human-check> da Task 3 (staff-admin de DUAS empresas em /logs com recorte limitado, staff-admin de UMA empresa sem recorte, tenant_admin inalterado, /admin/invites com o chip) exige browser/servidor autenticado, indisponível nesta sessão. Registrado em .planning/WINDOWS.md (id 36)."

# Metrics
duration: ~50min
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 07: Leitura escopada + marcador de escopo nas 4 telas de admin Summary

**As quatro telas de admin (`/team`, `/configuracoes`, `/logs`, `/admin/invites`) passam a ler o tenant-alvo resolvido pelo seletor de empresa da Sidebar — não mais o tenant de lotação de quem está logado — e ganham um chip "Agindo em: {Empresa}" e um aviso amber de escrita desabilitada quando não há empresa selecionada, sem criar nenhum segundo seletor.**

## Performance

- **Duration:** ~50min
- **Completed:** 2026-08-07
- **Tasks:** 3
- **Files modified:** 7 (2 criados, 5 modificados)

## Accomplishments

- `components/admin/ScopeBadge.tsx` (novo): chip de servidor "Agindo em: {Empresa}", peso 700/11px, paleta neutra, `truncate` + `title` para nomes longos. Só renderiza quando `multiple=true` (2+ empresas possíveis) **e** há um nome resolvido — nunca aparece para `tenant_admin`/`platform_admin` (sempre 1 empresa possível) nem no estado "concessão múltipla sem seleção" (evita "Agindo em: —").
- `components/admin/NoScopeBanner.tsx` (novo): aviso `role="alert"` em âmbar, texto fixo "Selecione uma empresa na barra lateral para editar." (§Copywriting Contract), com o racional de "desabilitado ≠ escondido" e "aviso ≠ autorização" documentado por extenso no cabeçalho do arquivo.
- `components/shell/icons.tsx`: `Icon.Building` novo (SVG inline, sem lib externa) — o ícone de empresa que o `ScopeBadge` usa.
- `app/(app)/team/page.tsx`: tenant-alvo resolvido via `resolveEmpresaSlug(sp) → fetchTenantIdBySlug → resolveAdminTenantId(profile, …)` (mesma composição de `opportunities/page.tsx`); guard vira `isTenantAdminOf(profile, tenantAlvo)` — cobre `tenant_admin` (byte-equivalente, sem ida ao banco) e `psw_staff` com concessão; sem NENHUMA concessão continua redirecionado. Sem tenant-alvo, nem convites nem equipe são buscados; `<fieldset disabled className="contents">` desabilita todo o `TeamInviteForm` sem tocar o arquivo dele; botão "Revogar" de cada convite ganha `disabled={!tenantAlvo}`.
- `app/(app)/configuracoes/page.tsx`: mesma composição de tenant-alvo; guard vira `isPlatformAdmin(profile) || isTenantAdminOf(profile, tenantAlvo)` — super-admin preservado (comportamento já existente), `psw_staff`-com-concessão adicionado. Sem tenant-alvo, branding não é buscado (`EMPTY_BRANDING`) e `<fieldset disabled>` cobre os 3 controles de `BrandingForm` (cor, upload, remoção).
- `app/(app)/logs/page.tsx`: guard passa a admitir `psw_staff` com ao menos uma concessão (`isTenantAdminOf(profile, profile.tenantId)` substitui o antigo `isTenantAdmin(profile)` isolado — byte-equivalente para `tenant_admin`, mesmo predicado em todo o guard); o recorte por empresa (antes só `platform_admin`) estende a quem administra 2+ empresas, com a lista de opções **limitada às empresas administradas** (nunca `fetchAuditTenants()` sem filtro para staff-admin — mitigação de T-18-60); `?empresa=` fora da carteira é ignorado (defesa em profundidade extra); `showTenant` por linha estendido ao mesmo caso, para separar visualmente logs de empresas diferentes quando nenhuma está selecionada.
- `app/(app)/admin/invites/page.tsx`: só ganhou o `ScopeBadge` no cabeçalho (`multiple={false}` fixo, já que a tela é platform_admin-only e não tem ambiguidade de escopo) — nenhuma consulta mudou, comentário de cabeçalho novo explica o porquê.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: marcador de escopo e aviso de escrita desabilitada** — `6e82e3b` (feat)
2. **Task 2: `/team` e `/configuracoes` — leitura escopada, guard tenant-aware e gate visual** — `470f2e6` (fix)
3. **Task 3: `/logs` acessível ao staff-admin, recorte limitado; `/admin/invites` — marcador de escopo** — `5c83982` (fix)

## Files Created/Modified

- `components/admin/ScopeBadge.tsx` — chip "Agindo em: {Empresa}"
- `components/admin/NoScopeBanner.tsx` — aviso de escrita desabilitada
- `components/shell/icons.tsx` — `Icon.Building` novo
- `app/(app)/team/page.tsx` — leitura escopada, guard tenant-aware, fieldset disabled
- `app/(app)/configuracoes/page.tsx` — idem
- `app/(app)/logs/page.tsx` — guard estendido, recorte limitado às empresas administradas
- `app/(app)/admin/invites/page.tsx` — só o ScopeBadge, nenhuma consulta mudou

## Decisions Made

- **`/team` sem acesso para `platform_admin`** (diferente de `configuracoes`/`logs`, que já tinham) — ver `key-decisions` no frontmatter para o raciocínio completo. Resumo: o texto do `<action>` da Task 2 ("super-admin entra sempre") colidiria com a `prohibitions` list do próprio plano ("NÃO alterar o comportamento... nem para super-admin") e com o comentário original do arquivo ("platform_admin não usa esta tela: ele tem /admin/invites"). Optei por zero-regressão: `/team` continua redirecionando `platform_admin`, exatamente como antes desta fase. Os greps automatizados passam com as duas leituras — **sinalizando para o PO revisar se isto é o comportamento desejado**, já que o texto do plano sugere o oposto.
- **Nenhum helper novo em `lib/`** — a contagem/lista de concessões (`psw_tenant_admins` por `profile_id`) ficou inline em cada página, para não tocar arquivos fora do `files_modified` do plano (em particular `lib/security/role.ts`, que já tem suíte de teste fechada pelo 18-06).
- **`<fieldset disabled>` em vez de prop `disabled`** em `TeamInviteForm`/`BrandingForm` — os dois Client Components não estavam em `files_modified`; a cascata nativa do HTML resolve sem tocar neles.
- **`ScopeBadge` só mostra nome quando há UMA empresa em foco** — nunca "Agindo em: —" para o estado "múltiplas concessões, nenhuma selecionada" (coberto por `NoScopeBanner` nas telas de escrita e por `showTenant` por linha em `/logs`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `Icon.Building` adicionado a `components/shell/icons.tsx`**
- **Found during:** Task 1
- **Issue:** O `<action>` da Task 1 exige que `ScopeBadge` renderize "com o ícone de empresa", mas nenhum ícone de prédio/empresa existia em `components/shell/icons.tsx` (arquivo NÃO listado em `files_modified` do plano).
- **Fix:** Adicionado `Icon.Building` (SVG inline, mesma convenção de stroke/tamanho dos ícones existentes, nenhuma lib externa).
- **Files modified:** `components/shell/icons.tsx`.
- **Verification:** `npm run typecheck`/`npm run build` exit 0; grep do `<verify>` não proíbe o arquivo (só proíbe `@/components/ui/` e `font-semibold` nos dois arquivos NOVOS, `components/shell/icons.tsx` não é um deles).
- **Committed in:** `6e82e3b` (Task 1).

**2. [Rule 2 - Missing Critical] `showTenant` estendido a staff-admin com 2+ concessões sem seleção, em `/logs`**
- **Found during:** Task 3
- **Issue:** O `<action>` só pedia o recorte por empresa; sem ele, um staff-admin de 2 empresas SEM selecionar nenhuma via o log "misturado" sem NENHUMA pista visual de qual linha é de qual empresa — o próprio sintoma que o RESEARCH (§6 item 18) descreve como motivador da Task.
- **Fix:** `showTenant = platformAdmin || (staffAdmin && staffGrantedTenants.length > 1)` — mostra a coluna de empresa por linha no mesmo caso em que o recorte aparece.
- **Files modified:** `app/(app)/logs/page.tsx`.
- **Verification:** `npm run typecheck`/`npm run build` exit 0; não conflita com nenhum grep do `<verify>`.
- **Committed in:** `5c83982` (Task 3).

**3. [Rule 3 - Blocking, para satisfazer o `<verify>` literal] `?empresa=` de `/logs` validado via `isTenantAdminOf` antes do filtro**
- **Found during:** Task 3, ao rodar o `<verify>` automatizado
- **Issue:** O guard inicial usava `isTenantAdminOf` só para o próprio tenant do `tenant_admin` (substituindo `isTenantAdmin(profile)`), mas a seleção de empresa do staff-admin (`?empresa=`) nunca era validada pelo par tenant-aware — funcionalmente inofensivo (a RLS bloquearia dados de fora da carteira de qualquer forma), mas não expressava o "par pessoa × empresa" que o plano pede para o recorte.
- **Fix:** `?empresa=` de um `psw_staff` é validado via `isTenantAdminOf(profile, empresaRequested)` antes de virar filtro; fora do escopo, é ignorado (colapsa para "").
- **Files modified:** `app/(app)/logs/page.tsx`.
- **Verification:** `npm run typecheck`/`npm run build` exit 0; grep do `<verify>` (`isTenantAdminOf` presente, `isTenantAdmin(profile)` ausente) passa.
- **Committed in:** `5c83982` (Task 3).

---

**Total deviations:** 3 auto-fixed (2 Rule 2 — funcionalidade crítica ausente, 1 Rule 3 — necessário para o `<verify>` literal do plano e para defesa em profundidade genuína).
**Impact on plan:** Todos os três são aditivos e de baixo risco — nenhum muda o escopo de dados exposto além do que o plano já pedia (a RLS já era o bloqueio real em todos os casos). Nenhum arquivo fora do escopo geral da fase foi tocado.

## Issues Encountered

1. **`<human-check>` das Tasks 2 e 3 não executados** — exigem browser/servidor autenticado (staff-admin com concessão real em 1 e em 2 empresas, `tenant_admin` de cliente), indisponível nesta sessão (`binding_proof_mode: prova-por-sql-no-handoff`, sem `.env.test`, sem acesso a browser). Registrado em `.planning/WINDOWS.md` (ids 35 e 36) — mesma limitação já documentada nos planos `18-04`/`18-05`/`18-06` desta fase.
2. **Ambiguidade textual entre o `<action>` da Task 2 e a `prohibitions` list do plano** quanto a `platform_admin` em `/team` — resolvida a favor de zero-regressão (ver `Decisions Made` acima). Recomenda-se ao PO confirmar se `platform_admin` deveria ganhar acesso a `/team` nesta fase ou permanecer redirecionado.
3. **Nenhum novo arquivo de teste automatizado criado** — o plano não pediu (é uma fase de UI/leitura, com `<verify>` estrutural via grep + `typecheck`/`build`); a suíte de unidade pré-existente relevante (`resolve-admin-tenant.test.ts`, `tenant-admin-parity.test.ts`) foi re-executada para confirmar ausência de regressão no par `isTenantAdminOf`/`resolveAdminTenantId` que este plano reusa (17 passed | 6 skipped, sem mudança de resultado em relação ao 18-06).

## User Setup Required

Nenhuma ação de ambiente pendente. `.env.test` continua intencionalmente ausente (decisão vinculante da fase). **Ação recomendada, não bloqueante, para o PO:**
- Executar os `<human-check>` das Tasks 2 e 3 (staff-admin com concessão em 1 e em 2 empresas, nas 4 telas) antes de considerar a Phase 18 encerrada — junto das pendências já registradas nos planos `18-04`/`18-05`/`18-06`.
- Confirmar a decisão de manter `/team` fechado para `platform_admin` (ver Issues Encountered #2) — ou pedir um ajuste explícito se o comportamento pretendido for o inverso.
- Nota estrutural: a `CompanySelector` da Sidebar hoje só é renderizada para `platform_admin` (`components/shell/Sidebar.tsx:251`, item #24 do RESEARCH §6) — um `psw_staff` ainda não tem, na UI atual, como definir `?empresa=`/o cookie `coe_empresa` por conta própria (só por URL direta). A leitura escopada deste plano já funciona corretamente quando o parâmetro chega por qualquer via; expor o seletor também para `psw_staff` é o assunto do próximo plano da fase (`18-08`, "shell + gate de atribuição", já com `18-08-PLAN.md` presente no diretório da fase).

## Next Phase Readiness

- As quatro telas de admin agora leem o tenant-alvo corretamente e concordam com a escrita já corrigida em `18-06` — a "tela mostra a equipe da PSW enquanto o botão grava na empresa A" (o sintoma que motivou este plano) está fechada.
- `ScopeBadge`/`NoScopeBanner` prontos para reuso por qualquer tela futura de admin que precise do mesmo padrão de escopo.
- `components/shell/Sidebar.tsx` (item #24 do RESEARCH §6 — `CompanySelector`/itens de nav "Equipe"/"Configurações" gateados por `profile.role === 'tenant_admin'`/`'platform_admin'`, sem ramo para `psw_staff`) permanece intocado — é o assunto explícito do `18-08`.
- 2 itens novos registrados em `.planning/WINDOWS.md` (ids 35-36, ambos `unrun-verify`) — o ledger acumula e bloqueia `/gsd-ship` até resolvidos ou dispensados explicitamente.

## Self-Check: PASSED

- FOUND: `components/admin/ScopeBadge.tsx`
- FOUND: `components/admin/NoScopeBanner.tsx`
- FOUND: `Icon.Building` em `components/shell/icons.tsx`
- FOUND: `app/(app)/team/page.tsx` (isTenantAdminOf, resolveAdminTenantId, ScopeBadge, NoScopeBanner, fieldset disabled)
- FOUND: `app/(app)/configuracoes/page.tsx` (idem + isPlatformAdmin preservado)
- FOUND: `app/(app)/logs/page.tsx` (isTenantAdminOf, recorte limitado, showTenant estendido, ScopeBadge)
- FOUND: `app/(app)/admin/invites/page.tsx` (ScopeBadge multiple=false, nenhuma consulta alterada)
- FOUND: commit `6e82e3b` (Task 1)
- FOUND: commit `470f2e6` (Task 2)
- FOUND: commit `5c83982` (Task 3)
- `npm run typecheck` → exit 0 (confirmado após cada task)
- `npm run build` → exit 0 (confirmado após cada task)
- Greps estruturais do `<verify>` das 3 tasks → todos `OK` (confirmado nesta sessão)
- `npx vitest run tests/security/resolve-admin-tenant.test.ts tests/schema/tenant-admin-parity.test.ts` → 17 passed | 6 skipped (23), exit 0 — sem regressão
- `git diff --stat` das 3 tasks → nenhum arquivo em `supabase/migrations/` tocado
- `.planning/WINDOWS.md` → 2 entradas novas confirmadas (ids 35-36)

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
