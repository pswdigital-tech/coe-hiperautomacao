-- =============================================================================
-- 0014_rbac_viewer_enum.sql — Novo valor 'viewer' no enum tenant_role
-- =============================================================================
-- v0.3 — RBAC simples por usuário: 'member' (editor, default) vs 'viewer'
-- (somente leitura). 'tenant_admin' segue existindo (0001), sem mudança de
-- comportamento — é só um rótulo hoje, não gate de nada.
--
-- ISOLADO EM MIGRATION PRÓPRIA DE PROPÓSITO: o Postgres não permite usar um
-- valor de enum recém-adicionado (ALTER TYPE ... ADD VALUE) na MESMA transação
-- em que ele foi criado. A migration 0015 (que cria a policy usando 'viewer')
-- só pode ser colada DEPOIS desta ter sido executada (commitada) no SQL Editor.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Colar e RODAR SOZINHA (não colar junto com 0015 no mesmo Run).
-- Pré-requisito: 0001..0013 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type tenant_role add value if not exists 'viewer';

-- =============================================================================
-- FIM 0014 — tenant_role agora tem 'member' | 'tenant_admin' | 'viewer'.
-- PRÓXIMO PASSO OBRIGATÓRIO: aplicar 0015 numa segunda execução separada.
-- =============================================================================
