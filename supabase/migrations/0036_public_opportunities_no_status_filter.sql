-- =============================================================================
-- 0036_public_opportunities_no_status_filter.sql — seletor público lista todas
-- =============================================================================
-- CONTEXTO: 0035 criou `fetch_public_opportunities` filtrando por
-- `status in ('desenvolvimento','homologacao','producao','concluido')` — a ideia
-- era só oferecer, no seletor de "projeto associado" do formulário público,
-- automações que de fato já existem, e de quebra não expor ideias em triagem.
--
-- NA PRÁTICA O FILTRO ZERA A LISTA. Levantamento em 2026-07-31 na base real:
-- das 119 oportunidades dos 6 tenants ativos, ZERO estão nesses status — 118 em
-- 'novo' e 1 em 'backlog'. O pipeline é movimentado fora do campo `status`, então
-- o seletor aparecia sempre vazio e a feature não funcionava.
--
-- DECISÃO DE PRODUTO (2026-07-31): cai o filtro de status; fica só `visivel`.
-- Consequência assumida: quem tem o link público passa a ver a lista de
-- processos da empresa, inclusive os em triagem. Continua valendo o recorte
-- mínimo — `processo` truncado em 160 chars, sem solicitante, sem e-mail, sem
-- score, sem status — e o botão de escape é `visivel = false` (0030), que segue
-- excluindo a linha daqui.
--
-- `create or replace` BASTA: assinatura e tipo de retorno idênticos aos de 0035
-- (o drop+create de 0034 foi necessário porque LÁ o retorno mudou).
--
-- IDEMPOTENTE. Pré-requisito: 0035 aplicada.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

create or replace function public.fetch_public_opportunities(p_slug text)
returns table (
  id uuid,
  seq_id int,
  processo text,
  area text
)
language sql
security definer
stable
set search_path = public
as $$
  select o.id,
         o.seq_id,
         left(o.processo, 160) as processo,
         o.area
    from opportunities o
    join tenants t on t.id = o.tenant_id
   where t.slug = p_slug
     and t.status = 'active'
     and o.visivel
   order by o.seq_id desc
   limit 300;
$$;

grant execute on function public.fetch_public_opportunities(text) to anon, authenticated;

-- =============================================================================
-- Smoke (após aplicar) — deve devolver linhas, ao contrário de 0035:
--   select count(*) from public.fetch_public_opportunities('unidasul');  -- ~66
--   -- e a oculta continua fora:
--   select count(*) from public.fetch_public_opportunities('fgcoop');    -- 18, não 33
-- =============================================================================
