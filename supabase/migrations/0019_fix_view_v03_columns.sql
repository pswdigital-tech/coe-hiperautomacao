-- =============================================================================
-- 0019_fix_view_v03_columns.sql — Recria opportunities_with_score (colunas v0.3)
-- =============================================================================
-- Bug: a migration 0017 adicionou 9 colunas em `opportunities` (criticidade +
-- campos operacionais + datas COE), mas a view `opportunities_with_score`
-- (recriada em 0011 com `select o.*`) NÃO foi recriada junto. No Postgres, uma
-- view com `select o.*` congela a lista de colunas no momento da criação —
-- colunas adicionadas depois na tabela base não aparecem na view
-- automaticamente. Resultado: `column opportunities_with_score.criticidade
-- does not exist` (e as demais 8 colunas de 0017), pois `queries.ts` lê dessa
-- view, não da tabela diretamente.
--
-- Fix: DROP + CREATE da view, idêntica a 0011 (mesma definição), o que basta
-- para capturar o shape atual de `opportunities` (pós-0017).
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0001..0018 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

drop view if exists opportunities_with_score;
create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte) as score,
  case when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 70 then 'alta'
       when opportunity_score(o.esforco,o.complexidade,o.tempo,o.objetivo,o.fte) >= 40 then 'media'
       else 'baixa' end as priority_level
from opportunities o;
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- FIM 0019 — opportunities_with_score agora expõe todas as colunas v0.3
-- (criticidade, azure_boards_codigo, linguagem, execucao, usuarios_servico,
-- execucoes_mes, data_conclusao, data_abertura_coe, data_fechamento_coe).
-- =============================================================================
