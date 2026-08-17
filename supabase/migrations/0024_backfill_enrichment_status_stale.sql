-- =============================================================================
-- 0024_backfill_enrichment_status_stale.sql — Backfill ai_enrichment_status
-- (linhas de seed antigas, qualquer tenant)
-- =============================================================================
-- Ported/generalizado de origin/feat/v0.3-produtizacao (commit 6ce45d1, migration
-- 0019 daquela branch — "backfill_enrichment_status_gsmm", nunca mesclada).
--
-- BUG: qualquer oportunidade inserida via SQL puro (seeds 0003 FGCoop, 0013
-- Unidasul, 0023 GSMM) nunca passa pelo enrichment por IA — que só roda no
-- `after()` de `createOpportunity`/`createPublicOpportunity` (Server Actions).
-- Essas linhas herdam o default 'pending' de `ai_enrichment_status` (0010) e
-- FICAM PENDENTES PARA SEMPRE. SINTOMA: ao abrir qualquer uma no modal, liga o
-- overlay "Enriquecendo com IA…" (OpportunityDetail: isPending) e fica em
-- polling até o safety-net de 20s desistir — toda vez que reabre.
--
-- CONTEXTO: este backfill (com WHERE genérico, não restrito a um tenant) já foi
-- APLICADO diretamente no banco Supabase Cloud compartilhado fora do histórico
-- deste repositório — confirmado em 2026-07-16: FGCoop (29 opps) e Unidasul (66
-- opps) já aparecem 100% 'enriched' no banco vivo, apesar de NENHUMA migration
-- deste repositório jamais ter feito esse UPDATE. Esta migration existe para
-- que o histórico reflita o que já está em produção — reaplicar é NO-OP na
-- prática (nada mais deveria estar 'pending' há >10min), mas fecha a lacuna
-- para um ambiente novo/staging semeado do zero com 0003+0013+0023.
--
-- FIX: marcar como 'enriched' as linhas 'pending' com mais de 10 minutos —
-- guard por idade evita clobberar uma oportunidade recém-criada pelo app cujo
-- `after()` ainda está processando (não é uma condição de corrida real, é só
-- defesa: o enrichment normalmente completa em segundos).
--
-- IDEMPOTENTE — reaplicar não tem efeito quando não há 'pending' antigo.
-- WRITE-ONLY MODE — aplicar MANUALMENTE no Supabase Cloud SQL Editor do projeto
--   do app (vxgthycrjetniejsjmee). NÃO rodar `supabase db push`.
-- Pré-requisitos: 0001..0023 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

update opportunities
set
  ai_enrichment_status = 'enriched',
  ai_enriched_at = coalesce(ai_enriched_at, now())
where
  ai_enrichment_status = 'pending'
  and created_at < now() - interval '10 minutes';

-- =============================================================================
-- FIM 0024 — linhas de seed 'pending' antigas (qualquer tenant) → 'enriched'.
-- Oportunidades novas (criadas pelo app) continuam 'pending' até o enrichment
-- por IA concluir normalmente, sem serem afetadas por este backfill.
-- =============================================================================
