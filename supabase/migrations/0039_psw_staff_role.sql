-- =============================================================================
-- 0039_psw_staff_role.sql — Novo valor 'psw_staff' no enum tenant_role
-- =============================================================================
-- CONTEXTO: hoje, para uma pessoa da PSW (dev, tech lead, PM) trabalhar numa
-- demanda de um cliente, ela é cadastrada DENTRO DO TENANT DAQUELE CLIENTE — e
-- aí enxerga TUDO do cliente. Pior: se ela precisar atuar num segundo cliente,
-- o cadastro falha, porque o e-mail já existe em `auth.users` (um mesmo e-mail
-- não pode ter dois `profiles` em tenants diferentes).
--
-- O QUE O PAPEL NOVO SIGNIFICA: uma pessoa `psw_staff` é cadastrada UMA ÚNICA
-- VEZ, com `profiles.tenant_id` apontando para o tenant da PSW — nunca para o
-- do cliente. O acesso dela NÃO é o tenant inteiro: é o conjunto de
-- oportunidades às quais ela foi atribuída via `opportunity_assignees` (0032),
-- possivelmente de tenants A, B e C ao mesmo tempo. `profiles.tenant_id`
-- continua único e NOT NULL — o multi-tenant vem da tabela de atribuição,
-- nunca de uma segunda linha em `profiles`.
--
-- Esta migration SÓ adiciona o valor ao enum. O helper SQL, o trigger
-- reescrito e as policies aditivas de RLS que o referenciam vêm nas migrations
-- seguintes (0040+), porque o Postgres NÃO deixa um valor de enum recém-criado
-- ser USADO na mesma transação em que foi adicionado — mesma razão documentada
-- no cabeçalho da 0020 (o par 0020 → 0021 é o precedente direto deste padrão).
--
-- IMPORTANTE: isto NÃO promove ninguém. Para tornar um usuário `psw_staff`,
-- rode (com service_role / SQL Editor) algo como:
--     update profiles set role = 'psw_staff' where email = 'pessoa@psw...';
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- IDEMPOTENTE — o `add value if not exists` garante que rodar duas vezes não
-- gera erro.
-- Colar e RODAR SOZINHA (não colar junto com a 0040, nem qualquer outra
-- migration, no mesmo Run do SQL Editor).
-- Pré-requisito: 0001..0037 aplicadas (a 0038 é opcional e não é
-- pré-requisito de nada aqui).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type tenant_role add value if not exists 'psw_staff';

-- =============================================================================
-- FIM 0039 — tenant_role agora tem 'member' | 'tenant_admin' | 'viewer' |
-- 'platform_admin' | 'psw_staff'. PRÓXIMO PASSO OBRIGATÓRIO: aplicar a 0040
-- numa SEGUNDA execução separada, só depois de confirmar que esta transação
-- commitou.
-- =============================================================================
