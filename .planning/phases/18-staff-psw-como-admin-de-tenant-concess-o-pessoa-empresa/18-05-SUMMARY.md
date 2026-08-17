---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 05
subsystem: database
tags: [supabase, postgres, rls, rbac, multi-tenant]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-02, 18-03)
    provides: "0045/0046 aplicadas: psw_tenant_admins, is_tenant_admin_of()/effective_admin_tenant_ids()/current_admin_tenant_ids(), as duas metades da RLS em opportunities/tenants e nas 7 tabelas filhas + profiles"
provides:
  - "Migration 0047 aplicada em produção: as 11 policies vivas de tenant_admin (opportunity_assignees_insert/_update/_delete, invited_emails_select/_delete/_insert_tenant_admin, tenants_update_own_admin, tenant_branding_storage_insert/_update/_delete, audit_log_select) reemitidas pela fonte única is_tenant_admin_of(), mais 3 policies novas no bucket privado opportunity-documents (select/insert/delete, sem update)"
  - "Barreira de escalada de convite (role not in ('platform_admin','psw_staff')) e a condição de convite não usado (used_at is null) confirmadas PRESENTES na definição viva das policies, pós-apply, via pg_policies"
  - "Byte-equivalência de is_tenant_admin_of() com o predicado antigo de tenant_admin PROVADA POR CONSTRUÇÃO — leitura das 3 definições de função (pg_get_functiondef) e tabela de equivalência papel-a-papel, mais forte que amostragem porque vale para todo tenant_admin de todos os tenants, não só o amostrado"
  - "Decisão do checkpoint da Task 2 (aplicar-as-11) e a ratificação de produto (staff-admin de A pode convidar tenant_admin de A) registradas explicitamente"
  - "Grupo d (16 specs: d1-d6, d7a-f, d8a-d) escrito em tests/security/psw-staff-admin-grant.test.ts como rede de regressão durável — permanece em SKIP (modo de prova prova-por-sql-no-handoff)"
  - "DUAS DÍVIDAS DE MÉTODO NOVAS registradas em .planning/WINDOWS.md: (1) baseline pré-apply das 11 policies capturado DEPOIS do apply, não antes; (2) impersonação de sessão via set_config não funciona no SQL Editor do Supabase Cloud — invalida as verificações estilo D5/D6/D7 dos handoffs 18-02/18-03/18-05 que dependiam dela"
affects: [18-06, 18-07, 18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Localizar policies a trocar SEMPRE por NOME, nunca por número de linha de documento — uma das 11 (invited_emails_insert_tenant_admin) tinha sua definição viva numa migration diferente daquela em que nasceu, e reescrevê-la a partir da versão morta reabriria escalada de privilégio"
    - "Prova de byte-equivalência POR CONSTRUÇÃO (leitura da definição das funções + tabela de equivalência lógica papel-a-papel) como alternativa mais forte à medição por amostragem quando a amostragem não pôde ser capturada a tempo"
    - "Impersonação de sessão via `set local role` + `set_config('request.jwt.claims', …, true)` NÃO é confiável no SQL Editor do Supabase Cloud (cada statement roda em transação própria) — descartada como técnica de verificação em handoffs futuros desta fase"

key-files:
  created:
    - supabase/migrations/0047_tenant_admin_predicate_swap.sql
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md
  modified:
    - tests/security/psw-staff-admin-grant.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Task 2 (checkpoint:decision, gate=blocking): PO escolheu `aplicar-as-11` — as 11 policies trocadas de uma vez, com medição de byte-equivalência antes/depois. A 0047 permaneceu exatamente como escrita na Task 1, sem ajustes."
  - "Ratificação de produto (Task 2): um staff-admin de A PODE convidar alguém como tenant_admin de A, criando um admin de cliente dentro de A — equivalência plena a tenant_admin (D-A). Dois limites tornam isso NÃO-escalada no sentido de D-B: (1) ele continua sem poder criar ou estender concessão — psw_tenant_admins só aceita escrita de is_platform_admin(); (2) ele continua sem poder convidar ninguém como psw_staff ou platform_admin — a cláusula role not in ('platform_admin','psw_staff') foi preservada literalmente."
  - "Byte-equivalência (Decisiva #1) provada POR CONSTRUÇÃO, não por amostragem: o baseline pré-apply foi perdido (o PO rodou a query A1 depois do apply), mas a leitura das definições vivas de effective_admin_tenant_ids()/is_tenant_admin_of()/current_admin_tenant_ids() via pg_get_functiondef, mais a tabela de equivalência papel-a-papel (tenant_admin/member/viewer/platform_admin/psw_staff sem e com concessão), prova a equivalência para TODO tenant_admin de TODO tenant — cobertura mais ampla do que a amostra teria provado."
  - "Dívida de método registrada: impersonação via set_config não funciona no SQL Editor do Supabase Cloud (retorna auth.uid()/current_user_role()/current_tenant_id() = null). Toda verificação D5/D6/D7-style dos handoffs 18-02/18-03/18-05 que dependia dessa técnica é artefato, não medição. Handoffs futuros desta fase usam (a) inspeção estática de funções/policies ou (b) observação pelo app com login real."

requirements-completed: [GRANT-04, GRANT-06, GRANT-10]

coverage:
  - id: D1
    description: "As 11 policies vivas de tenant_admin (localizadas por nome, não por linha) reemitidas pela fonte única is_tenant_admin_of() — nenhuma ficou para trás"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C1 — pg_policies pós-apply colado pelo PO: 11 linhas, todas chamando is_tenant_admin_of"
        status: pass
    human_judgment: true
    rationale: "Prova por SQL no handoff (modo de prova da fase); o PO colou o resultado exato pós-apply."
  - id: D2
    description: "invited_emails_insert_tenant_admin preserva LITERALMENTE a barreira de escalada (role not in ('platform_admin','psw_staff')) — a armadilha da 0029 morta foi evitada"
    requirement: GRANT-06
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação DECISIVA #2 — with_check pós-apply colado pelo PO: (is_tenant_admin_of(tenant_id) AND (role <> ALL (ARRAY['platform_admin','psw_staff'])))"
        status: pass
    human_judgment: true
    rationale: "A verificação que mais importava desta fase — confirmada pelo texto exato da policy viva em produção, não por comentário no arquivo."
  - id: D3
    description: "invited_emails_delete_tenant_admin preserva a condição de convite ainda não usado (used_at is null)"
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C2 — qual pós-apply colado pelo PO: (is_tenant_admin_of(tenant_id) AND (used_at IS NULL))"
        status: pass
    human_judgment: true
    rationale: "Prova por SQL no handoff."
  - id: D4
    description: "CHECK de papel convidável (invited_emails_role_check) fica intacto — nenhuma constraint alterada"
    requirement: GRANT-10
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C5 (pg_constraint) — NÃO EXECUTADA pelo PO"
        status: unknown
    human_judgment: true
    rationale: "GAP: o PO não colou o resultado da verificação C5. A garantia estrutural (nenhum ALTER TABLE...DROP CONSTRAINT na 0047, confirmado pelo <verify> automatizado da Task 1 antes do apply) segue válida, mas o estado vivo pós-apply não foi confirmado."
  - id: D5
    description: "Storage: as policies de tenant-branding comparam o segmento de caminho do lado TEXTO contra effective_admin_tenant_ids(), sem cast para identificador; disjunto is_platform_admin() preservado"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C4 — qual/with_check pós-apply colados pelo PO confirmam comparação lado-texto e ausência de ::uuid"
        status: pass
    human_judgment: true
    rationale: "Prova por SQL no handoff."
  - id: D6
    description: "Bucket privado opportunity-documents ganha exatamente 3 policies novas (select/insert/delete), sem um quarto verbo de update"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C3 — NÃO EXECUTADA pelo PO em produção pós-apply"
        status: unknown
    human_judgment: true
    rationale: "GAP: verificada apenas no TEXTO da migration antes do apply (verify automatizado da Task 1, que passou), mas a existência em produção das 3 policies (e a ausência de uma 4ª) não foi confirmada via pg_policies pós-apply."
  - id: D7
    description: "BYTE-EQUIVALÊNCIA: is_tenant_admin_of() reduz ao predicado antigo (t = current_tenant_id() and current_user_role() = 'tenant_admin') para todo tenant_admin de todo tenant — um tenant_admin de cliente enxerga e faz exatamente o que fazia antes (SC-12, D-J)"
    requirement: GRANT-10
    verification:
      - kind: other
        ref: "Prova por construção — leitura das definições vivas de effective_admin_tenant_ids()/is_tenant_admin_of()/current_admin_tenant_ids() via pg_get_functiondef (colada pelo PO) e tabela de equivalência papel-a-papel neste SUMMARY (seção 'Byte-equivalência por construção')"
        status: pass
    human_judgment: true
    rationale: "O baseline empírico pré-apply foi perdido (query A1 rodada depois do apply). A prova por construção é MAIS FORTE que a amostragem que se pretendia fazer — vale para TODO tenant_admin de TODO tenant, não só o do FGCoop — mas ainda exige leitura humana do argumento lógico, não é um assert automatizado de runtime."
  - id: D8
    description: "PODERES EM A: staff-admin com concessão em A insere convite legítimo (aceita), tenta convidar psw_staff (rejeitado), atualiza o branding de A (aceita), lê o log de A (traz linhas)"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, DECISIVA #3 — NÃO EXECUTADA pelo PO após o apply"
        status: unknown
    human_judgment: true
    rationale: "GAP DECISIVO: a alegação central de GRANT-04 não tem prova de runtime nesta wave. A rede de regressão automatizada existe (specs d1, d2, d3, d5, d6 em tests/security/psw-staff-admin-grant.test.ts) mas está em SKIP (.env.test ausente). Nenhuma escrita de teste (concessão psw_tenant_admins) ficou pendente — a Decisiva #3 nunca chegou a rodar, então nenhum Passo F foi necessário."
  - id: D9
    description: "NEGATIVO EM B: as mesmas tentativas de leitura/escrita do staff-admin num tenant sem concessão são todas negadas, nas duas formas corretas (erro explícito para INSERT, zero linhas para SELECT/UPDATE/DELETE via using)"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, verificação C6 (negativo em B) — NÃO EXECUTADA pelo PO"
        status: unknown
    human_judgment: true
    rationale: "GAP: mesma situação de D8. Rede de regressão automatizada (specs d7a-f) escrita e em SKIP."
  - id: D10
    description: "NÃO-REGRESSÃO: um tenant_admin de cliente continua SEM conseguir convidar psw_staff, e continua convidando papéis legítimos e sem ver invited_emails de outro tenant — reconferido DEPOIS do swap da 0047"
    requirement: GRANT-10
    verification:
      - kind: unit
        ref: "tests/security/psw-staff-admin-grant.test.ts — specs d8a/d8b/d8c/d8d (SKIP, .env.test ausente)"
        status: unknown
    human_judgment: true
    rationale: "Os specs existem e tipam corretamente (npm run typecheck exit 0), mas estão em SKIP — não há prova de runtime nesta wave desta reconferência específica. A verificação estrutural equivalente (D2 acima, barreira presente na policy viva) já reduz bastante o risco: a barreira que protege b3/d8b é a mesma cláusula confirmada em produção."
  - id: D11
    description: "A 0047 é idempotente: rodar o arquivo duas vezes no SQL Editor não gera erro"
    verification:
      - kind: manual_procedural
        ref: "18-05-MIGRATION-HANDOFF.md, passo 5 (prova de idempotência) — NÃO CONFIRMADA explicitamente pelo PO"
        status: unknown
    human_judgment: true
    rationale: "GAP: o PO não relatou explicitamente o resultado da segunda execução. A garantia estrutural (todo create policy precedido de drop policy if exists) foi confirmada no <verify> automatizado da Task 1 antes do apply."

# Metrics
duration: checkpoint-gated (Task 1 numa sessão; Task 2 resolvida via checkpoint pelo PO/coordenador; Task 3 — handoff escrito nesta sessão, apply humano em produção confirmado pelo coordenador entre sessões; Task 4 e fechamento nesta sessão)
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 05: Migration 0047 — as 11 policies vivas de `tenant_admin` pela fonte única Summary

**Migration `0047_tenant_admin_predicate_swap.sql` escrita, verificada estruturalmente e APLICADA EM PRODUÇÃO: as 11 policies vivas de `tenant_admin` (localizadas por NOME, não por linha) reemitidas pela fonte única `is_tenant_admin_of()`, com a barreira de escalada de convite e a condição de convite não usado preservadas LITERALMENTE — confirmadas presentes na definição viva pós-apply, não só no arquivo. A byte-equivalência (a alegação mais crítica da fase) foi provada POR CONSTRUÇÃO, não por amostragem, depois que o baseline empírico pré-apply se perdeu — uma prova mais forte porque vale para todo `tenant_admin` de todo tenant. Duas dívidas de método novas foram descobertas e registradas: o baseline pré-apply não foi capturado a tempo, e a técnica de impersonação por `set_config` usada nos três handoffs desta fase (`18-02`, `18-03`, `18-05`) não funciona no SQL Editor do Supabase Cloud.**

## Performance

- **Duration:** checkpoint-gated (ver `duration` no frontmatter)
- **Completed:** 2026-08-07
- **Tasks:** 4 (migration write-only + checkpoint:decision + handoff/apply humano + specs de prova)
- **Files modified:** 4 (1 migration criada, 1 handoff criado, 1 spec de teste estendido, `.planning/WINDOWS.md` com 8 entradas novas)

## Accomplishments

- Migration `0047` escrita, verificada estruturalmente (`<verify>` automatizado da Task 1 passou: as 11 por nome, barreira preservada, condição de convite não usado preservada, 3 policies novas no bucket privado sem um 4º verbo, ausência de cast em Storage, CHECK intocado, helpers globais intocados) e **aplicada em produção** pelo PO.
- **Checkpoint da Task 2 resolvido:** decisão `aplicar-as-11` (as 11 de uma vez) e a ratificação explícita de que um staff-admin de A pode convidar um `tenant_admin` de A — com os dois limites que tornam isso equivalência a `tenant_admin` (D-A) e não escalada no sentido de D-B (sem poder de conceder, sem poder de convidar `psw_staff`/`platform_admin`).
- **Confirmado pelo PO pós-apply, via `pg_policies`:** as 11 policies presentes, todas chamando `is_tenant_admin_of`; a barreira de escalada (`role <> ALL (ARRAY['platform_admin','psw_staff'])`) presente no `with_check` de `invited_emails_insert_tenant_admin`; a condição `used_at is null` presente em `invited_emails_delete_tenant_admin`; a comparação lado-texto contra `effective_admin_tenant_ids()` nas policies de Storage; `opportunity_assignees_*` preservando `OR is_platform_admin()`; `tenants_update_own_admin` usando `is_tenant_admin_of(id)` (a coluna correta em `tenants`).
- **Byte-equivalência provada por construção:** como o baseline pré-apply se perdeu, o argumento decisivo desta fase foi obtido lendo a definição viva das 3 funções (`pg_get_functiondef`) e construindo a tabela de equivalência papel-a-papel entre `is_tenant_admin_of(t)` e o predicado antigo — ver seção dedicada abaixo. Esta prova é estruturalmente mais forte que a amostragem original: vale para **todo** `tenant_admin` de **todo** tenant, não apenas o do FGCoop.
- Grupo `d` (16 specs: `d1`-`d6`, `d7a`-`f`, `d8a`-`d`) escrito em `tests/security/psw-staff-admin-grant.test.ts` como rede de regressão durável para GRANT-04/GRANT-06/GRANT-10 — permanece em SKIP nesta wave (`.env.test` ausente).
- Duas dívidas de método registradas em `.planning/WINDOWS.md`: baseline pré-apply capturado tarde demais; impersonação via `set_config` inválida no SQL Editor (invalida retroativamente as verificações D5/D6/D7-style dos handoffs `18-02`/`18-03` também).
- `npm run typecheck` → exit 0. `npm run test:security` → exit 0, **68 passed | 151 skipped (219)** — `psw-staff-admin-grant.test.ts` com **47/47 em SKIP** (16 novos desta wave), nenhum `it.todo` pendente, registrado como tal, **nunca como verde**.

## Task Commits

Cada task com arquivo próprio foi commitada atomicamente:

1. **Task 1: Migration 0047 — as 11 trocas nominais e as 3 policies novas do bucket privado** — `a5334fc` (feat)
2. **Task 2: [DECISÃO one-way] Reescrever o predicado de um papel de cliente vivo em produção** — sem arquivo próprio (`<files>` vazio no plano); decisão registrada nesta Summary, em "Decisions Made" abaixo.
3. **Task 3: [BLOCKING] Handoff e apply manual da 0047** — `8aeb967` (docs, o handoff) + apply manual confirmado pelo PO/coordenador (sem commit — a migration em si já foi commitada na Task 1; o apply é ação em produção, não em git)
4. **Task 4: Provar os poderes em A, a negação em B e as não-regressões de convite** — `5cd2ff2` (test)

## Files Created/Modified

- `supabase/migrations/0047_tenant_admin_predicate_swap.sql` - as 11 policies vivas reemitidas pela fonte única (Blocos A-C), 3 policies novas de Storage no bucket privado (Blocos D-E), declaração de não-mudança (Bloco F), blocos de verificação e rollback comentados (Blocos G-H)
- `.planning/phases/18-.../18-05-MIGRATION-HANDOFF.md` - handoff write-only com baseline pré-apply no topo, 3 verificações DECISIVAS rankeadas, complementares, rollback com a ordem obrigatória
- `tests/security/psw-staff-admin-grant.test.ts` - grupo `d` (16 specs: poderes em A, negação em B nas duas formas, não-regressão de convite pós-swap)
- `.planning/WINDOWS.md` - 8 entradas novas (2 `deviation` de dívida de método, 5 `unrun-verify`, 1 `skipped-test`)

## Decisions Made

### Task 2 — checkpoint:decision, gate=blocking

**Opção escolhida pelo PO: `aplicar-as-11`.** As 11 trocas de uma vez, com a medição de byte-equivalência antes/depois. A `0047` permaneceu exatamente como escrita na Task 1 — nenhum ajuste foi necessário (a alternativa "trocar só o necessário" teria deixado duas fontes do mesmo predicado convivendo, contrariando D-I; "fatiar em dois applies" teria dobrado os gates humanos numa fase que já tem três).

**Ratificação de produto:** SIM, explicitamente — um staff-admin de A pode convidar alguém como `tenant_admin` de A, criando um admin de cliente dentro de A. É equivalência plena a `tenant_admin`, que é o que D-A pede. Dois limites continuam valendo e tornam isso **não-escalada** no sentido de D-B:
- ele continua **sem** poder criar ou estender concessão — `psw_tenant_admins` só aceita escrita de `is_platform_admin()` (0045, Bloco 5);
- ele continua **sem** poder convidar ninguém como `psw_staff` ou `platform_admin` — a cláusula `role not in ('platform_admin', 'psw_staff')` foi preservada literalmente (confirmada na definição viva pós-apply, ver D2 em `coverage`).

### Byte-equivalência por construção (substitui a medição por amostragem perdida)

O PO extraiu a definição viva das três funções via `pg_get_functiondef`:

```sql
effective_admin_tenant_ids():   -- STABLE, SECURITY DEFINER, search_path=public
  select current_tenant_id() where current_user_role() = 'tenant_admin'
  union all
  select tenant_id from psw_tenant_admins
    where profile_id = (select auth.uid()) and current_user_role() = 'psw_staff'

is_tenant_admin_of(t):          -- STABLE, SEM definer, SEM SET (inlinável — D-Q confirmado)
  select coalesce(t in (select public.effective_admin_tenant_ids()), false)

current_admin_tenant_ids():     -- só concessões, sem ramo de papel
  select tenant_id from psw_tenant_admins where profile_id = (select auth.uid())
```

Tabela de equivalência, papel a papel — `is_tenant_admin_of(t)` versus o predicado antigo `t = current_tenant_id() and current_user_role() = 'tenant_admin'`:

| Papel | Conjunto (`effective_admin_tenant_ids`) | `is_tenant_admin_of(t)` | Predicado antigo | Equivalente? |
|---|---|---|---|---|
| `tenant_admin` | `{current_tenant_id()}` | `t = current_tenant_id()` | idem | **SIM** |
| `member` | vazio | `false` | `false` | **SIM** |
| `viewer` | vazio | `false` | `false` | **SIM** |
| `platform_admin` | vazio | `false` | `false` | **SIM** (o acesso dele vem dos disjuntos `OR is_platform_admin()`, preservados literalmente em toda policy que os tinha) |
| `psw_staff` sem concessão | vazio | `false` | `false` | **SIM** |
| `psw_staff` com concessão | tenants concedidos | `true` nos concedidos | — | capacidade NOVA, intencional (GRANT-04) |

Isto prova SC-12/D-J/GRANT-10 de forma **mais ampla** do que a medição por amostragem provaria — vale para todo `tenant_admin` de todos os tenants, não só o do FGCoop amostrado. O ponto crítico está no ramo 2 de `effective_admin_tenant_ids()`: ele é filtrado por `current_user_role() = 'psw_staff'` — sem esse filtro, um `tenant_admin` de cliente herdaria concessões de terceiros, o vazamento invisível que a byte-equivalência existe para descartar. O filtro está presente. E `coalesce(…, false)` faz `t` nulo **negar** — a direção segura.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma. O `<action>` de cada task foi seguido; a `0047` permaneceu exatamente como escrita na Task 1 (o PO ratificou `aplicar-as-11` sem pedir ajustes).

### Desvios de execução, não de código (Rule 4 — reportados, não decididos unilateralmente)

**1. Baseline pré-apply não capturado antes do apply.** O handoff instruía rodar a seção "ANTES DE APLICAR" (export das 11 policies + contagens de byte-equivalência do `tenant_admin`) ANTES de colar a `0047`. O PO rodou a query A1 DEPOIS do apply. Sem impacto no rollback (que reaplica arquivos versionados, não depende do snapshot); impacto real: a Decisiva #1 não pôde ser julgada por comparação empírica — foi substituída pela prova por construção descrita acima, mais forte. Registrado em `.planning/WINDOWS.md` (entrada 24).

**2. Impersonação por `set_config` não funciona no SQL Editor.** Diagnóstico do PO: `set local role authenticated` + `set_config('request.jwt.claims', …, true)` seguido de `select auth.uid(), current_user_role(), current_tenant_id()` retornou `null, null, null` — o SQL Editor roda cada statement em transação própria, descartando o `set local`. Consequência: toda verificação estilo D5/D6/D7 baseada nessa técnica, nos handoffs `18-02`, `18-03` e `18-05`, é **artefato, não medição** (ex.: a query A2 deste handoff, que devolveu `0,0,0,0`, não provou nem desprovou nada). Registrado em `.planning/WINDOWS.md` (entrada 25) como dívida de método para toda a fase, não só este plano.

---

**Total deviations:** 0 (Rules 1-3) — 2 desvios de execução (não de código) documentados acima, ambos reportados pelo coordenador/PO, sem necessidade de decisão arquitetural.
**Impact on plan:** Nenhum impacto na `0047` em si (o arquivo aplicado é byte-idêntico ao commitado na Task 1). O impacto é na COBERTURA de prova: a Decisiva #1 foi satisfeita por um caminho mais forte; as Decisivas #2 (confirmada) e #3 (não executada) permanecem como estavam.

## Issues Encountered

1. **Decisiva #3 (poderes em A) e o negativo em B não executados nesta wave.** O PO confirmou apenas a Decisiva #2 (barreira de convite) e as complementares C1/C2/C4 via `pg_policies`. A Decisiva #3 (staff-admin insere convite legítimo/rejeita `psw_staff`/atualiza branding/lê log de A) e o negativo em B (as mesmas tentativas negadas num tenant sem concessão) **não foram executadas**. Como a Decisiva #3 nunca rodou, nenhuma concessão de teste (`psw_tenant_admins`) foi criada — o Passo F (revogar) do handoff não se aplica; nenhuma linha de teste ficou pendente em produção. Registrado em `.planning/WINDOWS.md` (entradas 26/27).
2. **C3 (3 policies novas do bucket privado em produção) e C5 (CHECK inalterado) não confirmadas via SQL pós-apply** — verificadas apenas no texto do arquivo antes do apply (o `<verify>` automatizado da Task 1, que passou). Registrado em `.planning/WINDOWS.md` (entradas 28/29).
3. **Idempotência (segunda execução do arquivo) não confirmada explicitamente pelo PO.** Registrado em `.planning/WINDOWS.md` (entrada 30).
4. **Modo de prova da fase inalterado.** `.env.test` continua sem existir (decisão vinculante do Plan 18-02). `tests/security/psw-staff-admin-grant.test.ts` roda 47/47 em SKIP — incluindo os 16 specs novos do grupo `d` desta wave. Nenhuma alegação de "testes verdes" é feita neste SUMMARY para esses specs. Registrado em `.planning/WINDOWS.md` (entrada 31).
5. **`tests/security/psw-staff-isolation.test.ts` NÃO foi editado** (restrição do plano e do binding_proof_mode, confirmada por `git diff --name-only HEAD -- tests/security` retornando apenas `psw-staff-admin-grant.test.ts`).

## User Setup Required

Nenhuma ação de ambiente pendente. `.env.test` continua intencionalmente ausente. **Ação recomendada, não bloqueante, para o PO antes de considerar a Phase 18 encerrada:** rodar a Decisiva #3, o negativo em B, C3, C5 e a prova de idempotência pendentes (handoff `18-05-MIGRATION-HANDOFF.md`), atualizando este SUMMARY ou marcando as entradas 26-30 de `.planning/WINDOWS.md` como resolvidas.

## Next Phase Readiness

- A `0047` está aplicada em produção; as 11 policies pelo nome, a barreira de escalada de convite, a condição de convite não usado, e a comparação lado-texto do Storage estão confirmadas via `pg_policies` pós-apply.
- **Os planos `18-06` em diante estão formalmente destravados** — o handoff declarava esse bloqueio, e o apply foi confirmado. A camada de servidor (`isTenantAdminOf`/`resolveAdminTenantId`, plano `18-06`) pode prosseguir assumindo que GRANT-04 está concedido na RLS.
- **Recomendação para o `18-06`/`18-08`:** a Decisiva #3 e o negativo em B ainda não têm prova de runtime em produção — rodar a verificação prática pelo próprio app (staff-admin logado, convidando/atualizando branding/lendo log em A, e tentando o mesmo em B) durante ou antes da verificação visual do `18-08` fecharia essa lacuna com evidência mais forte que SQL manual.
- A rede de regressão automatizada (grupo `d`) existe e está correta estruturalmente (`npm run typecheck` exit 0), mas continua em SKIP — sem valor probatório até `.env.test` existir.
- 8 itens novos registrados em `.planning/WINDOWS.md` (2 `deviation` de dívida de método × 2, `unrun-verify` × 5, `skipped-test` × 1) — o ledger acumula e bloqueia `/gsd-ship` até resolvidos ou dispensados explicitamente.
- **Dívida de método vale para a fase inteira:** os handoffs `18-02` e `18-03` também usaram impersonação por `set_config` em verificações D5/D6/D7-style — essas verificações devem ser tratadas como não-provadas, não como "prováveis mas não confirmadas", até serem refeitas por inspeção estática ou observação pelo app.

## Self-Check: PASSED

- FOUND: `supabase/migrations/0047_tenant_admin_predicate_swap.sql`
- FOUND: `.planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-05-MIGRATION-HANDOFF.md`
- FOUND: commit `a5334fc` (Task 1)
- FOUND: commit `8aeb967` (Task 3, handoff)
- FOUND: commit `5cd2ff2` (Task 4)
- `npm run typecheck` → exit 0
- `npm run test:security` → exit 0, `68 passed | 151 skipped (219)` (confirmado; `psw-staff-admin-grant.test.ts` com 47/47 em skip, registrado como tal, não como verde)
- `.planning/WINDOWS.md` → 8 entradas novas confirmadas (ids 24-31)

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
