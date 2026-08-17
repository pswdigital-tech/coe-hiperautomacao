# Phase 18: Staff PSW como Admin de Tenant (concessão pessoa × empresa) - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning
**Source:** decisões travadas diretamente com o PO na conversa de abertura da fase (2 perguntas fechadas + 3 recomendações aceitas), + medição do estado real do `main` pelo orquestrador (contagem de predicados de RLS e call sites).

<domain>
## Phase Boundary

**O problema estrutural (nas palavras do PO):** existe hoje o papel `psw_staff`
(Phase 17), que enxerga **somente** as oportunidades atribuídas a ele. O PO quer
um segundo caso: uma pessoa da PSW que seja **admin de uma empresa** — e possa
ser admin de **mais de uma**. Nesse caso ela vê não só as oportunidades
atribuídas a ela, mas todas as das empresas em que é admin.

**O que trava isso hoje:** `profiles` tem **um** `role` e **um** `tenant_id`.
Isso codifica "esta pessoa tem este papel nesta empresa" — uma linha, um par.
"É admin nas empresas A e C, e nas demais só vê o atribuído" é um par (pessoa ×
empresa) que **se repete**. Nenhuma coluna enum expressa isso: não é valor novo
de enum, é **cardinalidade**. Logo a concessão precisa sair de `profiles` e
virar tabela.

**O que esta fase entrega:** uma concessão N:N (pessoa × empresa) que o
`platform_admin` dá e tira numa tela `/admin/staff`; o `psw_staff` sem concessão
segue idêntico ao de hoje; o `psw_staff` com concessão no tenant A vê tudo de A
e exerce ali os poderes de um `tenant_admin`, sem perder de vista as
oportunidades que lhe foram atribuídas em outras empresas.

**Em escopo:** GRANT-01 … GRANT-10. Inclui:
- tabela `psw_tenant_admins` (pessoa × empresa) com RLS e escrita só do
  `platform_admin`;
- helper `current_admin_tenant_ids()` espelhando `current_assigned_opportunity_ids()`
  (0040) na forma;
- helper `is_tenant_admin_of(t uuid)` como fonte única do predicado "é admin
  deste tenant", e a troca dos **17 predicados** de RLS existentes por ele;
- disjunto novo no laço das 8 policies restritivas da `0044`;
- tenant-alvo explícito nas Server Actions de admin (aplicação do padrão D-11 da
  Phase 17 uma camada acima);
- tela `/admin/staff` — conceder, revogar (com confirmação quantificada) e ver
  as duas origens de acesso separadas;
- `lib/database.types.ts` atualizado à mão e testes de não-regressão.

**Fora de escopo:**
- **Multi-tenancy para usuário de cliente** — segue valendo o D-02 da Phase 17.
  `member`/`viewer`/`tenant_admin` continuam travados em um tenant.
- **Concessão dada por quem não é `platform_admin`** — sem escalada lateral
  (D-B). Um staff-admin de A não promove ninguém.
- **Editar atribuição de oportunidade fora da oportunidade** — `AssigneesPanel`
  continua sendo o único ponto de escrita (D-C).
- **Ampliar o alcance do `platform_admin`** — ele já vê tudo (0021) e não é o
  objeto desta fase.
- **Conceder a papéis que não sejam `psw_staff`** — a concessão não existe para
  `member`/`viewer`/`tenant_admin`; para eles nada muda.
- **Notificar a pessoa por e-mail ao ganhar/perder concessão**, histórico
  navegável de concessões, ou concessão com validade/expiração.
- **Mexer no mecanismo de atribuição por oportunidade** (`opportunity_assignees`,
  `check_assignee_tenant()`) — a Phase 17 o entregou e ele fica intocado.

</domain>

<decisions>
## Implementation Decisions

### Travadas pelo PO (2026-08-07) — NÃO reabrir

- **D-A (Poderes = `tenant_admin` daquele tenant):** a concessão dá poderes
  **equivalentes aos de um `tenant_admin`** no tenant concedido — convites/
  allowlist, equipe, configurações/branding e logs. **Não** é leitura ampliada.
  O PO escolheu explicitamente esta opção sobre a alternativa "ver tudo, só
  leitura", ciente de que ela é a mais cara.
- **D-B (Só o `platform_admin` concede e revoga):** sem escalada lateral. Um
  `psw_staff` com concessão em A **não** promove outra pessoa — nem em A, nem
  em lugar nenhum. Garantido por RLS, não só por UI.
- **D-C (Atribuição continua editada só na oportunidade):** a tela de admin
  mostra atribuições em **leitura** + link, nunca escreve. Dois pontos de
  escrita divergiriam em validação e deixariam `check_assignee_tenant()` como
  única barreira de coerência.
- **D-D (Concessão é tabela, não enum):** a cardinalidade (pessoa × N empresas)
  força isso. `profiles.tenant_id` **não** vira N:N — continua sendo o tenant de
  lotação (a PSW, no caso do staff), único e NOT NULL.
- **D-E (`psw_staff` sem concessão não muda):** a restritiva da `0044` continua
  valendo integralmente para ele. A concessão apenas **acrescenta** um disjunto;
  não relaxa nada do que existe.
- **D-F (Duas origens de acesso exibidas separadas):** a tela mostra "admin nas
  empresas A, C" e "atribuições individuais: N (M redundantes)" como blocos
  distintos. Um número agregado levaria o `platform_admin` a conclusão errada
  sobre o alcance real da pessoa, porque atribuição dentro de tenant
  administrado é redundante.
- **D-G (Revogar é quantificado):** revogar exige confirmação que informa
  **quantas oportunidades** a pessoa deixará de enxergar. O comportamento
  (perder a visão de tudo em A exceto o atribuído nominalmente) é correto, mas
  surpreendente o bastante para não acontecer em silêncio.
- **D-R (Seletor da Sidebar é o contexto de escrita):** o seletor de empresa que
  já existe para `platform_admin`/`psw_staff` (`lib/tenants/scope.ts`,
  `resolveEmpresaSlug()`, cookie `coe_empresa`) passa a definir **também** o
  tenant-alvo das ações das telas de admin. Não se cria um segundo seletor por
  tela. **Consequência obrigatória:** com "Todas as empresas" selecionado não
  existe alvo definido, então as ações de escrita dessas telas ficam
  **desabilitadas** com explicação em pt-BR ("selecione uma empresa para
  editar"), nunca gravando num tenant adivinhado. O tenant-alvo continua sendo
  validado contra a concessão no servidor (D-K) — o seletor é conveniência de
  UI, jamais a autorização.
- **D-S (Concessão órfã sobrevive inerte):** se a pessoa deixa de ser
  `psw_staff`, as linhas de `psw_tenant_admins` **permanecem**. Elas param de
  conceder sozinhas, porque `is_tenant_admin_of()` exige
  `current_user_role() = 'psw_staff'` no seu segundo disjunto. A `/admin/staff`
  mostra essas linhas **sinalizadas como órfãs**. Não há trigger de limpeza:
  apagar dado em silêncio numa troca de papel é pior que exibir uma linha
  inerte, e promover a pessoa de volta restaura o acesso sem reconceder tudo à
  mão. (A FK de `tenant_id` continua com `on delete cascade` — apagar a empresa
  apaga a concessão, o que é outro caso e está correto.)

### Derivadas do estado real do código (medidas no `main`, 2026-08-07)

- **D-H (Numeração de migration):** a última migration é a
  `0044_psw_staff_only_assigned.sql`. Esta fase começa em **`0045`**.
- **D-I (Superfície de `tenant_admin` — CORRIGIDA pela pesquisa de 2026-08-07):**
  a contagem inicial do orquestrador ("17 predicados") contava **ocorrências de
  texto**, não policies vivas. O número real é **11 policies vivas** em 14
  ocorrências textuais, e a diferença esconde uma armadilha:

  **`0029:53` é CÓDIGO MORTO.** A policy `invited_emails_insert_tenant_admin`
  foi dropada e recriada mais restrita pela `0041:444-449`, que acrescentou
  `and role not in ('platform_admin', 'psw_staff')`. Um plano que varra as
  ocorrências por número de linha **ressuscita a versão de 0029 e apaga essa
  cláusula**, reabrindo exatamente a escalada de privilégio que a 0041 fechou
  (um `tenant_admin` de cliente convidando alguém como `psw_staff` direto pela
  API). Aplica limpo, não dá erro em lugar nenhum, e só
  `psw-staff-isolation.test.ts:1045` pega. **Trabalhar por NOME DE POLICY, nunca
  por número de linha**, e no ROLLBACK reaplicar o BLOCO 6b da 0041 por último.
  Ver §5 da RESEARCH.md para as 11 nomeadas.
- **D-J (`is_tenant_admin_of()` precisa ser byte-equivalente no ramo `tenant_admin`):** o primeiro disjunto da função tem que reproduzir
  exatamente o predicado antigo (`current_user_role() = 'tenant_admin' and
  t = current_tenant_id()`), senão a fase muda silenciosamente o comportamento
  de um papel de cliente. Isto é requisito de não-regressão, não detalhe.
- **D-K (O bug latente nas Server Actions de admin):**
  [`app/(app)/team/actions.ts:46`](app/(app)/team/actions.ts#L46) grava
  `tenant_id: profile!.tenantId` e a linha 84 filtra
  `.eq('tenant_id', profile!.tenantId)`. Isso está **correto hoje** e vira
  **errado** com staff-admin: o tenant do profile dele é o da PSW, não o da
  empresa que administra. O sintoma é o mesmo que o D-11 da Phase 17 descreve
  para oportunidades — grava no tenant errado, ou casa zero linhas e responde
  `{ ok: true }`. Sucesso silencioso mentiroso. O mesmo padrão precisa ser
  auditado em `/configuracoes`, `/admin/invites`, `/logs` e no branding.
- **D-L (O ponto de encaixe na RLS já está escrito):** a `0044` já é um laço
  sobre 8 tabelas com predicado idêntico. O disjunto novo entra no laço —
  não se escrevem 8 blocos à mão. **Verificado (2026-08-07): as 8 tabelas têm
  `tenant_id uuid not null`** (`opportunities`, `opportunity_phases`,
  `opportunity_risks`, `opportunity_notes`, `opportunity_documents`,
  `opportunity_history`, `opportunity_tasks`, `opportunity_assignees`), então o
  predicado por tenant é **uniforme** — a ressalva anterior sobre "resolver pela
  coluna que existir" não se aplica. O laço deve `raise exception` (não
  `continue`) se alguma tabela não tiver a coluna: silenciar aqui é o mesmo que
  esquecer uma tabela.

- **D-P (A RESTRITIVA SOZINHA É INERTE — descoberto na pesquisa, muda o plano):**
  uma policy RESTRICTIVE só **subtrai**. Para um `psw_staff`, a camada
  PERMISSIVE concede hoje exatamente dois conjuntos: linhas com
  `tenant_id = current_tenant_id()` (o tenant da PSW) e linhas ligadas a
  `current_assigned_opportunity_ids()`. **Nenhum dos dois concede as linhas de
  um tenant A ao qual ele não pertence** — `opportunities_select` (0001:332),
  `opportunities_select_platform_admin` (0021) e
  `opportunities_select_psw_staff` (0040:192) todas falham para A. O Postgres é
  explícito: *"there needs to be at least one permissive policy to grant access
  before restrictive policies can be usefully used to reduce that access."*

  Consequência: acrescentar `or tenant_id in (select current_admin_tenant_ids())`
  **só** na restritiva da `0044` não concede nada. A fase precisa das **duas
  metades** — policies PERMISSIVE aditivas novas por tabela **e** o disjunto na
  restritiva — e cada metade é inútil sem a outra. Entregar só uma delas produz
  uma migration que aplica limpo, não erra em lugar nenhum, e **não faz nada**.
  A exceção que prova a regra: `opportunity_assignees` está nas duas listas, e
  por isso trocar os predicados da 0032 lá dentro já concede. SQL exato das duas
  metades em §1 da RESEARCH.md.

- **D-Q (`is_tenant_admin_of(t)` nunca vira InitPlan — e a forma óbvia mata o inlining):** a função recebe uma **coluna da linha** como argumento, então não
  pode ser InitPlan. Pior: `security definer` + `set search_path` **bloqueiam o
  inlining de função SQL**, transformando-a numa chamada opaca por linha com a
  subquery reconstruída dentro. Recomendação da pesquisa (§4): manter
  `security definer` nos helpers **sem argumento** (que retornam conjuntos), e
  fazer o booleano ser um wrapper fino `stable`, **sem** definer, **sem** `SET`,
  com chamadas schema-qualified — aí ele inlina para
  `tenant_id in (select effective_admin_tenant_ids())`, um subplano com hash
  avaliado uma vez por statement. `immutable` está **errado** aqui: o resultado
  depende de `auth.uid()`, e marcá-lo immutable vazaria resultado entre sessões.
  A mecânica de inlining está marcada `[ASSUMED: A2]` na pesquisa — o plano deve
  incluir o bloco `EXPLAIN (analyze)` que ela sugere para confirmar.
- **D-M (`resolveWriteTenantId()` já cobre a camada de oportunidade):**
  [`lib/security/role.ts`](lib/security/role.ts) resolve o tenant-alvo lendo a
  oportunidade quando o papel é `psw_staff`. Assim que a RLS alargar, ele alarga
  junto **sem edição** — a fase não deve reescrevê-lo, e sim replicar seu padrão
  (incluindo `WRITE_SCOPE_DENIED_MESSAGE`) para o tenant-alvo das actions de
  admin.
- **D-N (`/admin` já tem o guard certo):**
  [`app/(app)/admin/layout.tsx`](app/(app)/admin/layout.tsx) redireciona quem
  não é `platform_admin`. `/admin/staff` herda isso — zero plumbing de auth
  novo. O `platform_admin` já lê `opportunity_assignees` cross-tenant pela RLS
  da 0021, então a visão diagnóstica é quase só UI sobre dado que ele já pode
  ler.
- **D-O (`isTenantAdmin(profile)` é a assinatura errada para o novo mundo):** o
  gate atual testa a **pessoa**, sem saber **de qual empresa**. Ele precisa
  ganhar um par tenant-aware (`isTenantAdminOf(profile, tenantId)`) como fonte
  única no servidor, espelhando `is_tenant_admin_of()` no SQL — os dois têm que
  ser mantidos em sincronia, como já acontece com
  `isPlatformAdmin()`/`is_platform_admin()`.

### Executor's Discretion

- **Colunas exatas de `psw_tenant_admins`.** O mínimo é `profile_id`,
  `tenant_id`, `granted_at`, `granted_by`. Avaliar PK composta vs. `id` próprio
  + unique `(profile_id, tenant_id)`, e se `granted_by` é FK para `profiles`
  com `on delete set null`. Documentar a escolha.
- **Se a tabela carrega `tenant_id` como coluna de escopo de RLS.** A tabela é
  cross-tenant por natureza (é o que ela existe para expressar); decidir se as
  policies dela são "só `platform_admin` escreve + o próprio staff lê suas
  linhas" ou se o `tenant_admin` do tenant concedido também enxerga. Justificar.
- **Forma do `current_admin_tenant_ids()`.** `setof uuid` consumido via
  `in (select …)` é o padrão da 0040 e o recomendado pelo guia de performance de
  RLS do Supabase; manter salvo se houver razão medida em contrário. `(select
  auth.uid())` para virar InitPlan é obrigatório.
- **Comparação de papel por `role::text`** — a 0021 compara assim de propósito,
  para não depender da ordem de commit do valor de enum. Manter o padrão.
- **Índices.** Espelhar o `opportunity_assignees_profile_only_idx` (0040) com um
  índice por `profile_id` em `psw_tenant_admins`; avaliar se `(tenant_id)`
  também compensa para a visão "quem administra esta empresa".
- **Como o tenant-alvo chega às actions de admin.** Parâmetro explícito é a
  decisão (D-K); a **forma** (argumento da action, campo escondido do form
  validado no servidor, ou derivado de `resolveEmpresaSlug()` de
  [`lib/tenants/scope.ts`](lib/tenants/scope.ts)) fica a critério do plano —
  desde que nunca venha do `profile` e sempre seja validado contra a concessão
  antes de mutar.
- **Como as telas de admin exibem "em qual empresa estou agindo".** O seletor de
  empresa da Sidebar já existe para `platform_admin`/`psw_staff`; decidir se ele
  passa a ser o contexto de escrita ou se cada tela ganha indicação própria.
- **Quebra em migrations.** O faseamento sugerido (fundação → RLS → actions →
  tela) é uma sugestão, não uma imposição; o plano pode agrupar diferente desde
  que a fundação seja aplicável e verificável sozinha, sem alterar comportamento
  de ninguém.
- **Layout da `/admin/staff`.** Lista de pessoas com detalhe, ou tabela
  pessoa × empresa — decidir no plano de UI, respeitando D-F (origens separadas)
  e D-G (revogação quantificada).

</decisions>

<canonical_refs>
## Canonical References

### O padrão a espelhar (a fase é este mecanismo um nível acima)

- `supabase/migrations/0032_opportunity_assignees.sql` — a tabela de vínculo N:N
  (pessoa × oportunidade), suas 4 policies e o trigger de coerência. É o analog
  estrutural direto de `psw_tenant_admins`.
- `supabase/migrations/0040_psw_staff_access_core.sql:86` —
  `current_assigned_opportunity_ids()`: `security definer` + `stable` +
  `set search_path = public`, `(select auth.uid())` para InitPlan, consumo via
  `in (select …)`, índice de suporte por `profile_id`. **Copiar a forma.**
- `supabase/migrations/0021_platform_admin_rls.sql` — `is_platform_admin()` e as
  policies aditivas que combinam com OR; comparação por `role::text`.
- `supabase/migrations/0044_psw_staff_only_assigned.sql` — as 8 policies
  RESTRITIVAS e o laço que as cria. É onde entra o disjunto novo, e é o padrão
  de cabeçalho/verificação/rollback que toda migration desta fase deve seguir.

### Os 17 predicados que passam a chamar `is_tenant_admin_of()`

- `supabase/migrations/0032_opportunity_assignees.sql:94,101,104,111`
- `supabase/migrations/0029_tenant_admin_invites.sql:43,53,64`
- `supabase/migrations/0033_tenant_branding.sql:56,58,115,126,137`
- `supabase/migrations/0038_audit_log.sql:229`
- `supabase/migrations/0041_psw_staff_child_access.sql:447`
- CHECKs de allowlist de papel convidável (revisar, não são policies):
  `0028_invite_viewer_role.sql:27`, `0041_psw_staff_child_access.sql:432`

### Helpers de papel/tenant existentes

- `supabase/migrations/0015_rbac_viewer_policies.sql:28` — `current_user_role()`
- `supabase/migrations/0001_init.sql:181` — `current_tenant_id()`

### Resolução de papel/tenant no servidor (fonte única)

- `lib/security/role.ts` — `getCurrentProfile()`, `isPlatformAdmin()`,
  `isPswStaff()`, `isTenantAdmin()`, `resolveWriteTenantId()` e
  `WRITE_SCOPE_DENIED_MESSAGE`. O comentário de bloco de `resolveWriteTenantId`
  documenta o sintoma do sucesso silencioso — leitura obrigatória antes de
  tocar nas actions de admin.
- `lib/tenants/scope.ts` — `resolveEmpresaSlug()` + cookie `coe_empresa`.

### As Server Actions de admin que assumem "meu tenant = o tenant da ação"

- `app/(app)/team/actions.ts:46,84` — o caso confirmado (D-K)
- `app/(app)/configuracoes/actions.ts`
- `app/(app)/admin/invites/actions.ts`
- `app/(app)/logs/page.tsx`, `app/(app)/team/page.tsx`,
  `app/(app)/configuracoes/page.tsx` — leitura correspondente

### Guard e tela de admin

- `app/(app)/admin/layout.tsx` — guard `platform_admin` que `/admin/staff` herda
- `app/(app)/admin/invites/` — o analog de tela de admin cross-tenant já
  existente (page + actions + form)
- `components/opportunities/AssigneesPanel.tsx` — o ponto de escrita de
  atribuição que a tela nova **não** pode duplicar (D-C)
- `components/shell/Sidebar.tsx:132-153` — seletor de empresa e preservação do
  `?empresa=` ao navegar entre abas admin

### Regras de projeto

- `docs/PROJETO.md` — isolamento multi-tenant existencial, RLS obrigatória, nada de
  score persistido, UI em pt-BR / código em inglês.
- `.planning/phases/17-*/17-CONTEXT.md` — D-01 a D-17 da fase anterior; D-09
  (policies aditivas), D-11 (escopo mora em `lib/security/role.ts`) e D-16
  (call sites de escrita) são os que esta fase estende.

</canonical_refs>

<specifics>
## Specific Ideas

- O helper `is_tenant_admin_of(t uuid)` na forma acordada com o PO:
  ```sql
  (current_user_role() = 'tenant_admin' and t = current_tenant_id())
  or (current_user_role() = 'psw_staff' and t in (select current_admin_tenant_ids()))
  ```
  O primeiro disjunto é literalmente o predicado antigo — é o que garante a
  não-regressão (D-J).

- O disjunto novo na restritiva da `0044`, em `opportunities`:
  ```sql
  current_user_role() is distinct from 'psw_staff'
  or id in (select current_assigned_opportunity_ids())
  or tenant_id in (select current_admin_tenant_ids())   -- ← acrescentado
  ```
  **Isto é metade da mudança.** Sem a PERMISSIVE aditiva correspondente (D-P),
  este disjunto não concede nada — ele apenas deixa de subtrair algo que nunca
  foi concedido.

- A visão diagnóstica da `/admin/staff` responde a pergunta "por que fulano vê
  isto?". O valor dela é diagnóstico, não gestão — por isso as atribuições são
  leitura + link (D-C).

- A contagem de "quantas oportunidades a pessoa deixa de ver" ao revogar é
  calculada em runtime (oportunidades do tenant A menos as atribuídas
  nominalmente a ela em A), nunca persistida — mesma regra do score.

</specifics>

<deferred>
## Deferred Ideas

- **Concessão com validade/expiração** (admin temporário de um tenant durante um
  projeto) — não pedido; a concessão é por ora permanente até ser revogada.
- **Notificação por e-mail** ao ganhar ou perder concessão — fora de escopo.
- **Histórico navegável de concessões** — `granted_at`/`granted_by` ficam
  gravados na linha, mas não há tela de auditoria de concessões nesta fase. O
  `audit_log` (0038) pode cobrir isso depois.
- **Concessão parcial** (admin só de convites, ou só de configurações, dentro de
  um tenant) — o PO escolheu equivalência plena a `tenant_admin` (D-A);
  granularidade fina de permissão fica para quando houver demanda real.
- **Estender a concessão a papéis de cliente** — proibido por D-02 da Phase 17.

</deferred>
