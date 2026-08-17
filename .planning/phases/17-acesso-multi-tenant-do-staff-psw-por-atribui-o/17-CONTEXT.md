# Phase 17: Acesso Multi-Tenant do Staff PSW por Atribuição - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning
**Source:** decisões travadas diretamente com o PO na abertura da fase (3 perguntas fechadas + 2 premissas confirmadas), + verificação do estado real do `main` pelo orquestrador.

<domain>
## Phase Boundary

**O problema estrutural (nas palavras do PO):** hoje, para uma pessoa da PSW
(dev, tech lead, PM) trabalhar numa demanda de um cliente, ela é cadastrada
**dentro do tenant daquele cliente** — e aí enxerga **tudo** do cliente. Pior:
se ela precisar atuar num segundo cliente, o cadastro falha, porque o e-mail já
existe em `auth.users`.

**O que esta fase entrega:** a pessoa da PSW é cadastrada **uma única vez**, no
tenant da PSW, e é **atribuída a oportunidades** de qualquer empresa. Ao logar,
ela vê **somente** as oportunidades atribuídas a ela — que podem ser dos
tenants A, B e C ao mesmo tempo — numa **lista unificada** com coluna e filtro
de empresa.

**Em escopo:** ACCESS-01 … ACCESS-10. Inclui:
- papel `psw_staff` no enum `tenant_role` (migration isolada, padrão da `0020`);
- reescrita do trigger `check_assignee_tenant()` (0032) para aceitar vínculo
  cross-tenant **apenas** quando o profile é `psw_staff`;
- helper SQL de acesso por atribuição + **policies aditivas** de select/insert/
  update/delete nas tabelas do bloco de oportunidade;
- policies aditivas no bucket `opportunity-documents` do Storage;
- escopo de acesso resolvido no servidor substituindo o `.eq('tenant_id', …)`
  hardcoded nos call sites;
- listagem unificada cross-tenant com coluna + filtro de empresa para o
  `psw_staff`;
- UI do `platform_admin` para convidar `psw_staff` e atribuí-lo a oportunidades
  de qualquer empresa;
- `lib/database.types.ts` atualizado à mão e testes de isolamento.

**Fora de escopo:**
- **Multi-tenancy para usuário de cliente** — explicitamente descartado pelo PO
  (D-02). `profiles.tenant_id` continua único e NOT NULL; nada de tabela N:N de
  acesso a tenant.
- **Entidade `projects`** — o "projeto" ao qual a pessoa é atrelada É a
  oportunidade (D-01). Não criar agrupador novo.
- **Seletor de contexto que troca o tenant ativo** para o `psw_staff` — a
  navegação é lista unificada (D-03). O seletor `?empresa=` do `platform_admin`
  continua existindo e não é alterado.
- **Ampliar o alcance do `platform_admin`** — ele já vê tudo (0021) e não é o
  objeto desta fase.
- **Convite de `psw_staff` por `tenant_admin` de cliente** — só `platform_admin`
  (D-05).
- **Notificar por e-mail a pessoa atribuída**, painel de "minhas demandas" com
  métricas próprias, time-tracking, ou qualquer relatório novo.
- **Mexer na `0038_audit_log.sql`** — está no working tree, ainda não commitada,
  e não pertence a esta fase.

</domain>

<decisions>
## Implementation Decisions

### Travadas pelo PO (2026-08-06) — NÃO reabrir

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

### Derivadas do estado real do código (verificadas no `main`, 2026-08-06)

- **D-07 (Numeração de migration):** a última migration commitada é a
  `0037_opportunity_tasks.sql`; a `0038_audit_log.sql` **existe no working tree
  ainda não commitada**. Esta fase começa em **`0039`** e não toca a `0038`.
- **D-08 (Enum isolado):** o valor `psw_staff` entra sozinho numa migration
  (`0039`), e tudo que o referencia vem na seguinte (`0040`+). O Postgres não
  permite usar valor de enum recém-criado na mesma transação — foi exatamente o
  motivo do par `0020` → `0021`, e o cabeçalho da `0020` documenta isso.
- **D-09 (Policies aditivas, nunca substitutivas):** múltiplas policies
  PERMISSIVE do mesmo comando são combinadas com **OR** pelo Postgres. Toda
  policy nova desta fase é um `*_psw_staff` adicional; **nenhuma** policy
  existente por tenant é dropada ou relaxada. É o padrão já usado na `0021`
  (`opportunities_select_platform_admin` etc.).
- **D-10 (Tenant da linha de atribuição):** `opportunity_assignees.tenant_id`
  passa a ser sempre o `tenant_id` **da oportunidade** (hoje o trigger exige que
  profile, oportunidade e linha coincidam). O trigger reescrito mantém a
  rejeição de vínculo cruzado para todo profile que **não** seja `psw_staff`.
- **D-11 (Onde mora o escopo):** o "escopo de acesso" do usuário é resolvido em
  **`lib/security/role.ts`** (ao lado de `getCurrentProfile` / `isPlatformAdmin`
  / `isTenantAdmin`), não espalhado por call site. Os ~15 `.eq('tenant_id',
  profile.tenantId)` passam a consumir esse escopo.
- **D-12 (Storage entra na conta):** documentos vivem no bucket privado
  `opportunity-documents` com path `{tenant_id}/{opportunity_id}/{arquivo}` e
  policies em `storage.objects` escopadas por `(storage.foldername(name))[1] =
  current_tenant_id()::text` (0018). Sem policy aditiva ali, o `psw_staff` vê o
  registro do documento e **não consegue baixar o arquivo**. O 2º segmento do
  path é o `opportunity_id` — é por ele que a policy aditiva deve casar.
- **D-13 (`viewer` continua bloqueado):** as policies de escrita de 0018/0032/
  0037 usam `current_user_role() <> 'viewer'`. Como `psw_staff` é um valor novo
  do enum, ele passa nesse teste automaticamente — o que está **correto** por
  D-04, mas precisa ser afirmado em teste, não assumido.

### Resolvidas com o PO após a pesquisa (2026-08-06)

- **D-14 (`psw_staff` pode ser responsável de tarefa):** SIM. O trigger
  `check_task_tenant_coherence()` (0037) — que hoje exige que o `assignee_id` de
  uma tarefa seja de um profile do mesmo tenant da oportunidade — passa a aceitar
  também um profile `psw_staff`. O select de responsável da tarefa, para uma
  oportunidade que tem staff PSW atribuído, lista esses PSW além das pessoas do
  tenant. Sem isso o dev da PSW enxerga e edita as tarefas mas não pode ser o
  responsável por elas, o que contraria o motivo da fase existir.
- **D-15 (`audit_log` entra na RLS aditiva):** SIM. A `0038_audit_log.sql` está
  no working tree ainda sem commit e é ela que passa a alimentar a aba
  "Histórico". A Phase 17 escreve a policy aditiva de `audit_log` também, de
  forma **idempotente e condicional** (aplica somente se a tabela existir — `if
  exists (select 1 from information_schema.tables …)` ou equivalente), para não
  quebrar caso a `0038` ainda não tenha sido aplicada. A fase **não** edita a
  `0038` nem o código de `lib/audit/`.
- **D-16 (call sites de escrita — descoberto na pesquisa):** os
  `.eq('tenant_id', profile.tenant_id)` das server actions de escrita
  (`lib/opportunities/actions.ts:570`, `risk-actions.ts:156,195`,
  `task-actions.ts:186,229,280`, `document-actions.ts:203,210`,
  `note-actions.ts:95`) usam o tenant **do profile**. Para um `psw_staff` esse é
  o tenant da PSW, nunca o da oportunidade — o efeito é uma falha **silenciosa**
  (0 linhas afetadas, sem erro). Trocar por um escopo resolvido no servidor
  (D-11) é obrigatório, e cada um desses call sites precisa de cobertura.
- **D-17 (`invited_emails` — descoberto na pesquisa):** a tabela tem CHECK
  restrito a `('member','tenant_admin','viewer')` e a policy de INSERT do
  `tenant_admin` só barra `role <> 'platform_admin'`. Para D-05 valer, o CHECK
  precisa admitir `psw_staff` **e** a policy do `tenant_admin` precisa barrá-lo
  explicitamente — senão ou o convite do `platform_admin` falha, ou o
  `tenant_admin` de cliente consegue convidar staff PSW.

### Executor's Discretion

- **Forma do helper SQL de acesso.** Um `has_opportunity_access(uuid)` ou um
  `current_assigned_opportunity_ids()` retornando `setof uuid`, ambos
  `SECURITY DEFINER` + `stable` + `set search_path = public`, espelhando o
  formato de `current_tenant_id()` / `is_platform_admin()`. Escolher pelo plano
  de execução do Postgres nas policies das tabelas filhas (subquery por linha
  vs. `in (select …)`), e documentar a escolha.
- **Como o `psw_staff` é identificado no helper.** Por `role = 'psw_staff'`
  comparado como `::text` (a `0021` compara `role::text` de propósito, para não
  depender da ordem de commit do valor de enum) — manter esse padrão.
- **Índices.** `opportunity_assignees` já tem `(tenant_id, profile_id)` e
  `(opportunity_id)`. Se o helper filtrar só por `profile_id`, avaliar índice
  adicional.
- **Onde entra a coluna "Empresa" na lista.** Reusar a tabela de oportunidades
  existente com a coluna condicionada ao papel; a lista já recebe `tenant_id` e
  já existe join de tenant no caminho do `platform_admin` (`?empresa=` por
  slug).
- **UI de atribuição cross-tenant.** Estender o seletor de pessoas atual
  (`lib/opportunities/assignees.ts` → `AssignableProfile`) para, quando o
  usuário logado é `platform_admin`, incluir os `psw_staff` do tenant da PSW
  além dos profiles do tenant da oportunidade.
- **Como a UI do `psw_staff` sinaliza "por que vejo isto"** (badge de empresa no
  cabeçalho da oportunidade, por exemplo) — decidir no plano de UI.
- **Rota/tela de cadastro do `psw_staff`.** Reusar `app/(app)/admin/invites/`
  (do `platform_admin`) acrescentando o papel à allowlist de lá, em vez de criar
  tela nova; a allowlist de papéis convidáveis de `tenant_admin`
  (`parseRoleAndCargo`, usada por `app/(app)/team/actions.ts`) **não** pode
  aceitar `psw_staff`.

</decisions>

<canonical_refs>
## Canonical References

### Padrão de papel novo + RLS aditiva (o analog direto desta fase)

- `supabase/migrations/0020_platform_admin_role.sql` — como adicionar valor ao
  enum `tenant_role` em migration isolada, com o "porquê" no cabeçalho e o aviso
  de rodar sozinha.
- `supabase/migrations/0021_platform_admin_rls.sql` — helper `SECURITY DEFINER`
  + policies **aditivas** que combinam com OR; comparação por `role::text`;
  escopo deliberadamente limitado. É o formato a espelhar.
- `supabase/migrations/0025_platform_admin_write_rls.sql` — o mesmo padrão
  estendido para escrita (relevante porque D-04 pede escrita).
- `supabase/migrations/0015_rbac_viewer_policies.sql` — `current_user_role()`.
- `supabase/migrations/0001_init.sql:177-190` — `current_tenant_id()`.

### O vínculo e o trigger a reescrever

- `supabase/migrations/0032_opportunity_assignees.sql` — tabela
  `opportunity_assignees`, trigger `check_assignee_tenant()` (a regra "sem
  atribuição cruzada" que esta fase precisa afrouxar **só** para `psw_staff`),
  índices e as 4 policies.
- `lib/opportunities/assignees.ts` — `AssignableProfile`, listagem de pessoas
  atribuíveis do tenant, `fetchOpportunityIdsForAssignee`.
- `lib/opportunities/assignee-actions.ts` — server action de atribuir/remover.

### Tabelas filhas que precisam herdar a visibilidade

- `supabase/migrations/0018_documentos_anotacoes_historico.sql` —
  `opportunity_documents`, `opportunity_notes`, `opportunity_history` + as 3
  policies de `storage.objects` do bucket `opportunity-documents`.
- `supabase/migrations/0037_opportunity_tasks.sql` — `opportunity_tasks` (4
  policies, `current_tenant_id()` + gate de viewer).
- `opportunity_phases` e `opportunity_risks` — policies em `0001_init.sql` e na
  migration de riscos; a `0021` já lhes deu o override de `platform_admin`.

### Resolução de papel/tenant no servidor

- `lib/security/role.ts` — `getCurrentProfile()`, `CurrentProfile`,
  `isPlatformAdmin()`, `isTenantAdmin()`, `requireEditorRole()`. **É aqui que o
  escopo de acesso novo mora (D-11).**
- `lib/supabase/server.ts:49-60` — a regra "toda query deve incluir
  `.eq('tenant_id', …)`" que esta fase precisa reescrever com nuance.
- `lib/opportunities/queries.ts` — `fetchOpportunities`, o filtro
  `filters.tenant` (caminho do `?empresa=` do `platform_admin`), os filtros
  `assignee`/`cargo` que já resolvem ids atribuídos, e as whitelists de colunas.

### Convite / cadastro de pessoas

- `app/(app)/admin/invites/{page,actions,InviteForm}.tsx` — fluxo do
  `platform_admin` (escolhe a empresa).
- `app/(app)/team/actions.ts` — fluxo do `tenant_admin` (tenant server-derived,
  allowlist de papéis, `parseRoleAndCargo`); mostra por que `psw_staff` precisa
  ficar **fora** da allowlist de lá.
- `supabase/migrations/0022_invited_emails.sql` (+ `0028`, `0029`) — allowlist
  de convite e trigger `handle_new_user`.

### Regras de projeto

- `docs/PROJETO.md` — princípio nº1 (isolamento multi-tenant é existencial; todo teste
  precisa de um caso "tenant A não vê tenant B") e nº4 ("admin/cross-tenant fica
  para depois" — esta fase é a exceção autorizada pelo PO, escopada a
  `psw_staff` por atribuição).
- `tests/schema/` e `tests/security/` — onde vivem os testes de isolamento
  existentes que **precisam continuar passando sem alteração**.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`opportunity_assignees` já é o vínculo N:N pessoa↔oportunidade** — com
  `tenant_id` denormalizado, índices para os dois sentidos da busca e 4
  policies. Não criar tabela nova.
- **`fetchOpportunityIdsForAssignee` / `fetchOpportunityIdsForCargo`
  (`lib/opportunities/queries.ts`)** — já traduzem "profile → ids de
  oportunidade" e alimentam um `.in('id', …)`. É exatamente a forma do escopo
  do `psw_staff` no client-side/query layer.
- **`is_platform_admin()` (0021)** — o molde do helper SQL novo.
- **`getCurrentProfile()`** — já devolve `role`, `tenantId`, `tenantName`,
  `tenantSlug` num único ponto; estender ali é barato.

### Established Patterns

- **Defesa em camadas:** guard de papel na server action → valor
  server-derived (nunca do formulário) → RLS como bloqueio real. Toda escrita
  nova desta fase deve seguir as três.
- **Write-only mode para migrations:** o arquivo é escrito no repo e o apply é
  **manual** no SQL Editor do Supabase Cloud, com doc de handoff (ver
  `16-01-MIGRATION-HANDOFF.md`). O plano precisa de um checkpoint humano para o
  apply — nada que dependa do schema novo avança antes dele.
- **`lib/database.types.ts` é hand-maintained** (type-gen bloqueado: o MCP
  aponta para o projeto errado e o `gen:types` não tem privilégio). Toda
  migration vem acompanhada da edição manual do arquivo de tipos.
- **Whitelist de colunas em vez de `select('*')`** (HARDEN-E-06) — qualquer
  query nova segue.

### Integration Points

- **Middleware/route guard** (`lib/supabase/session.ts`) — não distingue papel
  hoje; verificar se `psw_staff` precisa de guard próprio em `/admin` e
  `/team` (hoje guardados por `isPlatformAdmin`/`isTenantAdmin`).
- **Sidebar** (`components/shell/Sidebar.tsx`) — carrega o seletor de empresa do
  `platform_admin`; é onde a UI do `psw_staff` precisa **não** aparecer.
- **Página de detalhe da oportunidade** (`app/(app)/opportunities/[id]/`) e o
  modal por abas — consomem as tabelas filhas; é onde a herança de visibilidade
  se prova (ou falha silenciosamente com abas vazias).
- **`app/(app)/logs/` + `lib/audit/`** — trabalho de audit log não commitado no
  working tree; a fase não depende dele, mas o executor vai encontrar esses
  arquivos e não deve mexer neles.

</code_context>

<specifics>
## Specific Ideas

- O teste que mais importa não é "psw_staff vê a oportunidade atribuída", é o
  **negativo**: `psw_staff` atribuído à oportunidade X do tenant A **não** vê a
  oportunidade Y do mesmo tenant A. Se a policy aditiva for escrita por engano
  como "tenant onde ele tem alguma atribuição", tudo passa no teste positivo e o
  vazamento só aparece em produção.
- Segundo teste crítico: as suítes de isolamento **existentes** precisam rodar
  sem edição. Se um teste antigo precisar mudar para passar, a policy nova
  provavelmente relaxou algo que não devia.
- O trigger de coerência de tenant é o único ponto onde a regra "quem pode ser
  atribuído a quê" existe no banco. Reescrevê-lo é a mudança mais arriscada da
  fase — merece teste dedicado nos quatro casos: profile do mesmo tenant (OK),
  profile de outro tenant não-PSW (REJEITA), `psw_staff` em qualquer tenant
  (OK), `tenant_id` da linha diferente do da oportunidade (REJEITA).
- Storage: sem a policy aditiva do bucket, o sintoma é sutil — a lista de
  documentos aparece e o download dá 403.

</specifics>

<deferred>
## Deferred Ideas

- **Acesso multi-tenant para usuário de cliente** — descartado pelo PO nesta
  fase (D-02). Se um dia voltar, a tabela de vínculo tenant↔profile é o desenho,
  e `current_tenant_id()` deixa de ser suficiente.
- **Acesso da PSW no nível do tenant inteiro** (staff que enxerga a empresa toda
  sem atribuição demanda a demanda) — não pedido; hoje isso é `platform_admin`.
- **Entidade `projects`** agrupando N oportunidades — descartada em favor da
  granularidade de oportunidade (D-01).
- **Notificar a pessoa quando ela é atribuída** — o projeto já tem e-mail
  transacional, mas não foi pedido.
- **Painel "minhas demandas" com métricas próprias do staff PSW** — a lista
  unificada já resolve o acesso; dashboard próprio é outra conversa.
- **Log de acesso do staff PSW por tenant** (quem da PSW abriu o quê, para
  prestação de contas ao cliente) — encaixaria no audit log da `0038`, que é
  trabalho ainda não commitado e fora desta fase.

</deferred>
