# Phase 18: Staff PSW como Admin de Tenant — Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 12 (novos/modificados)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0045_psw_tenant_admins_foundation.sql` | migration (DDL + helpers) | CRUD | `supabase/migrations/0032_opportunity_assignees.sql` (tabela N:N + trigger) + `0040_psw_staff_access_core.sql` (helpers `security definer`) | exact |
| `supabase/migrations/0046_tenant_admin_rls_swap.sql` | migration (RLS) | CRUD | `supabase/migrations/0044_psw_staff_only_assigned.sql` (laço restritivo, cabeçalho, verificação, rollback) | exact |
| `lib/security/role.ts` (edição — `isTenantAdminOf`, `resolveAdminTenantId`, `ADMIN_SCOPE_DENIED_MESSAGE`) | utility / auth guard | request-response | mesmo arquivo: `isPlatformAdmin`/`resolveWriteTenantId`/`WRITE_SCOPE_DENIED_MESSAGE` | exact (self-analog) |
| `app/(app)/admin/staff/page.tsx` | route (Server Component) | request-response | `app/(app)/admin/invites/page.tsx` | exact |
| `app/(app)/admin/staff/actions.ts` | controller (Server Actions) | CRUD | `app/(app)/admin/invites/actions.ts` (grant/revoke) + `app/(app)/team/actions.ts` (comentário de derivação de tenant) | exact |
| `app/(app)/admin/staff/GrantForm.tsx` (ou `StaffAdminForm.tsx`) | component (client form) | request-response | `app/(app)/admin/invites/InviteForm.tsx` (não lido — inferir do `page.tsx` que a consome) | role-match |
| `app/(app)/admin/staff/RevokeButton.tsx` | component (client, confirmação quantificada) | request-response | `app/(app)/admin/invites/ResendButton.tsx` (não lido, mesmo papel: client action-button) + `<form action={revokeInvite}>` inline da `invites/page.tsx` | role-match |
| `app/(app)/team/actions.ts` (edição — `tenant_id` deixa de vir de `profile!.tenantId`) | controller (Server Action) | CRUD | mesmo arquivo (auto-edição) — padrão a seguir é `resolveWriteTenantId` de `lib/security/role.ts` | exact (self-analog) |
| `app/(app)/configuracoes/actions.ts` (edição — mesmo bug D-K) | controller (Server Action) | CRUD, file-I/O | `app/(app)/team/actions.ts` (mesmo bug já resolvido nesta fase) | exact |
| `app/(app)/logs/page.tsx`, `app/(app)/team/page.tsx`, `app/(app)/configuracoes/page.tsx` (edição — leitura por tenant-alvo) | route (Server Component, read) | request-response | `app/(app)/admin/invites/page.tsx` (leitura cross-tenant já resolvida para `platform_admin`) | role-match |
| `app/(app)/layout.tsx` (edição — branding/seletor para `psw_staff` com concessão) | provider/layout | request-response | mesmo arquivo (auto-edição), `components/shell/Sidebar.tsx` (seletor de empresa) | exact (self-analog) |
| `tests/security/psw-staff-admin-grant.test.ts` | test | event-driven (RLS via JWT real) | `tests/security/psw-staff-isolation.test.ts` (fixtures, `afterAll` de despromoção, releitura por `serviceRoleClient()`) | exact |

## Pattern Assignments

### `supabase/migrations/0045_psw_tenant_admins_foundation.sql` (migration, CRUD)

**Analogs:** `supabase/migrations/0032_opportunity_assignees.sql` (tabela N:N) + `supabase/migrations/0040_psw_staff_access_core.sql` (helpers).

**Cabeçalho / modo de aplicação** (padrão obrigatório do projeto — `0032:1-18`):
```sql
-- =============================================================================
-- 0045_psw_tenant_admins_foundation.sql — <resumo de uma linha>
-- =============================================================================
-- CONTEXTO: ...
-- IDEMPOTENTE. Pré-requisitos: 0001 (current_tenant_id), 0015
-- (current_user_role), 0040 (padrão de helper security definer).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;
```
Nota: `set session characteristics ...` / `set default_transaction_read_only = off` são o boilerplate real de toda migration deste projeto (visto em `0032`) — copiar literalmente, não é opcional.

**Tabela N:N — copiar a forma de `opportunity_assignees`** (`0032:21-38`):
```sql
create table if not exists psw_tenant_admins (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  tenant_id   uuid not null references tenants(id)  on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references profiles(id) on delete set null,
  unique (profile_id, tenant_id)
);

create index if not exists psw_tenant_admins_profile_only_idx on psw_tenant_admins(profile_id);
create index if not exists psw_tenant_admins_tenant_idx       on psw_tenant_admins(tenant_id);
```
(RESEARCH.md §4 já valida esses dois índices — espelham `opportunity_assignees_profile_idx`.)

**Trigger de coerência — não obrigatório por D-S (concessão órfã sobrevive), mas se o plano decidir por um CHECK leve, o modelo de `check_assignee_tenant()` (`0032:44-69`) é o padrão de trigger `before insert or update` com `security definer` + `raise exception ... using errcode`.** Diferente de `opportunity_assignees`, aqui não há "tenant da linha pai" para validar contra — a tabela É a fonte, então provavelmente nenhum trigger de coerência é necessário (apenas o `unique` e as duas FKs).

**Os 3 helpers — copiar literalmente a forma da `0040:86-110` (assinatura) e a recomendação de inlining da RESEARCH.md §4** (não reler `0040` novamente; a assinatura já foi extraída acima em `<canonical_refs>`/RESEARCH.md §4):
- `current_admin_tenant_ids()` — `setof uuid`, `security definer`, `stable`, `set search_path = public`, `(select auth.uid())`.
- `effective_admin_tenant_ids()` — mesma forma; unifica ramo `tenant_admin` (byte-equivalente ao predicado antigo, D-J) e ramo `psw_staff`.
- `is_tenant_admin_of(t uuid)` — **deliberadamente sem `security definer` e sem `set search_path`**, chamadas internas schema-qualificadas (`public.effective_admin_tenant_ids()`), para permitir inlining (D-Q). Ver SQL exato em RESEARCH.md §4 (linhas 503-553) — copiar de lá, não reinventar.

**RLS de `psw_tenant_admins`** (SQL exato em RESEARCH.md §5, linhas 714-742) — só `platform_admin` grava (`is_platform_admin()`, nunca `is_tenant_admin_of()` — é a assimetria que garante D-B), a própria pessoa lê suas linhas, sem policy de UPDATE (concessão se dá/revoga, não edita — mesma disciplina de `audit_log`).

---

### `supabase/migrations/0046_tenant_admin_rls_swap.sql` (migration, RLS)

**Analog:** `supabase/migrations/0044_psw_staff_only_assigned.sql` (o laço restritivo, o cabeçalho longo justificando RESTRICTIVE×PERMISSIVE, o bloco de verificação e o bloco de rollback comentado).

**Estrutura a copiar de `0044` (lida integralmente — cabeçalho §1-60):**
1. Cabeçalho longo explicando **por que** RESTRICTIVE e não reescrita manual — mesmo raciocínio se aplica aqui (D-P da RESEARCH: restritiva sozinha é inerte).
2. `do $$ ... $$` com `for spec in (values (...))` iterando as 8 tabelas — **não escrever 8 blocos à mão** (D-L).
3. `raise exception` (não `continue`/`raise notice`) se uma tabela não tiver `tenant_id` — diverge deliberadamente do padrão da `0044` (que usa `continue`) porque aqui a ausência da coluna é bug, não "tabela fora do escopo" (ver RESEARCH.md §1, nota após o bloco A).
4. Bloco de verificação pós-apply com `select ... from pg_policies` e — crucialmente — os testes `EXPLAIN (analyze, buffers)` de inlining (RESEARCH.md §4, linhas 568-591) e os testes de contagem baseline/depois (RESEARCH.md §1, V3/V4).
5. Bloco de ROLLBACK comentado no rodapé, **na ordem exata**: bloco A (drop das permissivas novas) → bloco B (reaplicar `0044` na íntegra) → swap dos 11 predicados (reaplicar `0029`, `0033`, `0038`, e o **BLOCO 6b da `0041` por último** — nesta ordem, senão a versão permissiva demais da `0029` fica valendo). Este é o detalhe de segurança mais importante da migration — não improvisar a ordem.

**SQL exato dos três blocos (A: permissivas novas por tabela+verbo; B: disjunto novo na restritiva; C: `tenants`/`profiles` fora do laço) está pronto em RESEARCH.md §1, linhas 131-274 — copiar de lá, incluindo os comentários sobre por que `opportunity_notes`/`opportunity_documents`/`opportunity_history` NÃO recebem todos os 4 verbos (paridade com o que `tenant_admin` já tem, não superconjunto).**

**Swap dos 11 predicados de `tenant_admin`** (identificados por **nome de policy**, nunca por número de linha — D-I é uma regressão de segurança se ignorado):
```
opportunity_assignees_insert, opportunity_assignees_update, opportunity_assignees_delete   (0032)
invited_emails_select_tenant_admin, invited_emails_delete_tenant_admin                     (0029)
invited_emails_insert_tenant_admin  ← definição VIVA está em 0041:443-449, NÃO em 0029:50-55
tenants_update_own_admin                                                                    (0033)
tenant_branding_storage_insert/update/delete                                                (0033)
audit_log_select                                                                            (0038)
```
SQL exato dos 3 predicados de `invited_emails` (com o comentário de por que o `role not in (...)` é preservado literalmente) está em RESEARCH.md §5, linhas 644-683.

**Storage (`tenant-branding`, `opportunity-documents`)** — comparação sempre do lado **texto** (`(storage.foldername(name))[1] in (select t::text from effective_admin_tenant_ids() t)`), nunca cast para uuid — armadilha documentada em `0041:295-300` e reproduzida em RESEARCH.md §3, linhas 411-456.

---

### `lib/security/role.ts` (edição — utility / auth guard, request-response)

**Analog:** o próprio arquivo — `resolveWriteTenantId` (linhas 176-209) é a irmã direta de `resolveAdminTenantId`, e `isPlatformAdmin`/`isPswStaff` (linhas 115-135) são o padrão de guard síncrono simples que `isTenantAdminOf` **não** pode seguir (precisa ser assíncrona, pois consulta `psw_tenant_admins`).

**Padrão de doc-comment extenso citando o SQL espelhado** (copiar a disciplina de `isPlatformAdmin`, linhas 115-119, e do bloco de comentário de `resolveWriteTenantId`, linhas 137-165):
```ts
/**
 * Espelha o predicado SQL `is_tenant_admin_of(t uuid)` (migration 0045) —
 * mantenha os dois em sincronia, como já acontece com
 * isPlatformAdmin()/is_platform_admin().
 */
export async function isTenantAdminOf(
  profile: CurrentProfile | null,
  tenantId: string
): Promise<boolean> { /* ... consulta psw_tenant_admins quando role === 'psw_staff';
                            ramo tenant_admin é síncrono e byte-equivalente ao
                            isTenantAdmin() atual (D-J) ... */ }
```

**Padrão de `resolveWriteTenantId` a replicar para `resolveAdminTenantId`** (mesma forma: early-return de `null`, mensagem pt-BR única exportada como constante, comentário de bloco explicando o sintoma do "sucesso silencioso"):
```ts
export const ADMIN_SCOPE_DENIED_MESSAGE =
  'Empresa não encontrada ou fora do seu escopo de administração.';

export async function resolveAdminTenantId(
  profile: CurrentProfile,
  requestedTenantId: string | undefined
): Promise<string | null> {
  // client/`tenant_admin`: profile.tenantId direto (zero round-trip), IGUAL
  // ao ramo "cliente" de resolveWriteTenantId.
  // psw_staff: valida requestedTenantId contra isTenantAdminOf() — nunca
  // aceitar sem validar, mesmo que a Sidebar já tenha "filtrado" as opções.
}
```

---

### `app/(app)/admin/staff/page.tsx` (route, request-response)

**Analog:** `app/(app)/admin/invites/page.tsx` (lido integralmente).

**Padrão a copiar** (linhas 1-43): imports de `createClient` direto no Server Component (sem passar por Server Action para leitura), `Promise.all` para paralelizar queries, tabela com `<thead>`/`<tbody>` Tailwind (`bg-wh rounded-xl border border-bdr overflow-hidden`), link "← Voltar" para `/opportunities`. Herdar o guard de `app/(app)/admin/layout.tsx` (zero plumbing novo — D-N).

**Estrutura de dados exigida por D-F (duas origens separadas — nunca um número agregado):**
```tsx
// bloco 1: "Admin nas empresas: A, C" — de psw_tenant_admins join tenants
// bloco 2: "Atribuições individuais: N (M redundantes)" — de opportunity_assignees,
//          onde "redundante" = atribuição num tenant onde a pessoa já é admin
```
Órfãs (D-S) precisam de sinalização visual — nenhum analog direto no código; usar o mesmo padrão de badge de status usado em `admin/invites/page.tsx` linhas 91-100 (`inline-flex ... rounded-full` com cor semântica, aqui provavelmente âmbar "concessão órfã").

---

### `app/(app)/admin/staff/actions.ts` (controller, CRUD)

**Analogs:** `app/(app)/admin/invites/actions.ts` (guard `isPlatformAdmin` + `revalidatePath`, linhas 72-75 e 203-214) e `app/(app)/team/actions.ts` (comentário de cabeçalho documentando a proveniência do `tenant_id` — copiar essa disciplina de comentário).

**Padrão de guard + insert/delete simples** (`admin/invites/actions.ts:203-214`, `revokeInvite`):
```ts
export async function revokeStaffGrant(formData: FormData): Promise<void> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return;

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('psw_tenant_admins').delete().eq('id', id);

  revalidatePath('/admin/staff');
}
```
**D-G (revogação quantificada) não tem analog no código** — é lógica nova: contar `opportunities` do tenant menos as atribuídas nominalmente (RESEARCH.md §Specific Ideas, linha 342-344 — "calculada em runtime... nunca persistida, mesma regra do score"). Modelar como uma Server Action `countOpportunitiesLostOnRevoke(profileId, tenantId)` chamada antes de confirmar, análoga em espírito ao cálculo de score em `lib/opportunities/score.ts` (calculado, nunca persistido) — **não** um analog estrutural, mas a mesma disciplina do projeto.

---

### `app/(app)/team/actions.ts` (edição — corrige D-K)

**O bug e o fix exatos já estão identificados na RESEARCH.md §6, item 2 e item 4:**
```ts
// ANTES (linha 46) — grava no tenant do profile, errado para staff-admin:
tenant_id: profile!.tenantId,

// DEPOIS — replicar o padrão de resolveWriteTenantId:
const targetTenantId = await resolveAdminTenantId(profile!, requestedTenantId);
if (!targetTenantId) return { error: ADMIN_SCOPE_DENIED_MESSAGE };
// ... tenant_id: targetTenantId
```
```ts
// ANTES (linha 84) — filtra por profile.tenantId, casa ZERO linhas para
// staff-admin (sucesso silencioso — o bug mais caro da fase):
.delete().eq('id', id).eq('tenant_id', profile!.tenantId);

// DEPOIS:
.delete().eq('id', id).eq('tenant_id', targetTenantId);
```
Guard também muda de `isTenantAdmin(profile)` (síncrono) para `await isTenantAdminOf(profile, targetTenantId)`.

---

### `app/(app)/configuracoes/actions.ts` (edição — mesmo bug D-K, 4 ocorrências)

**Analog: o próprio `app/(app)/team/actions.ts` já corrigido nesta fase** — mesmo padrão de substituição de `profile.tenantId` por `resolveAdminTenantId(...)`. RESEARCH.md §6 itens 9, 10, 12, 14 listam as 4 linhas exatas (`update({brand_color}).eq('id', profile.tenantId)`, path de upload `${profile.tenantId}/logo-...`, e dois `update(...).eq('id', profile.tenantId)` de logo) — todas seguem a mesma transformação mecânica.

---

### `app/(app)/logs/page.tsx`, `app/(app)/team/page.tsx`, `app/(app)/configuracoes/page.tsx` (edição — leitura)

**Analog:** `app/(app)/admin/invites/page.tsx` já resolve cross-tenant para `platform_admin` sem seletor (vê tudo). Para `psw_staff` com concessão, o padrão correto é o mesmo **seletor de empresa da Sidebar** (`lib/tenants/scope.ts` `resolveEmpresaSlug()` + cookie `coe_empresa`, D-R) — usar exatamente o que `app/(app)/opportunities/page.tsx:109` já faz para escopar por `scopedTenantId` (não lido nesta sessão, mas citado em RESEARCH.md §6 item 21 como o padrão vivo de "escopo vem do seletor").

---

### `app/(app)/layout.tsx` (edição — branding/seletor)

**Analog:** o próprio arquivo (`profile.tenantId` hoje decide branding e visibilidade do seletor, linhas 28 e 34-40 conforme RESEARCH.md §6 itens 19-20). A correção é estender a condição que hoje só testa `isAdmin` para também cobrir `isPswStaff(profile)` (a Sidebar já tem `isTenantAdmin`/`isAdmin` computados localmente — ver `components/shell/Sidebar.tsx:129-131`, que é o padrão de "role local para gating de menu" a replicar se o seletor ganhar uma variante para staff-admin).

---

### `components/shell/Sidebar.tsx` (referência, não necessariamente editado)

Trecho relevante já lido (linhas 100-160): preservação de `?empresa=` ao navegar entre abas `/admin` (linhas ~132-140) é o mecanismo que D-R reaproveita como contexto de escrita — **nenhuma tela nova de seletor deve ser criada**; a Sidebar existente já é a fonte.

---

### `tests/security/psw-staff-admin-grant.test.ts` (test, event-driven)

**Analog:** `tests/security/psw-staff-isolation.test.ts` — reusar `seedTestTenants()`, `asPswStaff()`, `asFgcoop()`, `serviceRoleClient()`, o padrão de promoção temporária de papel com `afterAll` que reverte (linhas 988-1002 e 1031-1043 daquele arquivo), e a regra inegociável de releitura por `serviceRoleClient()` antes de afirmar sucesso de escrita (linhas 26-29).

**Não editar o arquivo existente** — criar arquivo novo com prefixo de UUID próprio (`bbbb0000-...`) e `afterAll` incondicional que remove qualquer linha de `psw_tenant_admins` do usuário staff de teste, para não vazar estado para `psw-staff-isolation.test.ts` (que afirma no nível de topo que o staff vê exatamente `[X, Z]`).

**Casos de teste completos (copiar estrutura, não reinventar)** já escritos em RESEARCH.md §7:
- (a) baseline sem concessão / volta ao baseline após revogar (GRANT-02/GRANT-08)
- (b) `member`/`tenant_admin` do FGCoop inalterados, incluindo os 3 testes de não-regressão da escalada de convite (`0029:53` código morto)
- (c) com concessão em A: vê A, não vê C, D-B garantido por RLS (insert/delete em `psw_tenant_admins` falham para o staff)

## Shared Patterns

### Migrations — cabeçalho, aplicação manual, idempotência
**Source:** `supabase/migrations/0032_opportunity_assignees.sql:1-19`, `supabase/migrations/0044_psw_staff_only_assigned.sql:1-60`
**Apply to:** `0045`, `0046`
```sql
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;
```
Nunca `supabase db push` — o PO aplica manualmente (ver docs/PROJETO.md / memória do projeto).

### Guard de Server Action — `getCurrentProfile()` + early return pt-BR
**Source:** `app/(app)/team/actions.ts:28-29`, `app/(app)/admin/invites/actions.ts:73-74`
**Apply to:** `app/(app)/admin/staff/actions.ts`, edições em `team/actions.ts` e `configuracoes/actions.ts`
```ts
const profile = await getCurrentProfile();
if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };
```

### Tenant-alvo nunca vem do formulário sem validação
**Source:** comentário de cabeçalho `app/(app)/team/actions.ts:6-10` ("`tenant_id` NUNCA vem do formulário") + `lib/security/role.ts` `resolveWriteTenantId`
**Apply to:** todas as Server Actions de admin tocadas nesta fase (GRANT-05)

### `revalidatePath` após mutação
**Source:** `app/(app)/team/actions.ts:63,86`, `app/(app)/admin/invites/actions.ts:159,213`
**Apply to:** `admin/staff/actions.ts`

### Helper SQL `security definer` + `stable` + `set search_path = public` + `(select auth.uid())`
**Source:** `supabase/migrations/0040_psw_staff_access_core.sql:86-110` (conteúdo exato reproduzido em RESEARCH.md §4)
**Apply to:** `current_admin_tenant_ids()`, `effective_admin_tenant_ids()` em `0045`

### Predicado por linha deve permitir inlining — sem `security definer`/`set` no wrapper fino
**Source:** RESEARCH.md §4 (D-Q) — nenhum analog no código existente, é o achado novo desta fase
**Apply to:** `is_tenant_admin_of(t uuid)` em `0045`

### Policy restritiva combinada por AND — sempre acompanhada de permissiva aditiva
**Source:** `supabase/migrations/0044_psw_staff_only_assigned.sql` (cabeçalho completo) + RESEARCH.md §1 (D-P)
**Apply to:** `0046` — nunca entregar só o disjunto na restritiva sem as PERMISSIVAS novas

### Teste de RLS com JWT real, nunca mock
**Source:** `tests/security/psw-staff-isolation.test.ts:26-33`
**Apply to:** `tests/security/psw-staff-admin-grant.test.ts`

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Lógica de "quantas oportunidades a pessoa perde ao revogar" (D-G) | utility (cálculo runtime) | transform | Nenhuma contagem análoga existe no código hoje; usar a disciplina de "calculado, nunca persistido" do score (`lib/opportunities/score.ts`) como referência de princípio, não de forma |
| Sinalização de "concessão órfã" na UI (D-S) | component (badge) | — | Nenhuma tela do projeto marca uma linha de banco como "inerte"/órfã hoje; adaptar o padrão de badge de status (`admin/invites/page.tsx:91-100`) com um rótulo semântico novo |
| `effective_admin_tenant_ids()` (helper de 3 partes, RESEARCH.md §4) | migration function | CRUD | É achado novo da pesquisa (não existe padrão de "3 helpers com um wrapper fino não-definer" no projeto); a forma exata está prescrita na RESEARCH.md, não em código existente |

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/(app)/admin/`, `app/(app)/team/`, `app/(app)/configuracoes/`, `lib/security/`, `lib/tenants/`, `components/opportunities/`, `components/shell/`, `tests/security/`
**Files scanned:** 12 lidos integralmente + RESEARCH.md (1554 linhas) como fonte primária de SQL exato
**Pattern extraction date:** 2026-08-07
