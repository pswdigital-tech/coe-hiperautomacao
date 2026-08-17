# Phase 18: Staff PSW como Admin de Tenant (concessão pessoa × empresa) — Research

**Researched:** 2026-08-07
**Domain:** PostgreSQL Row Level Security (RESTRICTIVE × PERMISSIVE), Supabase multi-tenant, Next.js 16 Server Actions
**Confidence:** HIGH (todas as afirmações estruturais foram lidas nos arquivos reais do `main`; a semântica de RLS está citada da doc oficial do PostgreSQL)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-A (Poderes = `tenant_admin` daquele tenant):** a concessão dá poderes **equivalentes aos de um `tenant_admin`** no tenant concedido — convites/allowlist, equipe, configurações/branding e logs. **Não** é leitura ampliada. O PO escolheu explicitamente esta opção sobre a alternativa "ver tudo, só leitura", ciente de que ela é a mais cara.
- **D-B (Só o `platform_admin` concede e revoga):** sem escalada lateral. Um `psw_staff` com concessão em A **não** promove outra pessoa — nem em A, nem em lugar nenhum. Garantido por RLS, não só por UI.
- **D-C (Atribuição continua editada só na oportunidade):** a tela de admin mostra atribuições em **leitura** + link, nunca escreve.
- **D-D (Concessão é tabela, não enum):** `profiles.tenant_id` **não** vira N:N — continua sendo o tenant de lotação, único e NOT NULL.
- **D-E (`psw_staff` sem concessão não muda):** a restritiva da `0044` continua valendo integralmente para ele. A concessão apenas **acrescenta** um disjunto; não relaxa nada do que existe.
- **D-F (Duas origens de acesso exibidas separadas):** "admin nas empresas A, C" e "atribuições individuais: N (M redundantes)" como blocos distintos.
- **D-G (Revogar é quantificado):** revogar exige confirmação informando **quantas oportunidades** a pessoa deixará de enxergar.
- **D-H (Numeração de migration):** esta fase começa em **`0045`**.
- **D-I (Superfície de `tenant_admin` = 17 predicados, forma idêntica):** todos com a forma `tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin'`, o que permite um helper único em vez de 17 reescritas à mão. *(→ ver correção medida na §5 deste documento: são **11 policies vivas / 14 ocorrências textuais**, e uma das linhas citadas está morta.)*
- **D-J (`is_tenant_admin_of()` byte-equivalente no ramo `tenant_admin`):** o primeiro disjunto tem que reproduzir exatamente o predicado antigo. Requisito de não-regressão.
- **D-K (Bug latente nas Server Actions de admin):** `app/(app)/team/actions.ts:46,84` grava/filtra por `profile!.tenantId`; correto hoje, errado com staff-admin. Auditar também `/configuracoes`, `/admin/invites`, `/logs` e branding.
- **D-L (Ponto de encaixe na RLS já escrito):** o disjunto novo entra no laço da `0044`, não em 8 blocos à mão.
- **D-M (`resolveWriteTenantId()` já cobre a camada de oportunidade):** não reescrever; replicar o padrão (incl. `WRITE_SCOPE_DENIED_MESSAGE`) para o tenant-alvo das actions de admin.
- **D-N (`/admin` já tem o guard certo):** `/admin/staff` herda de `app/(app)/admin/layout.tsx`.
- **D-O (`isTenantAdmin(profile)` é a assinatura errada):** precisa de um par tenant-aware `isTenantAdminOf(profile, tenantId)`, espelhando `is_tenant_admin_of()` no SQL.

### Executor's Discretion

- Colunas exatas de `psw_tenant_admins` (mínimo `profile_id`, `tenant_id`, `granted_at`, `granted_by`); PK composta vs. `id` próprio + unique; `granted_by` FK com `on delete set null`.
- Se a tabela carrega `tenant_id` como coluna de escopo de RLS, e quem lê suas linhas.
- Forma do `current_admin_tenant_ids()` (`setof uuid` + `in (select …)` é o padrão da 0040; `(select auth.uid())` é obrigatório).
- Comparação de papel por `role::text` (padrão da 0021).
- Índices (espelhar `opportunity_assignees_profile_only_idx`; avaliar `(tenant_id)`).
- Como o tenant-alvo chega às actions de admin (argumento, campo escondido validado, ou `resolveEmpresaSlug()`), desde que nunca venha do `profile` e sempre seja validado antes de mutar.
- Como as telas de admin exibem "em qual empresa estou agindo".
- Quebra em migrations (fundação → RLS → actions → tela é sugestão).
- Layout da `/admin/staff`.

### Deferred Ideas (OUT OF SCOPE)

- Concessão com validade/expiração.
- Notificação por e-mail ao ganhar/perder concessão.
- Histórico navegável de concessões (`granted_at`/`granted_by` ficam na linha; sem tela).
- Concessão parcial (admin só de convites, ou só de configurações).
- Estender a concessão a papéis de cliente (proibido por D-02 da Phase 17).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrição (de REQUIREMENTS.md) | Suporte desta pesquisa |
|----|-------------------------------|------------------------|
| GRANT-01 | Concessão N:N (pessoa × empresa) sem duplicar `profiles` nem alterar `profiles.tenant_id` | §Fundação: DDL de `psw_tenant_admins`, PK/unique/índices, trigger de coerência de papel (§Don't Hand-Roll) |
| GRANT-02 | `psw_staff` **sem** concessão continua vendo só o atribuído | §1 (a restritiva da 0044 é preservada e só ganha um disjunto que é falso sem concessão) + §7 teste (a) |
| GRANT-03 | `psw_staff` **com** concessão em A vê tudo de A + o atribuído em outras | §1 (policies PERMISSIVAS novas — este é o achado central) + §2 (predicado por tabela) |
| GRANT-04 | Poderes de `tenant_admin` no tenant concedido (convites, equipe, branding, logs) | §5 (invites), §3 (storage/branding), §Inventário de policies (audit_log, tenants, profiles) |
| GRANT-05 | Server Actions com tenant-alvo explícito, validado; sem sucesso silencioso | §6 (auditoria completa, 22 pontos) + `resolveWriteTenantId()` como padrão (D-M) |
| GRANT-06 | Só `platform_admin` concede/revoga | §Fundação (policies de `psw_tenant_admins`) + §5 (a allowlist de convite impede cunhar novo `psw_staff`) |
| GRANT-07 | Tela `/admin/staff` sob o guard de `platform_admin`, duas origens separadas | §Architecture Patterns (a query diagnóstica) + D-N |
| GRANT-08 | Revogação quantificada; a atribuição sobrevive | §Architecture Patterns (contagem em runtime, nunca persistida) |
| GRANT-09 | Atribuição só editada em `AssigneesPanel` | §6 (itens 20–21: os guards de escrita de atribuição são o único ponto que muda) |
| GRANT-10 | Nenhum papel existente muda de comportamento | §1 (aditividade), §4 (byte-equivalência de `is_tenant_admin_of`), §7 testes (b) |
</phase_requirements>

## Project Constraints (from docs/PROJETO.md)

Diretivas acionáveis extraídas do `docs/PROJETO.md` do projeto — o planner deve verificar conformidade item a item:

1. **Isolamento multi-tenant é existencial.** Toda tabela de domínio carrega `tenant_id uuid not null` com FK para `tenants(id)`; RLS ativada; 4 policies por tabela. → `psw_tenant_admins` é a exceção a discutir explicitamente (é a tabela que *expressa* o cruzamento).
2. **Em testes, sempre rodar pelo menos um caso "tenant A não vê dados de tenant B".** → obrigatório na suíte nova (§7, teste c).
3. **Score é calculado, nunca persistido.** Idem para qualquer derivado — a contagem de "quantas oportunidades a pessoa deixa de ver" ao revogar é runtime, nunca coluna.
4. **Admin/cross-tenant fora do MVP** — superado pelas fases v0.3+/v0.5; a regra viva hoje é "cross-tenant só pelos papéis `platform_admin` e `psw_staff`".
5. **UI e textos visíveis ao usuário final em pt-BR; código (variáveis, tabelas, colunas, funções) em inglês.**
6. **Next.js 16 App Router, Server Components por padrão**; `"use client"` só onde necessário. Mutações por Server Actions / Route Handlers.
7. **TypeScript estrito**; tipos de `lib/database.types.ts` (aqui: hand-maintained).
8. **Não desviar do esqueleto do mockup sem discussão explícita.**
9. **Não criar tabelas sem `tenant_id`** (exceto `tenants` e tabelas globais).

## Summary

O risco desta fase não está onde o CONTEXT.md o coloca. O CONTEXT descreve o trabalho de RLS como "acrescentar um disjunto no laço das 8 restritivas da `0044`" — e essa frase, lida literalmente, produz uma fase que **não funciona e não falha**: a migration aplica sem erro, os `pg_policies` mostram as 8 policies atualizadas, e o `psw_staff` com concessão no tenant A continua vendo exatamente o que via antes. O motivo está na §1: uma policy RESTRICTIVE só **subtrai**, e a camada PERMISSIVA hoje **nunca concede** a um `psw_staff` uma linha de um tenant ao qual ele não pertence, tenant-wide. Alargar uma subtração que não era o gargalo é inerte. A fase precisa de **duas metades**: policies PERMISSIVAS novas (que concedem) **e** o disjunto na restritiva (que impede que a concessão nova seja cortada de volta). Nenhuma das duas funciona sozinha, e só uma delas está no CONTEXT.

O segundo achado é uma correção de fato: os "17 predicados" a trocar são, no `main` de hoje, **11 policies vivas / 14 ocorrências textuais**, e uma das linhas citadas (`0029:53`) está **morta** — a policy `invited_emails_insert_tenant_admin` foi recriada mais restrita pela `0041:444-449`. Um plano que reescreva mecanicamente "os 17" a partir dos números do CONTEXT **ressuscita a versão da 0029 e apaga o `role not in ('platform_admin','psw_staff')`** — abrindo exatamente a escalada de privilégio que a `0041` fechou de propósito. É a regressão mais cara possível nesta fase, e ela chega disfarçada de refactor mecânico.

O terceiro achado é de performance e de forma: `is_tenant_admin_of(t uuid)` recebe uma **coluna da linha** como argumento, então ela é avaliada **por linha** e não pode virar InitPlan. Se for escrita como `security definer` + `set search_path` (a forma "óbvia", copiada da 0040), o PostgreSQL **não consegue inlineá-la** — as duas coisas bloqueiam o inlining — e cada linha varrida paga uma chamada de função opaca que reexecuta a subconsulta sobre `psw_tenant_admins`. A recomendação (§4) é inverter: manter o `security definer` nos helpers *sem argumento* (que já existem e já são o padrão) e fazer `is_tenant_admin_of()` um invólucro **fino, `stable`, sem `security definer` e sem `set`** sobre um conjunto fixo — aí o planner inlineia, o `IN (SELECT …)` vira subplano hasheado avaliado uma vez por statement, e o predicado fica *mais* barato que os 14 de hoje.

**Primary recommendation:** quebrar em três migrations aplicáveis isoladamente — `0045` (fundação: tabela + 3 helpers + trigger de coerência, **zero** mudança de comportamento, verificável sozinha), `0046` (RLS: troca das 11 policies vivas + policies PERMISSIVAS novas + disjunto na restritiva da `0044`), `0047` (nada de SQL — reservado se a auditoria de actions revelar necessidade). Escrever as PERMISSIVAS novas no **mesmo laço** da `0044` (as 8 tabelas têm todas `tenant_id not null` — §2), e provar a fase com um arquivo de teste **novo** que mede baseline → concede → revoga → volta ao baseline, em vez de estender `psw-staff-isolation.test.ts` (cujas asserções de topo quebram se uma concessão vazar de um `describe`).

## 1. RESTRICTIVE × PERMISSIVE — o veredito (risco #1)

### Veredito, sem rodeios

**Não. A camada PERMISSIVA de hoje não concede a um `psw_staff` nenhuma linha, tenant-wide, de um tenant ao qual ele não pertence.** Acrescentar `or tenant_id in (select current_admin_tenant_ids())` ao predicado da restritiva da `0044` é, sozinho, **INERTE**: a migration aplica, `pg_policies` mostra as 8 policies com o texto novo, e a pessoa com concessão continua vendo exatamente o mesmo conjunto de antes. A fase **precisa também** de policies PERMISSIVAS novas por tabela.

E a recíproca é igualmente verdadeira: **as PERMISSIVAS novas sozinhas também não funcionam.** A restritiva da `0044` é `for all` e vale para `current_user_role() = 'psw_staff'`; sem o disjunto novo ela corta a concessão de volta a zero. As duas metades são obrigatórias, e cada uma é inútil sem a outra. Esse é o modo de falha a evitar: metade da fase entregue produz um sistema que aplica limpo, não emite erro nenhum e não faz nada.

### A regra, citada da fonte

> "All permissive policies which are applicable to a given query will be combined together using the Boolean 'OR' operator." … "All restrictive policies which are applicable to a given query will be combined together using the Boolean 'AND' operator. By creating restrictive policies, administrators can **reduce** the set of records which can be accessed…" … "Note that there needs to be **at least one permissive policy to grant access to records before restrictive policies can be usefully used to reduce that access**. If only restrictive policies exist, then no records will be accessible."
> — [CITED: postgresql.org/docs/current/sql-createpolicy.html]

Ou seja: `acessível = (OR das permissivas) AND (AND das restritivas)`. Uma restritiva nunca aparece do lado esquerdo do AND — ela não tem como conceder.

### A prova, no código real

Para uma pessoa cujo `profiles.role = 'psw_staff'` e cujo `profiles.tenant_id` = tenant da PSW, todas as policies PERMISSIVAS vivas sobre `opportunities` são estas três:

| Policy | Origem | Predicado | Concede a uma linha do tenant A? |
|--------|--------|-----------|----------------------------------|
| `opportunities_select` | [`0001_init.sql:332-333`](supabase/migrations/0001_init.sql#L332) | `tenant_id = current_tenant_id()` | **Não** — `current_tenant_id()` é o tenant da PSW, nunca A |
| `opportunities_select_platform_admin` | [`0021_platform_admin_rls.sql`](supabase/migrations/0021_platform_admin_rls.sql) | `is_platform_admin()` | **Não** — `psw_staff` e `platform_admin` são papéis independentes (D-06 da Phase 17); `is_platform_admin()` é falso |
| `opportunities_select_psw_staff` | [`0040_psw_staff_access_core.sql:192-197`](supabase/migrations/0040_psw_staff_access_core.sql#L192) | `current_user_role() = 'psw_staff' and id in (select current_assigned_opportunity_ids())` | **Não** — concede **oportunidade a oportunidade**, jamais por tenant. A `0040:186-190` documenta explicitamente que escrever "existe alguma atribuição no tenant desta oportunidade" seria o erro nº 1 da fase, e o teste `ACCESS-04` existe para pegá-lo |

Nenhuma das três concede. O mesmo raciocínio vale, tabela a tabela, para as 7 filhas: as permissivas são `<tabela>_select/insert/update/delete` por `tenant_id = current_tenant_id()` ([`0001`](supabase/migrations/0001_init.sql), [`0011`](supabase/migrations/0011_schema_evolution_v02.sql), [`0018`](supabase/migrations/0018_documentos_anotacoes_historico.sql), [`0037`](supabase/migrations/0037_opportunity_tasks.sql), com o gate de `viewer` da [`0015`](supabase/migrations/0015_rbac_viewer_policies.sql)), as `*_platform_admin` da [`0025`](supabase/migrations/0025_platform_admin_write_rls.sql), e as `*_psw_staff` da [`0041`](supabase/migrations/0041_psw_staff_child_access.sql) — todas por `opportunity_id in (select current_assigned_opportunity_ids())`. [VERIFIED: leitura dos arquivos de migration]

### A única exceção, e por que ela importa

`opportunity_assignees` está **nas duas listas** ao mesmo tempo: é uma das 8 tabelas do laço da `0044` **e** carrega 4 das ocorrências do predicado de `tenant_admin` a trocar ([`0032:94,101,104,111`](supabase/migrations/0032_opportunity_assignees.sql#L94)). Como aquelas policies são PERMISSIVAS, trocá-las por `is_tenant_admin_of(tenant_id)` **realmente concede** escrita ao staff-admin de A — e é o único caso em que a "troca dos 17" tem efeito de concessão sobre uma tabela do laço. Mesmo assim ela **também** precisa do disjunto na restritiva, senão a concessão é cortada. É a demonstração mais limpa de que as duas metades são independentes.

Consequência prática para as **outras 5 tabelas** fora do laço (`tenants`, `invited_emails`, `audit_log`, `storage.objects`, e — por não ter restritiva — `profiles`): ali a troca dos predicados **é** a concessão, e nenhuma policy nova é necessária além do que já existe. É por isso que a fase parece pequena quando lida pelos números do CONTEXT: a parte que a troca resolve sozinha é justamente a de convites/branding/logs (GRANT-04), e a que ela **não** resolve é justamente a das oportunidades (GRANT-03), que é o coração do pedido.

### O SQL exato que falta

**(a) As PERMISSIVAS novas — mesmo laço, paridade de verbos com `tenant_admin`.**

As 8 tabelas têm todas `tenant_id not null` (§2), então o predicado é uniforme. O que **não** é uniforme é o conjunto de verbos que um `tenant_admin` de fato tem em cada tabela — e D-A é *equivalência*, não superconjunto. Usar `for all` cegamente daria ao staff-admin `UPDATE`/`DELETE` em `opportunity_history` (append-only para todo mundo desde a `0018`) e `UPDATE` em `opportunity_notes`/`opportunity_documents` (que ninguém tem). O laço abaixo carrega a lista de verbos junto com o nome da tabela:

```sql
-- 0046 — bloco A: PERMISSIVAS aditivas para o staff-admin de tenant.
-- Aditivas no sentido da 0040/0021: nenhuma policy existente é dropada,
-- substituída ou relaxada. Para qualquer papel que não seja psw_staff com
-- concessão, `is_tenant_admin_of()` reduz ao predicado antigo e estas policies
-- nunca concedem nada de novo (D-J / GRANT-10).
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- tabela,                    verbos que um tenant_admin daquele tenant tem hoje
      ('opportunities',             array['select','insert','update','delete']),
      ('opportunity_phases',        array['select','insert','update','delete']),
      ('opportunity_risks',         array['select','insert','update','delete']),
      ('opportunity_tasks',         array['select','insert','update','delete']),
      ('opportunity_assignees',     array['select','insert','update','delete']),
      ('opportunity_notes',         array['select','insert','delete']),          -- 0018: sem update p/ ninguém
      ('opportunity_documents',     array['select','insert','delete']),          -- 0018: sem update p/ ninguém
      ('opportunity_history',       array['select','insert'])                    -- 0018: append-only, sem grant de update/delete
    ) as t(tbl, verbs)
  loop
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'pulando % — tabela nao existe', spec.tbl;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = spec.tbl and column_name = 'tenant_id'
    ) then
      raise exception 'ABORTANDO: % nao tem tenant_id — o predicado desta fase nao se aplica', spec.tbl;
    end if;

    -- SELECT / DELETE usam USING; INSERT usa WITH CHECK; UPDATE usa os dois.
    if 'select' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_select_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for select using (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_select_psw_admin', spec.tbl);
    end if;
    if 'insert' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_insert_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for insert with check (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_insert_psw_admin', spec.tbl);
    end if;
    if 'update' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_update_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for update using (is_tenant_admin_of(tenant_id)) with check (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_update_psw_admin', spec.tbl);
    end if;
    if 'delete' = any(spec.verbs) then
      execute format('drop policy if exists %I on %I', spec.tbl || '_delete_psw_admin', spec.tbl);
      execute format(
        'create policy %I on %I for delete using (is_tenant_admin_of(tenant_id))',
        spec.tbl || '_delete_psw_admin', spec.tbl);
    end if;

    raise notice 'permissivas psw_admin criadas em % (%)', spec.tbl, spec.verbs;
  end loop;
end $$;
```

Duas notas sobre este bloco:

- **`raise exception`, não `raise notice`, na ausência de `tenant_id`.** A `0044` usa `continue` porque lá a ausência da coluna significava "esta tabela não participa". Aqui significaria "esta tabela ficou sem a concessão e ninguém percebeu" — é o modo de falha que o laço existe para evitar (o próprio comentário da `0044:83-86` diz que repetir à mão é como uma tabela acaba esquecida). Falhar alto é a escolha correta.
- **`profiles` fica de fora do laço** (não tem `tenant_id`? tem — mas não está no laço da `0044` e não tem restritiva) e ganha a sua policy própria, junto com `tenants`, no bloco C.

**(b) O disjunto na restritiva da `0044` — reaplicando o mesmo laço, agora com 3 disjuntos.**

Como a `0044` é idempotente por `drop policy if exists` + `create policy`, a forma correta é **reemitir** o laço inteiro com o predicado novo, não tentar "editar" a policy:

```sql
-- 0046 — bloco B: o disjunto novo na restritiva da 0044.
-- opportunities (a chave é `id`)
drop policy if exists opportunities_psw_staff_only_assigned on opportunities;
create policy opportunities_psw_staff_only_assigned on opportunities
  as restrictive
  for all
  using (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
    or tenant_id in (select current_admin_tenant_ids())   -- ← novo
  )
  with check (
    current_user_role() is distinct from 'psw_staff'
    or id in (select current_assigned_opportunity_ids())
    or tenant_id in (select current_admin_tenant_ids())   -- ← novo
  );

-- as 7 filhas (a chave é `opportunity_id`; todas têm tenant_id — §2)
do $$
declare t text;
begin
  foreach t in array array[
    'opportunity_phases','opportunity_risks','opportunity_notes',
    'opportunity_documents','opportunity_history','opportunity_tasks',
    'opportunity_assignees'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on %I', t || '_psw_staff_only_assigned', t);
    execute format($f$
      create policy %I on %I
        as restrictive
        for all
        using (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
          or tenant_id in (select current_admin_tenant_ids())
        )
        with check (
          current_user_role() is distinct from 'psw_staff'
          or opportunity_id in (select current_assigned_opportunity_ids())
          or tenant_id in (select current_admin_tenant_ids())
        )
    $f$, t || '_psw_staff_only_assigned', t);
  end loop;
end $$;
```

Repare que aqui o disjunto usa `current_admin_tenant_ids()` (a **concessão pura**, `setof uuid`, InitPlan) e **não** `is_tenant_admin_of(tenant_id)`. É deliberado: a restritiva só precisa não barrar o `psw_staff`; usar o helper booleano por linha aqui pagaria custo sem ganhar semântica (o ramo `tenant_admin` do helper é irrelevante dentro de um predicado já protegido por `current_user_role() is distinct from 'psw_staff'`). Ver §4.

**(c) `tenants` e `profiles` — fora do laço, mas indispensáveis.**

Sem `tenants`, o staff-admin não resolve o slug da empresa, não vê o nome dela no cabeçalho e não carrega o branding. Sem `profiles`, a tela de Equipe de A vem vazia (o mesmo sintoma "aba vazia sem erro" que a `0041:265-270` documenta).

```sql
-- 0046 — bloco C
drop policy if exists tenants_select_psw_admin on tenants;
create policy tenants_select_psw_admin on tenants
  for select using (is_tenant_admin_of(id));

-- branding: o tenant_admin já tem `tenants_update_own_admin` (0033) — aquela
-- policy é TROCADA no bloco de swap (§5), não duplicada aqui.

drop policy if exists profiles_select_psw_admin on profiles;
create policy profiles_select_psw_admin on profiles
  for select using (is_tenant_admin_of(tenant_id));
```

`profiles` **não** tem policy restritiva da `0044` (a `0044:41-44` explica por quê: fechá-la quebraria `getCurrentProfile()` e derrubaria o app inteiro para o staff), então esta permissiva é aditiva pura e não precisa de contraparte.

### Bloco de verificação pós-apply (obrigatório, estilo 0044)

O erro desta fase é silencioso, então a verificação não pode ser "as policies existem" — tem que medir o conjunto visível:

```sql
-- V1. Inventário: 8 restritivas com 3 disjuntos + as permissivas novas
select tablename, policyname, permissive, cmd
from pg_policies
where policyname like '%_psw_staff_only_assigned'
   or policyname like '%_psw_admin'
order by tablename, policyname;
-- esperado: 8 linhas com permissive='RESTRICTIVE' e 26+ com 'PERMISSIVE'

-- V2. As 8 restritivas realmente contêm o disjunto novo (pega o caso
--     "reapliquei só metade do laço"):
select count(*) as esperado_8
from pg_policies
where policyname like '%_psw_staff_only_assigned'
  and qual like '%current_admin_tenant_ids%';

-- V3. O TESTE QUE IMPORTA — com concessão, o staff vê o tenant inteiro.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
-- select count(*) as antes_da_concessao from opportunities;
-- rollback;
-- -- (aplicar a concessão via platform_admin, repetir, e comparar com:
-- --  select count(*) from opportunities where tenant_id = '<TENANT_A>';)

-- V4. NÃO-REGRESSÃO — um member/tenant_admin não pode ter ganho nem perdido
--     nada. Rodar ANTES e DEPOIS e comparar os dois números.
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DE_UM_MEMBER>','role','authenticated')::text, true);
-- select count(*) as visiveis from opportunities;
-- rollback;
```

### Bloco de ROLLBACK (obrigatório, estilo 0044)

```sql
-- ROLLBACK do bloco A (as permissivas novas somem; nada mais é tocado):
--   drop policy if exists opportunities_select_psw_admin on opportunities;  -- … idem insert/update/delete
--   (e assim por diante para as 8 tabelas × verbos; ou o mesmo laço com `drop policy if exists`)
--   drop policy if exists tenants_select_psw_admin on tenants;
--   drop policy if exists profiles_select_psw_admin on profiles;
-- ROLLBACK do bloco B: REAPLICAR o arquivo 0044 na íntegra — ele é idempotente
--   e restaura o predicado de 2 disjuntos. NÃO dropar as restritivas: dropá-las
--   devolveria ao psw_staff o acesso por tenant da PSW que a 0044 removeu.
-- ROLLBACK do swap (§5): reaplicar 0029 (select/delete), 0033, 0038 e o
--   BLOCO 6b da 0041 — nesta ordem, sendo o 6b o ÚLTIMO, senão a versão
--   permissiva demais da 0029 fica valendo.
```

Essa última linha é o detalhe que separa um rollback correto de um incidente de segurança. Ver §5.

## 2. As 8 tabelas do laço da 0044 — quais têm `tenant_id`

**Resposta curta: as 8 têm.** Todas as oito carregam `tenant_id uuid not null references tenants(id) on delete cascade` — o predicado do disjunto novo é uniforme e nenhuma tabela precisa de tratamento especial. O D-L do CONTEXT ("o disjunto por tenant precisa resolver pela coluna que existir em cada uma, várias filhas carregam `tenant_id` próprio") superestima o problema: não são "várias", são **todas**. [VERIFIED: `create table` de cada migration de origem]

| # | Tabela | `tenant_id`? | Definição (arquivo:linha) | Predicado recomendado |
|---|--------|--------------|---------------------------|------------------------|
| 1 | `opportunities` | ✅ not null | [`0001_init.sql`](supabase/migrations/0001_init.sql) (a raiz) | `tenant_id in (select current_admin_tenant_ids())` |
| 2 | `opportunity_phases` | ✅ not null | [`0001_init.sql:164`](supabase/migrations/0001_init.sql#L164) | idem |
| 3 | `opportunity_risks` | ✅ not null | [`0011_schema_evolution_v02.sql:222`](supabase/migrations/0011_schema_evolution_v02.sql#L222) | idem |
| 4 | `opportunity_notes` | ✅ not null | [`0018_documentos_anotacoes_historico.sql:78`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L78) | idem |
| 5 | `opportunity_documents` | ✅ not null | [`0018:40`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L40) | idem |
| 6 | `opportunity_history` | ✅ not null | [`0018:105`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L105) | idem |
| 7 | `opportunity_tasks` | ✅ not null | [`0037_opportunity_tasks.sql:60`](supabase/migrations/0037_opportunity_tasks.sql#L60) | idem |
| 8 | `opportunity_assignees` | ✅ not null | [`0032_opportunity_assignees.sql:36`](supabase/migrations/0032_opportunity_assignees.sql#L36) | idem |

**Por que a resposta "todas" é confiável e não frágil.** O `tenant_id` das filhas não é decorativo nem best-effort: dois triggers de banco o garantem coerente com o da oportunidade, para **todos os papéis, inclusive `psw_staff`** —

- `check_assignee_tenant()` ([`0040:155-158`](supabase/migrations/0040_psw_staff_access_core.sql#L155)): *"tenant_id do vínculo não confere com o da oportunidade"* → rejeita. É o caso (d) do smoke test da Phase 17, e o teste `d) tenant_id da LINHA divergente…` em [`tests/security/psw-staff-isolation.test.ts:543`](tests/security/psw-staff-isolation.test.ts#L543) o prova.
- `check_task_tenant_coherence()` ([`0041:364-367`](supabase/migrations/0041_psw_staff_child_access.sql#L364)): mesma regra para `opportunity_tasks`.
- A migration [`0043_child_tenant_coherence.sql`](supabase/migrations/0043_child_tenant_coherence.sql) existe exatamente para estender essa garantia às demais filhas.

Portanto `filha.tenant_id = pai.tenant_id` é **invariante de banco**, não convenção. Filtrar a filha por `tenant_id` e filtrar por "o `tenant_id` da oportunidade-pai" dão o mesmo conjunto — com a diferença de que a primeira forma é uma comparação de coluna local, sem join e sem subconsulta correlacionada. É a forma certa por correção **e** por performance.

**A alternativa (para o caso hipotético de uma tabela sem `tenant_id`).** Se uma filha futura nascer sem a coluna, o predicado seria:

```sql
or opportunity_id in (
  select o.id from opportunities o
  where o.tenant_id in (select current_admin_tenant_ids())
)
```

— note que a subconsulta é **não-correlacionada** (não referencia a linha corrente), então o planner ainda a materializa uma vez. A forma errada, a evitar, é `exists (select 1 from opportunities o where o.id = t.opportunity_id and …)`, que é correlacionada e reexecuta por linha (é o item 5 do guia de performance da Supabase [CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]).

**Guard-rail recomendado no plano:** o laço do bloco A (§1) deve dar `raise exception` — não `raise notice` — se alguma das 8 não tiver `tenant_id`. Silenciar aqui é aceitar que uma tabela fique sem a concessão sem ninguém saber.

## 3. `storage.objects` e funções do schema `public`

### Pode uma policy em `storage.objects` chamar uma função de `public`? **Sim — e o projeto já faz isso, em produção, desde a `0033`.**

Não é hipótese: são **6 policies vivas** em `storage.objects` chamando funções de `public` sem qualificação de schema.

| Policy | Migration | Funções `public` chamadas | Qualificação usada |
|--------|-----------|---------------------------|--------------------|
| `opportunity_documents_storage_select` | [`0018:139-142`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L139) | `current_tenant_id()` | **nenhuma** (só `storage.foldername` é qualificada) |
| `opportunity_documents_storage_insert` | [`0018:146-151`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L146) | `current_tenant_id()`, `current_user_role()` | nenhuma |
| `opportunity_documents_storage_delete` | [`0018:154-159`](supabase/migrations/0018_documentos_anotacoes_historico.sql#L154) | `current_tenant_id()`, `current_user_role()` | nenhuma |
| `tenant_branding_storage_insert` | [`0033:110-118`](supabase/migrations/0033_tenant_branding.sql#L110) | `current_tenant_id()`, `current_user_role()`, `is_platform_admin()` | nenhuma |
| `tenant_branding_storage_update` | [`0033:121-129`](supabase/migrations/0033_tenant_branding.sql#L121) | idem | nenhuma |
| `tenant_branding_storage_delete` | [`0033:132-140`](supabase/migrations/0033_tenant_branding.sql#L132) | idem | nenhuma |

E a `0041` fez exatamente a mesma coisa, com a função *nova* daquela fase:

```sql
-- 0041:301-309 (aplicada e em produção)
create policy opportunity_documents_storage_select_psw_staff on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and current_user_role() = 'psw_staff'                       -- ← public, sem qualificar
    and (storage.foldername(name))[2] in (
      select o::text from current_assigned_opportunity_ids() o  -- ← public, sem qualificar
    )
  );
```

### Por que funciona, mecanicamente

Uma expressão de policy é **parseada no `CREATE POLICY`** e armazenada como árvore de parse com **OIDs já resolvidos** (`pg_policy.polqual` / `polwithcheck`). O `search_path` só importa **no momento da criação**, nunca na avaliação. Como as migrations rodam no SQL Editor do Supabase Cloud com `search_path` padrão (`"$user", public`), `current_user_role()` resolve para `public.current_user_role()` e o OID é gravado. Depois disso o schema da tabela alvo (`storage`) é irrelevante. [ASSUMED: mecanismo de armazenamento de policies do PostgreSQL — não verificado nesta sessão contra a doc, mas confirmado empiricamente pelas 6 policies acima funcionando]

### Qual grant é necessário? **Nenhum novo.**

Não existe **um único** `grant execute` para `current_tenant_id`, `current_user_role`, `is_platform_admin` ou `current_assigned_opportunity_ids` em nenhuma das 44 migrations — os únicos `grant execute` do repositório são para as RPCs públicas (`fetch_public_tenant`, `create_public_opportunity`, `fetch_public_opportunities`, `log_public_form_attempt`, `opportunity_audit_trail`). [VERIFIED: grep em `supabase/migrations/*.sql`]

O motivo é o default do PostgreSQL: **funções recebem `EXECUTE` para `PUBLIC` na criação**. Como `authenticated` herda de `PUBLIC`, o predicado avalia sem barreira de permissão. A prova viva é a `0041`: ela criou `current_assigned_opportunity_ids()` na `0040` sem grant nenhum e a usa dentro de uma policy de `storage.objects` que hoje funciona em produção.

**Recomendação:** manter o padrão (sem `grant execute` explícito) para as funções novas desta fase, por consistência com as 4 funções-helper existentes. Se o plano quiser ser explícito, o custo é zero e a forma seria `grant execute on function is_tenant_admin_of(uuid) to authenticated;` — mas isso **divergiria** do padrão do projeto sem ganho de segurança, e um `revoke ... from public` acompanhante seria necessário para ter efeito real. Não vale a pena.

### O que a fase precisa fazer em `storage.objects`

**Bucket `tenant-branding` (público, 0033)** — GRANT-04 exige que o staff-admin de A troque a logo de A. As 3 policies de escrita passam a chamar o helper. **Atenção ao cast:**

```sql
-- ERRADO — quebra para TODOS os usuários se algum objeto tiver 1º segmento
-- não-uuid (e o platform_admin PODE criar um: a policy de insert da 0033
-- aceita `or is_platform_admin()` sem checar a pasta):
--   is_tenant_admin_of(((storage.foldername(name))[1])::uuid)

-- CERTO — comparação do lado TEXTO, exatamente como a 0033 já fazia
-- (`… = current_tenant_id()::text`) e como a 0041:295-300 documenta:
drop policy if exists tenant_branding_storage_insert on storage.objects;
create policy tenant_branding_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'tenant-branding'
    and (
      (storage.foldername(name))[1] in (
        select t::text from effective_admin_tenant_ids() t
      )
      or is_platform_admin()
    )
  );
-- idem para tenant_branding_storage_update e tenant_branding_storage_delete.
```

O comentário da [`0041:295-300`](supabase/migrations/0041_psw_staff_child_access.sql#L295) já ensina a regra e o porquê, palavra por palavra: *"Comparação do 2º segmento como TEXTO, nunca com cast para uuid: um objeto cujo path fuja da convenção derrubaria a policy INTEIRA com erro de cast em runtime, para QUALQUER usuário"*. Reaproveitar essa lição aqui é obrigatório — é a mesma armadilha, um segmento à esquerda.

É essa exigência que motiva o **terceiro helper** (`effective_admin_tenant_ids()`, `setof uuid`) recomendado na §4: sem ele, ou se casta (perigoso) ou se duplica a lógica do predicado em forma de conjunto (divergência garantida). Com ele, `is_tenant_admin_of(t)` é **definido em termos** do conjunto, então as duas formas não podem divergir por construção.

**Bucket `opportunity-documents` (privado, 0018/0041)** — o 1º segmento é o tenant e o 2º é a oportunidade. O staff-admin de A precisa dos documentos de A inteiro:

```sql
drop policy if exists opportunity_documents_storage_select_psw_admin on storage.objects;
create policy opportunity_documents_storage_select_psw_admin on storage.objects
  for select using (
    bucket_id = 'opportunity-documents'
    and (storage.foldername(name))[1] in (
      select t::text from effective_admin_tenant_ids() t
    )
  );
-- idem for insert (with check) e for delete (using) — a 0018:135-137 confirma
-- que o bucket concede exatamente 3 verbos, SEM update. Espelhar os 3, não 4.
```

Aqui são policies **novas** (não swap), porque as da `0018` não têm gate de papel — elas concedem por `current_tenant_id()` a qualquer papel do tenant, e o staff-admin não está nesse tenant. Mesmo raciocínio da §1.

> **Nota importante:** `storage.objects` **não** tem policy restritiva da `0044` (a `0044:47-48` diz explicitamente: *"`audit_log`, `invited_emails`, `storage.objects` — não são tabelas de demanda; seus recortes já foram tratados em 0041/0042"*). Logo, no Storage a permissiva nova basta — não há contraparte a acrescentar.

## 4. Performance de `is_tenant_admin_of(t)` em 17 policies

### O problema, enunciado com precisão

`is_tenant_admin_of(t uuid)` **recebe uma coluna da linha** como argumento. Isso a torna estruturalmente diferente de `current_assigned_opportunity_ids()` da `0040`, que não recebe nada:

- `id in (select current_assigned_opportunity_ids())` — subconsulta **não-correlacionada** → o planner constrói um **subplano hasheado avaliado uma vez por statement**. É a razão do benchmark citado na `0040:76` (~9000 ms → ~20 ms).
- `is_tenant_admin_of(tenant_id)` — **depende da linha** → **não existe** forma de envolvê-la em `(select …)` para virar InitPlan. `(select is_tenant_admin_of(tenant_id))` é um subplano *correlacionado*: reexecuta por linha. Envolver não ajuda, e escrever isso dá a falsa sensação de ter aplicado a otimização da Supabase.

Isso não é motivo para abandonar o helper (D-I/D-O o exigem como fonte única). É motivo para **escolher a forma da função** com cuidado.

### `stable` vs `immutable` — `stable`, sem discussão

`immutable` seria **incorreto e perigoso**, por três motivos independentes:

1. O resultado depende de conteúdo de tabelas (`psw_tenant_admins`, `profiles`) — uma concessão revogada mudaria a resposta sem que nada "imutável" tenha mudado.
2. Depende de `auth.uid()`, ou seja, **do usuário da sessão**. Um plano preparado ou um valor constant-folded poderia ser reaproveitado entre sessões de usuários diferentes. Num predicado de RLS isso é um vazamento cross-tenant, não uma imprecisão.
3. `immutable` habilita uso em expressão de índice e constant-folding em tempo de planejamento — ambos venenosos aqui.

`stable` é o correto (mesma resposta dentro de um statement, pode mudar entre statements) e é o que **todas as 4 helpers existentes** já declaram: `current_tenant_id()` ([`0001:181`](supabase/migrations/0001_init.sql#L181)), `current_user_role()` ([`0015:28-37`](supabase/migrations/0015_rbac_viewer_policies.sql#L28)), `is_platform_admin()` ([`0021`](supabase/migrations/0021_platform_admin_rls.sql)), `current_assigned_opportunity_ids()` ([`0040:86-96`](supabase/migrations/0040_psw_staff_access_core.sql#L86)). [VERIFIED: leitura das migrations]

### Inline-vs-função — o achado que decide a forma

O PostgreSQL inlineia funções SQL escalares (`inline_function()`) apenas quando um conjunto de condições é satisfeito. **Duas delas são exatamente as que a "forma óbvia" copiada da `0040` violaria:**

| Condição | Efeito de violá-la |
|----------|--------------------|
| a função **não** é `SECURITY DEFINER` | `security definer` ⇒ **nunca inlineada** |
| a função **não** tem cláusula `SET` (`proconfig` nulo) | `set search_path = public` ⇒ **nunca inlineada** |
| `language sql`, corpo de um único `SELECT`, não retorna `setof`, volatilidade compatível | idem |

[ASSUMED: baseado no comportamento documentado de `inline_function` no otimizador do PostgreSQL — **não verificado nesta sessão** contra a fonte. O plano deve confirmar com `EXPLAIN` (bloco abaixo), que é evidência direta e mais forte que a citação.]

Consequência: se `is_tenant_admin_of()` for escrita como `security definer` + `set search_path = public` (o reflexo natural, já que é assim que todas as helpers do projeto são escritas), ela vira uma **caixa-preta chamada uma vez por linha varrida**, e dentro de cada chamada a subconsulta sobre `psw_tenant_admins` é montada de novo. Numa varredura de `opportunities` isso é O(linhas) chamadas de função definer + O(linhas) execuções de subplano — o oposto do que a `0040` conquistou.

### Custo do `security definer` por linha

`SECURITY DEFINER` troca o contexto de privilégio a cada entrada e saída da função (além de aplicar o `proconfig`/`search_path` via `GUC` save/restore). É barato por chamada e **caro por milhão de chamadas**. As helpers existentes já pagam isso (`current_user_role()` aparece em quase toda policy do sistema), então o *status quo* não piora — mas acrescentar uma **quinta** função definer avaliada por linha, e ainda com subconsulta dentro, é a diferença entre "mais uma chamada" e "uma varredura aninhada".

### Recomendação concreta

**Três funções, com papéis distintos e uma única fonte de verdade semântica:**

```sql
-- (1) A CONCESSÃO PURA — espelha current_assigned_opportunity_ids() (0040:86)
--     na forma, byte a byte: setof uuid, security definer, stable,
--     set search_path, (select auth.uid()) para InitPlan.
--     É esta que o disjunto da restritiva da 0044 consome.
create or replace function current_admin_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from psw_tenant_admins
  where profile_id = (select auth.uid())
$$;

-- (2) O CONJUNTO EFETIVO — "de quais tenants o usuário corrente é admin",
--     unificando o ramo tenant_admin e o ramo psw_staff. É o que as policies
--     de storage.objects consomem (comparação lado-texto, §3), e é o que
--     define a semântica da (3).
create or replace function effective_admin_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- ramo tenant_admin: BYTE-EQUIVALENTE ao predicado antigo (D-J)
  select current_tenant_id()
  where current_user_role() = 'tenant_admin'
  union all
  -- ramo psw_staff: a concessão desta fase
  select tenant_id
  from psw_tenant_admins
  where profile_id = (select auth.uid())
    and current_user_role() = 'psw_staff'
$$;

-- (3) A FONTE ÚNICA DO PREDICADO (D-I / D-O) — deliberadamente SEM
--     `security definer` e SEM `set search_path`, para que o planner POSSA
--     inlineá-la. Não precisa de definer: quem fura a RLS é a (2), que já é
--     definer. Chamadas qualificadas por schema compensam a ausência do SET.
create or replace function is_tenant_admin_of(t uuid)
returns boolean
language sql
stable
as $$
  select coalesce(t in (select public.effective_admin_tenant_ids()), false)
$$;
```

**Por que isto é rápido.** Depois do inlining, `is_tenant_admin_of(tenant_id)` vira literalmente `tenant_id in (select public.effective_admin_tenant_ids())` — subconsulta **não-correlacionada** (a função não recebe argumento), que o planner hasheia uma vez por statement. É exatamente o padrão que a `0040:70-76` já usa e mede. O helper booleano dá a ergonomia de fonte única que o D-I pede **sem** pagar o preço da forma booleana ingênua.

**Por que não é inseguro.** `is_tenant_admin_of()` não lê tabela nenhuma diretamente; ela delega para `effective_admin_tenant_ids()`, que é `security definer` + `set search_path = public`. Como a (3) roda com os privilégios do chamador, um `search_path` manipulado não escala privilégio — e as chamadas internas são **schema-qualificadas** (`public.effective_admin_tenant_ids()`), fechando o vetor de shadowing.

**Índice de suporte** (espelhando a decisão da [`0040:99-110`](supabase/migrations/0040_psw_staff_access_core.sql#L99)):

```sql
create index if not exists psw_tenant_admins_profile_only_idx on psw_tenant_admins(profile_id);
create index if not exists psw_tenant_admins_tenant_idx       on psw_tenant_admins(tenant_id);
```

O primeiro serve `current_admin_tenant_ids()` / `effective_admin_tenant_ids()` (filtro por `profile_id`) e é o análogo direto do `opportunity_assignees_profile_only_idx`. O segundo serve a `/admin/staff` ("quem administra esta empresa?") — a tabela será minúscula (dezenas de linhas), então o custo de manutenção é irrelevante e a decisão é "criar agora, como a 0040 fez, em vez de descobrir depois". O guia da Supabase põe indexação de colunas de policy como a recomendação nº 1, com ganho de "over 100x em tabelas grandes" [CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv].

### Verificação obrigatória de que o inlining aconteceu

Isto **não** é fé — é `EXPLAIN`, e cabe no bloco de verificação pós-apply da `0046`:

```sql
-- Com a sessão fingindo ser o staff (mesma técnica da 0044:144-151):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub','<UID_DO_STAFF>','role','authenticated')::text, true);
-- explain (analyze, buffers) select count(*) from opportunities;
-- rollback;
--
-- ESPERADO: um nó `SubPlan` / `Hashed SubPlan` avaliado 1x
--   (`Filter: (hashed SubPlan N)` ou InitPlan) referenciando
--   effective_admin_tenant_ids.
-- SINAL DE ALARME: `Function Scan on is_tenant_admin_of` com `loops=<nº de
--   linhas>`, ou `SubPlan` com `loops` proporcional às linhas → o inlining NÃO
--   ocorreu. Nesse caso, remover `security definer`/`set` da (3) (se tiverem
--   sido acrescentados) ou, em último caso, expandir o predicado à mão nas
--   policies quentes (`opportunities` e as 7 filhas), mantendo
--   `is_tenant_admin_of()` para as tabelas frias (tenants, invited_emails,
--   audit_log, storage).
```

### Uma nota sobre `(select …)` e as helpers antigas

O guia da Supabase recomenda envolver chamadas em `(select …)` para virarem InitPlan (benchmark deles: 11.000 ms → 10 ms) [CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]. As 14 ocorrências de hoje escrevem `current_tenant_id()` e `current_user_role()` **crus**, sem o envelope. Trocá-las por `is_tenant_admin_of(tenant_id)` — com o corpo já contendo `(select …)` nas helpers internas via `effective_admin_tenant_ids()` — **melhora** esse ponto de graça, e a §7 deve medir isso (contagem de linhas idêntica é o requisito; latência menor é o bônus). O que **não** se deve fazer é aproveitar a fase para reescrever as helpers `current_tenant_id()`/`current_user_role()` — elas são consumidas por dezenas de policies e mexer nelas transforma uma fase de concessão numa fase de refactor de RLS global.

## 5. CHECKs de papel convidável e as policies de convite

### Correção de fato: os "17 predicados" são 11 policies vivas / 14 ocorrências, e uma linha citada está morta

Antes de responder o que muda nos convites, é preciso corrigir o inventário do CONTEXT (D-I), porque o erro tem consequência de segurança.

| # | Policy viva | Migration:linha da definição VIVA | Ocorrências do predicado |
|---|-------------|-----------------------------------|--------------------------|
| 1 | `opportunity_assignees_insert` | `0032:93-97` | 1 (`with check`) |
| 2 | `opportunity_assignees_update` | `0032:99-107` | 2 (`using` + `with check`) |
| 3 | `opportunity_assignees_delete` | `0032:109-114` | 1 |
| 4 | `invited_emails_select_tenant_admin` | `0029:41-44` | 1 |
| 5 | `invited_emails_delete_tenant_admin` | `0029:61-66` | 1 |
| 6 | `invited_emails_insert_tenant_admin` | **`0041:444-449`** (a `0029:50-55` foi **substituída**) | 1 |
| 7 | `tenants_update_own_admin` | `0033:54-59` | 2 (`using` + `with check`) |
| 8 | `tenant_branding_storage_insert` | `0033:110-118` | 1 |
| 9 | `tenant_branding_storage_update` | `0033:121-129` | 1 |
| 10 | `tenant_branding_storage_delete` | `0033:132-140` | 1 |
| 11 | `audit_log_select` | `0038:224-230` | 1 |
| | **Total** | **11 policies** | **14 ocorrências** |

**A linha `0029:53` do CONTEXT é código morto.** A `0041`, no seu BLOCO 6b, dropou e recriou `invited_emails_insert_tenant_admin` com um predicado **mais restrito**, e documentou o porquê em 8 linhas de comentário ([`0041:434-449`](supabase/migrations/0041_psw_staff_child_access.sql#L434)):

```sql
-- 0041:443-449 — a definição VIVA
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_role() = 'tenant_admin'
    and role not in ('platform_admin', 'psw_staff')   -- ← a barreira REAL
  );
```

> ⚠️ **Modo de falha crítico do plano.** Um plano que "troque os 17 predicados" percorrendo as linhas listadas no CONTEXT vai encontrar `0029:53`, reescrever *aquele* texto, e emitir um `create policy invited_emails_insert_tenant_admin` **sem** o `role not in ('platform_admin','psw_staff')`. O resultado: qualquer `tenant_admin` de cliente volta a poder inserir um convite com `role = 'psw_staff'` direto pela API — a escalada de privilégio que a `0041` fechou de propósito. A migration aplicaria limpa, os testes de contagem de oportunidades passariam, e o único teste que pegaria isso é `tenant_admin NÃO consegue inserir invited_emails com o papel novo (psw_staff) — ACCESS-09` ([`tests/security/psw-staff-isolation.test.ts:1045`](tests/security/psw-staff-isolation.test.ts#L1045)). **O plano deve enumerar as 11 policies vivas por nome, nunca por número de linha do CONTEXT**, e a mesma ordem importa no bloco de ROLLBACK (reaplicar a `0029` depois da `0041` reintroduziria a versão fraca).

### Os CHECKs de papel convidável — o que muda: **nada**

| Objeto | Definição atual | Muda? |
|--------|-----------------|-------|
| `invited_emails_role_check` (`0028:25-27`) | `check (role in ('member','tenant_admin','viewer'))` | **Substituída pela `0041`** — é histórico, não estado vivo |
| `invited_emails_role_check` (`0041:430-432`) — **vivo** | `check (role in ('member','tenant_admin','viewer','psw_staff'))` | **NÃO muda** |

Um `CHECK` de coluna não sabe **quem** está inserindo — ele responde "este valor é aceitável na tabela?", não "esta pessoa pode gravar este valor?". Estreitá-lo quebraria o `platform_admin` (que precisa convidar `psw_staff` pelo fluxo de `/admin/invites`, [`app/(app)/admin/invites/actions.ts:86-90`](app/(app)/admin/invites/actions.ts#L86)); alargá-lo não é necessário porque nenhum papel novo é convidável nesta fase (a concessão **não** é um `role` — D-D). O CHECK fica intacto, e o plano deve dizer isso explicitamente para que ninguém "conserte" o que está certo.

> Nota: `platform_admin` **nunca** foi convidável por CHECK nenhum — a `0028:10-11` e a `0022` deixam isso escrito. Continua assim.

### As policies de convite — os 3 predicados novos, exatos

```sql
-- 0046 — bloco D: invited_emails.
-- A troca do par (tenant, papel) por is_tenant_admin_of() é, aqui, a PRÓPRIA
-- concessão (§1): estas policies são PERMISSIVAS e invited_emails não tem
-- restritiva da 0044. Nenhuma policy adicional é necessária nesta tabela.

-- 1) SELECT — o staff-admin vê a allowlist de A (e o tenant_admin de A
--    continua vendo exatamente o que via: is_tenant_admin_of() reduz ao
--    predicado antigo no ramo dele — D-J).
drop policy if exists invited_emails_select_tenant_admin on invited_emails;
create policy invited_emails_select_tenant_admin on invited_emails
  for select using (is_tenant_admin_of(tenant_id));

-- 2) INSERT — a barreira de escalada da 0041 é PRESERVADA LITERALMENTE.
--    É esta linha que garante D-B/GRANT-06 na camada de convite: um
--    staff-admin de A não cunha outro psw_staff, logo não cria a pessoa que
--    depois poderia receber uma concessão.
drop policy if exists invited_emails_insert_tenant_admin on invited_emails;
create policy invited_emails_insert_tenant_admin on invited_emails
  for insert with check (
    is_tenant_admin_of(tenant_id)
    and role not in ('platform_admin', 'psw_staff')
  );

-- 3) DELETE — revoga convite PENDENTE de A. `used_at is null` preservado:
--    a 0029:23-25 explica que um convite usado é registro de auditoria de
--    como aquele profile nasceu; apagar não remove o acesso, só destrói a
--    trilha.
drop policy if exists invited_emails_delete_tenant_admin on invited_emails;
create policy invited_emails_delete_tenant_admin on invited_emails
  for delete using (
    is_tenant_admin_of(tenant_id)
    and used_at is null
  );

-- Sem policy de UPDATE: o único UPDATE existente é `used_at = now()` feito por
-- handle_new_user(), SECURITY DEFINER, que bypassa RLS (0029:68-70). Nada muda.
```

### O que um staff-admin de A passa a poder convidar — e o que continua impossível

| Papel no convite | `tenant_admin` de A (hoje) | staff-admin de A (depois) | Barreira quando negado |
|------------------|---------------------------|---------------------------|------------------------|
| `member` | ✅ | ✅ | — |
| `viewer` | ✅ | ✅ | — |
| `tenant_admin` | ✅ (dentro de A) | ✅ (dentro de A) | — |
| `psw_staff` | ❌ | ❌ | `role not in (…)` na policy de insert (`0041`, preservado) |
| `platform_admin` | ❌ | ❌ | idem **+** `invited_emails_role_check` **+** allowlist de app |
| qualquer papel **em outro tenant** | ❌ | ❌ | `is_tenant_admin_of(tenant_id)` é falso para o tenant não concedido |

**Consequência a declarar no plano (não é bug, é D-A):** um staff-admin de A pode convidar um `tenant_admin` de A, e `handle_new_user()` (`0022`) copia `invited_emails.role` para `profiles.role` — então ele *cria* um admin de cliente em A. Isso é equivalência plena a `tenant_admin` (D-A) e não é escalada lateral no sentido do D-B, porque não cria nem estende **concessão** (`psw_tenant_admins` é escrita só pelo `platform_admin`). Vale escrever isso na SUMMARY da fase para que ninguém o descubra como surpresa numa auditoria.

### A allowlist de app — já está correta, não precisa mudar

[`lib/security/cargo.ts:66-88`](lib/security/cargo.ts#L66) define:

```ts
export type AccessRole = 'member' | 'viewer' | 'tenant_admin';
const ACCESS_ROLES: readonly AccessRole[] = ['member', 'viewer', 'tenant_admin'];
// parseRoleAndCargo(): qualquer valor fora da allowlist cai no default seguro 'member'
```

O tipo **não inclui** `psw_staff` nem `platform_admin`, e `parseRoleAndCargo()` faz `includes()` explícito com fallback seguro. Isso significa que a tela `/team` pode ser **reusada** pelo staff-admin sem abrir escalada — a allowlist de app já bate exatamente com a policy de banco. É reuso, não código novo: só o guard de papel (`isTenantAdmin` → `isTenantAdminOf`) e a origem do `tenant_id` mudam (§6). [VERIFIED: leitura de `lib/security/cargo.ts`]

### A tabela da concessão — onde D-B é realmente garantido

A barreira dos convites impede *cunhar* um `psw_staff`. A barreira que impede *promover* alguém a admin de tenant é a RLS de `psw_tenant_admins`:

```sql
alter table psw_tenant_admins enable row level security;

-- SELECT: o platform_admin gere; a própria pessoa lê suas concessões (é o que
-- permite ao servidor espelhar `isTenantAdminOf()` sem service-role). O
-- tenant_admin do tenant concedido NÃO lê — quem administra a PSW-side de um
-- cliente não é informação do cliente nesta fase (fora de escopo, D-F é sobre
-- a tela do platform_admin).
drop policy if exists psw_tenant_admins_select on psw_tenant_admins;
create policy psw_tenant_admins_select on psw_tenant_admins
  for select using (
    is_platform_admin() or profile_id = (select auth.uid())
  );

-- INSERT / DELETE: SOMENTE platform_admin (D-B / GRANT-06).
drop policy if exists psw_tenant_admins_insert on psw_tenant_admins;
create policy psw_tenant_admins_insert on psw_tenant_admins
  for insert with check (is_platform_admin());

drop policy if exists psw_tenant_admins_delete on psw_tenant_admins;
create policy psw_tenant_admins_delete on psw_tenant_admins
  for delete using (is_platform_admin());

-- SEM policy de UPDATE, deliberadamente: uma concessão não se "edita" — se
-- concede e se revoga. Mesma disciplina de audit_log (0038:232-233): a ausência
-- de policy é a garantia, não a disciplina da app.
revoke all on psw_tenant_admins from anon;
grant select, insert, delete on psw_tenant_admins to authenticated;
```

Note a assimetria proposital: a concessão do `platform_admin` vem de `is_platform_admin()` (`0021`), **nunca** de `is_tenant_admin_of()`. Se ela viesse do helper novo, um staff-admin de A poderia conceder em A — exatamente o que D-B proíbe.

## 6. Auditoria de Server Actions — todo `profile.tenantId` nas superfícies de admin

**Método:** `grep -rn "tenantId" app lib components` no `main` (2026-08-07), seguido de leitura de cada ocorrência. Foram 88 ocorrências brutas; as que derivam o **tenant de atuação** do `profile` (e não de uma oportunidade, de um parâmetro ou de um slug já resolvido) estão abaixo. Completude é o critério, não profundidade: **22 itens**, nenhum omitido. [VERIFIED: grep + leitura arquivo a arquivo]

### Legenda de classificação

- **WRITE / silêncio** — muta e responde sucesso mesmo afetando **zero linhas**. É o sintoma que [`lib/security/role.ts:148-155`](lib/security/role.ts#L148) descreve por extenso: *"o Supabase devolve `error: null`; a Server Action responde `{ ok: true }`; o usuário vê 'salvo com sucesso' e NADA mudou no banco"*. **O bug mais caro da fase.**
- **WRITE / erro** — muta, mas a RLS recusa com 42501 ou o guard barra antes; falha visível, ainda assim comportamento errado.
- **READ / escopo** — lê o tenant errado; a tela mostra dado da PSW em vez do dado da empresa administrada.
- **GUARD** — bloqueia o staff-admin antes de qualquer query (a tela simplesmente não abre).
- **CORRETO — não tocar** — usa `profile.tenantId` de propósito e continuaria certo.

### A auditoria

| # | Arquivo:linha | O que faz | Classe | Sintoma com staff-admin de A |
|---|---------------|-----------|--------|------------------------------|
| 1 | [`app/(app)/team/actions.ts:29`](app/(app)/team/actions.ts#L29) | `if (!isTenantAdmin(profile)) return { error: 'Acesso negado.' }` | GUARD | Convite em A impossível: o papel é `psw_staff`, não `tenant_admin` |
| 2 | [`app/(app)/team/actions.ts:46`](app/(app)/team/actions.ts#L46) | `insert({ …, tenant_id: profile!.tenantId })` | WRITE / erro | Gravaria o convite no tenant **da PSW**; o `with check` da policy recusaria (42501) |
| 3 | [`app/(app)/team/actions.ts:74`](app/(app)/team/actions.ts#L74) | `if (!isTenantAdmin(profile)) return;` (revoke) | GUARD | Revogação de convite em A impossível |
| 4 | [`app/(app)/team/actions.ts:84`](app/(app)/team/actions.ts#L84) | `.delete().eq('id', id).eq('tenant_id', profile!.tenantId)` | **WRITE / silêncio** | Casa **zero linhas**; a action retorna `void`, o `revalidatePath` roda, a tela recarrega com o convite ainda lá. Nenhum erro em lugar nenhum. **O caso D-K canônico.** |
| 5 | [`app/(app)/team/page.tsx:51`](app/(app)/team/page.tsx#L51) | `if (!isTenantAdmin(profile)) redirect('/opportunities')` | GUARD | `/team` inacessível |
| 6 | [`app/(app)/team/page.tsx:61`](app/(app)/team/page.tsx#L61) | `invited_emails … .eq('tenant_id', profile!.tenantId)` | READ / escopo | Lista os convites da **PSW**, não os de A |
| 7 | [`app/(app)/team/page.tsx:66`](app/(app)/team/page.tsx#L66) | `profiles … .eq('tenant_id', profile!.tenantId)` | READ / escopo | Lista a equipe da **PSW**, não a de A |
| 8 | [`app/(app)/configuracoes/actions.ts:33`](app/(app)/configuracoes/actions.ts#L33) | `requireBrandingAdmin()` — `isTenantAdmin \|\| isPlatformAdmin` | GUARD | Branding de A impossível |
| 9 | [`app/(app)/configuracoes/actions.ts:52`](app/(app)/configuracoes/actions.ts#L52) | `update({ brand_color }).eq('id', profile.tenantId)` | **WRITE / silêncio** | Zero linhas → `error` é `null` → `{ ok: true }` → "Cor salva" e nada mudou |
| 10 | [`app/(app)/configuracoes/actions.ts:77`](app/(app)/configuracoes/actions.ts#L77) | `path = ${profile.tenantId}/logo-…` (upload) | WRITE / erro | Sobe para a pasta **da PSW**; a policy do bucket recusa (§3) |
| 11 | [`app/(app)/configuracoes/actions.ts:88`](app/(app)/configuracoes/actions.ts#L88) | `select logo_path .eq('id', profile.tenantId)` | READ / escopo | Lê a logo antiga **da PSW** — e depois a apagaria do Storage |
| 12 | [`app/(app)/configuracoes/actions.ts:94`](app/(app)/configuracoes/actions.ts#L94) | `update({ logo_path }).eq('id', profile.tenantId)` | **WRITE / silêncio** | Zero linhas; o `if (error)` não dispara; o arquivo novo fica órfão no bucket |
| 13 | [`app/(app)/configuracoes/actions.ts:117`](app/(app)/configuracoes/actions.ts#L117) | `select logo_path .eq('id', profile.tenantId)` (remove) | READ / escopo | idem #11 |
| 14 | [`app/(app)/configuracoes/actions.ts:123`](app/(app)/configuracoes/actions.ts#L123) | `update({ logo_path: null }).eq('id', profile.tenantId)` | **WRITE / silêncio** | Zero linhas → `{ ok: true }` → "logo removida", logo intacta |
| 15 | [`app/(app)/configuracoes/page.tsx:17`](app/(app)/configuracoes/page.tsx#L17) | guard `isTenantAdmin \|\| isPlatformAdmin` | GUARD | `/configuracoes` inacessível |
| 16 | [`app/(app)/configuracoes/page.tsx:19`](app/(app)/configuracoes/page.tsx#L19) | `fetchTenantBranding(profile!.tenantId)` | READ / escopo | Mostra o branding **da PSW** no formulário de A |
| 17 | [`app/(app)/logs/page.tsx:129`](app/(app)/logs/page.tsx#L129) | `if (!platformAdmin && !isTenantAdmin(profile)) redirect(…)` | GUARD | `/logs` inacessível (GRANT-04 exige logs de A) |
| 18 | [`app/(app)/logs/page.tsx:135`](app/(app)/logs/page.tsx#L135) | `const empresa = platformAdmin ? raw.empresa ?? '' : ''` + `fetchAuditTenants()` só para `platformAdmin` | READ / escopo | Sem o seletor, o staff-admin de A **e** C veria o log dos dois misturado, sem como filtrar. A RLS não erra; a UI não consegue recortar |
| 19 | [`app/(app)/layout.tsx:28`](app/(app)/layout.tsx#L28) | `fetchTenantBranding(profile.tenantId)` (tema do app) | READ / escopo — **decisão** | O app inteiro fica com a identidade da PSW. Defensável (é o tenant de lotação dele), mas com seletor de empresa ativo o usuário espera o tema de A. **Escolha de produto a registrar no plano.** |
| 20 | [`app/(app)/layout.tsx:34-40`](app/(app)/layout.tsx#L34) | `if (isAdmin)` carrega `tenants` para o seletor da Sidebar | READ / escopo | O staff-admin não recebe a lista de empresas → o seletor some justamente para quem passou a precisar dele |
| 21 | [`app/(app)/opportunities/page.tsx:109`](app/(app)/opportunities/page.tsx#L109) | `membersTenantId = scopedTenantId ?? (isAdmin ? undefined : profile?.tenantId)` | READ / escopo | Sem empresa selecionada, o filtro "Membro" lista gente **da PSW** |
| 22 | [`app/(app)/opportunities/[id]/page.tsx:62`](app/(app)/opportunities/[id]/page.tsx#L62) e [`lib/opportunities/assignee-actions.ts:43`](lib/opportunities/assignee-actions.ts#L43) | `canAssign = isTenantAdmin(profile) \|\| isPlatformAdmin(profile)` | GUARD | O staff-admin de A não atribui em A, embora as policies de `opportunity_assignees` (§5, itens 1-3) passem a permitir. **Divergência UI × RLS** |
| 23 | [`lib/opportunities/assignee-actions.ts:60`](lib/opportunities/assignee-actions.ts#L60) | `if (!isPlatformAdmin(profile) && opp.tenant_id !== profile.tenantId) return …` | WRITE / erro | Barra a atribuição em A antes da RLS |
| 24 | [`components/shell/Sidebar.tsx:133,240`](components/shell/Sidebar.tsx#L133) | `const isTenantAdmin = profile.role === 'tenant_admin'` gateia os itens Equipe/Configurações | READ (UI) | Os menus de A não aparecem |

### Os que usam `profile.tenantId` **corretamente** e NÃO devem entrar no sweep

Um refactor mecânico de `profile.tenantId` quebraria estes três. O plano precisa listá-los como exclusões explícitas:

| Arquivo:linha | Por que está certo |
|---------------|--------------------|
| [`app/(app)/admin/invites/actions.ts:113`](app/(app)/admin/invites/actions.ts#L113) — `tenantId = profile!.tenantId` quando `role === 'psw_staff'` | É a **regra de lotação** (D-02/D-08 da Phase 17): o staff PSW é sempre lotado no tenant da PSW, e o tenant escolhido no formulário é ignorado de propósito. O comentário de 9 linhas acima explica a premissa. Trocar isto quebra a criação de staff |
| [`app/(app)/opportunities/[id]/page.tsx:68`](app/(app)/opportunities/[id]/page.tsx#L68) — `fetchAssignableProfilesForPlatformAdmin(opportunity.tenant_id, profile!.tenantId)` | O 2º argumento é "o tenant da PSW", derivado do `platform_admin` logado por construção — mesma premissa documentada |
| Todo `lib/opportunities/*-actions.ts` (`note-actions:60,95`, `risk-actions:79,144,190`, `task-actions:99,173,221,280`, `document-actions:61`) | Já usam `resolveWriteTenantId(profile, opportunityId)` + `WRITE_SCOPE_DENIED_MESSAGE`. Quando a RLS alargar, eles alargam junto **sem edição** (D-M). **Não reescrever.** |

### O padrão a replicar — uma camada acima

`resolveWriteTenantId()` resolve o tenant-alvo a partir de uma **oportunidade**. As telas de admin não têm oportunidade; têm uma **empresa**. O par correto, em `lib/security/role.ts` (fonte única, D-11/D-O):

```ts
/**
 * Espelha o predicado SQL `is_tenant_admin_of(t uuid)` (migration 0045) —
 * mantenha os dois em sincronia, como já acontece com
 * isPlatformAdmin()/is_platform_admin().
 *
 * true quando (a) o profile é `tenant_admin` e `tenantId` é o tenant dele
 * (byte-equivalente ao gate atual `isTenantAdmin()` — D-J), ou (b) o profile é
 * `psw_staff` e existe concessão dele para `tenantId` em `psw_tenant_admins`.
 */
export async function isTenantAdminOf(
  profile: CurrentProfile | null,
  tenantId: string
): Promise<boolean> { /* … */ }

/**
 * Tenant-alvo de uma Server Action de ADMIN. Irmã de resolveWriteTenantId(),
 * uma camada acima: lá o escopo vem da oportunidade, aqui vem da empresa.
 * NUNCA derivar de profile.tenantId (D-K). Devolve null quando a pessoa não
 * administra o tenant pedido — e o chamador DEVE tratar null como erro ANTES
 * de mutar. É este early return que elimina o sucesso silencioso.
 */
export async function resolveAdminTenantId(
  profile: CurrentProfile,
  requestedTenantId: string | undefined
): Promise<string | null> { /* … */ }

export const ADMIN_SCOPE_DENIED_MESSAGE =
  'Empresa não encontrada ou fora do seu escopo de administração.';
```

Três observações de projeto:

1. **`isTenantAdminOf` é assíncrona** (precisa consultar `psw_tenant_admins`), enquanto `isTenantAdmin` é síncrona. Isso é bom: força o revisor a olhar cada call site em vez de trocar por sed. Os 24 pontos acima precisam ser tocados um a um de qualquer forma.
2. **A leitura de `psw_tenant_admins` pelo servidor funciona sem service-role** graças à policy `psw_tenant_admins_select` (`profile_id = auth.uid()`, §5). Nada de client privilegiado numa Server Action.
3. **De onde vem o `requestedTenantId`.** `resolveEmpresaSlug()` de [`lib/tenants/scope.ts`](lib/tenants/scope.ts) já resolve o slug a partir de `?empresa=` com fallback no cookie `coe_empresa`, e a Sidebar já preserva `?empresa=` ao navegar entre abas `/admin` ([`Sidebar.tsx:150-155`](components/shell/Sidebar.tsx#L150)). O caminho de menor invenção é: slug → `fetchTenantIdBySlug()` → `resolveAdminTenantId()`. O que **não** pode acontecer é o `tenant_id` chegar por campo de formulário sem revalidação — o comentário de cabeçalho de [`team/actions.ts:8-10`](app/(app)/team/actions.ts#L8) diz que `tenant_id` "NUNCA vem do formulário", e essa disciplina deve ser mantida invertendo a fonte, não relaxando a regra.

### O teste que prova que o silêncio acabou

Para os 5 itens marcados **WRITE / silêncio** (#4, #9, #12, #14, e por extensão #2), a asserção `error === null` é inútil. A regra já escrita em [`tests/security/psw-staff-isolation.test.ts:606-611`](tests/security/psw-staff-isolation.test.ts#L606) — *"`error === null` sozinho NUNCA prova que uma escrita persistiu … TODA afirmação de sucesso relê a linha por `serviceRoleClient()`"* — é exatamente o instrumento. Ver §7.

## 7. Testes de RLS — o que existe hoje e como escrever os novos

### Como RLS é testada aqui hoje (fatos, nomes reais)

Não há mock de Supabase em lugar nenhum. **Todo spec de RLS autentica com JWT real contra um Postgres real** — é o padrão do projeto desde a Phase 7.5, declarado em [`tests/security/psw-staff-isolation.test.ts:30-33`](tests/security/psw-staff-isolation.test.ts#L30).

| Peça | Localização real | O que expõe |
|------|------------------|-------------|
| Clients | `tests/setup/supabase-test-client.ts` | `serviceRoleClient()`, `authedClient(email, password)` |
| Seed | `tests/setup/seed-test-tenants.ts` | `FGCOOP_TEST_ID` (`1111…`), `ACME_TEST_ID` (`2222…`), `PSW_TEST_ID` (`3333…`), `FGCOOP_TEST_EMAIL`, `ACME_TEST_EMAIL`, `PSW_STAFF_TEST_EMAIL`, `TEST_PASSWORD`, `seedTestTenants()`, `cleanupTestTenants()` |
| Atalhos de papel | `tests/helpers/auth-as.ts` | `asFgcoop()`, `asAcme()`, **`asPswStaff()`**, `asService` |
| Suíte de referência | `tests/security/psw-staff-isolation.test.ts` (1156 linhas) | fixture X/Y/Z, `CONTROL_TENANT_ID` (`eeee0000…`), `PLATFORM_ADMIN_TEST_EMAIL` |
| Outras suítes de isolamento | `tests/security/tenant-isolation.test.ts`, `platform-admin-cross-tenant.test.ts`, `opportunity-risks-isolation.test.ts`, `opportunity-tasks-isolation.test.ts`, `unidasul-isolation.test.ts`, `is-platform-admin.test.ts` | precedentes de "papel X não vê tenant Y" |
| Paridade SQL × TS | `tests/schema/score-parity.test.ts`, `tests/schema/score-rule.test.ts` | precedente de "função do client ≡ função SQL" |
| Runner | `vitest.config.ts` | `pool: 'forks'`, `singleFork: true`, `sequence.concurrent: false`, `testTimeout: 30_000`, `globalSetup: tests/setup/global-setup.ts` |
| Comandos | `package.json` | `npm test` (`vitest run`), `npm run test:security` (`vitest run tests/security`), `npm run typecheck` (`tsc --noEmit`) |
| Skip sem banco | padrão do arquivo | `const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)` + `describe.skipIf(!HAS_DB)(…)` |

Três padrões desta base que os testes novos **têm** que herdar:

1. **Releitura obrigatória por service-role.** *"REGRA INEGOCIÁVEL … nenhum spec pode concluir sucesso de uma escrita apenas por `error === null` — é obrigatório reler a linha via `serviceRoleClient()` e comparar o valor observado"* ([`psw-staff-isolation.test.ts:26-29`](tests/security/psw-staff-isolation.test.ts#L26)).
2. **Promoção temporária de papel dentro de `describe` aninhado**, com `afterAll` que reverte — ver os blocos `gate de viewer (D-13)` ([:988-1002](tests/security/psw-staff-isolation.test.ts#L988)) e `invited_emails` ([:1031-1043](tests/security/psw-staff-isolation.test.ts#L1031)), que promovem e despromovem o usuário FGCoop compartilhado.
3. **Prefixo de UUID próprio por suíte** para não colidir sob `singleFork` ([:52-53](tests/security/psw-staff-isolation.test.ts#L52)). Prefixos já em uso: `1111…`/`2222…`/`3333…` (tenants), `aaaa0000…` (oportunidades da suíte 17), `eeee0000…` (tenant de controle).

### O obstáculo estrutural, e a decisão que ele força

Existe **um único** usuário `psw_staff` de teste (`PSW_STAFF_TEST_EMAIL`). Os testes (a) *"sem concessão vê o mesmo de antes"* e (c) *"com concessão em A vê A"* são **estados mutuamente exclusivos do mesmo usuário**. Pior: a suíte da Phase 17 afirma, **no nível de topo**, que `asPswStaff()` enxerga exatamente `[X, Z]` ([:410-419](tests/security/psw-staff-isolation.test.ts#L410), [:1104-1121](tests/security/psw-staff-isolation.test.ts#L1104)). Uma linha de concessão em `psw_tenant_admins` que sobreviva a um `afterAll` faz **X, Y e mais o que houver no FGCoop** aparecerem, e aquelas asserções quebram — num arquivo que esta fase não deveria tocar.

**Recomendação: arquivo novo, não extensão.** `tests/security/psw-staff-admin-grant.test.ts`, com:
- prefixo de UUID próprio — `bbbb0000-0000-0000-0000-00000000000N` para oportunidades e `cccc0000-…-0001` se um tenant terceiro for necessário (não colide com `1111/2222/3333/aaaa0000/eeee0000`);
- `afterAll` que faz `sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId)` **incondicionalmente** — é a linha mais importante do arquivo, porque `singleFork` + `sequence.concurrent: false` significa que um vazamento contamina toda suíte posterior;
- reuso de `seedTestTenants()`, `asPswStaff()`, `asFgcoop()`, `serviceRoleClient()` — nada de fixture paralela.

### (a) "psw_staff **sem** concessão vê o mesmo de antes" — GRANT-02 / SC-4

Não hardcodar número. Medir baseline com o mesmo cliente, no mesmo arquivo, e comparar depois de conceder **e** revogar. Isso prova as duas metades de GRANT-02 e GRANT-08 de uma vez:

```ts
let baselineIds: string[] = [];

it('a1) sem concessão, o conjunto visível é exatamente o de atribuição (baseline)', async () => {
  const { client } = await asPswStaff();
  const { data, error } = await client.from('opportunities').select('id');
  expect(error).toBeNull();
  baselineIds = (data ?? []).map((r) => r.id).sort();

  // O negativo decisivo herdado da Phase 17: a oportunidade NÃO atribuída do
  // tenant A não pode estar no baseline.
  expect(baselineIds).not.toContain(OPP_A_NAO_ATRIBUIDA);
});

// … describe aninhado que concede … e depois:

it('a2) após revogar, o conjunto visível volta EXATAMENTE ao baseline', async () => {
  const { client } = await asPswStaff();
  const { data } = await client.from('opportunities').select('id');
  expect((data ?? []).map((r) => r.id).sort()).toEqual(baselineIds);
});
```

Complemento **estático** (não depende de banco, roda em modo unit-only): um teste que lê `supabase/migrations/0044_psw_staff_only_assigned.sql` + a `0046` e afirma que os dois primeiros disjuntos da restritiva permanecem literalmente `current_user_role() is distinct from 'psw_staff'` e `… in (select current_assigned_opportunity_ids())`. É o mesmo espírito de `tests/schema/*-rule.test.ts` e pega o caso "alguém 'simplificou' a restritiva".

### (b) "contagens de `member` / `tenant_admin` inalteradas" — GRANT-10 / SC-12

A escolha de tenant importa: a concessão é **no FGCoop**, então o `member` do FGCoop é a testemunha mais próxima possível do risco.

```ts
let memberBaseline = 0;
let tenantAdminBaseline = 0;

it('b1) baseline de member e de tenant_admin do FGCoop, ANTES de existir concessão', async () => {
  const { client } = await asFgcoop();                       // role 'member'
  const { count } = await client.from('opportunities')
    .select('id', { count: 'exact', head: true });
  memberBaseline = count ?? -1;
  expect(memberBaseline).toBeGreaterThan(0);                 // testemunha viva
});

// … dentro do describe que concede ao staff admin do FGCoop:
it('b2) com a concessão ATIVA, a contagem do member do FGCoop não se move', async () => {
  const { client } = await asFgcoop();
  const { count } = await client.from('opportunities')
    .select('id', { count: 'exact', head: true });
  expect(count).toBe(memberBaseline);
});
```

Para `tenant_admin`, promover o usuário FGCoop dentro de um `describe` aninhado com `afterAll` que devolve a `'member'` — **exatamente** o padrão de [`psw-staff-isolation.test.ts:1031-1043`](tests/security/psw-staff-isolation.test.ts#L1031) — e repetir baseline/pós-concessão. Este é o teste que prova a byte-equivalência do D-J na prática, e ele é mais forte que ler o SQL.

Três não-regressões adicionais, baratas e de alto valor (cobrem o modo de falha da §5):

```ts
it('b3) tenant_admin do FGCoop CONTINUA sem conseguir convidar psw_staff (0041 preservada)', async () => {
  const { client } = await asFgcoop();  // promovido a tenant_admin no describe
  const { error } = await client.from('invited_emails').insert({
    email: 'tentativa-psw-staff-18@test.local',
    tenant_id: FGCOOP_TEST_ID,
    role: 'psw_staff',
  });
  expect(error).not.toBeNull();          // ← quebra se a 0029:53 for ressuscitada
});

it('b4) tenant_admin continua convidando papéis legítimos do próprio tenant', async () => { /* role: member → ok */ });

it('b5) tenant_admin do FGCoop continua SEM ver invited_emails do Acme', async () => { /* → [] */ });
```

### (c) "staff-admin de A vê A, não vê B" — GRANT-03 / GRANT-06 / SC-5

```ts
describe('com concessão no tenant A (FGCoop)', () => {
  beforeAll(async () => {
    const { error } = await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: adminUserId,
    });
    if (error) throw new Error(`setup falhou (concessão): ${error.message}`);
  });

  afterAll(async () => {
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('c1) POSITIVO DECISIVO — passa a ver a oportunidade de A que NÃO lhe foi atribuída', async () => {
    const { client } = await asPswStaff();
    const { data, error } = await client.from('opportunities').select('id')
      .eq('id', OPP_A_NAO_ATRIBUIDA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);   // era [] no baseline (a1) — a diferença É a fase
  });

  it('c2) não perde de vista o atribuído em OUTRA empresa (Acme)', async () => {
    const { client } = await asPswStaff();
    const { data } = await client.from('opportunities').select('id, tenant_id')
      .eq('id', OPP_B_ATRIBUIDA);
    expect(data).toHaveLength(1);
  });

  it('c3) NEGATIVO DECISIVO — nada do tenant C, onde não há concessão nem atribuição', async () => {
    const { client } = await asPswStaff();
    const { data, error } = await client.from('opportunities').select('id')
      .eq('tenant_id', CONTROL_TENANT_ID);
    expect(error).toBeNull();
    expect(data).toEqual([]);       // o "tenant A não vê tenant B" do docs/PROJETO.md
  });

  it('c4) as 7 tabelas filhas propagam a concessão', async () => { /* it.each(CHILD_TABLES) */ });

  it('c5) escreve em A com releitura por service-role — não é sucesso silencioso', async () => {
    const { client } = await asPswStaff();
    const novo = `branding staff-admin ${Date.now()}`;
    const { error } = await client.from('opportunities')
      .update({ observacao: novo }).eq('id', OPP_A_NAO_ATRIBUIDA);
    expect(error).toBeNull();
    const { data } = await sb.from('opportunities')
      .select('observacao').eq('id', OPP_A_NAO_ATRIBUIDA).single();
    expect(data?.observacao).toBe(novo);   // ← a releitura obrigatória
  });

  it('c6) D-B — o staff-admin NÃO consegue conceder a ninguém, nem a si', async () => {
    const { client } = await asPswStaff();
    const { error } = await client.from('psw_tenant_admins')
      .insert({ profile_id: pswStaffUserId, tenant_id: ACME_TEST_ID });
    expect(error).not.toBeNull();          // RLS, não UI
  });

  it('c7) D-B — nem revogar', async () => {
    const { client } = await asPswStaff();
    const { data } = await client.from('psw_tenant_admins')
      .delete().eq('tenant_id', FGCOOP_TEST_ID).select('id');
    expect(data ?? []).toEqual([]);
    const { count } = await sb.from('psw_tenant_admins')
      .select('id', { count: 'exact', head: true }).eq('profile_id', pswStaffUserId);
    expect(count).toBe(1);                 // continua lá
  });
});
```

Note `c6`/`c7`: um é erro explícito (`with check` de INSERT), o outro é **zero linhas em silêncio** (`using` de DELETE). Testar os dois é obrigatório — o segundo é a forma que a RLS toma quando nega uma remoção, e afirmá-lo só por `error` daria falso verde.

### Testes fora do banco

| Alvo | Arquivo sugerido | Precedente real |
|------|------------------|-----------------|
| `isTenantAdminOf()` (TS) ≡ `is_tenant_admin_of()` (SQL) | `tests/schema/tenant-admin-parity.test.ts` | `tests/schema/score-parity.test.ts` (mesma disciplina de "as duas fontes não podem divergir") |
| `isTenantAdminOf` byte-equivalente a `isTenantAdmin` para `tenant_admin` | mesmo arquivo | `tests/security/is-platform-admin.test.ts` |
| Contagem de "quantas oportunidades a pessoa deixa de ver" (D-G) | `tests/opportunities/…` (lógica pura) | `tests/opportunities/kpis.test.ts` |
| `lib/database.types.ts` reflete `psw_tenant_admins` | — | `npm run typecheck` (`tsc --noEmit`) |

### O que **não** fazer

- Não editar `tests/security/psw-staff-isolation.test.ts` para "acomodar" a concessão. Aquele arquivo é a prova viva de GRANT-02 e o rodapé dele ([:1150-1155](tests/security/psw-staff-isolation.test.ts#L1150)) diz *"suíte completa para a Phase 17"*. Se ele quebrar, a resposta é que a fase quebrou algo — não que ele precisa ser afrouxado.
- Não criar um segundo usuário `psw_staff` "para facilitar". Isso duplicaria o seed compartilhado e mascararia o cenário real (a mesma pessoa com concessão em A e atribuição em B) que GRANT-03 descreve.
- Não afirmar sucesso de escrita por `error === null`.

## Architectural Responsibility Map

| Capacidade | Camada primária | Camada secundária | Racional |
|------------|-----------------|-------------------|----------|
| "Esta pessoa é admin deste tenant?" | **Banco (RLS / `is_tenant_admin_of()`)** | Servidor (`isTenantAdminOf()`) | O bloqueio real é o banco (docs/PROJETO.md §1). O servidor espelha para decidir UI/roteamento, nunca para autorizar sozinho — o mesmo par `isPlatformAdmin()`/`is_platform_admin()` já existe |
| Conceder / revogar concessão | **Banco (policies de `psw_tenant_admins`)** | Server Action + UI | D-B exige garantia por RLS, não por UI. A UI é conveniência |
| Escopo de leitura de oportunidades | **Banco (permissivas + restritiva)** | — | Nenhuma query da app pode ampliar o que a RLS nega |
| Tenant-alvo de uma escrita de admin | **Servidor (`resolveAdminTenantId()`)** | Banco (`with check`) | O servidor decide *onde* escrever; o banco decide *se pode*. Derivar do `profile` é o bug D-K |
| Empresa selecionada (contexto de trabalho) | **Servidor (`resolveEmpresaSlug()` + cookie)** | URL `?empresa=` | Já existe; não inventar um segundo seletor |
| Diagnóstico "por que fulano vê isto?" | **Servidor (Server Component `/admin/staff`)** | Banco (RLS da 0021) | O `platform_admin` já lê `psw_tenant_admins` e `opportunity_assignees` cross-tenant; a tela é quase só UI sobre dado que ele já pode ler (D-N) |
| Contagem "quantas oportunidades perde ao revogar" | **Servidor (runtime)** | — | Derivado; nunca persistido (docs/PROJETO.md §3) |
| Guard de `/admin/*` | **Servidor (`app/(app)/admin/layout.tsx`)** | Banco | Já existe; `/admin/staff` herda sem plumbing novo |

**Erro de camada a evitar:** implementar "o staff-admin vê o tenant A" filtrando no servidor (`.eq('tenant_id', …)` a partir da lista de concessões) em vez de na RLS. Passaria em toda demo e vazaria na primeira query que esquecesse o filtro — é literalmente o que a regra nº 1 do `docs/PROJETO.md` proíbe.

## Standard Stack

Fase **sem dependência externa nova**. Nenhum pacote é instalado, então a seção de auditoria de legitimidade de pacotes não se aplica (ver `## Package Legitimacy Audit` abaixo).

### Core (já no projeto, versões do `package.json` do `main`)

| Biblioteca | Versão | Papel nesta fase | Por que é o padrão |
|------------|--------|------------------|--------------------|
| PostgreSQL (Supabase Cloud) | gerenciado | RLS PERMISSIVE/RESTRICTIVE, funções `stable`/`security definer` | É o motor de isolamento do projeto desde a `0001` |
| `next` | `16.2.6` | App Router, Server Components, Server Actions | Stack decidida no `docs/PROJETO.md` |
| `react` / `react-dom` | `19.2.4` | UI da `/admin/staff` | — |
| `@supabase/supabase-js` | `^2.106.1` | client de leitura/escrita | — |
| `@supabase/ssr` | `^0.10.3` | client server-side com cookies | — |
| `typescript` | `^5` (`strict`) | `lib/database.types.ts` hand-maintained | type-gen bloqueado |
| `vitest` | `^3.2.0` | suíte de RLS contra banco real | — |
| `zod` | `^4.4.3` | validação de payload das actions novas | já usado no projeto |
| `tailwindcss` | `^4` | UI | — |

### Alternativas consideradas

| Em vez de | Poderia usar | Tradeoff |
|-----------|--------------|----------|
| Tabela `psw_tenant_admins` | Coluna `admin_tenant_ids uuid[]` em `profiles` | Rejeitado por D-D e por design: array não tem FK, não tem `granted_by`/`granted_at` por linha, e `t = any(col)` não indexa bem sem GIN. A tabela é a forma normal |
| `is_tenant_admin_of(t)` booleana | `tenant_id in (select effective_admin_tenant_ids())` escrito à mão nas 11 policies | Rejeitado por D-I: 11 reescritas à mão é como uma fica esquecida. A recomendação da §4 dá **as duas coisas** — helper único e o plano do `IN (SELECT …)` — via inlining |
| Nova migration reescrevendo as policies da `0044` | `ALTER POLICY` | `ALTER POLICY` não é idempotente sob reaplicação nem sobrevive a "a policy não existe ainda". O padrão do projeto (`drop if exists` + `create`) é superior aqui |
| `psw_tenant_admins` com PK composta `(profile_id, tenant_id)` | `id uuid` + `unique (profile_id, tenant_id)` | **Recomendado o segundo**, espelhando `opportunity_assignees` (`0032:33-39`): um `id` único deixa o form de revogação carregar um só campo, e o `unique` dá a mesma garantia |

**Instalação:** nenhuma. `npm install` não é executado nesta fase.

## Package Legitimacy Audit

**Não aplicável — esta fase não instala nenhum pacote externo.** Toda a implementação usa SQL, o schema existente e as bibliotecas já presentes no `package.json` do `main`. Nenhum nome de pacote foi sugerido, portanto não há verdicts `OK` / `SUS` / `SLOP` a reportar.

- Pacotes removidos por verdict `[SLOP]`: nenhum
- Pacotes sinalizados `[SUS]`: nenhum

## Architecture Patterns

### Diagrama — de onde vem a visibilidade de uma linha

```
                      ┌──────────────── SESSÃO ────────────────┐
   login  ──────────► │ auth.uid()                             │
                      │   ├─ current_tenant_id()   (0001, def) │
                      │   ├─ current_user_role()   (0015, def) │
                      │   ├─ is_platform_admin()   (0021, def) │
                      │   ├─ current_assigned_opportunity_ids() (0040, def)
                      │   └─ current_admin_tenant_ids()  ◄── NOVO (0045, def)
                      └────────────────┬───────────────────────┘
                                       │
                          effective_admin_tenant_ids()  ◄── NOVO (0045, def)
                             = {tenant próprio se tenant_admin}
                             ∪ {tenants concedidos se psw_staff}
                                       │
                          is_tenant_admin_of(t)  ◄── NOVO (0045, inlineável)
                             = t ∈ conjunto acima
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  ┌───────────────┐          ┌───────────────────┐         ┌──────────────────┐
  │ PERMISSIVAS   │  OR      │ PERMISSIVAS       │  OR     │ PERMISSIVAS      │
  │ por tenant    │          │ por atribuição    │         │ por concessão    │
  │ (0001/0011/   │          │ (0040/0041)       │         │  ◄── NOVAS (0046)│
  │  0015/0018/   │          │ id ∈ atribuídas   │         │ is_tenant_admin_ │
  │  0037/0025)   │          │                   │         │   of(tenant_id)  │
  └───────┬───────┘          └─────────┬─────────┘         └────────┬─────────┘
          └────────────────────────────┴────────────────────────────┘
                                       │  (OR de todas)
                                       ▼
                        ┌──────────────────────────────┐
                        │  AND                          │
                        │  RESTRITIVA da 0044           │
                        │   papel ≠ psw_staff           │
                        │   OR id ∈ atribuídas          │
                        │   OR tenant_id ∈ concedidos ◄─┼── NOVO (0046)
                        └──────────────┬───────────────┘
                                       ▼
                              linha visível / gravável
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  fetchOpportunities()        Server Action de admin           /admin/staff
  (RLS decide)                resolveAdminTenantId()           (visão diagnóstica)
                              → null ⇒ ADMIN_SCOPE_DENIED       lê 2 origens
                              → id   ⇒ .eq('tenant_id', id)     separadas (D-F)
```

O ponto que o diagrama torna óbvio e que a leitura em prosa esconde: **os dois blocos novos estão em lados opostos do `AND`**. É por isso que um sem o outro não faz nada (§1).

### Pattern 1 — Policy aditiva com short-circuit de papel

**O quê:** toda policy nova começa por um predicado que é falso para os papéis não afetados, garantindo que o planner descarte cedo e que a policy jamais conceda nada de novo a quem não é alvo.
**Quando usar:** sempre que a fase acrescentar acesso sem poder alterar comportamento existente (GRANT-10).
**Exemplo (o padrão que a `0040` estabeleceu e que esta fase herda):**

```sql
-- Fonte: supabase/migrations/0040_psw_staff_access_core.sql:192-197
create policy opportunities_select_psw_staff on opportunities
  for select using (
    current_user_role() = 'psw_staff'          -- short-circuit: demais papéis saem aqui
    and id in (select current_assigned_opportunity_ids())
  );
```

Na fase 18 o short-circuit fica **dentro** de `effective_admin_tenant_ids()` (o ramo `psw_staff` só produz linhas se `current_user_role() = 'psw_staff'`), o que mantém a propriedade sem repetir o gate em 26 policies.

### Pattern 2 — Laço sobre tabelas com o predicado idêntico

**O quê:** um `do $$ … foreach … $$` que cria N policies com o mesmo texto, protegido por `to_regclass()` e por checagem de coluna.
**Quando usar:** sempre que o mesmo predicado valer para 3+ tabelas.
**Fonte:** [`0044:87-131`](supabase/migrations/0044_psw_staff_only_assigned.sql#L87) — o comentário `:83-86` diz o porquê: *"Laço em vez de 7 blocos repetidos … repetir à mão é como uma tabela acaba esquecida"*. A §1 estende este laço com uma lista de verbos por tabela e troca `continue` por `raise exception` na ausência de `tenant_id`.

### Pattern 3 — Escopo resolvido no servidor, com early return

**O quê:** a action nunca deriva o tenant do `profile`; resolve, e se `null`, retorna erro **antes** de mutar.
**Fonte:** [`lib/security/role.ts:193-209`](lib/security/role.ts#L193) e os 10 call sites em `lib/opportunities/*-actions.ts`.

```ts
// Fonte: lib/opportunities/risk-actions.ts:79-86 (o padrão a replicar)
const tenantId = await resolveWriteTenantId(profile, opportunityId);
if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };
// … insert({ tenant_id: tenantId, … })  ← server-derived, nunca profile.tenantId
```

### Pattern 4 — Trigger de coerência como única barreira que sobrevive ao service-role

**O quê:** invariantes que devem valer mesmo para escritas com `service_role` moram em trigger, não em policy.
**Fonte:** [`check_assignee_tenant()` (0040:134-176)](supabase/migrations/0040_psw_staff_access_core.sql#L134) e `check_task_tenant_coherence()` (0041). O comentário `0040:117-119` explica: *"sobrevive inclusive a uma escrita por service-role"*.
**Aplicação nesta fase:** `psw_tenant_admins` precisa do seu — ver Don't Hand-Roll.

### Pattern 5 — A visão diagnóstica das duas origens (D-F / GRANT-07)

A pergunta que a tela responde é *"por que fulano vê isto?"*. As duas origens vêm de tabelas diferentes e **não** devem ser somadas:

```ts
// Origem 1 — empresas administradas (a concessão)
const { data: grants } = await supabase
  .from('psw_tenant_admins')
  .select('id, tenant_id, granted_at, tenants(name, slug)')
  .eq('profile_id', staffId);

// Origem 2 — atribuições individuais (leitura + link; NUNCA escrita — D-C)
const { data: assignments } = await supabase
  .from('opportunity_assignees')
  .select('opportunity_id, tenant_id, opportunities(processo, seq_id)')
  .eq('profile_id', staffId);

// Redundância: atribuição DENTRO de empresa administrada não acrescenta acesso.
const grantedTenants = new Set((grants ?? []).map((g) => g.tenant_id));
const redundantes = (assignments ?? []).filter((a) => grantedTenants.has(a.tenant_id)).length;

// D-G — quantas oportunidades a pessoa deixa de ver ao revogar o tenant T:
//   |oportunidades visíveis de T| − |atribuídas nominalmente a ela em T|
// Calculado em RUNTIME, na hora de abrir o diálogo. Nunca persistido
// (mesma regra do score — docs/PROJETO.md §3).
```

O `platform_admin` lê ambas cross-tenant pela RLS da `0021` — nenhuma policy nova é necessária para a tela (D-N).

### Anti-padrões a evitar

- **Acrescentar o disjunto só na restritiva.** Inerte (§1). É o anti-padrão nº 1 desta fase porque tem a aparência exata de estar certo.
- **`for all` uniforme nas 8 tabelas.** Daria ao staff-admin `UPDATE`/`DELETE` em `opportunity_history` (append-only para todos) — mais que um `tenant_admin`, violando D-A.
- **Castar segmento de path para `uuid` em policy de `storage.objects`.** Derruba a policy para **todos** os usuários no primeiro objeto fora da convenção ([`0041:295-300`](supabase/migrations/0041_psw_staff_child_access.sql#L295)).
- **Reescrever as 11 policies a partir dos números de linha do CONTEXT.** Ressuscita a `0029:53` e reabre a escalada de privilégio (§5).
- **`is_tenant_admin_of()` como `security definer` + `set search_path`.** Mata o inlining e transforma o predicado em varredura aninhada (§4).
- **Filtrar por concessão no servidor em vez da RLS.** Viola docs/PROJETO.md §1.
- **Sweep mecânico de `profile.tenantId`.** Quebra `admin/invites/actions.ts:113` (regra de lotação) — §6.
- **Um segundo ponto de escrita de atribuição na `/admin/staff`.** Proibido por D-C; deixaria `check_assignee_tenant()` como única barreira de coerência.

## Don't Hand-Roll

| Problema | Não construir | Usar | Por quê |
|----------|---------------|------|---------|
| "De quais tenants sou admin?" | Uma query de `psw_tenant_admins` repetida em cada policy | `current_admin_tenant_ids()` / `effective_admin_tenant_ids()` (`0045`) | Repetir a subconsulta em 26 policies é divergência garantida; e só a forma `setof` + `in (select …)` vira subplano avaliado 1×/statement (`0040:70-82`) |
| "É admin deste tenant?" | 11 predicados reescritos à mão | `is_tenant_admin_of(t)` | D-I: reescrever à mão é como um fica esquecido |
| Criar N policies iguais | 8 blocos copiados | o laço `do $$ … foreach $$` da `0044` | `0044:83-86` |
| Resolver o tenant-alvo de uma escrita | `.eq('tenant_id', profile.tenantId)` | `resolveWriteTenantId()` (oportunidade) / `resolveAdminTenantId()` (empresa) | O sucesso silencioso está documentado em `role.ts:148-155`; um segundo mecanismo divergiria |
| Impedir concessão a papel errado | Validação só na Server Action | **trigger de coerência** em `psw_tenant_admins` | Uma concessão para um `member` seria aceita pela FK e **não faria nada** (o ramo `psw_staff` de `effective_admin_tenant_ids()` exige o papel) — um no-op silencioso, exatamente a classe de bug que a fase combate. O trigger é o análogo direto de `check_assignee_tenant()` e sobrevive ao service-role |
| Guard de `/admin/staff` | Um novo check de papel | `app/(app)/admin/layout.tsx` | D-N: já existe e já redireciona |
| Seletor de empresa | Um segundo seletor | `resolveEmpresaSlug()` + cookie `coe_empresa` + `Sidebar.tsx:150-155` | Já resolve URL→cookie e preserva `?empresa=` entre abas admin |
| Allowlist de papel convidável na UI | Um novo array | `AccessRole` de `lib/security/cargo.ts:66-68` | Já exclui `psw_staff`/`platform_admin` com fallback seguro |
| Slug de empresa | `slugify()` novo | o de `admin/invites/actions.ts:57-65` | Já existe, já trata acentos e colisão |

**Insight-chave:** quase tudo que esta fase precisa já foi construído na Phase 17, um nível abaixo. O trabalho é **elevar** o mecanismo de "pessoa × oportunidade" para "pessoa × tenant", não inventar um segundo. Onde a fase inventar forma nova, ela cria duas fontes de verdade que vão divergir — e a divergência aparece como vazamento, não como erro de compilação.

Esboço do trigger recomendado (o único mecanismo genuinamente novo):

```sql
-- 0045 — coerência de papel da concessão. Espelha check_assignee_tenant()
-- (0040:134) na forma: plpgsql, security definer, set search_path, comparação
-- por role::text (padrão da 0021, não depende da ordem de commit do enum).
create or replace function check_psw_tenant_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role tenant_role;
begin
  select role into v_role from profiles where id = new.profile_id;
  if not found then
    raise exception 'Pessoa inexistente.' using errcode = 'foreign_key_violation';
  end if;
  if v_role::text <> 'psw_staff' then
    raise exception 'A concessão de admin de empresa só existe para o papel psw_staff.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists psw_tenant_admins_role_guard on psw_tenant_admins;
create trigger psw_tenant_admins_role_guard
  before insert or update on psw_tenant_admins
  for each row execute function check_psw_tenant_admin_role();
```

> **Consequência a documentar:** se um `psw_staff` com concessões for despromovido a `member`, as linhas antigas continuam na tabela e ficam inertes (o ramo exige o papel). Não é vazamento — é a única direção segura. A tela `/admin/staff` deve sinalizar linhas órfãs assim, e o plano deve decidir se um `after update` em `profiles.role` limpa as concessões ou se isso fica como dívida explícita (recomendação: **deixar inerte + sinalizar na tela**; apagar automaticamente destruiria a informação de que a concessão existia, e a Phase 18 não tem histórico de concessões).

## Runtime State Inventory

Esta fase **não** é rename/refactor/migração de string — é adição de schema. Ainda assim, o modo write-only das migrations cria estado fora do git que precisa ser rastreado:

| Categoria | Encontrado | Ação necessária |
|-----------|------------|-----------------|
| Dados armazenados | Nenhuma tabela existente muda de forma. `psw_tenant_admins` nasce **vazia**; nenhum backfill é possível ou desejável (não há como inferir uma concessão de dado existente) | Nenhuma migração de dado. O primeiro registro é criado pelo `platform_admin` na `/admin/staff` |
| Config de serviço vivo | **As migrations `0045`/`0046` são write-only**: o agente escreve o `.sql`, o PO aplica à mão no SQL Editor do Supabase Cloud. Enquanto não aplicadas, o schema vivo diverge do git | Bloco de verificação pós-apply + bloco de ROLLBACK em cada arquivo, no padrão da `0044:133-175`. Nenhum código de app que dependa da tabela pode ir a produção antes do apply confirmado |
| Estado registrado no SO | Nenhum — sem tarefa agendada, sem processo, sem cron | Nenhuma — verificado por ausência de qualquer referência a scheduler no repo |
| Segredos / env vars | Nenhuma variável nova. `NEXT_PUBLIC_SUPABASE_URL` e a service-role key já existem e são o que habilita a suíte de RLS | Nenhuma |
| Artefatos de build | `lib/database.types.ts` é **hand-maintained** (`npm run gen:types` bloqueado — sem `SUPABASE_ACCESS_TOKEN` privilegiado; o MCP aponta para outro projeto). A tabela nova **não** aparece sozinha | **Task explícita**: acrescentar `psw_tenant_admins` (Row/Insert/Update/Relationships) em `lib/database.types.ts`, no formato de `opportunity_assignees` (`:322-366`), e rodar `npm run typecheck` |
| Deploy | Vercel sem git integration: push na `main` **não** deploya | `vercel deploy --prod` + `vercel alias set <url> coe-hiperautomacao.vercel.app` — o domínio do cliente é alias manual |

Bloco a acrescentar em `lib/database.types.ts` (forma exata, espelhando `opportunity_assignees`):

```ts
      psw_tenant_admins: {
        Row: {
          id: string;
          profile_id: string;
          tenant_id: string;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          tenant_id: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: Partial<{ profile_id: string; tenant_id: string; granted_by: string | null }>;
        Relationships: [
          { foreignKeyName: 'psw_tenant_admins_profile_id_fkey'; columns: ['profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'psw_tenant_admins_tenant_id_fkey';  columns: ['tenant_id'];  referencedRelation: 'tenants';  referencedColumns: ['id'] },
          { foreignKeyName: 'psw_tenant_admins_granted_by_fkey'; columns: ['granted_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
```

## Common Pitfalls

### Pitfall 1 — A fase que aplica limpa e não faz nada

**O que dá errado:** só o disjunto na restritiva da `0044` é acrescentado. `pg_policies` mostra as 8 policies atualizadas, nenhum erro, e o staff-admin vê exatamente o mesmo de antes.
**Por que acontece:** o CONTEXT descreve o trabalho de RLS como "acrescentar o disjunto no laço" (D-L, `<specifics>`), e a frase está tecnicamente correta mas **incompleta**. RESTRICTIVE só subtrai.
**Como evitar:** as duas metades na mesma migration (`0046`), e o teste `c1` (§7) como gate — ele afirma que a oportunidade de A **não atribuída** passa de invisível a visível. Nenhum outro teste pega isto.
**Sinal de alerta:** `select count(*) from pg_policies where policyname like '%_psw_admin'` devolve 0.

### Pitfall 2 — Ressuscitar a `0029:53` e reabrir escalada de privilégio

**O que dá errado:** `invited_emails_insert_tenant_admin` volta à versão sem `role not in ('platform_admin','psw_staff')`; um `tenant_admin` de cliente passa a poder convidar um `psw_staff` pela API.
**Por que acontece:** o CONTEXT lista `0029:53` como um dos "17 predicados", mas essa policy foi substituída pela `0041:444-449`.
**Como evitar:** enumerar as 11 policies **por nome** (§5), e no ROLLBACK reaplicar o BLOCO 6b da `0041` **por último**.
**Sinal de alerta:** o teste `b3` (§7) / `ACCESS-09` da suíte 17 fica vermelho — ou, pior, não existe.

### Pitfall 3 — `is_tenant_admin_of()` como `security definer` + `set search_path`

**O que dá errado:** a função vira caixa-preta chamada por linha varrida, com subconsulta interna reconstruída a cada chamada. A lista de oportunidades fica lenta sob carga e ninguém liga isso à fase.
**Por que acontece:** as 4 helpers existentes são todas `security definer` + `set search_path`, então copiar a forma parece o certo.
**Como evitar:** §4 — definer fica nas helpers sem argumento; o booleano é fino, `stable`, sem `set`, com chamadas schema-qualificadas.
**Sinal de alerta:** `EXPLAIN (analyze)` mostra `Function Scan on is_tenant_admin_of` com `loops` proporcional às linhas, em vez de um `Hashed SubPlan`.

### Pitfall 4 — Sucesso silencioso nas telas de admin

**O que dá errado:** o staff-admin de A troca a cor da empresa, vê "salvo com sucesso", e nada muda.
**Por que acontece:** `.eq('id', profile.tenantId)` casa zero linhas; o Supabase devolve `error: null`; a action retorna `{ ok: true }`.
**Como evitar:** `resolveAdminTenantId()` com early return + `ADMIN_SCOPE_DENIED_MESSAGE` (§6), e teste com **releitura por service-role** (§7, `c5`).
**Sinal de alerta:** qualquer action de admin que ainda mencione `profile.tenantId` fora das 3 exclusões listadas na §6.

### Pitfall 5 — Concessão vazando entre arquivos de teste

**O que dá errado:** uma linha em `psw_tenant_admins` sobrevive ao `afterAll` e a suíte da Phase 17 quebra em asserções que a fase 18 não tocou.
**Por que acontece:** `pool: forks` + `singleFork: true` + `sequence.concurrent: false` — tudo roda no mesmo banco, em sequência, com um único usuário `psw_staff`.
**Como evitar:** arquivo novo, prefixo de UUID próprio, `afterAll` com `delete().eq('profile_id', pswStaffUserId)` incondicional.
**Sinal de alerta:** `psw-staff-isolation.test.ts` vermelho em `psw_staff só enxerga as oportunidades atribuídas (X e Z)`.

### Pitfall 6 — Cast de path em `storage.objects`

**O que dá errado:** `((storage.foldername(name))[1])::uuid` levanta erro de cast em runtime para **qualquer** usuário que tocar um objeto fora da convenção — e a policy inteira cai.
**Por que acontece:** `is_tenant_admin_of()` recebe `uuid`, o segmento é `text`, e o cast parece inofensivo.
**Como evitar:** comparar do lado texto contra `select t::text from effective_admin_tenant_ids() t` (§3), como a `0041:295-300` já ensina.
**Sinal de alerta:** `invalid input syntax for type uuid` nos logs do Storage.

### Pitfall 7 — Enum novo antes do commit (não se aplica, mas quase)

**O que dá errado:** `unsafe use of new value ... of enum type tenant_role`.
**Por que não se aplica:** esta fase **não** cria valor de enum (D-D: a concessão é tabela). O `psw_staff` já foi commitado pela `0039`.
**Por que ainda importa:** se alguém "simplificar" a fase propondo um `role = 'psw_tenant_admin'`, a armadilha da `0040:13-19` volta inteira — junto com a impossibilidade de cardinalidade N que motivou D-D.

### Pitfall 8 — Ordem de apply das migrations write-only

**O que dá errado:** a `0046` roda antes da `0045` estar commitada e falha com "function is_tenant_admin_of does not exist"; ou pior, o código da app vai a produção antes do apply.
**Como evitar:** três arquivos aplicáveis isoladamente, cada um com verificação própria; a `0045` (fundação) tem que ser aplicável e verificável **sem mudar comportamento de ninguém** — a `0044:13-14` e a `0040:55-60` são o precedente de handoff. Nenhum código que referencie `psw_tenant_admins` pode ser deployado antes do apply confirmado.

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | `vitest` `^3.2.0` (+ `@vitest/coverage-v8` `^3.2.0`) |
| Config | `vitest.config.ts` — `environment: 'node'`, `pool: 'forks'`, `poolOptions.forks.singleFork: true`, `sequence.concurrent: false`, `testTimeout/hookTimeout: 30_000`, `globalSetup: ./tests/setup/global-setup.ts`, `setupFiles: ./tests/setup/dom-matchers.ts` |
| Comando rápido (por commit de task) | `npx vitest run tests/security/psw-staff-admin-grant.test.ts` |
| Comando de segurança (por merge de wave) | `npm run test:security` (`vitest run tests/security`) |
| Suíte completa | `npm test` (`vitest run`) + `npm run typecheck` (`tsc --noEmit`) |
| Modo sem banco | `describe.skipIf(!HAS_DB)` com `HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)` — a suíte inteira é pulada, não falsamente verde |

### Requisitos da fase → mapa de testes

| REQ | Comportamento | Tipo | Comando automatizado | Arquivo existe? |
|-----|---------------|------|----------------------|-----------------|
| GRANT-01 | `psw_tenant_admins` existe, N linhas para o mesmo staff, `profiles.tenant_id` intacto | integração (RLS) | `npx vitest run tests/security/psw-staff-admin-grant.test.ts -t "concessão N:N"` | ❌ Wave 0 |
| GRANT-01 | Concessão a papel ≠ `psw_staff` é rejeitada pelo trigger | integração | `… -t "trigger de papel"` | ❌ Wave 0 |
| GRANT-02 | Sem concessão, conjunto visível = baseline; após revogar, volta ao baseline | integração | `… -t "baseline"` (specs `a1`/`a2`) | ❌ Wave 0 |
| GRANT-02 | Os 2 disjuntos originais da restritiva da `0044` permanecem literais | schema (estático) | `npx vitest run tests/schema/psw-staff-restrictive-rule.test.ts` | ❌ Wave 0 |
| GRANT-03 | Com concessão em A: vê a oportunidade de A **não atribuída** (`c1`), mantém a atribuída em B (`c2`), nada de C (`c3`), 7 filhas propagam (`c4`) | integração | `… -t "com concessão no tenant A"` | ❌ Wave 0 |
| GRANT-04 | Convites de A: select/insert/delete; branding de A; logs de A | integração | `… -t "poderes de tenant_admin em A"` | ❌ Wave 0 |
| GRANT-04 | Convite de `psw_staff` por staff-admin de A é recusado | integração | `… -t "não cunha psw_staff"` | ❌ Wave 0 |
| GRANT-05 | Escrita em A persiste, com **releitura por service-role** (`c5`) | integração | `… -t "não é sucesso silencioso"` | ❌ Wave 0 |
| GRANT-05 | `resolveAdminTenantId()` devolve `null` fora do escopo | unidade | `npx vitest run tests/security/resolve-admin-tenant.test.ts` | ❌ Wave 0 |
| GRANT-06 | Staff-admin não insere (`c6`) nem apaga (`c7`) em `psw_tenant_admins` | integração | `… -t "D-B"` | ❌ Wave 0 |
| GRANT-07 | Duas origens separadas + contagem de redundantes | unidade (lógica pura) | `npx vitest run tests/opportunities/staff-access-origins.test.ts` | ❌ Wave 0 |
| GRANT-08 | Contagem "quantas deixa de ver" correta; atribuição sobrevive à revogação | unidade + integração | `… -t "revogação"` | ❌ Wave 0 |
| GRANT-09 | A tela de admin não escreve em `opportunity_assignees` | manual/UAT + revisão de código | grep: nenhum `from('opportunity_assignees')` com `insert/update/delete` sob `app/(app)/admin/staff/` | ❌ Wave 0 |
| GRANT-10 | `member` e `tenant_admin` do FGCoop com contagem idêntica antes/depois (`b1`/`b2`) | integração | `… -t "não-regressão"` | ❌ Wave 0 |
| GRANT-10 | `tenant_admin` ainda não convida `psw_staff` (`b3`); suítes existentes verdes | integração | `npm run test:security` | ✅ parcial — `tests/security/psw-staff-isolation.test.ts:1045` já cobre `b3` |
| SC-13 | `lib/database.types.ts` reflete a tabela nova | tipos | `npm run typecheck` | ✅ comando existe |

**Manual-only justificado:** GRANT-07/GRANT-08 têm componente visual (layout das duas origens, texto do diálogo de confirmação quantificada) que não é automatizável de forma útil aqui — o projeto não tem Playwright. A **lógica** por trás (contagem, marcação de redundante) é testável em unidade e deve ser extraída para função pura em `lib/` justamente por isso.

### Sampling rate

- **Por commit de task:** `npx vitest run tests/security/psw-staff-admin-grant.test.ts` (< 30 s).
- **Por merge de wave:** `npm run test:security` + `npm run typecheck`.
- **Gate da fase:** `npm test` inteiro verde **antes** de `/gsd-verify-work`, incluindo `tests/security/psw-staff-isolation.test.ts` **sem nenhuma alteração** — se aquele arquivo precisou ser editado, a fase quebrou algo.

### Wave 0 gaps

- [ ] `tests/security/psw-staff-admin-grant.test.ts` — cobre GRANT-01..06, 08, 10 (arquivo novo, prefixo `bbbb0000…`/`cccc0000…`, `afterAll` que limpa `psw_tenant_admins` incondicionalmente)
- [ ] `tests/schema/psw-staff-restrictive-rule.test.ts` — assert estático sobre o texto da restritiva (GRANT-02)
- [ ] `tests/security/resolve-admin-tenant.test.ts` — unidade de `resolveAdminTenantId()` / `isTenantAdminOf()` (GRANT-05)
- [ ] `tests/schema/tenant-admin-parity.test.ts` — paridade `isTenantAdminOf()` (TS) ≡ `is_tenant_admin_of()` (SQL), no espírito de `tests/schema/score-parity.test.ts`
- [ ] `tests/opportunities/staff-access-origins.test.ts` — lógica pura das duas origens e da contagem de revogação (GRANT-07/08)
- [ ] **Não** é necessário instalar framework nem fixture nova: `seedTestTenants()`, `asPswStaff()`, `asFgcoop()`, `serviceRoleClient()` cobrem tudo

## Security Domain

### Categorias ASVS aplicáveis

| Categoria ASVS | Aplica | Controle padrão nesta fase |
|----------------|--------|----------------------------|
| V1 Arquitetura | sim | Autorização no banco (RLS) como fonte da verdade; servidor espelha, nunca substitui |
| V2 Autenticação | não | Sem mudança — Supabase Auth, `handle_new_user()` (`0022`) intocado |
| V3 Sessão | não | Sem mudança — cookies do `@supabase/ssr` |
| **V4 Controle de Acesso** | **sim — é o objeto da fase** | RLS PERMISSIVE/RESTRICTIVE + `is_tenant_admin_of()`; guard de `/admin` + `isTenantAdminOf()` no servidor. **Nunca** só UI |
| V5 Validação de Entrada | sim | `zod` nas actions novas; `tenant_id` nunca vem do form sem revalidação contra a concessão; `parseRoleAndCargo()` como allowlist |
| V6 Criptografia | não | Nada a criptografar nesta fase |
| V7 Log e Auditoria | parcial | `granted_at`/`granted_by` ficam na linha; `audit_log` (`0038`) pode cobrir depois (deferred) |
| V8 Proteção de Dados | sim | Isolamento multi-tenant é o dado protegido; `psw_tenant_admins_select` não expõe ao cliente quem da PSW o administra |
| V13 API | sim | Server Actions são a superfície; o `with check` do banco é a barreira final |

### Padrões de ameaça conhecidos para esta stack

| Padrão | STRIDE | Mitigação nesta fase |
|--------|--------|----------------------|
| Escalada horizontal (staff-admin de A alcança B) | Elevation of Privilege | `is_tenant_admin_of(tenant_id)` é falso para B; teste `c3` |
| **Escalada lateral (staff-admin promove alguém)** | Elevation of Privilege | `psw_tenant_admins` insert/delete só por `is_platform_admin()`; testes `c6`/`c7` |
| **Escalada por convite (cunhar um `psw_staff`)** | Elevation of Privilege | `role not in ('platform_admin','psw_staff')` na policy de insert (`0041`, **preservado** — §5); teste `b3` |
| Regressão silenciosa em papel existente | Tampering | `is_tenant_admin_of()` byte-equivalente no ramo `tenant_admin` (D-J); testes `b1`/`b2` |
| Confused deputy — action grava no tenant errado | Tampering / Spoofing | `resolveAdminTenantId()` com early return; `with check` do banco |
| Sucesso silencioso mascarando negação | Repudiation | Releitura obrigatória por service-role nos testes; early return nas actions |
| `search_path` hijack em `security definer` | Elevation of Privilege | `set search_path = public` em todas as funções definer; chamadas schema-qualificadas na função não-definer |
| Erro de cast derrubando policy de Storage | Denial of Service | Comparação lado-texto, nunca `::uuid` no segmento de path (§3) |
| Bypass por service-role | Elevation of Privilege | Trigger `check_psw_tenant_admin_role()` — roda mesmo sob service-role |

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|---------------|-----------|--------|----------|
| Node.js + npm | build, testes, typecheck | ✓ | conforme `@types/node ^20` no `package.json` | — |
| `vitest` | suíte de RLS | ✓ | `^3.2.0` (devDependency instalada) | — |
| Supabase Cloud (projeto `vxgthycrjetniejsjmee`) | RLS real, testes de integração | ✓ | gerenciado | — |
| `NEXT_PUBLIC_SUPABASE_URL` + service-role key no ambiente | testes de RLS não serem pulados | ✓ (assumido — `global-setup.ts` e `describe.skipIf` dependem disso) | — | sem elas, `test:security` **passa vazio**; o plano deve tratar "pulado" como falha, não como verde |
| **Apply de migration pelo PO** | `0045`/`0046` entrarem em vigor | ✗ (write-only mode) | — | **Sem fallback** — é `checkpoint:human-action`. Nenhum código dependente pode ir a produção antes |
| `supabase gen types typescript` | `lib/database.types.ts` | ✗ | — | **Manutenção à mão** (bloco pronto na §Runtime State Inventory) |
| MCP Supabase | introspecção do schema | ✗ (aponta para outro projeto) | — | PO roda SQL de introspecção sob demanda |
| Vercel CLI | deploy | ✓ | — | `vercel deploy --prod` + `vercel alias set` (sem git integration; push na `main` não deploya) |
| Playwright / browser automation | UAT visual da `/admin/staff` | ✗ | — | UAT conversacional via `/gsd-verify-work`; lógica extraída para função pura e testada em unidade |

**Dependências ausentes sem fallback:**
- Apply manual das migrations pelo PO — bloqueia a fase inteira até acontecer; o plano deve isolar cada migration para que possa ser aplicada e verificada sozinha.

**Dependências ausentes com fallback:**
- Type-gen → manutenção manual de `lib/database.types.ts` (task explícita).
- MCP/introspecção → verificação por bloco SQL no próprio arquivo de migration.
- Automação de browser → UAT conversacional + testes de unidade sobre a lógica extraída.

## Assumptions Log

| # | Afirmação | Seção | Risco se estiver errada |
|---|-----------|-------|-------------------------|
| A1 | Expressões de policy resolvem OIDs de função no `CREATE POLICY`, não na avaliação — por isso a falta de qualificação de schema nas policies de `storage.objects` é segura | §3 | Baixo. Se estiver errada, as 6 policies vivas da `0018`/`0033`/`0041` já estariam quebradas em produção. A evidência empírica é mais forte que a afirmação |
| A2 | `security definer` e cláusula `SET` bloqueiam o inlining de funções SQL no PostgreSQL | §4 | **Médio.** Se estiver errada, a forma recomendada continua correta (só perde a justificativa). **Mitigação já prevista:** o bloco `EXPLAIN (analyze)` da §4 mede o fato em vez de confiar na afirmação — o plano deve executá-lo |
| A3 | Funções recebem `EXECUTE` para `PUBLIC` por padrão, por isso nenhum `grant execute` é necessário | §3 | Baixo. Corroborado por 4 helpers em produção sem grant explícito |
| A4 | Supabase concede DML a `authenticated` por default privileges no schema `public` (0037 e 0032 não têm `grant` explícito e funcionam) | §Don't Hand-Roll / DDL | Baixo. **Mitigação:** recomendar `grant select, insert, delete on psw_tenant_admins to authenticated` explícito, como a `0022` fez — custo zero e remove a dependência da suposição |
| A5 | `NEXT_PUBLIC_SUPABASE_URL` e a service-role key estão presentes no ambiente local do PO | §Environment | Médio — sem elas a suíte de segurança é **pulada em silêncio** e a fase parece verde. O plano deve incluir uma verificação explícita de que os specs rodaram (contagem de testes, não só exit code) |
| A6 | `psw_tenant_admins` permanecerá pequena (dezenas de linhas), tornando o índice por `tenant_id` barato | §4 | Muito baixo |
| A7 | A `0043_child_tenant_coherence.sql` de fato estende a coerência de `tenant_id` às demais filhas (lida apenas pelo nome, não pelo conteúdo, nesta sessão) | §2 | Baixo — a conclusão da §2 (todas as 8 têm `tenant_id not null`) foi verificada nos `create table`, independentemente da `0043` |
| A8 | O tenant da PSW é o tenant do `platform_admin` logado (premissa herdada da Phase 17, documentada em `admin/invites/actions.ts:108-112`) | §6 | Médio — já é premissa viva do sistema; deixaria de valer se existisse um `platform_admin` lotado em tenant de cliente. **Não é introduzida por esta fase**, mas a `/admin/staff` a herda ao listar "os `psw_staff`" |

## Open Questions

1. **Qual branding o app mostra para um staff-admin com empresa selecionada?**
   - O que se sabe: `app/(app)/layout.tsx:28` usa `fetchTenantBranding(profile.tenantId)` → sempre a identidade da PSW.
   - O que não está claro: com o seletor de empresa ativo e poderes de admin em A, o usuário provavelmente espera o tema de A — mas trocar o tema do shell inteiro é mudança visível para um papel existente.
   - Recomendação: **manter o branding da PSW no shell** (é o tenant de lotação) e sinalizar a empresa de atuação no cabeçalho das telas de admin. É a opção que não mexe em nada existente. Levar ao PO no `checkpoint:decision` do plano de UI.

2. **O seletor de empresa passa a ser o contexto de escrita, ou cada tela indica a sua empresa?** (marcado como discrição no CONTEXT)
   - Recomendação: **o seletor é o contexto**, porque já existe, já persiste em cookie e já é preservado entre abas `/admin` (`Sidebar.tsx:150-155`). Cada tela de admin exibe um rótulo "Agindo em: <Empresa>" não-clicável, e a action valida contra a concessão de qualquer forma. Duas fontes de contexto seriam pior que uma imperfeita.

3. **O que acontece com concessões de alguém despromovido de `psw_staff`?**
   - Recomendação (§Don't Hand-Roll): deixar inertes e sinalizar na `/admin/staff`, em vez de apagar automaticamente. Confirmar com o PO — é comportamento visível.

4. **`/logs` para staff-admin de N empresas: o seletor de empresa passa a ser oferecido a ele?**
   - Hoje `fetchAuditTenants()` só roda para `platformAdmin` (`logs/page.tsx:135,147`). Com concessão em A **e** C, sem seletor o log vem misturado. Recomendação: oferecer o seletor limitado às empresas concedidas — reusa o mesmo componente, sem query nova cross-tenant.

5. **A `/admin/staff` lista "todos os `psw_staff`" a partir de qual consulta?**
   - `profiles` filtrado por `role = 'psw_staff'`. O `platform_admin` lê `profiles` cross-tenant pela `0021`. Herda a premissa A8 (staff está lotado no tenant da PSW) — se algum staff foi criado fora dela, some da lista. Recomendação: filtrar **só por papel**, nunca por tenant, para que a tela seja robusta à premissa.

## Sources

### Primárias (HIGH confidence) — código e schema do próprio projeto, lidos nesta sessão

- `supabase/migrations/0001_init.sql` — policies base por tenant, `current_tenant_id()`, grants
- `supabase/migrations/0011_schema_evolution_v02.sql` — `opportunity_risks` (DDL + policies)
- `supabase/migrations/0015_rbac_viewer_policies.sql` — `current_user_role()`, gate de `viewer`
- `supabase/migrations/0018_documentos_anotacoes_historico.sql` — 3 tabelas filhas, grants, policies de `storage.objects`
- `supabase/migrations/0021_platform_admin_rls.sql` — `is_platform_admin()`, comparação por `role::text`
- `supabase/migrations/0022_invited_emails.sql`, `0028_invite_viewer_role.sql`, `0029_tenant_admin_invites.sql` — allowlist e policies de convite
- `supabase/migrations/0032_opportunity_assignees.sql` — o análogo estrutural de `psw_tenant_admins`
- `supabase/migrations/0033_tenant_branding.sql` — `tenants_update_own_admin`, bucket `tenant-branding`
- `supabase/migrations/0037_opportunity_tasks.sql`, `0038_audit_log.sql`
- `supabase/migrations/0040_psw_staff_access_core.sql` — a forma a espelhar (helper, índice, trigger, policies aditivas)
- `supabase/migrations/0041_psw_staff_child_access.sql` — filhas, `profiles`, Storage, `invited_emails` (BLOCO 6b)
- `supabase/migrations/0042_psw_staff_audit_trail.sql`, `0044_psw_staff_only_assigned.sql` — as 8 restritivas e o laço
- `lib/security/role.ts`, `lib/security/cargo.ts`, `lib/tenants/scope.ts`, `lib/audit/queries.ts`
- `app/(app)/team/{actions.ts,page.tsx}`, `app/(app)/configuracoes/{actions.ts,page.tsx}`, `app/(app)/admin/invites/actions.ts`, `app/(app)/admin/layout.tsx`, `app/(app)/logs/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/opportunities/{page.tsx,[id]/page.tsx}`, `components/shell/Sidebar.tsx`
- `tests/security/psw-staff-isolation.test.ts`, `tests/helpers/auth-as.ts`, `tests/setup/*`, `vitest.config.ts`, `package.json`, `lib/database.types.ts`
- `.planning/phases/18-*/18-CONTEXT.md`, `.planning/ROADMAP.md` (§Phase 18), `.planning/REQUIREMENTS.md` (GRANT-01..10), `docs/PROJETO.md`

### Secundárias (MEDIUM/HIGH confidence) — documentação oficial consultada nesta sessão

- [postgresql.org/docs/current/sql-createpolicy.html](https://www.postgresql.org/docs/current/sql-createpolicy.html) — semântica PERMISSIVE (OR) × RESTRICTIVE (AND) e a frase decisiva: *"there needs to be at least one permissive policy to grant access to records before restrictive policies can be usefully used to reduce that access"*
- [supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — índices em colunas de policy (>100×), `(select …)` para InitPlan (11.000 ms → 10 ms), funções `security definer` no lugar de joins (178.000 ms → 12 ms), filtro explícito na app além da RLS, reestruturação de join contra dado fixo

### Terciárias (LOW confidence) — conhecimento de treinamento, marcado como tal

- Mecânica de `inline_function()` do otimizador do PostgreSQL (bloqueio por `prosecdef` e `proconfig`) — **A2**, a ser confirmada por `EXPLAIN` durante a execução
- Armazenamento de expressões de policy como árvore de parse com OIDs resolvidos — **A1**, corroborada empiricamente
- Default privileges do Supabase no schema `public` — **A4**, contornada com `grant` explícito

## Metadata

**Confidence breakdown:**

| Área | Nível | Razão |
|------|-------|-------|
| §1 RESTRICTIVE × PERMISSIVE | **HIGH** | Veredito derivado da leitura exaustiva das policies vivas **e** citado literalmente da doc oficial do PostgreSQL |
| §2 `tenant_id` nas 8 tabelas | **HIGH** | Verificado nos `create table` de cada migration de origem; reforçado pelos triggers de coerência |
| §3 `storage.objects` | **HIGH** | 6 policies em produção provam a viabilidade; a `0041` é o precedente exato, incluindo a armadilha do cast |
| §4 Performance / volatilidade | **MEDIUM** | `stable` vs `immutable` é HIGH (correção lógica). A mecânica de inlining é **A2** (LOW/MEDIUM) — por isso a recomendação vem acompanhada de um `EXPLAIN` que a mede |
| §5 CHECKs e convites | **HIGH** | A correção do inventário (11 policies vivas, `0029:53` morta) foi verificada arquivo a arquivo; o teste que a protege já existe |
| §6 Auditoria de Server Actions | **HIGH** | Grep exaustivo + leitura de todas as ocorrências; completude é o critério declarado |
| §7 Testes | **HIGH** | Todos os helpers, flags e nomes citados foram lidos; nada inventado |
| Stack | **HIGH** | Nenhum pacote novo; versões lidas do `package.json` |
| Pitfalls | **HIGH** | Cada um deriva de uma evidência concreta neste repositório |

**Data da pesquisa:** 2026-08-07
**Válido até:** 2026-09-06 (30 dias — o schema é estável e write-only; revalidar se novas migrations forem aplicadas ao `main`, especialmente qualquer uma que toque nas 11 policies inventariadas na §5)
