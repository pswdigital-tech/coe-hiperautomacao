# Phase 17: Acesso Multi-Tenant do Staff PSW por Atribuição - Research

**Researched:** 2026-08-06
**Domain:** PostgreSQL RLS (policies aditivas + performance), Supabase Storage RLS, migrations de enum, defesa em profundidade na camada de app (Next.js Server Actions)
**Confidence:** HIGH para os padrões de RLS/enum (verificados no código vivo + docs oficiais Postgres/Supabase); MEDIUM para os pontos de UI (poucas referências no mockup, é tela nova); LOW para nenhuma claim relevante — tudo que seria `[ASSUMED]` foi verificado no repo ou em fonte oficial.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Granularidade = oportunidade):** o vínculo pessoa↔trabalho é a
  **oportunidade**, reusando `opportunity_assignees` (0032). Não se cria
  entidade `projects` nem se concede acesso ao tenant inteiro.
- **D-02 (Só a PSW é multi-tenant):** usuário de cliente continua travado em um
  único tenant. `current_tenant_id()` permanece a fronteira de `member` /
  `viewer` / `tenant_admin`. Nenhuma UI de "conceder outro tenant a alguém do
  cliente".
- **D-03 (Navegação = lista unificada):** o `psw_staff` vê demandas de A, B e C
  **na mesma lista**, com coluna de empresa e filtro por empresa. Não é troca de
  contexto.
- **D-04 (Escrita como `member`):** o `psw_staff` escreve nas oportunidades
  atribuídas exatamente como um `member` escreve nas do próprio tenant —
  tarefas, notas, documentos, riscos, campos/status da oportunidade. **Não** é
  acesso somente-leitura.
- **D-05 (Quem atribui):** apenas `platform_admin` vincula gente da PSW a
  oportunidades e convida alguém como `psw_staff`. `tenant_admin` de cliente não
  enxerga nem atribui pessoas de fora do próprio tenant.
- **D-06 (`psw_staff` ≠ `platform_admin`):** papéis distintos. O
  `platform_admin` continua com visão total via `is_platform_admin()` (0021); o
  `psw_staff` só enxerga o que lhe foi atribuído. Um não é nível do outro.
- **D-07 (Numeração de migration):** a última migration commitada é a
  `0037_opportunity_tasks.sql`; a `0038_audit_log.sql` **existe no working tree
  ainda não commitada**. Esta fase começa em **`0039`** e não toca a `0038`.
- **D-08 (Enum isolado):** o valor `psw_staff` entra sozinho numa migration
  (`0039`), e tudo que o referencia vem na seguinte (`0040`+).
- **D-09 (Policies aditivas, nunca substitutivas):** múltiplas policies
  PERMISSIVE do mesmo comando são combinadas com **OR** pelo Postgres. Toda
  policy nova desta fase é um `*_psw_staff` adicional; **nenhuma** policy
  existente por tenant é dropada ou relaxada.
- **D-10 (Tenant da linha de atribuição):** `opportunity_assignees.tenant_id`
  passa a ser sempre o `tenant_id` **da oportunidade**. O trigger reescrito
  mantém a rejeição de vínculo cruzado para todo profile que **não** seja
  `psw_staff`.
- **D-11 (Onde mora o escopo):** o "escopo de acesso" do usuário é resolvido em
  **`lib/security/role.ts`**, não espalhado por call site. Os call sites de
  `.eq('tenant_id', profile.tenantId)` passam a consumir esse escopo.
- **D-12 (Storage entra na conta):** documentos vivem no bucket privado
  `opportunity-documents` com path `{tenant_id}/{opportunity_id}/{arquivo}` e
  policies escopadas por `(storage.foldername(name))[1] = current_tenant_id()::text`
  (0018). Sem policy aditiva ali, o `psw_staff` vê o registro do documento e
  **não consegue baixar o arquivo**.
- **D-13 (`viewer` continua bloqueado):** as policies de escrita usam
  `current_user_role() <> 'viewer'`. Como `psw_staff` é um valor novo do enum,
  ele passa nesse teste automaticamente (correto por D-04), mas precisa ser
  afirmado em teste, não assumido.

### Executor's Discretion

- Forma do helper SQL de acesso (`has_opportunity_access(uuid)` vs
  `current_assigned_opportunity_ids()` `setof uuid`), ambos `SECURITY DEFINER`
  + `stable` + `set search_path = public`.
- Como o `psw_staff` é identificado no helper — por `role::text = 'psw_staff'`
  (padrão da 0021, não depende de ordem de commit do valor de enum).
- Índices adicionais em `opportunity_assignees` se o helper filtrar só por
  `profile_id`.
- Onde entra a coluna "Empresa" na lista — reusar a tabela existente com a
  coluna condicionada ao papel.
- UI de atribuição cross-tenant — estender `AssignableProfile` /
  `lib/opportunities/assignees.ts`.
- Como a UI do `psw_staff` sinaliza "por que vejo isto" (badge de empresa).
- Rota/tela de cadastro do `psw_staff` — reusar `app/(app)/admin/invites/`.

### Deferred Ideas (OUT OF SCOPE)

- Multi-tenancy para usuário de cliente (D-02) — tabela N:N de acesso a tenant
  fica para um eventual futuro.
- Acesso da PSW no nível do tenant inteiro sem atribuição — isso já é
  `platform_admin`.
- Entidade `projects` agrupando N oportunidades.
- Notificar a pessoa quando é atribuída.
- Painel "minhas demandas" com métricas próprias do staff PSW.
- Log de acesso do staff PSW por tenant (encaixaria no audit log da `0038`,
  fora desta fase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte da pesquisa |
|----|-----------|----------------------|
| ACCESS-01 | Existe o papel `psw_staff` no enum `tenant_role` | Padrão exato replicado de `0020_platform_admin_role.sql` — ver §"Enum em migration isolada". `profiles.role` não tem CHECK extra (só o enum), então nenhuma migration adicional é necessária para o profile aceitar o valor. |
| ACCESS-02 | Uma pessoa da PSW cadastrada uma única vez, atende N empresas | Resolvido puramente pelo modelo (D-01/D-10) — o profile continua com 1 `tenant_id` (o da PSW); o multi-tenant é via `opportunity_assignees`, não via `profiles`. |
| ACCESS-03 | `opportunity_assignees` aceita vínculo cross-tenant só para `psw_staff` | Trigger `check_assignee_tenant()` (0032) — ver §"Trigger de coerência" com os 4 casos de teste exigidos. |
| ACCESS-04 | `psw_staff` vê SOMENTE as oportunidades atribuídas | Padrão `id in (select opportunity_id from opportunity_assignees where profile_id = (select auth.uid()))` — ver §"Padrão de policy recomendado" (é o padrão oficial Supabase de policy performática, e resolve a granularidade exigida). |
| ACCESS-05 | Visibilidade se propaga às tabelas filhas | Mapeamento completo das 7 tabelas + Storage em §"Tabelas filhas a tocar". `opportunity_history` é caso especial (congelada, só SELECT). |
| ACCESS-06 | `psw_staff` escreve como `member` | Mesmo helper usado em `using` + `with check` das policies de UPDATE — ver §"Cuidado com UPDATE (using + with check)". Achado crítico: os call sites de `.eq('tenant_id', profile.tenant_id)` (defesa em profundidade) quebram a escrita do `psw_staff` se não forem ajustados — ver §"Pitfall — defesa em profundidade que vira bloqueio". |
| ACCESS-07 | Usuário de cliente mantém isolamento | Nenhuma policy existente é tocada (D-09); testes de isolamento existentes (`tenant-isolation.test.ts` etc.) são a prova de regressão. |
| ACCESS-08 | Listagem unificada cross-tenant com coluna/filtro de empresa | `fetchOpportunities()` já NÃO filtra por tenant por padrão (só quando `filters.tenant` é setado pelo seletor do `platform_admin`) — ver §"Achado-chave: fetchOpportunities já é RLS-only". Isso significa que a união cross-tenant do `psw_staff` **já funciona automaticamente** assim que a policy SELECT existir; falta só a coluna/filtro de UI. |
| ACCESS-09 | Só `platform_admin` cadastra/atribui `psw_staff` | `invited_emails.role` tem CHECK restrito a `('member','tenant_admin','viewer')` (0028) e a policy de INSERT do `tenant_admin` (0029) só bloqueia `role <> 'platform_admin'` — **não** bloqueia `psw_staff` ainda. Achado crítico de segurança — ver §"Pitfall — invited_emails precisa de dois ajustes". |
| ACCESS-10 | `psw_staff` ≠ `platform_admin` | Dois helpers SQL distintos (`is_platform_admin()` existente + o novo de acesso por atribuição), nunca uma hierarquia. |
</phase_requirements>

## Summary

Esta fase é 100% sobre RLS aditiva e um helper de acesso por atribuição — não
instala nenhum pacote novo (sem Package Legitimacy Audit aplicável). O padrão a
seguir já existe **no próprio repo**, três vezes: `0020`→`0021` (enum isolado +
helper `SECURITY DEFINER` + policies OR) para `platform_admin`, e `0032`
(`opportunity_assignees` + trigger de coerência de tenant) para o vínculo N:N
pessoa↔oportunidade. A fase 17 não inventa mecanismo novo — ela **espelha**
esses dois padrões e os combina: um helper que resolve "quais oportunidades
esse profile pode ver por atribuição" (mesmo formato de `is_platform_admin()`),
e uma reescrita do trigger de `0032` para permitir vínculo cruzado apenas
quando `profiles.role::text = 'psw_staff'`.

O achado mais importante da pesquisa é que **`fetchOpportunities()` já não
filtra por tenant por padrão** — ela confia inteiramente na RLS, e só aplica
`.eq('tenant_id', filters.tenant)` quando o `platform_admin` seleciona uma
empresa específica na URL (`?empresa=`). Isso significa que a "listagem
unificada cross-tenant" (ACCESS-08) já vem de graça assim que a policy SELECT
existir — não é preciso reescrever a query de listagem, só adicionar a
coluna/filtro de empresa na UI. O segundo achado importante, e o mais arriscado
de passar despercebido, é que os **call sites de escrita** (`updateOpportunity`,
`updateRisk`, `deleteRisk`, `updateTask`, `deleteTask`, `updateTaskStatus`,
`deleteDocument`, etc.) usam `.eq('tenant_id', profile.tenant_id)` como defesa
em profundidade sobre a RLS — e `profile.tenant_id` de um `psw_staff` é o
tenant da **PSW**, nunca o da oportunidade atribuída. Se esses call sites não
forem ajustados, a RLS abre a porta (ACCESS-06) mas a defesa em profundidade a
fecha de novo silenciosamente (0 linhas afetadas, sem erro) — o pior tipo de
bug porque parece que "a escrita funcionou" (a Server Action não lança erro) e
nada muda no banco.

**Recomendação primária:** um único helper SQL
`current_assigned_opportunity_ids()` (`SECURITY DEFINER stable`, retorna
`setof uuid`) alimentando `id in (select current_assigned_opportunity_ids())`
nas tabelas-filha que têm `opportunity_id` direto, e
`opportunity_id in (select current_assigned_opportunity_ids())` nas que só têm
isso; mais um trigger `check_assignee_tenant()` reescrito com uma branch
`if v_profile_role <> 'psw_staff' then <regra atual> end if`; mais a
substituição do padrão `.eq('tenant_id', profile.tenant_id)` nos call sites de
escrita por uma verificação que deriva o tenant **da linha-alvo** (não do
profile) quando o ator é `psw_staff`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Papel `psw_staff` no enum | Database | — | Enum é definição de schema; nenhuma camada de app decide isso. |
| Regra "cross-tenant só p/ psw_staff" no vínculo | Database (trigger) | — | É a MESMA regra que hoje vive em `check_assignee_tenant()` — trigger é a única fonte da verdade, RLS não impede um trigger de rejeitar um insert válido por RLS. |
| Visibilidade por atribuição (SELECT) | Database (RLS) | — | Regra de segurança nº1 do projeto: nunca confiar em filtro de app para isolamento. |
| Escrita escopada por atribuição (INSERT/UPDATE/DELETE) | Database (RLS) | API/Backend (Server Actions) | RLS é o bloqueio real; a Server Action é defesa em profundidade + UX (mensagem de erro amigável antes do round-trip). |
| Escopo de acesso resolvido (`getCurrentProfile`/scope) | API/Backend | — | `lib/security/role.ts` já é o ponto único de resolução de papel/tenant — o escopo novo mora ali (D-11), não em cada call site. |
| Listagem unificada + coluna/filtro de empresa | Frontend Server (RSC) | Browser (toolbar interativa) | `app/(app)/opportunities/page.tsx` já resolve isso hoje para `platform_admin`; é Server Component com Client Component de toolbar. |
| Download de documento cross-tenant | Database (Storage RLS) | API/Backend (signed URL) | O 2º segmento do path é o `opportunity_id` — quem decide se o path é acessível é a policy de `storage.objects`, não o código que gera a signed URL. |
| UI de convite/atribuição do `psw_staff` | Frontend Server (RSC) | API/Backend (Server Actions) | Reusa `app/(app)/admin/invites/` e `assignee-actions.ts`, ambos já Server Actions com guard de papel. |

## Standard Stack

Nenhuma dependência nova. A fase reusa integralmente:

| Peça | Onde já existe | Reuso nesta fase |
|------|-----------------|-------------------|
| Postgres enum `tenant_role` | `0001_init.sql`, ampliado em `0014`, `0020` | Ganha o valor `psw_staff` |
| Helper `SECURITY DEFINER stable` | `current_tenant_id()` (0001), `current_user_role()` (0015), `is_platform_admin()` (0021) | Modelo para o helper novo de acesso por atribuição |
| Trigger de coerência de tenant | `check_assignee_tenant()` (0032), `check_task_tenant_coherence()` (0037) | `check_assignee_tenant()` é reescrito; `check_task_tenant_coherence()` precisa de uma decisão explícita — ver Open Questions |
| Policies aditivas OR | `0021`, `0025`, `0037` (select) | Mesmo padrão, sufixo `_psw_staff` em vez de `_platform_admin` |
| Storage RLS por `storage.foldername` | `0018` (1º segmento = tenant_id) | Policy aditiva casando o 2º segmento (opportunity_id) |
| Server Actions com guard de papel | `lib/security/role.ts`, `assignee-actions.ts`, `team/actions.ts` | Escopo de acesso centralizado (D-11) |
| Vitest contra Supabase Cloud real | `tests/security/*.test.ts`, `tests/helpers/auth-as.ts` | Novo helper `asPswStaff()` + tenant/perfil de teste |

**Instalação:** nenhuma (`npm install` não muda nesta fase).

## Package Legitimacy Audit

**Não aplicável** — esta fase não instala nenhum pacote novo (só SQL +
TypeScript sobre a stack existente). Nenhuma linha de `package.json` muda.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   platform_admin (UI)        │
                         │  /admin/invites  +  seletor   │
                         │  de pessoas (assignee-actions)│
                         └──────────────┬───────────────┘
                                        │ cria profile psw_staff
                                        │ (tenant = PSW) e vincula
                                        ▼
                         ┌───────────────────────────────┐
                         │   opportunity_assignees         │
                         │  (profile_id, opportunity_id,   │
                         │   tenant_id = tenant da OPP)     │   ◄── trigger check_assignee_tenant()
                         └──────────────┬───────────────────┘     rejeita cross-tenant p/ não-psw_staff
                                        │
                     helper SQL: current_assigned_opportunity_ids()
                     (SECURITY DEFINER stable, roda 1x por query)
                                        │
        ┌───────────────────────────────┼────────────────────────────────┐
        ▼                               ▼                                ▼
┌───────────────┐            ┌────────────────────┐             ┌──────────────────┐
│ opportunities  │            │ opportunity_phases   │             │ opportunity_risks  │
│ SELECT/W policy│            │ opportunity_tasks     │             │ opportunity_notes   │
│ aditiva (OR)   │            │ opportunity_documents │             │ opportunity_history │
└───────┬────────┘            │ opportunity_assignees │             └──────────────────┘
        │                     └──────────┬─────────────┘
        │                                │
        │                       storage.objects (2º segmento
        │                       do path = opportunity_id)
        ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js Server Component (app/(app)/opportunities/page.tsx)   │
│  fetchOpportunities() SEM .eq('tenant_id',...) por padrão      │
│  → RLS devolve a UNIÃO das oportunidades atribuídas           │
│  → coluna "Empresa" + filtro condicionados a role=psw_staff    │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Server Actions de escrita (actions.ts, risk-actions.ts,        │
│ task-actions.ts, note-actions.ts, document-actions.ts,         │
│ assignee-actions.ts)                                           │
│  ⚠ hoje escopam por .eq('tenant_id', profile.tenant_id)        │
│  → PRECISA mudar: para psw_staff, tenant_id da defesa em        │
│    profundidade deve vir da LINHA (opp/tarefa/risco), não do    │
│    profile — senão a RLS libera mas a defesa em profundidade    │
│    barra silenciosamente (0 linhas afetadas, sem erro)          │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Nenhuma pasta nova — a fase adiciona arquivos aos módulos já existentes:

```
supabase/migrations/
├── 0039_psw_staff_role.sql          # só o ALTER TYPE ... ADD VALUE (D-08)
├── 0040_psw_staff_access.sql        # helper + trigger reescrito + policies aditivas
lib/security/
├── role.ts                          # + isPswStaff() + resolveAccessScope() (D-11)
lib/opportunities/
├── assignees.ts                     # + fetchAssignablePswStaff() (ou análogo)
├── actions.ts / risk-actions.ts /   # ajuste do .eq('tenant_id', profile.tenant_id)
│   task-actions.ts / note-actions.ts / document-actions.ts / assignee-actions.ts
app/(app)/admin/invites/
├── InviteForm.tsx                   # + <option value="psw_staff">
├── page.tsx / actions.ts            # + tipo/label psw_staff
app/(app)/opportunities/
├── page.tsx                         # coluna/filtro "Empresa" condicionado a role
tests/
├── security/psw-staff-isolation.test.ts   # o teste negativo decisivo
├── helpers/auth-as.ts               # + asPswStaff()
├── setup/seed-test-tenants.ts       # + PSW_TEST_ID / perfil psw_staff de teste
```

### Pattern 1: Helper `SECURITY DEFINER stable` retornando `setof uuid`

**What:** em vez de repetir uma subquery correlacionada em cada policy, um
único helper resolve "quais oportunidades esse profile pode ver por
atribuição" e cada policy só faz `id in (select ...)`.

**When to use:** sempre que a mesma regra de acesso for consumida por 3+
tabelas (é exatamente este caso — 7 tabelas + Storage).

**Example (espelha `is_platform_admin()`, 0021, e o padrão oficial Supabase de
"IN em vez de JOIN"):**

```sql
-- Fonte: padrão do repo (0021_platform_admin_rls.sql) + Supabase RLS
-- performance guide (ver Sources) — subquery filtrada por profile_id fixo,
-- NUNCA um EXISTS correlacionado linha a linha.
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

-- policy aditiva em opportunities:
create policy opportunities_select_psw_staff on opportunities
  for select using (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  );
```

Por que `id in (select current_assigned_opportunity_ids())` e não
`exists (select 1 from opportunity_assignees where opportunity_id = opportunities.id and profile_id = (select auth.uid()))`:
o guia oficial de performance de RLS do Supabase mostra que reescrever a
policy para produzir primeiro o **conjunto fixo** (independente da linha
corrente) e depois usar `IN`/`ANY` contra a coluna evita que o planner
re-execute a subquery a cada linha da tabela varrida — o benchmark deles muda
de ~9000ms para ~20ms nessa reescrita exata (ver Sources).
`current_user_role() = 'psw_staff'` funciona como **short-circuit**: para os
demais papéis a subquery nem roda (o Postgres avalia o `and` da esquerda para
a direita e pode parar cedo), então o custo extra desta policy pros papéis de
tenant é desprezível.

### Pattern 2: `(select auth.uid())` em vez de `auth.uid()` cru

**What:** todo predicado de RLS que chama uma função do Supabase (`auth.uid()`,
`auth.jwt()`) ou uma `security definer stable` do próprio banco deve envolvê-la
em `select` para virar um **InitPlan**.

**When to use:** sempre — inclusive dentro do próprio helper acima (já
aplicado) e em qualquer policy nova desta fase.

```sql
-- ERRADO (reavalia por linha):
where profile_id = auth.uid()

-- CERTO (Postgres faz cache do resultado 1x por statement via InitPlan):
where profile_id = (select auth.uid())
```

**Fonte oficial:** [Supabase RLS Performance and Best
Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
— "Wrapping the function in some SQL causes an `initPlan` to be run by the
optimizer which allows it to 'cache' the results versus calling the function
on each row." Benchmark deles: 179ms → 9ms na mesma tabela só com essa troca.
As migrations existentes do repo (`current_tenant_id()`, `is_platform_admin()`)
já são funções `stable security definer` — o ganho do InitPlan se aplica à
CHAMADA da função dentro da policy, não só a `auth.uid()` cru; ou seja, o
padrão `current_user_role() = 'psw_staff'` já se beneficia disso pela mesma
razão. `[CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]`

### Pattern 3: Índice de suporte à policy

O guia oficial recomenda indexar toda coluna usada dentro de uma policy que
não seja PK/unique — no benchmark deles, "over 100x" de melhora em tabelas
grandes. `opportunity_assignees` já tem `(tenant_id, profile_id)` — um índice
composto que **começa** por `tenant_id`, não por `profile_id`. Se o helper
novo filtrar só por `profile_id = (select auth.uid())` (sem `tenant_id` no
predicado, porque o objetivo é justamente ignorar o tenant), o índice
composto atual não é usado eficientemente (Postgres não pode pular a 1ª coluna
de um índice composto para buscar só pela 2ª). Avaliar em `EXPLAIN ANALYZE`
se compensa um índice adicional `on opportunity_assignees(profile_id)` — a
tabela ainda é pequena (poucas dezenas de vínculos), então isto é uma
otimização, não um bloqueador; documentar a decisão no PLAN em vez de assumir.
`[CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]`

### Anti-Patterns to Avoid

- **`exists (select 1 from opportunity_assignees where opportunity_id = t.id and profile_id = auth.uid())` em cada tabela filha** — funciona, mas é reavaliado por linha e reescrito 7 vezes (uma por tabela); o helper único é mais barato e mais fácil de auditar.
- **Substituir a policy de tenant existente em vez de adicionar uma nova** — quebra D-09 e a regra nº1 do docs/PROJETO.md. Toda policy nova tem sufixo `_psw_staff` (ou `_atribuicao`), nunca reescreve `opportunities_select`/`opportunities_update` etc.
- **Confiar só na UI para esconder "Empresa" de quem não é `psw_staff`** — a coluna/filtro são cosméticos; o que protege dado é a RLS, não a renderização condicional.
- **Deixar o helper sem `set search_path = public`** — toda função `security definer` do repo fixa o `search_path`; omitir isso é um vetor conhecido de escalação (o chamador poderia manipular `search_path` para injetar um objeto homônimo).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Quem pode ver essa linha por atribuição" | Uma verificação em cada Server Action (JS) | Helper SQL `security definer stable` + RLS | RLS é o único bloqueio que sobrevive a um bug de app esquecendo o filtro — é a regra nº1 do docs/PROJETO.md, não uma preferência de estilo |
| Tabela de vínculo pessoa↔trabalho | Nova tabela `psw_staff_assignments` | `opportunity_assignees` (0032) já existe e é exatamente isso — D-01 trava isso |
| "Empresa" na listagem | Uma segunda query por tenant + merge em JS | RLS já devolve a união; só falta o `select` de `tenants(name)` no join da query existente | Evita N+1 e evita re-implementar o que a RLS já resolve de graça |

**Key insight:** nesta fase específica, "não hand-rollar" significa sobretudo
não inventar um segundo mecanismo de autorização paralelo ao que já existe
(RLS + trigger de coerência). O risco maior não é reinventar a roda — é
duplicar a regra em dois lugares (SQL e JS) e eles divergirem com o tempo.

## Runtime State Inventory

> Esta fase é enum/RLS/schema, não rename/refactor — mas envolve mudar a
> *semântica* de uma regra de acesso já viva em produção (o trigger de
> `opportunity_assignees`). Aplicando o mesmo rigor por analogia:

| Categoria | Itens encontrados | Ação necessária |
|-----------|---------------------|-------------------|
| Dados armazenados | Nenhuma linha existente de `opportunity_assignees` referencia um `psw_staff` hoje (o role não existe ainda) — não há dado legado para migrar. | Nenhuma. |
| Config de serviço vivo | `invited_emails` já tem um CHECK restrito (`0028`) e uma policy de INSERT do `tenant_admin` (`0029`) que **não** bloqueia `psw_staff` — ver Pitfall dedicado abaixo. | CHECK + policy precisam de ajuste explícito na mesma migration que introduz o uso do enum. |
| Estado registrado no SO | N/A — não há cron/task scheduler envolvido nesta fase. | Nenhuma. |
| Secrets/env vars | Nenhum novo secret. | Nenhuma. |
| Artefatos de build/pacotes instalados | `lib/database.types.ts` é hand-maintained; `TenantRole` (linha 83) e os dois `Record<TenantRole, string>` exaustivos (`components/shell/Sidebar.tsx:107`, `app/(app)/team/page.tsx:24`) vão falhar `tsc --noEmit` assim que `psw_staff` entrar no union type, até serem atualizados. | Atualizar os 3 pontos na mesma tarefa que atualiza `database.types.ts`. |

**Nada encontrado em "dados armazenados" e "estado do SO":** verificado por
grep — nenhuma referência a `psw_staff` existe em lugar nenhum do repo hoje
(é papel 100% novo), e nada no schema depende de scheduler/OS.

## Common Pitfalls

### Pitfall 1: defesa em profundidade que vira bloqueio silencioso (o mais crítico da fase)

**What goes wrong:** `updateOpportunity`, `updateRisk`, `deleteRisk`,
`updateTask`, `deleteTask`, `updateTaskStatus`, `deleteDocument` (e outros)
escopam a mutação com `.eq('tenant_id', profile.tenant_id)` **depois** de já
terem validado Zod e o guard de `viewer`. Pontos exatos verificados no código:

- `lib/opportunities/actions.ts:570` — `updateOpportunity`
- `lib/opportunities/risk-actions.ts:156,195` — `updateRisk`/`deleteRisk`
- `lib/opportunities/task-actions.ts:186,229,280` — `updateTask`/`deleteTask`/`updateTaskStatus`
- `lib/opportunities/document-actions.ts:203,210` — `deleteDocument`
- `lib/opportunities/note-actions.ts:95` — (mutação de nota)

**Por que acontece:** o comentário original em `actions.ts:475-478` é
explícito sobre a intenção: "escopa o update ao tenant do usuário autenticado
— defesa em profundidade sobre o RLS". Essa intenção pressupõe que
`profile.tenant_id == tenant_id da linha` — verdade para todo papel hoje
existente, **falsa por design** para `psw_staff` (cujo `profile.tenant_id` é o
tenant da PSW, não o da oportunidade atribuída em outra empresa).

**Sintoma exato:** a RLS (correta, aditiva) permite a escrita. A query do
Supabase client roda, mas o `.eq('tenant_id', profile.tenant_id)` filtra 0
linhas antes mesmo de a RLS entrar em ação (é um `WHERE` a mais, avaliado em
conjunto com `USING`/`WITH CHECK`). O `error` do Supabase vem `null` (não é
erro de permissão, é "0 rows matched") e a Server Action retorna `{ ok: true }`
— o usuário vê "salvo com sucesso" e nada mudou no banco. É o pior tipo de bug
porque não aparece em nenhum log de erro.

**How to avoid:** nos call sites de escrita, quando o ator é `psw_staff`, a
defesa em profundidade precisa comparar contra o **tenant da linha-alvo** (ex.:
buscar `tenant_id` da oportunidade/tarefa/risco antes do update, como
`assignee-actions.ts:42-51` já faz — `tenant_id vem da oportunidade
(server-derived)`), não contra `profile.tenant_id`. Uma forma simples: já que a
RLS é o bloqueio real (D-11 já reconhece isso), a opção mais segura é
**remover** o `.eq('tenant_id', ...)` extra dessas mutações específicas e
confiar 100% na RLS (que já é aditiva e correta) — mas isso é uma mudança de
padrão estabelecido no projeto e merece decisão explícita no PLAN, não uma
correção silenciosa. Alternativa que preserva o padrão: resolver o escopo em
`lib/security/role.ts` (D-11) como uma função que devolve o predicado certo
por papel, e os call sites passam a usar esse predicado em vez de
`profile.tenant_id` cru.

**Warning signs:** um teste de escrita "psw_staff atualiza a oportunidade
atribuída" que passa sem erro mas o segundo assert (reler a linha e comparar o
valor) falha — se o teste só checar `result.ok === true`, esse bug passa
despercebido. O teste TEM que reler a linha via service-role depois.

### Pitfall 2: `invited_emails` permite hoje um caminho para `tenant_admin` convidar `psw_staff` no banco (mesmo que a UI nunca ofereça)

**What goes wrong:** dois lugares no schema de convites precisam de ajuste
explícito, verificados em `supabase/migrations/0028_invite_viewer_role.sql:26-27`
e `supabase/migrations/0029_tenant_admin_invites.sql:51-55`:

1. O CHECK de `invited_emails.role` hoje é
   `check (role in ('member', 'tenant_admin', 'viewer'))` — não aceita
   `psw_staff` ainda. Isso PRECISA ser ampliado (senão nem o `platform_admin`
   consegue convidar um `psw_staff` por esse fluxo).
2. A policy de INSERT do `tenant_admin` (`invited_emails_insert_tenant_admin`)
   só bloqueia explicitamente `role <> 'platform_admin'` — se o CHECK acima for
   ampliado para aceitar `psw_staff` **sem** também apertar essa policy, um
   `tenant_admin` malicioso (ou um bug futuro que remova a allowlist de app)
   conseguiria inserir um convite com `role = 'psw_staff'` passando pela RLS.
   A defesa de app (`lib/security/cargo.ts` — `AccessRole` já é só
   `'member' | 'viewer' | 'tenant_admin'`, `psw_staff` fica fora por construção)
   cobre a UI, mas a policy de banco é o bloqueio real (D-05 exige isso
   explicitamente: "`tenant_admin` de cliente não enxerga nem atribui pessoas
   de fora do próprio tenant").

**How to avoid:** na migration que amplia o CHECK (`0040`+), trocar
`invited_emails_insert_tenant_admin` para
`and role not in ('platform_admin', 'psw_staff')` — um ajuste de uma linha,
mas fácil de esquecer porque não é mencionado em nenhuma decisão travada do
CONTEXT.md (é um achado desta pesquisa, não uma decisão do PO).

**Warning signs:** teste que tenta, autenticado como `tenant_admin` de teste,
inserir diretamente em `invited_emails` com `role: 'psw_staff'` — deve
retornar erro de RLS (42501), não `null`. Nenhum teste hoje cobre isso
(verificado em `tests/security/` — o teste equivalente existente só cobre
`role: 'platform_admin'`, ver `platform-admin-cross-tenant.test.ts:190-200`).

### Pitfall 3: `check_task_tenant_coherence()` (0037) ainda rejeitaria um `psw_staff` como responsável de uma TAREFA

**What goes wrong:** o trigger de `opportunity_tasks` (0037) valida que
`assignee_id` (o responsável da tarefa) pertence ao MESMO tenant da
oportunidade:

```sql
if v_profile_tenant <> v_opp_tenant then
  raise exception 'Responsável de outra empresa não pode ser atribuído a esta tarefa.'
```

Isso é **diferente** do trigger de `opportunity_assignees` (que esta fase
reescreve por D-10). O CONTEXT.md e o ROADMAP não mencionam
`check_task_tenant_coherence()` em nenhuma decisão travada — só falam do
trigger de `opportunity_assignees`. Se o `psw_staff` executa tarefas de uma
oportunidade atribuída (D-04 diz que ele escreve "tarefas... exatamente como
um member"), é razoável esperar que ele também possa aparecer como
`assignee_id` de uma tarefa daquela oportunidade — mas o trigger atual
rejeitaria isso (tenant do `psw_staff` = PSW ≠ tenant da oportunidade).

**How to avoid:** esta é uma decisão de escopo que falta ser tomada
explicitamente — ver Open Questions. Não presumir a resposta; documentar a
lacuna para o planner/PO decidirem antes de escrever o PLAN.

### Pitfall 4: `opportunity_history` está CONGELADA — não confundir com a tabela viva de auditoria

**What goes wrong:** ao dar SELECT ao `psw_staff` em `opportunity_history`
(0018), é fácil assumir que isso cobre "o histórico" da oportunidade por
completo. Mas `lib/audit/timeline.ts:11-22` documenta que, a partir da
migration `0038` (não commitada, fora de escopo desta fase), o histórico real
vem de `audit_log`, e `opportunity_history` só guarda o que foi escrito
**antes** da 0038 — nada escreve mais nela. `audit_log` (0038) tem uma policy
de SELECT (`is_platform_admin() or (tenant_id = current_tenant_id() and
current_user_role() = 'tenant_admin')`, `supabase/migrations/0038_audit_log.sql:224-230`)
que **não** dá acesso nem a `member` nem a `viewer` hoje — e como a 0038 está
fora de escopo desta fase (D-07/CONTEXT.md), o `psw_staff` **não vai ver**
entradas de auditoria recentes na aba "Histórico" mesmo depois desta fase,
só as linhas legadas congeladas (se existirem, e só se a policy de
`opportunity_history` ganhar o SELECT aditivo).

**How to avoid:** documentar essa limitação como conhecida (não é regressão
introduzida por esta fase — é um limite pré-existente da 0038, que nem
`member` comum tem hoje). Adicionar a policy SELECT de `psw_staff` em
`opportunity_history` mesmo assim (ACCESS-05 pede propagação às tabelas
filhas, e essa é uma delas), mas não prometer que a aba "Histórico" fica
"completa" no sentido de auditoria recente — ver Open Questions.

### Pitfall 5: `ALTER TYPE ... ADD VALUE` e uso na mesma transação

**What goes wrong:** o Postgres rejeita com o erro `unsafe use of new value
"psw_staff" of enum type tenant_role` (hint: "New enum values must be
committed before they can be used") se a `0039` (que adiciona o valor) e a
`0040` (que o referencia numa policy/CHECK) forem coladas e executadas juntas
no SQL Editor. Desde o Postgres 12, `ALTER TYPE ... ADD VALUE` pode rodar
DENTRO de um bloco de transação (antes disso nem isso era permitido) — mas o
valor novo continua indisponível para uso até aquela transação **commitar**.
É exatamente o motivo documentado no cabeçalho de `0020_platform_admin_role.sql:13-16`.
`[CITED: postgresql.org — mensagens de release sobre "Relax transactional
restrictions on ALTER TYPE ... ADD VALUE" e o erro "unsafe use of new value"]`

**How to avoid:** manter D-08 à risca — `0039` roda **sozinha**, é confirmada
como aplicada, e só então `0040`+ roda numa segunda execução separada no SQL
Editor. O handoff de apply manual (mesmo padrão de `16-01-MIGRATION-HANDOFF.md`)
precisa deixar isso explícito em letras garrafais, porque colar as duas juntas
no mesmo "Run" do SQL Editor do Supabase Cloud as executa na mesma transação
implícita.

### Pitfall 6: `Record<TenantRole, string>` exaustivo quebra o build

**What goes wrong:** dois pontos do código têm `Record<TenantRole, string>`
(union exaustivo): `components/shell/Sidebar.tsx:107` (`roleLabel`) e
`app/(app)/team/page.tsx:24` (`ROLE_LABEL`, tipado sobre `InviteRow['role']`
que é um union literal manual, não `TenantRole` — mas ambos quebram/ficam
incompletos se esquecidos). Assim que `lib/database.types.ts` ganhar
`psw_staff` no tipo `TenantRole`, `tsc --noEmit` falha em `Sidebar.tsx` até um
rótulo pt-BR ser adicionado (ex.: `psw_staff: 'Staff PSW'`).

**How to avoid:** grep por `Record<TenantRole` (achado: exatamente 2
ocorrências) e por `'platform_admin'` como proxy de "lugar que enumera papéis
manualmente" antes de considerar a fase completa; `tsc --noEmit` limpo é
critério de sucesso explícito (SC10) e pega isso de qualquer forma, mas vale
antecipar no planejamento das tasks.

## Code Examples

### Trigger de coerência reescrito (padrão a seguir)

```sql
-- Fonte: adaptação de check_assignee_tenant() (0032_opportunity_assignees.sql:51-75)
create or replace function check_assignee_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_tenant     uuid;
  v_profile_tenant uuid;
  v_profile_role   tenant_role;
begin
  select tenant_id into v_opp_tenant     from opportunities where id = new.opportunity_id;
  select tenant_id, role into v_profile_tenant, v_profile_role
    from profiles where id = new.profile_id;

  if v_opp_tenant is null or v_profile_tenant is null then
    raise exception 'Oportunidade ou pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;

  -- tenant_id da LINHA sempre = tenant_id da oportunidade (D-10) — vale para todos.
  if new.tenant_id <> v_opp_tenant then
    raise exception 'tenant_id do vínculo não confere com o da oportunidade.'
      using errcode = 'check_violation';
  end if;

  -- Só psw_staff pode ter profile de tenant DIFERENTE do da oportunidade.
  if v_profile_role::text <> 'psw_staff' and v_profile_tenant <> v_opp_tenant then
    raise exception 'Atribuição cruzada entre empresas não é permitida.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
```

### Policy de UPDATE aditiva — `using` E `with check` precisam do MESMO predicado

```sql
-- Fonte: padrão espelhado de 0025_platform_admin_write_rls.sql:24-26
-- ATENÇÃO: se `using` tiver o predicado de acesso por atribuição mas
-- `with check` não tiver (ou vice-versa), o Postgres permite LER uma linha
-- pelo USING mas trocar seus valores para algo que o WITH CHECK sozinho não
-- validaria (ex.: mudar o próprio tenant_id da linha, se a coluna fosse
-- editável) — ou, o mais comum, a policy simplesmente rejeita todo UPDATE
-- porque UMA das duas cláusulas falha. Os dois lados são cláusulas
-- INDEPENDENTES avaliadas em momentos diferentes do UPDATE (before/after a
-- mudança); mantenha-as idênticas quando a regra de acesso é "a mesma antes e
-- depois".
create policy opportunities_update_psw_staff on opportunities
  for update
  using (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  )
  with check (
    current_user_role() = 'psw_staff'
    and id in (select current_assigned_opportunity_ids())
  );
```

### Storage — policy aditiva casando o `opportunity_id` (2º segmento do path)

```sql
-- Fonte: adaptação de opportunity_documents_storage_select (0018:137-143).
-- Convenção de path: "{tenant_id}/{opportunity_id}/{arquivo}" — o 1º segmento
-- é o tenant, o 2º é o opportunity_id. `storage.foldername(name)` devolve um
-- text[] com os segmentos de pasta (exclui o nome do arquivo).
create policy opportunity_documents_storage_select_psw_staff on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'
    and (storage.foldername(name))[2]::uuid in (select current_assigned_opportunity_ids())
  );
```

Custo: `storage.objects` não tem índice funcional sobre
`storage.foldername(name)` por padrão — para um bucket pequeno (poucas
centenas de arquivos por tenant) isso é aceitável; se o bucket crescer muito,
um índice de expressão seria a otimização natural, mas não é bloqueador para
este MVP (mesma lógica de custo que já se aceita para a policy por tenant_id
existente, que tem exatamente a mesma característica no 1º segmento).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Pessoa da PSW cadastrada dentro do tenant do cliente (role `member`/`tenant_admin` local) | Pessoa cadastrada 1x no tenant da PSW, `role='psw_staff'`, vínculo via `opportunity_assignees` cross-tenant | Esta fase | Elimina a necessidade de múltiplos `auth.users` para a mesma pessoa; resolve o erro "e-mail já existe" |
| `auth.uid()` cru em policies | `(select auth.uid())` — InitPlan caching | Recomendação oficial Supabase, já seguida em `current_tenant_id()`/`is_platform_admin()`/`current_user_role()` do repo | Evita reavaliação por linha; aplicar também no helper novo |

**Deprecated/outdated:** nada desta fase deprecia algo existente — é
estritamente aditivo (D-09).

## Assumptions Log

Nenhuma claim relevante desta pesquisa ficou como `[ASSUMED]` sem verificação:
todos os nomes de arquivo, migration, função, policy e teste citados foram
lidos diretamente no repositório (`main`, working tree em 2026-08-06), e as
claims de comportamento do Postgres/Supabase foram checadas contra fontes
oficiais (ver Sources). A única área genuinamente em aberto é uma decisão de
escopo do PRODUTO (não uma claim técnica) — ver Open Questions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (vazio) | — | — |

**Esta tabela está vazia** — nenhuma claim precisa de confirmação do usuário
antes de virar decisão travada; as duas questões abertas abaixo são de escopo
de produto, não de veracidade técnica.

## Open Questions (RESOLVED)

> **Ambas resolvidas pelo PO em 2026-08-06, depois desta pesquisa.** As decisões
> estão travadas no `17-CONTEXT.md` (D-14 e D-15) e implementadas no Plan 17-04.
> Esta seção fica como registro do raciocínio; não é mais uma pendência.

1. **`psw_staff` pode ser `assignee_id` de uma TAREFA (não só da oportunidade)?**
   — **RESOLVED: SIM (D-14).** O trigger `check_task_tenant_coherence()` (0037) é
   reescrito para aceitar um responsável `psw_staff` que esteja atribuído àquela
   oportunidade. Virou o REQ-ID `ACCESS-11`.
   - O que sabemos: D-04 diz que `psw_staff` escreve tarefas "como um member".
     O trigger `check_task_tenant_coherence()` (0037) hoje rejeita um
     `assignee_id` de tenant diferente do da oportunidade — o que bloquearia
     o `psw_staff` de aparecer como responsável de uma tarefa, mesmo numa
     oportunidade à qual ele está atribuído.
   - O que é incerto: se isso é um requisito real desta fase (não está em
     nenhuma decisão travada do CONTEXT.md nem em nenhum REQ-ID de ACCESS-*)
     ou se "escrever tarefas como member" significa só criar/editar/mover,
     sem precisar ser o responsável nomeado.
   - Recomendação: levar essa pergunta explícita ao PO antes do PLAN. Se a
     resposta for "sim, precisa poder se auto-atribuir", o trigger de 0037
     precisa da mesma branch `if role <> 'psw_staff'` do trigger de 0032 — é
     uma migration a mais nesta fase. Se "não, por enquanto não", documentar a
     limitação explicitamente (task fica sem responsável nomeado, ou o
     `platform_admin`/`tenant_admin` local assume esse campo).

2. **A aba "Histórico" do `psw_staff` mostra menos que a de um `member` do
   próprio tenant — isso é aceitável para o MVP desta fase?**
   — **RESOLVED: não fica assim (D-15).** O PO optou por incluir `audit_log` na
   RLS aditiva, de forma condicional/idempotente (a `0038` ainda não está
   commitada). O Plan 17-04 vai além do previsto aqui: a função
   `opportunity_audit_trail(uuid)` da `0038` tem um gate de tenant dentro do
   corpo `SECURITY DEFINER`, então policy sozinha não resolveria — a `0042`
   substitui a função condicionalmente.
   - O que sabemos: `audit_log` (0038, fora de escopo) hoje só concede SELECT
     a `tenant_admin`/`platform_admin` — nem `member` comum vê auditoria
     recente. `opportunity_history` (congelada) é só o legado pré-0038.
   - O que é incerto: se essa limitação pré-existente (que afeta até `member`
     hoje) precisa ser resolvida ANTES desta fase, ou se o `psw_staff` fica no
     mesmo barco que `member`/`viewer` já estão.
   - Recomendação: não bloquear esta fase por isso — é uma lacuna que já existe
     hoje para outros papéis e pertence à 0038 (explicitamente fora de escopo
     por D-07/CONTEXT.md). Só documentar no PLAN para não ser confundido com
     um bug introduzido por esta fase durante o UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Cloud (produção, apply manual) | Toda migration da fase | ✓ (write-only mode, aplicação manual via SQL Editor — ver `16-01-MIGRATION-HANDOFF.md` como modelo) | — | — |
| `.env.test` apontando para projeto Supabase Cloud de teste | Ativação dos testes de integração RLS (`tests/security/*.test.ts`) | Indefinido no momento da pesquisa — ver `STATE.md`: "Popular `.env.test` apontando para projeto Supabase Cloud DE TESTE" segue como pendência aberta desde a Phase 7.5 | Suite roda em `describe.skipIf(!HAS_DB)` — os specs desta fase entram em skip mode até o `.env.test` existir, mesmo padrão já aceito para `tenant-isolation.test.ts` etc. |
| Node/npm/TypeScript/Vitest | Rodar `tsc --noEmit` e `npm test` | ✓ (next 16.2.6, typescript ^5, vitest ^3.2.0 — `package.json`) | — | — |

**Missing dependencies with no fallback:** nenhuma — tudo tem fallback (skip
mode) ou já está disponível.

**Missing dependencies with fallback:** `.env.test` de um projeto Supabase
Cloud de teste — sem ele, os testes negativos decisivos desta fase (o mais
importante do plano de verificação) ficam em skip mode, o que é aceitável para
CI mas não verifica de fato a RLS antes do merge. Vale reforçar no PLAN que o
gate humano de "apply da 0039/0040" idealmente coincide com a ativação do
`.env.test`, para os testes rodarem de verdade pelo menos uma vez antes do
apply em produção.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.2.0, `pool: 'forks'` + `singleFork: true` (serializa specs contra a mesma instância Supabase — `vitest.config.ts:17-19`) |
| Config file | `vitest.config.ts` (raiz) |
| Quick run command | `npx vitest run tests/security/psw-staff-isolation.test.ts` (arquivo a criar) |
| Full suite command | `npm run test` (roda tudo, `describe.skipIf` pula specs sem `.env.test`) — `npm run test:security` roda só `tests/security/` |

Os testes de RLS deste projeto **nunca** usam mocks — rodam contra um Supabase
Cloud real (produção ou um projeto de teste, nunca contra `localhost`), com o
client autenticado via JWT de um usuário de teste real
(`tests/setup/supabase-test-client.ts` — `authedClient(email, password)`), e
usam `serviceRoleClient()` só no `beforeAll`/`afterAll` (seed/cleanup) e para
"provar que a linha do outro tenant continua intacta" depois de uma tentativa
de escrita cross-tenant que deveria falhar. Este é o padrão a seguir
integralmente (`tests/security/opportunity-tasks-isolation.test.ts`,
`tests/security/platform-admin-cross-tenant.test.ts`).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| ACCESS-01 | `psw_staff` existe no enum e um profile com esse role loga sem erro | integration (RLS) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "loga sem erro"` | ❌ Wave 0 |
| ACCESS-03 | Trigger aceita cross-tenant só p/ `psw_staff`; rejeita nos 4 casos (mesmo tenant OK / outro tenant não-psw REJEITA / psw_staff qualquer tenant OK / tenant_id da linha ≠ da oportunidade REJEITA) | integration (trigger) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "check_assignee_tenant"` | ❌ Wave 0 |
| ACCESS-04 | **O teste negativo decisivo**: `psw_staff` atribuído à oportunidade X do tenant A NÃO vê a oportunidade Y do MESMO tenant A (onde não tem atribuição) | integration (RLS) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "não vê oportunidade não atribuída do mesmo tenant"` | ❌ Wave 0 |
| ACCESS-05 | Cada tabela filha (7 tabelas + Storage) só mostra linhas da oportunidade atribuída | integration (RLS), 1 spec por tabela | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "tabelas filhas"` | ❌ Wave 0 |
| ACCESS-06 | `psw_staff` escreve (INSERT/UPDATE/DELETE) na oportunidade atribuída e é REJEITADO fora do escopo — reler a linha via service-role para confirmar que a escrita realmente persistiu (não só `error === null`) | integration (RLS + Server Action) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "escrita escopada"` | ❌ Wave 0 |
| ACCESS-07 | Suítes de isolamento EXISTENTES continuam verdes sem edição (`tenant-isolation.test.ts`, `opportunity-risks-isolation.test.ts`, `opportunity-tasks-isolation.test.ts`, `platform-admin-cross-tenant.test.ts`, `unidasul-isolation.test.ts`, `v03-tables-isolation.test.ts`) | integration (regressão) | `npm run test:security` | ✅ já existem |
| ACCESS-09 | `tenant_admin` NÃO consegue inserir `invited_emails` com `role='psw_staff'`; `platform_admin` consegue | integration (RLS) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "invited_emails"` | ❌ Wave 0 |
| ACCESS-10 | `psw_staff` de um tenant SEM atribuição não ganha acesso via `is_platform_admin()` nem vice-versa | integration (RLS, sanity) | `npx vitest run tests/security/psw-staff-isolation.test.ts -t "psw_staff != platform_admin"` | ❌ Wave 0 |
| SC10 (`tsc` limpo) | Compilação TypeScript passa após `TenantRole` ganhar `psw_staff` | build check | `npx tsc --noEmit` | ✅ script já existe |

### Sampling Rate

- **Por commit de task:** `npx vitest run tests/security/psw-staff-isolation.test.ts` (specs novos desta fase) + `npx tsc --noEmit`.
- **Por merge de wave:** `npm run test:security` (garante zero regressão nas suítes de isolamento existentes).
- **Gate de fase:** suíte completa (`npm run test`) verde + `tsc --noEmit` limpo antes de `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/security/psw-staff-isolation.test.ts` — cobre ACCESS-01, 03, 04, 05, 06, 09, 10 (arquivo novo, único, pelo padrão de `platform-admin-cross-tenant.test.ts`)
- [ ] `tests/helpers/auth-as.ts` — adicionar `asPswStaff()` (mesmo padrão de `asFgcoop`/`asAcme`)
- [ ] `tests/setup/seed-test-tenants.ts` — adicionar tenant/perfil de teste da PSW (`PSW_TEST_ID`, `PSW_STAFF_TEST_EMAIL`) e uma função de seed que promove um usuário a `role='psw_staff'` (mesmo padrão de "promote platform_admin" em `platform-admin-cross-tenant.test.ts:87-91`)
- [ ] Framework install: nenhum — Vitest já configurado.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V4 Access Control | sim | RLS aditiva por atribuição (helper `security definer stable` + policies `IN` contra conjunto fixo) — nunca controle só na aplicação |
| V2 Authentication | não (sem mudança) | Auth via Supabase Auth já existente; esta fase não toca fluxo de login |
| V3 Session Management | não (sem mudança) | Sem mudança de cookie/JWT |
| V5 Input Validation | sim (indireto) | `invited_emails.role` CHECK + allowlist `AccessRole` em `lib/security/cargo.ts` — psw_staff deliberadamente fora da allowlist de convite do tenant_admin |
| V6 Cryptography | não | Sem mudança |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Escalação de privilégio via `invited_emails` (tenant_admin conseguindo criar convite `role='psw_staff'`) | Elevation of Privilege | Policy de INSERT explicitamente bloqueando `role not in ('platform_admin', 'psw_staff')` para `tenant_admin` — ver Pitfall 2 |
| Vazamento cross-tenant via policy aditiva mal escrita (predicado "tenant onde tem alguma atribuição" em vez de "oportunidade específica atribuída") | Information Disclosure | O teste negativo decisivo (ACCESS-04) é desenhado exatamente para pegar esse erro — ver Specific Ideas do CONTEXT.md |
| Escrita bloqueada silenciosamente por defesa em profundidade desatualizada (Pitfall 1) | Denial of Service (funcional, não de disponibilidade) | Reler a linha via service-role em todo teste de escrita, nunca confiar só em `error === null` |
| Enum novo usado antes do commit da transação anterior | Tampering (falha de migration, não seria explorável por atacante, mas quebra o deploy) | D-08 — `0039` roda sozinha e é confirmada antes de `0040`+ |

## Sources

### Primary (HIGH confidence)

- Código do repositório (`main` + working tree em 2026-08-06): `supabase/migrations/0001_init.sql`, `0015_rbac_viewer_policies.sql`, `0018_documentos_anotacoes_historico.sql`, `0020_platform_admin_role.sql`, `0021_platform_admin_rls.sql`, `0022_invited_emails.sql`, `0025_platform_admin_write_rls.sql`, `0028_invite_viewer_role.sql`, `0029_tenant_admin_invites.sql`, `0032_opportunity_assignees.sql`, `0037_opportunity_tasks.sql`, `0038_audit_log.sql` (apenas leitura — fora de escopo); `lib/security/role.ts`, `lib/security/cargo.ts`, `lib/supabase/server.ts`, `lib/supabase/session.ts`, `lib/opportunities/{queries,filters,assignees,actions,risk-actions,task-actions,document-actions,assignee-actions}.ts`, `lib/tenants/queries.ts`, `lib/audit/timeline.ts`, `lib/database.types.ts`, `components/shell/Sidebar.tsx`, `app/(app)/{admin/invites,team,opportunities}/*`, `tests/security/*.test.ts`, `tests/helpers/auth-as.ts`, `tests/setup/{seed-test-tenants,supabase-test-client}.ts`, `vitest.config.ts`, `package.json`.
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — modelo geral de RLS no Supabase.
- [Supabase — RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — padrão `(select auth.uid())`, índices em colunas de policy, `IN`/`ANY` em vez de joins, `security definer` functions. Citado diretamente no Pattern 1/2/3.
- [PostgreSQL 18 — CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html) e [5.9. Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — regra oficial de policies PERMISSIVE combinadas com OR.

### Secondary (MEDIUM confidence)

- [PostgreSQL — thread/release notes sobre `ALTER TYPE ... ADD VALUE` e a restrição transacional](https://www.postgresql.org/message-id/E1g9fKm-00054P-JV%40gemulon.postgresql.org) — confirma que o valor novo do enum só pode ser usado após commit, mesmo com `ADD VALUE` já podendo rodar dentro de um bloco de transação desde o PG12.
- [GitHub issue — typeorm "PostgreSQL migrations ALTER TYPE ADD VALUE transaction error"](https://github.com/typeorm/typeorm/issues/1169) — confirma o comportamento na prática em ferramentas de migration.

### Tertiary (LOW confidence)

- Nenhuma — todas as claims relevantes foram elevadas a Primary/Secondary por verificação cruzada (código do repo + documentação oficial).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova; tudo é reuso de padrão já em produção no próprio repo.
- Architecture: HIGH — os 3 pilares (helper SQL, trigger reescrito, policies aditivas) já existem como precedente direto no código (`0020/0021`, `0032`).
- Pitfalls: HIGH — os 6 pitfalls foram encontrados por leitura direta de código (não especulação), incluindo dois achados que nenhuma decisão do CONTEXT.md cobria explicitamente (defesa em profundidade quebrada, e o gap do CHECK de `invited_emails`).

**Research date:** 2026-08-06
**Valid until:** 30 dias (schema/RLS é estável; revalidar se o Supabase mudar o comportamento de RLS/Storage, o que é raro em janela curta)
