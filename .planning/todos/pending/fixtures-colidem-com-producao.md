---
id: fixtures-colidem-com-producao
created: 2026-08-06
source: descoberto durante a Phase 17 (plan 17-03), ao interpretar o smoke do ACCESS-04
status: pending
severity: destrutivo-se-disparado
---

# Fixtures de teste colidem com UUIDs de produção

## O risco, em uma frase

Se alguém popular `.env.test` com as credenciais do projeto Supabase de
produção, a primeira execução da suíte **renomeia o tenant FGCoop real** e,
se `cleanupTestTenants()` for chamado, **apaga as oportunidades reais dele**.

## Por quê

`tests/setup/seed-test-tenants.ts` define:

```ts
export const FGCOOP_TEST_ID = '11111111-1111-1111-1111-111111111111';
```

Esse é o **mesmo UUID** do tenant FGCoop de produção, criado pela migration
`0002_seed_tenant_and_admin.sql`. O comentário no próprio arquivo diz "0002 já
cria fgcoop, mas usamos slugs '-test' separados" — o slug é separado, mas o
**id não é**, e o upsert é `onConflict: 'id'`:

```ts
{ id: FGCOOP_TEST_ID, slug: 'fgcoop-test', name: 'FGCoop Test', status: 'active' }
```

Resultado: o FGCoop real vira "FGCoop Test" / `fgcoop-test`.

E `cleanupTestTenants()`:

```ts
await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ...]);
```

apaga as oportunidades do tenant `11111111-…` — as reais.

O profile `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` tem o mesmo problema: não é
fixture, é o `admin.fgcoop@pswdigital.com.br` da `0002`.

## Por que não explodiu ainda

`.env.test` nunca foi populado, então a suíte inteira roda em
`describe.skipIf` e o seed nunca executa. A ausência do arquivo — tratada até
hoje como um débito — é o que está segurando a bomba.

`cleanupTestTenants()` também não é chamado em lugar nenhum hoje
(`grep` em `tests/` retorna só a própria definição), mas está exportado e
documentado como "para uso opcional em afterAll global".

## Consequência para o débito do `.env.test`

Resolver a pendência **não é** popular o arquivo. É:

1. Provisionar um projeto Supabase separado, dedicado a teste, com as
   migrations `0001`..`0042` aplicadas.
2. **Antes disso**, trocar os UUIDs das fixtures por valores que não colidam
   com nenhum dado real (ex.: faixa `ffffffff-…`), para que um apontamento
   errado de `.env.test` deixe de ser catastrófico. Esta parte é barata e
   deveria ser feita já, independente do projeto novo.
3. Idealmente, um guard no `serviceRoleClient()` que se recuse a rodar se a
   URL do Supabase for a de produção.

O item 2 é o que transforma isso de "bomba armada" em "erro recuperável".

## Impacto na Phase 17

Os planos 17-02 e 17-05 escrevem specs nesse mesmo arquivo de seed, e o 17-02
acrescentou `PSW_TEST_ID = '33333333-…'` seguindo o padrão existente. Nenhum
deles introduziu o problema — ele é anterior, da Phase 7.5 — mas cada spec
nova aumenta o que se perde no dia em que alguém apontar o `.env.test` para o
lugar errado.

## Arquivos

- `tests/setup/seed-test-tenants.ts` — as constantes e o upsert/cleanup
- `tests/setup/supabase-test-client.ts` — onde entraria o guard de URL
- `supabase/migrations/0002_seed_tenant_and_admin.sql` — de onde vêm os UUIDs reais
- `.env.test.example` — deveria alertar sobre isso no comentário
