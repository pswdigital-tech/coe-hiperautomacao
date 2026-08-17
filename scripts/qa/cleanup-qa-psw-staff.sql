-- =============================================================================
-- cleanup-qa-psw-staff.sql — desfaz scripts/qa/seed-qa-psw-staff.sql
-- =============================================================================
-- Remove o usuário de QA, suas atribuições e (se ficou vazio) o tenant da PSW.
-- Não toca em NENHUM dado real: só age sobre os ids fixos da faixa `fa5f…`.
--
-- Rode quando a verificação visual da Phase 17 estiver concluída.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

do $$
declare
  v_tenant_psw uuid := 'fa5f0000-0000-4000-8000-000000000001'::uuid;
  v_user_id    uuid := 'fa5f0000-0000-4000-8000-000000000002'::uuid;
  v_restantes  int;
begin
  -- Atribuições (o cascade de profiles já faria, mas explícito é mais claro).
  delete from opportunity_assignees where profile_id = v_user_id;

  -- auth.users → cascateia para profiles e identities.
  delete from auth.users where id = v_user_id;

  -- Só remove o tenant da PSW se ele tiver ficado sem gente e sem demanda —
  -- se alguém real já foi cadastrado nele, o tenant fica.
  select (select count(*) from profiles      where tenant_id = v_tenant_psw)
       + (select count(*) from opportunities where tenant_id = v_tenant_psw)
    into v_restantes;

  if v_restantes = 0 then
    delete from tenants where id = v_tenant_psw;
    raise notice 'Usuário de QA e tenant PSW removidos.';
  else
    raise notice 'Usuário de QA removido. Tenant PSW mantido (% registro(s) vinculado(s)).', v_restantes;
  end if;
end $$;

-- Conferência: as duas queries devem voltar vazias.
select id, email from auth.users where id = 'fa5f0000-0000-4000-8000-000000000002'::uuid;
select id, name  from tenants   where id = 'fa5f0000-0000-4000-8000-000000000001'::uuid;
