-- =============================================================================
-- 0016_status_enum_v03.sql — 3 novos status no pipeline (v0.3)
-- =============================================================================
-- Pipeline passa de 8 para 11 status: mantém os 7 do fluxo linear (em_analise
-- .. concluido, que espelham phase_key) + 'novo' (pré-pipeline), e ganha:
--   - 'gestao'        — em desenvolvimento interno, fora do fluxo de fases datado
--   - 'manutencao'     — automação já em produção, em manutenção pontual
--   - 'descontinuado'  — automação desativada (status terminal, como 'concluido')
--
-- Nenhum dos 3 tem phase_key correspondente em opportunity_phases (só os 7
-- status do fluxo linear têm) — a migration 0017 ajusta o trigger
-- sync_opportunity_phase() (0004) para tratá-los como 'novo' (sem phase row),
-- e não nesta migration, porque um valor de enum recém-adicionado NÃO PODE ser
-- usado (comparado/castado) na MESMA transação em que foi criado.
--
-- ISOLADO EM MIGRATION PRÓPRIA DE PROPÓSITO (mesmo motivo de 0014): a 0017
-- só pode ser colada DEPOIS desta ter sido executada (commitada) no SQL Editor.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Colar e RODAR SOZINHA (não colar junto com 0017 no mesmo Run).
-- Pré-requisito: 0001..0015 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type opportunity_status add value if not exists 'gestao';
alter type opportunity_status add value if not exists 'manutencao';
alter type opportunity_status add value if not exists 'descontinuado';

-- =============================================================================
-- FIM 0016 — opportunity_status agora tem 11 valores.
-- PRÓXIMO PASSO OBRIGATÓRIO: aplicar 0017 numa segunda execução separada.
-- =============================================================================
