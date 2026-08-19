-- =============================================================================
-- 0064_platform_admin_set_profile_role.sql — troca de papel de uma pessoa
-- =============================================================================
-- PEDIDO DO PO (2026-08-19): em /admin/invites, na lista "Pessoas com conta",
-- o super-admin da PSW precisa conseguir mudar o papel de alguém entre os três
-- papéis de CLIENTE — Membro, Leitor e Admin da empresa. Hoje o papel é
-- decidido no convite e nunca mais muda: promover um membro a admin exige SQL
-- no banco.
--
-- POR QUE UMA RPC E NÃO UMA POLICY DE UPDATE EM `profiles`:
-- `profiles` tem UMA única policy de UPDATE — `profiles_update_self` (0001):
--   using (id = auth.uid()) with check (id = auth.uid() and tenant_id = ...)
-- A 0053 já registrou por escrito por que ela nunca foi alargada (linhas 17-21
-- daquele arquivo): "a mesma policy que deixasse gravar `visibility_scope`
-- deixaria gravar `role`, que é escalação de privilégio direta". Abrir agora um
-- `profiles_update_platform_admin` daria ao super-admin UPDATE irrestrito na
-- tabela inteira — inclusive sobre `tenant_id` (mover pessoa de empresa) e
-- sobre a própria linha, permitindo lavar o papel de qualquer um para
-- `platform_admin`. A RPC entrega exatamente o verbo pedido, numa coluna só,
-- num conjunto fechado de valores, e deixa a policy viva intocada.
--
-- INVARIANTES (todas checadas ANTES da escrita, cada uma com exceção pt-BR):
--   1. Só `is_platform_admin()` executa — qualquer outro papel é recusado.
--   2. O papel NOVO só pode ser 'member' | 'viewer' | 'tenant_admin'.
--      'platform_admin' e 'psw_staff' são INATRIBUÍVEIS por aqui — 'psw_staff'
--      é lotação (D-02/D-08: quem é staff nasce staff, no tenant da PSW) e
--      'platform_admin' é o próprio topo da cadeia; promover alguém a ele por
--      um <select> de tela seria transformar esta RPC no bypass que ela existe
--      para evitar. Continuam sendo mudança manual e deliberada no banco.
--   3. O papel ATUAL da pessoa também tem que ser um dos três. Sem isto, o
--      super-admin poderia REBAIXAR um `psw_staff` (que perderia as
--      atribuições da 0044 sem aviso) ou outro `platform_admin`.
--   4. Ninguém muda o próprio papel. Um super-admin distraído se rebaixaria a
--      'member' e perderia o acesso a /admin — sem outro super-admin, o
--      conserto voltaria a ser SQL no banco. Auto-rebaixamento não é um verbo
--      que uma tela de admin deva ter.
--
-- O QUE ESTA MIGRATION *NÃO* MUDA: nenhuma policy, nenhuma coluna, nenhuma
-- linha. Só cria a função. Antes de alguém chamá-la, o comportamento do
-- sistema é bit-a-bit o de hoje.
--
-- EFEITO COLATERAL ESPERADO DA TROCA (não é bug): o recorte de visibilidade da
-- 0053 é POR PESSOA e independe do papel — quem estava restrito a N
-- oportunidades continua restrito depois de virar admin da empresa. Isso é
-- proposital: papel e recorte são eixos separados, e a tela mostra os dois
-- lado a lado.
--
-- IDEMPOTENTE (`create or replace`). Pré-requisitos: 0001, 0014, 0020, 0021.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- set_profile_role(p_profile_id, p_role) — a ÚNICA porta de troca de papel
-- -----------------------------------------------------------------------------
-- Devolve o papel gravado (texto) para o chamador confirmar sem reler a linha.
-- Comparações em `::text` pelo mesmo motivo da 0021: não depender da ordem de
-- commit dos valores do enum `tenant_role`.
create or replace function set_profile_role(
  p_profile_id uuid,
  p_role       text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  -- (1) só super-admin de plataforma
  if not is_platform_admin() then
    raise exception 'Acesso negado.';
  end if;

  if p_profile_id is null then
    raise exception 'Pessoa é obrigatória';
  end if;

  -- (4) nunca o próprio papel
  if p_profile_id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio papel.';
  end if;

  -- (2) allowlist do papel NOVO
  if p_role is null or p_role not in ('member', 'viewer', 'tenant_admin') then
    raise exception 'Papel inválido.';
  end if;

  select role::text into v_current_role
  from profiles
  where id = p_profile_id;

  if v_current_role is null then
    raise exception 'Pessoa não encontrada.';
  end if;

  -- (3) allowlist do papel ATUAL
  if v_current_role not in ('member', 'viewer', 'tenant_admin') then
    raise exception 'Só é possível trocar entre Membro, Leitor e Admin da empresa.';
  end if;

  update profiles
     set role = p_role::tenant_role
   where id = p_profile_id;

  return p_role;
end;
$$;

-- `authenticated` porque é o role de quem está logado; o filtro real de quem
-- pode é o `is_platform_admin()` no corpo, não o GRANT.
revoke all on function set_profile_role(uuid, text) from public;
grant execute on function set_profile_role(uuid, text) to authenticated;

-- =============================================================================
-- SMOKE TEST (rodar logado como platform_admin no SQL Editor):
--
--   -- 1. troca válida — ESPERADO: retorna 'tenant_admin'
--   select set_profile_role('<uuid-de-um-member>'::uuid, 'tenant_admin');
--
--   -- 2. papel inatribuível — ESPERADO: exceção 'Papel inválido.'
--   select set_profile_role('<uuid-de-um-member>'::uuid, 'platform_admin');
--
--   -- 3. alvo fora dos três papéis — ESPERADO: exceção
--   --    'Só é possível trocar entre Membro, Leitor e Admin da empresa.'
--   select set_profile_role('<uuid-de-um-psw_staff>'::uuid, 'member');
--
--   -- 4. si mesmo — ESPERADO: exceção 'Você não pode alterar o seu próprio papel.'
--   select set_profile_role(auth.uid(), 'member');
--
--   -- 5. como NÃO-super-admin — ESPERADO: exceção 'Acesso negado.'
--
--   -- 6. volta ao estado original:
--   select set_profile_role('<uuid>'::uuid, 'member');
-- =============================================================================
-- FIM 0064
-- =============================================================================
