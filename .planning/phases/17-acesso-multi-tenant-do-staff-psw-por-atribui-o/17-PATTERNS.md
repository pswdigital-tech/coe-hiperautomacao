# Phase 17: Acesso Multi-Tenant do Staff PSW por Atribuição - Pattern Map

**Mapped:** 2026-08-06
**Files analyzed:** 16 (novos/modificados)
**Analogs found:** 16 / 16

## File Classification

| Novo/Modificado | Papel | Fluxo de dados | Analog mais próximo | Qualidade |
|---|---|---|---|---|
| `supabase/migrations/0039_psw_staff_role.sql` | migration (enum isolado) | event-driven (DDL) | `supabase/migrations/0020_platform_admin_role.sql` | exact |
| `supabase/migrations/0040_psw_staff_access.sql` | migration (helper + trigger + RLS aditiva) | event-driven (triggers) + CRUD (policies) | `0021_platform_admin_rls.sql` + `0025_platform_admin_write_rls.sql` + `0032_opportunity_assignees.sql` (trigger) + `0037_opportunity_tasks.sql` (RLS de tabela-filha) | exact |
| Storage policy aditiva (dentro da `0040` ou migration própria) | migration (RLS de `storage.objects`) | file-I/O | `supabase/migrations/0018_documentos_anotacoes_historico.sql` (policies de `opportunity-documents`) | exact |
| `invited_emails` CHECK + policy ajustada (dentro da `0040`) | migration (RLS aditiva/CHECK) | CRUD | `supabase/migrations/0028_invite_viewer_role.sql` + `0029_tenant_admin_invites.sql` | exact |
| `lib/security/role.ts` (+ `isPswStaff()` + escopo de acesso) | service (resolução de papel/tenant) | request-response | o próprio arquivo — `isPlatformAdmin()`/`isTenantAdmin()`/`getCurrentProfile()` já existentes | exact (extensão in-place) |
| `lib/opportunities/actions.ts` (`updateOpportunity`, linha ~570) | service (server action, escrita) | CRUD | o próprio call site — `.eq('tenant_id', profile.tenant_id)` a substituir | exact |
| `lib/opportunities/risk-actions.ts` (`updateRisk`/`deleteRisk`, linhas 156/195) | service (server action, escrita) | CRUD | `lib/opportunities/actions.ts:updateOpportunity` (mesmo padrão de defesa em profundidade) | exact |
| `lib/opportunities/task-actions.ts` (`updateTask`/`deleteTask`/`updateTaskStatus`, linhas 186/229/280) | service (server action, escrita) | CRUD | idem | exact |
| `lib/opportunities/document-actions.ts` (`deleteDocument`, linhas 203/210) | service (server action, escrita) | file-I/O | idem | exact |
| `lib/opportunities/note-actions.ts` (linha 95) | service (server action, escrita) | CRUD | idem | exact |
| `lib/opportunities/assignee-actions.ts` | service (server action, atribuição) | CRUD | o próprio arquivo — já resolve `tenant_id` **da oportunidade** (server-derived), é o padrão-alvo dos call sites acima | exact |
| `lib/opportunities/assignees.ts` (+ `fetchAssignablePswStaff`/estender `AssignableProfile`) | service (leitura) | request-response | o próprio arquivo — `fetchAssignableProfiles`/`fetchAllAssignableProfiles` | exact |
| `lib/opportunities/filters.ts` (+ filtro `empresa`) + toolbar de listagem | utility (parse/serialize de filtro) + component | request-response | o próprio arquivo — filtros `assignee`/`cargo`/`tenant` já existentes | exact |
| `app/(app)/admin/invites/{InviteForm,actions,page}.tsx` | route/component (convite) | request-response | os próprios arquivos — fluxo de convite do `platform_admin` já existe, só ganha opção `psw_staff` | exact (extensão in-place) |
| `lib/database.types.ts` (`TenantRole` + 2 `Record<TenantRole,...>` exaustivos) | model (tipos hand-maintained) | transform | `components/shell/Sidebar.tsx:107` (`roleLabel`) + `app/(app)/team/page.tsx:24` (`ROLE_LABEL`) — pontos que quebram o build | exact |
| `tests/security/psw-staff-isolation.test.ts` | test | request-response (RLS via JWT) | `tests/security/platform-admin-cross-tenant.test.ts` + `tests/security/opportunity-tasks-isolation.test.ts` | exact |
| `tests/helpers/auth-as.ts` (+ `asPswStaff()`) e `tests/setup/seed-test-tenants.ts` (+ tenant/perfil PSW de teste) | test helper | request-response | os próprios arquivos — `asFgcoop`/`asAcme` e `seedTestTenants` | exact |

## Pattern Assignments

### `supabase/migrations/0039_psw_staff_role.sql` (migration — enum isolado)

**Analog:** `supabase/migrations/0020_platform_admin_role.sql` (íntegro, 37 linhas — já lido, nada a re-ler).

Copiar a estrutura **verbatim**, só trocando o valor do enum e a prosa de contexto:

```sql
-- =============================================================================
-- 0039_psw_staff_role.sql — Novo valor 'psw_staff' no enum tenant_role
-- =============================================================================
-- CONTEXTO: pessoa da PSW (dev/tech lead/PM) hoje precisa ser cadastrada
-- DENTRO do tenant do cliente para trabalhar numa demanda — e falha se já tem
-- conta noutro tenant (e-mail duplicado em auth.users). Este valor de enum
-- cria um papel próprio para a pessoa da PSW, cadastrada 1x no tenant da PSW,
-- multi-tenant só por ATRIBUIÇÃO (opportunity_assignees, 0032).
--
-- Esta migration SÓ adiciona o valor ao enum. Helper/trigger/policies vêm na
-- 0040, separados de propósito: o Postgres não deixa um valor de enum
-- recém-criado ser USADO na mesma transação em que foi adicionado.
--
-- IMPORTANTE: isto NÃO promove ninguém nem cria vínculo algum. Para tornar um
-- usuário psw_staff, rode (service_role / SQL editor):
--     update profiles set role = 'psw_staff' where email = 'dev@psw...';
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Colar e RODAR SOZINHA (não colar junto com 0040 no mesmo Run).
-- Pré-requisito: 0001..0038 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type tenant_role add value if not exists 'psw_staff';

-- =============================================================================
-- FIM 0039 — tenant_role agora tem ..., 'platform_admin', 'psw_staff'.
-- PRÓXIMO PASSO OBRIGATÓRIO: aplicar 0040 numa segunda execução separada,
-- só depois de confirmar que esta transação foi COMMITADA.
-- =============================================================================
```

---

### `supabase/migrations/0040_psw_staff_access.sql` (migration — helper + trigger reescrito + policies aditivas)

**Analogs combinados:**
- `0021_platform_admin_rls.sql` (helper `SECURITY DEFINER stable` + policies SELECT aditivas)
- `0025_platform_admin_write_rls.sql` (policies de escrita aditivas, mesmo padrão espelhado por tabela)
- `0032_opportunity_assignees.sql` linhas 51-80 (trigger `check_assignee_tenant()` a reescrever)
- `0037_opportunity_tasks.sql` linhas 226-259 (shape de 4 policies — SELECT com OR, escrita com gate de `viewer`)

**Helper SQL** (molde de `is_platform_admin()`, 0021 linhas 38-51) — RESEARCH.md já contém a versão final recomendada (`current_assigned_opportunity_ids()`), copiar dali sem re-derivar:

```sql
create or replace function current_assigned_opportunity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select opportunity_id
  from opportunity_assignees
  where profile_id = (select auth.uid())
$$;
```

**Trigger reescrito** — RESEARCH.md linhas 555-591 (`Code Examples`) já tem a versão completa; a base é `check_assignee_tenant()` de `0032:51-75`. Copiar essa versão do RESEARCH.md verbatim (já testada mentalmente contra os 4 casos exigidos pelo CONTEXT.md — mesmo tenant OK / outro tenant não-psw REJEITA / psw_staff qualquer tenant OK / tenant_id da linha ≠ oportunidade REJEITA). Não re-derivar.

**Policy SELECT aditiva** (padrão de `0021:57-80`, sufixo `_psw_staff` em vez de `_platform_admin`, D-09):

```sql
drop policy if exists opportunities_select_psw_staff on opportunities;
create policy opportunities_select_psw_staff on opportunities
  for select using (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  );
```
Repetir para as 6 tabelas-filha diretas (`opportunity_phases`, `opportunity_risks`, `opportunity_documents`, `opportunity_notes`, `opportunity_history`, `opportunity_tasks`) trocando o predicado para `opportunity_id in (select current_assigned_opportunity_ids())` quando a coluna é `opportunity_id` em vez de `id`. `opportunity_assignees` também precisa de uma policy SELECT aditiva análoga (ver ACCESS-05).

**Policy UPDATE aditiva** — `using` e `with check` IDÊNTICOS (padrão de `0025:24-26`, exemplo completo em RESEARCH.md linhas 606-616 — copiar de lá, já inclui o comentário de alerta sobre os dois lados precisarem ser iguais).

**Policy de `invited_emails`** — dois ajustes na MESMA migration (Pitfall 2 do RESEARCH.md), espelhando `0028_invite_viewer_role.sql:26-27` (CHECK) e `0029_tenant_admin_invites.sql:49-55` (policy de INSERT):
```sql
-- 1. Amplia o CHECK (mesma forma de 0028, que ampliou pra 'viewer'):
alter table invited_emails drop constraint if exists invited_emails_role_check;
alter table invited_emails add constraint invited_emails_role_check
  check (role in ('member', 'tenant_admin', 'viewer', 'psw_staff'));

-- 2. Aperta a policy de INSERT do tenant_admin (0029:49-55) para barrar
--    explicitamente psw_staff além de platform_admin:
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and role not in ('platform_admin', 'psw_staff')
  );
```
A policy de INSERT do `platform_admin` (de `0022`, não relida aqui — já documentada no RESEARCH como "policies de 0022 intactas") continua aditiva e sem restrição de `role`, então o `platform_admin` já pode inserir `psw_staff` sem mudança adicional ali.

**Storage — policy aditiva casando `opportunity_id`** (RESEARCH.md linhas 618-631, adaptado de `opportunity_documents_storage_select` em `0018:137-143` — não relido aqui, exemplo já extraído no RESEARCH):
```sql
create policy opportunity_documents_storage_select_psw_staff on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'
    and (storage.foldername(name))[2]::uuid in (select current_assigned_opportunity_ids())
  );
```
Repetir para INSERT/UPDATE/DELETE se `0018` já tiver essas policies para `tenant_admin`/`member` (checar o arquivo antes de escrever — não presumir).

**`audit_log` — aditiva condicional** (D-15, `0038` pode não estar aplicada ainda):
```sql
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'audit_log') then
    execute $sql$
      drop policy if exists audit_log_select_psw_staff on audit_log;
      create policy audit_log_select_psw_staff on audit_log
        for select using (
          current_user_role() = 'psw_staff'
          and opportunity_id in (select current_assigned_opportunity_ids())
        );
    $sql$;
  end if;
end $$;
```
Confirmar o nome real da coluna de vínculo em `audit_log` (`0038_audit_log.sql`, arquivo no working tree — permitido LER, não editar) antes de escrever este bloco; não presumir `opportunity_id` sem checar.

---

### `lib/security/role.ts` (D-11 — onde mora o escopo)

**Analog:** o próprio arquivo, extensão in-place seguindo o padrão de `isPlatformAdmin()`/`isTenantAdmin()` (linhas 115-133, já lidas acima):

```typescript
/**
 * Staff da PSW multi-tenant por atribuição: NÃO é platform_admin (D-06) — só
 * enxerga o que lhe foi atribuído via opportunity_assignees. Espelha o
 * predicado SQL current_user_role() = 'psw_staff' usado nas policies
 * aditivas (migration 0040).
 */
export function isPswStaff(profile: Pick<CurrentProfile, 'role'> | null): boolean {
  return profile?.role === 'psw_staff';
}
```

E o escopo de acesso central (D-11) que os call sites de escrita vão consumir em vez de `profile.tenant_id` cru:

```typescript
/**
 * Escopo de tenant para defesa em profundidade em Server Actions de escrita.
 * Para a maioria dos papéis, é o próprio tenant do profile — mesma regra que
 * `.eq('tenant_id', profile.tenant_id)` já embutia. Para `psw_staff`, o
 * tenant correto é o da LINHA-ALVO (a oportunidade), nunca o da PSW — ver
 * Pitfall 1 do RESEARCH.md desta fase. `resolveWriteTenantScope` centraliza
 * essa decisão para não duplicá-la em 6+ call sites.
 */
export async function resolveWriteTenantScope(
  profile: CurrentProfile,
  targetOpportunityTenantId: string,
): Promise<string> {
  return isPswStaff(profile) ? targetOpportunityTenantId : profile.tenantId;
}
```
A assinatura exata (síncrona vs. precisa buscar o tenant da oportunidade) e onde cada call site busca `targetOpportunityTenantId` fica a critério do plano — mas a defesa em profundidade NUNCA deve usar `profile.tenant_id` sem passar por este helper quando o ator pode ser `psw_staff`.

---

### Call sites de escrita (`actions.ts`, `risk-actions.ts`, `task-actions.ts`, `document-actions.ts`, `note-actions.ts`)

**Analog primário:** o próprio `lib/opportunities/actions.ts` — `updateOpportunity` (trecho lido, linhas ~475-580):

```typescript
// Server-derived tenant scope — defesa em profundidade sobre o RLS.
const { data: profile } = await supabase
  .from('profiles')
  .select('tenant_id')
  .eq('id', user.id)
  .single();
if (!profile) return { ok: false, error: 'Profile não encontrado.' };

const { error } = await supabase
  .from('opportunities')
  .update({ /* ...campos... */ })
  .eq('id', id)
  .eq('tenant_id', profile.tenant_id);   // <-- este é o ponto a trocar
```

**Padrão-alvo a copiar:** `lib/opportunities/assignee-actions.ts` JÁ resolve o tenant a partir da OPORTUNIDADE (server-derived), não do profile — é o modelo que os demais call sites precisam imitar quando o ator pode ser `psw_staff`. Ler `assignee-actions.ts:42-51` (citado no RESEARCH.md linha 419) antes de editar cada call site, para replicar exatamente essa forma de buscar `tenant_id` da linha-alvo em vez de `profile.tenant_id`.

**Pontos exatos a tocar** (do RESEARCH.md, já verificados linha a linha no código):
- `lib/opportunities/actions.ts:570` — `updateOpportunity`
- `lib/opportunities/risk-actions.ts:156,195` — `updateRisk`/`deleteRisk`
- `lib/opportunities/task-actions.ts:186,229,280` — `updateTask`/`deleteTask`/`updateTaskStatus`
- `lib/opportunities/document-actions.ts:203,210` — `deleteDocument`
- `lib/opportunities/note-actions.ts:95` — mutação de nota

**Erro a NÃO cometer (Pitfall 1 crítico):** `error === null` com `data` vazio NÃO significa sucesso — é um `WHERE` que casou 0 linhas. Qualquer teste de escrita precisa reler a linha via `service-role` depois (ver seção de testes).

---

### `lib/opportunities/assignees.ts` (D-05, atribuição cross-tenant)

**Analog:** o próprio arquivo — `fetchAssignableProfiles`/`fetchAllAssignableProfiles` (linhas 150-244, já lidas acima). Estender com uma função que, quando o ator é `platform_admin`, agrega os `psw_staff` do tenant da PSW aos profiles do tenant da oportunidade:

```typescript
/**
 * Pessoas atribuíveis a uma oportunidade, incluindo o staff PSW cross-tenant
 * quando quem atribui é platform_admin (D-05). Combina
 * fetchAssignableProfiles(tenantId) com os profiles role='psw_staff' do
 * tenant da PSW — union, sem duplicar quem já é do próprio tenant.
 */
export async function fetchAssignableProfilesForPlatformAdmin(
  tenantId: string,
  pswTenantId: string,
): Promise<AssignableProfile[]> {
  const [local, pswStaff] = await Promise.all([
    fetchAssignableProfiles(tenantId),
    fetchAssignableProfiles(pswTenantId).then((rows) =>
      rows.filter((p) => p.role === 'psw_staff'),
    ),
  ]);
  const seen = new Set(local.map((p) => p.id));
  return [...local, ...pswStaff.filter((p) => !seen.has(p.id))];
}
```
Mantém a whitelist de colunas (`id, email, full_name, cargo, role`) e o mesmo fallback de `cargo` ausente (42703) já implementado nas funções vizinhas — não reescrever a degradação, só compor sobre `fetchAssignableProfiles`.

O trigger `check_assignee_tenant()` reescrito (ver migration `0040` acima) é quem de fato autoriza o INSERT cross-tenant; esta função é só a lista da UI.

---

### `lib/opportunities/filters.ts` (+ coluna/filtro "Empresa" na listagem)

**Analog:** o próprio arquivo — filtro `tenant` (linhas 52-57, já existe e documenta exatamente esse caso: "Só efetivo para platform_admin — NÃO vem de `parseFilters`"). Para `psw_staff`, o mesmo padrão se aplica: adicionar `empresa` como filtro condicionado ao papel, resolvido **na page** (não em `parseFilters`, para não virar vetor de tenant_id arbitrário):

```typescript
/** Filtro de empresa — mesma forma do campo `tenant` já existente (linha 52-57)
 *  mas disponível também para psw_staff (não só platform_admin), já que a
 *  listagem unificada (D-03) precisa do filtro por empresa nas duas mãos:
 *  ver company coluna/filtro em `app/(app)/opportunities/page.tsx`. */
```
Reusar a MESMA forma de resolução server-side (slug → `tenant_id` via `fetchTenantIdBySlug`, nunca UUID cru na URL) já documentada no comentário do campo `tenant`. Não criar um segundo mecanismo de filtro paralelo.

**`fetchOpportunities()` já não filtra por tenant por padrão** (achado-chave do RESEARCH.md) — a união cross-tenant do `psw_staff` já funciona assim que a policy SELECT da `0040` existir; o trabalho aqui é só a coluna "Empresa" + o filtro na toolbar, não a query.

---

### `app/(app)/admin/invites/{InviteForm,actions,page}.tsx` (D-05 — convite de `psw_staff`)

**Analog:** os próprios arquivos — fluxo já existente do `platform_admin` (visto em `InviteForm.tsx` linhas 1-100). Adicionar a opção `psw_staff` na allowlist de papéis convidáveis DAQUI (não em `app/(app)/team/actions.ts`, que é do `tenant_admin` e NÃO pode oferecer `psw_staff` — `parseRoleAndCargo` deve continuar recusando esse valor).

```tsx
// InviteForm.tsx — acrescentar <option> ao seletor de papel existente
// (o form hoje só tem campo de e-mail + empresa; se não existir seletor de
// role ainda, checar actions.ts para ver onde o role é fixado/derivado
// antes de adicionar o campo).
```
`createInvite` (em `actions.ts`) precisa aceitar/validar `role: 'psw_staff'` e, quando esse for o papel, fixar `tenant_id` como o tenant da PSW (server-derived, não escolhido no form) — coerente com D-02/D-08 (a pessoa da PSW só existe no tenant da PSW).

---

### `lib/database.types.ts` + `Record<TenantRole, string>` exaustivos (Pitfall 6)

**Analog:** os próprios arquivos — `TenantRole` (linha 83 aprox.) e os dois usos exaustivos: `components/shell/Sidebar.tsx:107` (`roleLabel`) e `app/(app)/team/page.tsx:24` (`ROLE_LABEL`). Ambos quebram `tsc --noEmit` assim que `psw_staff` entrar no union — adicionar rótulo pt-BR (`psw_staff: 'Staff PSW'`) nos dois. `lib/database.types.ts` é hand-maintained (ver Memory: type-gen bloqueado) — editar manualmente, seguindo o formato dos demais valores do enum.

---

### `tests/security/psw-staff-isolation.test.ts`

**Analogs:** `tests/security/platform-admin-cross-tenant.test.ts` (íntegro, 202 linhas, já lido acima) para a forma de seed/promote/describe, e `tests/security/opportunity-tasks-isolation.test.ts` (mencionado no RESEARCH, não relido — mesma estrutura de specs por tabela-filha).

**Setup pattern a copiar** (de `platform-admin-cross-tenant.test.ts:33-101`):
```typescript
const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const PSW_STAFF_TEST_EMAIL = 'psw-staff@test.local';
const TEST_PASSWORD = 'test-password-123';

describe.skipIf(!HAS_DB)('psw_staff — RLS cross-tenant por atribuição (0039/0040)', () => {
  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();
    // criar 2 oportunidades em tenants DIFERENTES (A e B) + 1 terceira no
    // MESMO tenant A sem atribuição (é o caso do teste negativo decisivo).
    // Criar/promover o usuário de teste a role='psw_staff' — mesmo padrão de
    // "Cria (idempotente) e promove" das linhas 70-91.
    // Vincular via opportunity_assignees (INSERT direto via service-role,
    // simulando o que o platform_admin faria pela UI).
  });
  // ...
});
```

**O teste negativo decisivo (Specific Ideas do CONTEXT.md)** — não existe analog direto no repo (é o motivo desta fase existir), mas a FORMA do assert é a mesma de `platform-admin-cross-tenant.test.ts:129-134` ("sanity — membro comum NÃO vê..."):
```typescript
it('psw_staff atribuído à oportunidade X do tenant A NÃO vê a oportunidade Y do MESMO tenant A', async () => {
  const { client } = await asPswStaff();
  const { data, error } = await client.from('opportunities').select('id').eq('id', oppYSameTenantNoAssignment);
  expect(error).toBeNull();
  expect(data).toEqual([]);   // vazio — não "algum tenant onde ele tem atribuição"
});
```

**Reler a linha via service-role após escrita** (Pitfall 1, `platform-admin-cross-tenant.test.ts:138-153` já faz exatamente essa dupla verificação para o caso negativo — copiar a forma para o caso POSITIVO de escrita também):
```typescript
const { data: still } = await svc().from('opportunities').select('observacao').eq('id', oppId).single();
expect(still?.observacao).toBe('valor esperado');   // não só error === null
```

**4 casos do trigger** (`check_assignee_tenant()` reescrito) — usar `sb.from('opportunity_assignees').insert(...)` via service-role e checar `error`/`!error` nos 4 casos listados no CONTEXT.md/RESEARCH.md (mesmo tenant OK / outro tenant não-psw REJEITA / psw_staff qualquer tenant OK / tenant_id da linha ≠ oportunidade REJEITA) — forma similar ao teste de "convite nunca aceita role=platform_admin" em `platform-admin-cross-tenant.test.ts:190-200` (`expect(error).not.toBeNull()`).

**`invited_emails`** — copiar o describe inteiro de `platform-admin-cross-tenant.test.ts:156-201` como esqueleto, adaptando para `role: 'psw_staff'`: `tenant_admin` deve falhar ao inserir, `platform_admin` deve conseguir.

---

### `tests/helpers/auth-as.ts` + `tests/setup/seed-test-tenants.ts`

**Analog:** os próprios arquivos (íntegros, já lidos — 13 e 71 linhas respectivamente).

`auth-as.ts` — adicionar no MESMO padrão de `asFgcoop`/`asAcme`:
```typescript
export const asPswStaff = () => authedClient(PSW_STAFF_TEST_EMAIL, TEST_PASSWORD);
```

`seed-test-tenants.ts` — adicionar constantes e uma função de seed que promove um usuário a `psw_staff`, no MESMO padrão de `ensureUser`/upsert de tenants (linhas 22-54):
```typescript
export const PSW_TEST_ID = '33333333-3333-3333-3333-333333333333';
export const PSW_STAFF_TEST_EMAIL = 'psw-staff@test.local';

// dentro de seedTestTenants(): upsert do tenant PSW_TEST_ID + ensureUser +
// promote (update profiles set role='psw_staff' where id = ...), mesmo
// padrão de "promote platform_admin" já usado em
// platform-admin-cross-tenant.test.ts:87-91 (não duplicar a lógica de
// promote lá — trazer para cá se for compartilhável, ou replicar a forma).
```

## Shared Patterns

### Helper SQL `SECURITY DEFINER stable`
**Fonte:** `supabase/migrations/0021_platform_admin_rls.sql:38-51` (`is_platform_admin()`)
**Aplicar em:** `current_assigned_opportunity_ids()` (migration `0040`) — mesma assinatura (`stable security definer set search_path = public`), mesma comparação por `role::text` para não depender da ordem de commit do enum.

### Policies aditivas nunca substitutivas (D-09)
**Fonte:** `0021_platform_admin_rls.sql` + `0025_platform_admin_write_rls.sql` (padrão `drop policy if exists <nome>_psw_staff ... ; create policy <nome>_psw_staff ...`, sufixo próprio, nunca tocando a policy `_select`/`_update` de tenant).
**Aplicar em:** todas as 7 tabelas + `storage.objects` na migration `0040`.

### `(select auth.uid())` / InitPlan
**Fonte:** já usado em `current_tenant_id()`, `is_platform_admin()`, `current_user_role()` — e no próprio helper novo (RESEARCH.md linhas 269-291).
**Aplicar em:** toda policy/função nova desta fase.

### Defesa em profundidade server-derivada, nunca `profile.tenant_id` cru quando o ator pode ser `psw_staff`
**Fonte:** `lib/opportunities/assignee-actions.ts:42-51` (já resolve o tenant da OPORTUNIDADE, não do profile).
**Aplicar em:** os ~6 call sites de escrita listados acima (`actions.ts`, `risk-actions.ts`, `task-actions.ts`, `document-actions.ts`, `note-actions.ts`) — via o novo `resolveWriteTenantScope` em `lib/security/role.ts`.

### Guard de papel → server-derived → RLS (3 camadas, docs/PROJETO.md §1 + RESEARCH.md "Established Patterns")
**Fonte:** `requireEditorRole()` (`lib/security/role.ts:48-56`) + `updateOpportunity` (`actions.ts:483-580`).
**Aplicar em:** toda escrita nova/tocada desta fase deve seguir as três camadas — guard de papel na action, valor server-derived (nunca do formulário), RLS como bloqueio real.

## Nenhum Analog Encontrado

Nenhum arquivo desta fase ficou sem analog — é uma fase de extensão de padrões já consolidados no próprio repo (RLS aditiva + enum isolado + trigger de coerência), não de mecanismo novo.

## Metadata

**Escopo de busca de analogs:** `supabase/migrations/`, `lib/security/`, `lib/opportunities/`, `app/(app)/admin/invites/`, `app/(app)/opportunities/`, `tests/security/`, `tests/helpers/`, `tests/setup/`.
**Arquivos lidos integralmente (sem re-leitura):** `0020`, `0021`, `0025`, `0032`, `0037`, `0029`, `lib/security/role.ts`, `lib/opportunities/assignees.ts`, `lib/opportunities/filters.ts`, `tests/security/platform-admin-cross-tenant.test.ts`, `tests/helpers/auth-as.ts`, `tests/setup/seed-test-tenants.ts`.
**Trechos lidos via offset/limit (arquivos grandes):** `lib/opportunities/actions.ts` (linhas 450-600, `updateOpportunity`), `app/(app)/admin/invites/InviteForm.tsx` (linhas 1-100).
**Data da extração:** 2026-08-06
