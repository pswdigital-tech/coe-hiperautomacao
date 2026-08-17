-- =============================================================================
-- 0020_platform_admin_role.sql — Novo valor 'platform_admin' no enum tenant_role
-- =============================================================================
-- Ported de origin/feat/v0.3-produtizacao (commit df6a97e, renumerado — aquela
-- branch nunca foi mesclada e usava 0015/0016/0017 numa base diferente da que
-- acabou em main). Conteúdo idêntico ao original.
--
-- CONTEXTO: até aqui `tenant_role` tinha ('member', 'tenant_admin', 'viewer'
-- — este último de 0014), todos ESCOPADOS A UM TENANT. O que falta é um
-- SUPER-ADMIN DE PLATAFORMA (a PSW) que enxerga TODOS os tenants — suporte,
-- visão consolidada e gestão de quem pode criar conta.
--
-- Esta migration SÓ adiciona o valor ao enum. As policies de RLS cross-tenant
-- vêm na 0021, separadas de propósito: o Postgres não deixa um valor de enum
-- recém-criado ser USADO na mesma transação em que foi adicionado. Mantendo o
-- ALTER TYPE isolado, a 0021 pode referenciá-lo sem risco.
--
-- IMPORTANTE: isto NÃO promove ninguém. Para tornar um usuário super-admin,
-- rode (com service_role / SQL editor) algo como:
--     update profiles set role = 'platform_admin' where email = 'voce@psw...';
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Colar e RODAR SOZINHA (não colar junto com 0021 no mesmo Run).
-- Pré-requisito: 0001..0019 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type tenant_role add value if not exists 'platform_admin';

-- =============================================================================
-- FIM 0020 — tenant_role agora tem 'member' | 'tenant_admin' | 'viewer' |
-- 'platform_admin'. PRÓXIMO PASSO OBRIGATÓRIO: aplicar 0021 numa segunda
-- execução separada.
-- =============================================================================
