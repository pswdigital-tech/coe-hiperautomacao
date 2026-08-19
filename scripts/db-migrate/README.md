# Migração do banco para outro projeto Supabase

Copia **tudo** do projeto Supabase atual para um projeto novo e vazio: schema
(`public`), dados, usuários do `auth`, buckets e arquivos do Storage.

## Por que não é "rodar as migrations no banco novo"

Replayar `supabase/migrations/0001..0057` no destino recria a **estrutura** e os
seeds versionados — e só. Fica de fora tudo que nasceu em runtime:

| Fica de fora no replay | Onde está | Consequência |
|---|---|---|
| `auth.users`, `auth.identities` | schema `auth` | ninguém consegue logar |
| tenants/admins provisionados por SQL direto | `public.tenants`, `public.profiles` | empresas somem |
| oportunidades criadas pelo app | `public.opportunities` + 12 tabelas filhas | perda de dados do cliente |
| anexos e logos | `storage.objects` + S3 | anexos e branding quebrados |
| `audit_log`, `opportunity_history`, convites | `public.*` | histórico perdido |

Por isso o caminho aqui é `pg_dump` → `psql`, que é também o procedimento
[oficial do Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## O que roda

```
00-preflight.sh      só lê    checa ferramentas, conexão, extensões e se o destino está vazio
01-dump.sh           só lê    gera dump/roles.sql, dump/schema.sql, dump/data.sql
01b-extras.sh        só lê    gera dump/extras-auth-storage.sql (o que o dump padrão NÃO leva)
02a-reset-destino.sh ESCREVE  zera o destino — só ao refazer a migração do zero
02-restore.sh        ESCREVE  aplica roles+schema+data no destino, em transação única
02b-apply-extras.sh  ESCREVE  aplica o trigger de auth e as policies do Storage
03-storage.mjs       ESCREVE  copia os arquivos do Storage (pg_dump não copia binário)
04-verify.sh         só lê    compara contagem de linhas tabela a tabela, origem x destino
```

Ordem completa numa migração do zero:

```
00-preflight → 01-dump → 01b-extras → 02a-reset-destino → 02-restore → 02b-apply-extras → 03-storage → 04-verify
```

## Pré-requisitos

- **Docker Desktop rodando** — `supabase db dump` executa o `pg_dump` dentro de
  um container da imagem Postgres do Supabase, para a versão do dump casar com a
  do servidor.
- `supabase` CLI e `psql` no PATH (ambos já instalados nesta máquina).
- Projeto de destino criado e **vazio**.

## Passo a passo

### 1. Credenciais

```bash
cp scripts/db-migrate/env.example scripts/db-migrate/.env
# preencha as 6 variáveis (o .env já está no .gitignore)
```

A senha do banco precisa estar **percent-encoded** na connection string:

```bash
node -e "console.log(encodeURIComponent(process.argv[1]))" 'SUA_SENHA'
```

### 2. Preflight

```bash
./scripts/db-migrate/00-preflight.sh
```

Se apontar extensões faltando no destino, habilite em **Database > Extensions**
antes de seguir. Se o destino não estiver vazio, o script imprime o comando para
zerar o `public`.

### 3. Dump

```bash
./scripts/db-migrate/01-dump.sh
```

Gera `scripts/db-migrate/dump/` (ignorado pelo git — contém dados de cliente).

### 4. Restore

```bash
./scripts/db-migrate/02-restore.sh    # pede confirmação digitando SIM
```

Roda em `--single-transaction` com `ON_ERROR_STOP=1`: ou entra tudo, ou não entra
nada. Se falhar, `RELAXED=1 ./scripts/db-migrate/02-restore.sh` refaz sem
transação para listar **todos** os erros de uma vez — use só para diagnosticar,
depois corrija o `.sql` e rode o modo normal.

### 5. Arquivos do Storage

```bash
node scripts/db-migrate/03-storage.mjs --dry-run   # lista o que copiaria
node scripts/db-migrate/03-storage.mjs
```

**Este passo não é opcional.** O `data.sql` traz as linhas de `storage.objects`,
então depois do passo 4 o banco novo *acha* que tem os arquivos e devolve 404 em
todo download até os binários subirem. Buckets envolvidos:
`opportunity-documents` (privado, anexos) e `tenant-branding` (público, logos).

### 6. Conferência

```bash
./scripts/db-migrate/04-verify.sh
```

Compara linha a linha as duas pontas. Divergência é esperada apenas nas tabelas
listadas em `EXTRA_EXCLUDES`.

## O buraco do `auth` e do `storage` — leia antes de cortar

`supabase db dump` exclui os schemas `auth` e `storage` de propósito, porque a
estrutura deles é da plataforma. O efeito colateral é que **tudo que as nossas
migrations criaram lá dentro fica para trás**, sem erro nenhum no restore:

| O que se perde | Migration que criou | Sintoma no projeto novo |
|---|---|---|
| trigger `trg_auth_user_created` em `auth.users` | 0001 | cadastro novo cria usuário sem `profile` — login entra em app quebrado |
| 13 policies de RLS em `storage.objects` | 0018, 0033, 0040, 0044, 0046, 0047, 0057 | bucket privado sem policy: anexo não sobe nem baixa |

Foi exatamente o que aconteceu na primeira migração — o restore acusou 0 erros e
mesmo assim o destino subiu sem o trigger e sem nenhuma das 13 policies. É o que
`01b-extras.sh` e `02b-apply-extras.sh` resolvem, gerando o DDL a partir do
**catálogo da origem** (e não das migrations, para pegar também o que foi
aplicado direto no SQL Editor).

Confira sempre depois do corte:

```sql
select count(*) from pg_policies where schemaname = 'storage';  -- espera 13
select count(*) from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace np on np.oid = p.pronamespace
 where n.nspname = 'auth' and not t.tgisinternal and np.nspname = 'public';  -- espera 1
```

## Delta: por que contagem de linha não basta

`04-verify.sh` compara contagens, o que pega INSERT e DELETE mas **não pega
UPDATE**. Numa segunda passada encontramos 80 linhas alteradas na origem que a
contagem dava como iguais dos dois lados.

O `audit_log` mostra o que mudou, mas cobre só 9 tabelas — as que têm trigger de
auditoria (`invited_emails`, `opportunities`, `opportunity_assignees`,
`opportunity_documents`, `opportunity_notes`, `opportunity_risks`,
`opportunity_tasks`, `profiles`, `tenants`). Fora dessa lista —
`opportunity_phases`, `tenant_sequences`, `psw_tenant_admins` — um UPDATE é
invisível para os dois métodos.

Conclusão prática: **não tente sincronizar por delta.** Enquanto o destino não
tiver dados próprios, refazer do zero (`02a-reset-destino` + `02-restore`) é mais
barato e é exato por construção. Para saber se o destino já tem dado próprio:

```sql
-- se voltar linha, alguém trabalhou no banco novo e um reset perderia isso
select max(created_at) from public.audit_log;
```

## O que o dump NÃO leva — checklist de corte

Nada disso vive no Postgres, então precisa ser refeito no projeto novo:

- [ ] **Chaves de API** — `anon` e `service_role` são outras. Atualizar
      `.env.local` e as env vars na Vercel. Lembrando que este projeto **não tem
      git integration**: `vercel deploy --prod` de um worktree limpo, depois
      `vercel alias set <deploy-url> coe-hiperautomacao.vercel.app`.
- [ ] **Auth > URL Configuration** — Site URL e Redirect URLs.
- [ ] **Auth > Emails** — SMTP e os templates de `supabase/email-templates/`
      (`reset-password.html`, `password-changed.html`).
- [ ] **Auth > Providers** — o que estiver habilitado na origem.
- [ ] **Database > Extensions** — o preflight lista as que faltam.
- [ ] **Database Webhooks**, se houver.
- [ ] **Convites e links de reset pendentes** — os tokens de uso único não vêm
      (e os links já emitidos apontam para o domínio do projeto antigo de
      qualquer jeito). Reenviar depois do corte.
- [ ] **Sessões ativas** — o JWT secret do projeto novo é outro, então todo
      mundo é deslogado e loga de novo. **As senhas continuam valendo**: o hash
      mora em `auth.users`, que vem na cópia.
- [ ] `SUPABASE_PROJECT_REF` — usado pelo `npm run gen:types`.

Realtime e Edge Functions não se aplicam: este projeto não usa nenhum dos dois.

## Decisões embutidas nos scripts

**`storage.buckets_vectors` e `storage.vector_indexes` são excluídos do dump de
dados.** São tabelas novas do Storage que podem não existir no destino; a doc
oficial manda excluir sempre.

**`EXTRA_EXCLUDES` descarta ruído efêmero** por padrão — `auth.audit_log_entries`
(costuma ter centenas de milhares de linhas de log interno do GoTrue),
`auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims`, `auth.flow_state`,
`auth.one_time_tokens`. Sessões e tokens seriam inválidos no destino de qualquer
forma, porque o JWT secret é outro. Para uma cópia byte-a-byte inclusive do lixo,
deixe a variável vazia no `.env`.

**`SET session_replication_role = replica` durante a carga.** Desliga os triggers
do app (sync de fase, guard de branding do `tenants`, audit) — sem isso eles
disparam no meio do restore e reescrevem ou rejeitam linhas que deveriam entrar
exatamente como estão.

**Os paths do Storage são preservados byte a byte.**
`opportunity_documents.storage_path` e `tenants.logo_path` guardam o path como
texto puro; path diferente significa anexo e logo quebrados.

**`supabase db dump` em vez de `pg_dump` cru.** O CLI aplica a filtragem
específica da plataforma: remove schemas internos, comenta as roles reservadas
(`anon`, `authenticated`, `service_role`, `supabase_*`) e injeta `IF NOT EXISTS`.
`pg_dump` direto traz as tripas da plataforma e o restore morre em erro de
permissão.

## Rollback

O projeto antigo não é tocado em nenhum passo — todos os scripts que leem a
origem são somente-leitura. Reverter o corte é apontar as env vars de volta para
o projeto antigo e redeployar. Enquanto o DNS/env não virar, o banco novo é só
uma cópia parada.
