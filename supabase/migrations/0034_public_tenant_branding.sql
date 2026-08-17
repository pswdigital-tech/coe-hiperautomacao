-- =============================================================================
-- 0034_public_tenant_branding.sql — branding no formulário público /r/<slug>
-- =============================================================================
-- CONTEXTO: 0033 deu cor e logo a cada empresa, mas o formulário público é
-- ANÔNIMO — o RLS de `tenants` não deixa o role `anon` ler nada, e a única
-- porta pra fora é `fetch_public_tenant` (0005, SECURITY DEFINER). Então a
-- porta passa a devolver também brand_color e logo_path.
--
-- Continua expondo só o que já era público por natureza (nome, slug) + a
-- identidade visual — que a empresa escolheu justamente pra aparecer. Nenhum
-- dado novo de negócio sai daqui, e o filtro `status = 'active'` fica.
--
-- `create or replace` NÃO serve: o tipo de retorno muda (2 colunas novas), e o
-- Postgres recusa. Por isso drop + create — a função é stateless, dropar não
-- perde nada.
--
-- IDEMPOTENTE. Pré-requisitos: 0005 (função original), 0033 (colunas).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

drop function if exists public.fetch_public_tenant(text);

create function public.fetch_public_tenant(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  brand_color text,
  logo_path text
)
language sql
security definer
stable
set search_path = public
as $$
  select id, name, slug, brand_color, logo_path
  from tenants
  where slug = p_slug
    and status = 'active'
  limit 1;
$$;

grant execute on function public.fetch_public_tenant(text) to anon, authenticated;

-- =============================================================================
-- FIM 0034 — fetch_public_tenant devolve brand_color + logo_path; o formulário
-- público injeta o mesmo CSS de marca do app logado (lib/branding/theme.ts).
-- =============================================================================
