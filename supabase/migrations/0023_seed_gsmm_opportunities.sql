-- =============================================================================
-- 0023_seed_gsmm_opportunities.sql — Tenant GSMM + admin + 10 oportunidades (levantamento)
-- =============================================================================
-- Ported de origin/feat/v0.3-produtizacao (commit 6ce45d1ee004ac8180eaf8a589bc
-- 174b1fdaf076, migration 0018 daquela branch, nunca mesclada, renumerada aqui
-- para 0023 por convenção — ver memória feat-v03-produtizacao-branch-conflict).
--
-- CONTEXTO: este seed já foi APLICADO diretamente no banco Supabase Cloud
-- compartilhado (fora do histórico deste repositório) — confirmado via query
-- direta em 2026-07-16 (tenant `gsmm` existe, UUID e dados batem com o script
-- abaixo). Esta migration existe para que o histórico do repositório reflita o
-- que já está em produção — reaplicar aqui é NO-OP (idempotente por count,
-- como 0002/0013), mas garante que um ambiente novo/staging a partir do zero
-- reproduza o mesmo estado.
--
-- Cria, para o cliente GSMM:
--   • Tenant `gsmm` (UUID fixo 60000001-...)
--   • Auth user gsmm.admin@pswdigital.com.br / 123456789 (UUID fixo d0000001-...)
--     com role tenant_admin (admin da empresa, NÃO platform_admin).
--   • Identidade email no auth.identities (necessário p/ login email+senha).
--   • Profile vinculado é criado AUTOMATICAMENTE pelo trigger handle_new_user.
--     Após a 0022 (allowlist) o trigger é "convite-first": sem convite pendente
--     ele cai no fallback raw_app_meta_data->>'tenant_id' (setável só por
--     service_role / SQL), exatamente o que este seed faz — igual a 0002/0013.
--   • 10 oportunidades do LEVANTAMENTO INICIAL da GSMM, na shape v0.2.
--
-- ⚠️  ESTIMATIVAS MACRO / PLACEHOLDER — VALIDAR COM O TIME.
--   Não havia dados reais por processo. Os 5 fatores de score (esforco,
--   complexidade, tempo, objetivo, fte) foram estimados pela característica de
--   automação típica de cada tipo de processo. criterios (8 chaves) e beneficios
--   (8 chaves) ficam NEUTROS (tudo 'parcial' / tudo 3) de propósito — sinalizam
--   "não avaliado ainda". Campos sem dado coletado (volume_medio, tempo_execucao,
--   num_pessoas, fte_horas) ficam NULL para a área preencher.
--
-- NOTA: `ferramenta`/`status` no banco vivo hoje diferem do valor inicial de
--   algumas linhas abaixo (uso normal do app depois do seed — edição/kanban).
--   Migration de seed captura o estado INICIAL, não um snapshot ao vivo; não
--   sincronizamos edições posteriores de volta pra cá (mesmo padrão de 0003/0013).
--
-- WRITE-ONLY MODE — aplicar MANUALMENTE no Supabase Cloud SQL Editor do projeto
--   do app (vxgthycrjetniejsjmee). NÃO rodar `supabase db push`.
--
-- Pré-requisitos: 0001..0022 aplicadas (schema v0.3 completo + allowlist).
--
-- IDEMPOTENTE: on conflict no tenant/user + GUARD POR COUNT no insert das 10.
-- NUNCA inserimos seq_id (trigger), rpa_score (GENERATED), score/priority_level
--   (view opportunities_with_score) — docs/PROJETO.md §3.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. Tenant GSMM — UUID fixo próprio, distinto dos demais (FGCoop 11111111,
--    Unidasul 55551da5, PSW cccccccc).
-- -----------------------------------------------------------------------------
insert into tenants (id, name, slug)
values ('60000001-0000-0000-0000-000000000001'::uuid, 'GSMM', 'gsmm')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Auth user + identity do admin GSMM (espelha 0013 §2). UUID fixo d0000001-...
-- -----------------------------------------------------------------------------
do $$
declare
  v_user_id   uuid := 'd0000001-0000-0000-0000-000000000001'::uuid;
  v_tenant_id uuid := '60000001-0000-0000-0000-000000000001'::uuid;
  v_email     text := 'gsmm.admin@pswdigital.com.br';
  v_password  text := '123456789';
  v_full_name text := 'Admin GSMM';
begin
  -- 2a. auth.users -----------------------------------------------------------
  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),                                       -- email já confirmado
      jsonb_build_object(
        'provider',  'email',
        'providers', jsonb_build_array('email'),
        'tenant_id', v_tenant_id::text             -- lido pelo trigger (fallback service_role)
      ),
      jsonb_build_object(
        'full_name', v_full_name,
        'tenant_id', v_tenant_id::text
      ),
      now(), now(), '', '', '', ''
    );
  end if;

  -- 2b. auth.identities ------------------------------------------------------
  if not exists (
    select 1 from auth.identities where provider = 'email' and user_id = v_user_id
  ) then
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object(
        'sub',            v_user_id::text,
        'email',          v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    );
  end if;

  -- 2c. profile (fallback caso o trigger não rode) + garante role tenant_admin.
  if not exists (select 1 from profiles where id = v_user_id) then
    insert into profiles (id, tenant_id, email, full_name, role)
    values (v_user_id, v_tenant_id, v_email, v_full_name, 'tenant_admin')
    on conflict (id) do nothing;
  else
    update profiles set role = 'tenant_admin'
    where id = v_user_id and role <> 'tenant_admin';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Sanity check: tenant e admin precisam existir antes do insert.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from tenants where id = '60000001-0000-0000-0000-000000000001'::uuid) then
    raise exception 'Tenant GSMM não encontrado. Verifique o Bloco 1.';
  end if;
  if not exists (select 1 from auth.users where id = 'd0000001-0000-0000-0000-000000000001'::uuid) then
    raise exception 'Admin GSMM não encontrado. Verifique o Bloco 2.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Guard de idempotência por count + INSERT das 10 oportunidades.
--    criterios NEUTRO (tudo 'parcial') e beneficios NEUTRO (tudo 3) em todas —
--    placeholder explícito. Diferenciação real só nos 5 fatores de score.
--    solicitante = 'A validar' (NOT NULL); volume/tempo_execucao/num_pessoas/
--    fte_horas = NULL (não coletados). ai_enrichment_status já nasce 'enriched'
--    (ver nota no bloco 4b) — evita o overlay "Enriquecendo…" eterno (0024).
-- -----------------------------------------------------------------------------
do $$
declare
  v_tenant_id uuid := '60000001-0000-0000-0000-000000000001'::uuid;
  v_user_id   uuid := 'd0000001-0000-0000-0000-000000000001'::uuid;
  -- templates neutros reutilizados em todas as linhas (placeholder a validar)
  v_criterios jsonb := '{"causaReclamacoes":"parcial","totalmenteManual":"parcial","regrasClaras":"parcial","decisaoHumana":"parcial","padronizacaoDocs":"parcial","validacaoDados":"parcial","schedulable":"parcial","temDocumentacao":"parcial"}'::jsonb;
  v_beneficios jsonb := '{"reducaoTempo":3,"eliminacaoErros":3,"produtividade":3,"qualidadeDados":3,"reducaoCustos":3,"reducaoRetrabalho":3,"compliance":3,"objetivosEstrategicos":3}'::jsonb;
begin
  if (select count(*) from opportunities where tenant_id = v_tenant_id) > 0 then
    raise notice 'GSMM já tem oportunidades — pulando insert (idempotência).';
  else
    insert into opportunities (
      tenant_id, source, solicitante, email, area, subarea, processo,
      fonte, tipo_processo, frequencia, ferramenta,
      esforco, complexidade, tempo, objetivo, fte,
      criterios, beneficios, status, created_by
    ) values
    -- 01 — Gestão de contratos (Jurídico / Operacional)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Jurídico', 'Operacional', 'Gestão de contratos',
     'Levantamento Inicial', array['Jurídico','Operacional']::text[], 'Mensal', 'ambos'::automation_tool,
     'medio'::effort_level, 'alto'::complexity_level, 'mensal'::frequency_bucket, 3, 'baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 02 — Gestão ambiental (Operacional / Compliance)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Operacional', 'Compliance', 'Gestão ambiental',
     'Levantamento Inicial', array['Operacional','Compliance']::text[], 'Mensal', 'n8n'::automation_tool,
     'medio'::effort_level, 'alto'::complexity_level, 'mensal'::frequency_bucket, 3, 'muito_baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 03 — Gestão societária (Jurídico / Governança)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Jurídico', 'Governança', 'Gestão societária',
     'Levantamento Inicial', array['Jurídico','Governança']::text[], 'Anual', 'n8n'::automation_tool,
     'baixo'::effort_level, 'alto'::complexity_level, 'anual'::frequency_bucket, 2, 'muito_baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 04 — Processo da requisição ao pagamento / P2P (Financeiro / Operacional)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Financeiro', 'Operacional', 'Processo da requisição ao pagamento',
     'Levantamento Inicial', array['Financeiro','Operacional']::text[], 'Diário', 'rpa'::automation_tool,
     'alto'::effort_level, 'medio'::complexity_level, 'diario'::frequency_bucket, 4, 'alto'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 05 — Processo de orçamento e revisão (Financeiro / Planejamento)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Financeiro', 'Planejamento', 'Processo de orçamento e revisão',
     'Levantamento Inicial', array['Financeiro','Planejamento']::text[], 'Mensal', 'ambos'::automation_tool,
     'medio'::effort_level, 'medio'::complexity_level, 'mensal'::frequency_bucket, 3, 'baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 06 — Processo de contratação ao desligamento (RH / Operacional)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Recursos Humanos', 'Operacional', 'Processo de contratação ao desligamento',
     'Levantamento Inicial', array['Recursos Humanos','Operacional']::text[], 'Semanal', 'rpa'::automation_tool,
     'medio'::effort_level, 'medio'::complexity_level, 'semanal'::frequency_bucket, 3, 'medio'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 07 — Processo de Investimentos e Gestão de Portfolio (Financeiro)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Financeiro', 'Investimentos', 'Processo de Investimentos e Gestão de Portfolio',
     'Levantamento Inicial', array['Financeiro']::text[], 'Semanal', 'ambos'::automation_tool,
     'medio'::effort_level, 'alto'::complexity_level, 'semanal'::frequency_bucket, 3, 'baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 08 — Processo de manejo de gado (Pecuária / Operacional)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Pecuária', 'Operacional', 'Processo de manejo de gado',
     'Levantamento Inicial', array['Operacional','Pecuária']::text[], 'Diário', 'n8n'::automation_tool,
     'medio'::effort_level, 'alto'::complexity_level, 'diario'::frequency_bucket, 3, 'medio'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 09 — Gestão de vendas (Comercial / Pecuária)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Comercial', 'Pecuária', 'Gestão de vendas',
     'Levantamento Inicial', array['Comercial / Vendas','Pecuária']::text[], 'Diário', 'rpa'::automation_tool,
     'medio'::effort_level, 'medio'::complexity_level, 'diario'::frequency_bucket, 3, 'medio'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id),
    -- 10 — SST – Saúde e Segurança do Trabalho (RH / Compliance)
    (v_tenant_id, 'formulario'::opportunity_source, 'A validar', null, 'Recursos Humanos', 'Compliance', 'SST – Saúde e Segurança do Trabalho',
     'Levantamento Inicial', array['Recursos Humanos','Compliance']::text[], 'Mensal', 'rpa'::automation_tool,
     'medio'::effort_level, 'medio'::complexity_level, 'mensal'::frequency_bucket, 3, 'baixo'::fte_bucket,
     v_criterios, v_beneficios, 'novo'::opportunity_status, v_user_id);

    -- IMPORTANTE: estas 10 linhas são inseridas via SQL e NUNCA passam pelo
    -- enrichment por IA (que só roda no after() de createOpportunity). Sem isto
    -- herdam o default 'pending' da 0010 e o modal mostra o overlay
    -- "Enriquecendo com IA…" eternamente a cada abertura. Marca como 'enriched'
    -- já no seed para nascer correto num re-seed / DB limpo (backfill genérico
    -- de linhas antigas de qualquer tenant fica em 0024).
    update opportunities
    set ai_enrichment_status = 'enriched',
        ai_enriched_at = coalesce(ai_enriched_at, now())
    where tenant_id = v_tenant_id and ai_enrichment_status = 'pending';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Verificação rápida (descomente após rodar):
-- -----------------------------------------------------------------------------
-- select seq_id, processo, area, ferramenta, esforco, complexidade, tempo, fte, score, priority_level, rpa_score
-- from opportunities_with_score
-- where tenant_id = '60000001-0000-0000-0000-000000000001'::uuid
-- order by seq_id;

-- =============================================================================
-- FIM 0023 — GSMM: tenant + admin (tenant_admin) + 10 oportunidades (placeholder).
-- =============================================================================
