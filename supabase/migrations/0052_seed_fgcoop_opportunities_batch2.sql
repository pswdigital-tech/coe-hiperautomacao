-- =============================================================================
-- 0052_seed_fgcoop_opportunities_batch2.sql — 11 oportunidades FGCoop (CHM-0040..0050)
-- =============================================================================
-- Insere 11 oportunidades no tenant FGCoop (11111111-...) e atribui TODAS a
-- thiago.saldanha@pswdigital.com.br (profiles.id ddd974fa-0484-4e1c-9d9d-60c2da1b29f2)
-- como executor, via `opportunity_assignees` (0032) — não via o campo legado
-- `responsavel` (texto livre, fora da UI desde 2026-07-30).
--
-- ATRIBUIÇÃO CROSS-TENANT: o profile do Thiago vive no tenant da PSW, não no da
-- FGCoop. Isso só passa no trigger `check_assignee_tenant()` (reescrito na 0040)
-- se o papel dele for `psw_staff`. O bloco §3 valida isso ANTES e aborta com
-- mensagem clara se o papel for outro — senão o erro seria um check_violation cru.
--
-- seq_id EXPLÍCITO (40..50) para casar com os códigos CHM-0040..CHM-0050 do
-- levantamento. O trigger `set_opportunity_seq_id` só preenche quando NULL, então
-- o valor explícito vence. Linhas cujo seq_id já exista no tenant são PULADAS
-- (idempotência) — se a numeração já tiver avançado, veja o NOTICE no fim.
--
-- NUNCA inserimos: score / priority_level (view), rpa_score (GENERATED) — docs/PROJETO.md §3.
-- `ferramenta` fica NULL (não informada no levantamento). `tempo` (bucket de
-- frequência) fica NULL nas duas linhas "Eventual" (44 e 47) — não há bucket
-- 'eventual' no enum e a origem não informou.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0001..0051 aplicadas.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

do $$
declare
  v_tenant       uuid := '11111111-1111-1111-1111-111111111111';
  v_profile      uuid := 'ddd974fa-0484-4e1c-9d9d-60c2da1b29f2';
  v_profile_role text;
  v_inserted     int;
  v_assigned     int;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Pré-condições
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from tenants where id = v_tenant) then
    raise exception 'Tenant FGCoop % não existe.', v_tenant;
  end if;

  select role::text into v_profile_role from profiles where id = v_profile;
  if v_profile_role is null then
    raise exception 'Profile % (thiago.saldanha) não existe.', v_profile;
  end if;
  if v_profile_role <> 'psw_staff'
     and (select tenant_id from profiles where id = v_profile) <> v_tenant then
    raise exception
      'Profile % tem papel "%" e não pertence à FGCoop — check_assignee_tenant() (0040) '
      'só permite atribuição cross-tenant para papel psw_staff.', v_profile, v_profile_role;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. As 11 oportunidades (CHM-0040..CHM-0050)
  -- ---------------------------------------------------------------------------
  with novas (
    seq_id, solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo, fte, fte_horas,
    criterios, beneficios, observacao
  ) as (
    values
    -- CHM-0040 --------------------------------------------------------------
    (40, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Governança de Acesso no Unity Catalog',
     'Semanal', '1 a 3 Vezes', 'De 1 a 2 horas', 'De 2 a 4 pessoas',
     array['Conceder acesso por grupo, não pessoa a pessoa','Aplicar as 5 camadas de permissão de uma vez','Revisão periódica automática de quem tem acesso'],
     array['Acaba o erro de faltar uma permissão','Aprovação e revisão ficam registradas para auditoria','Não depende mais de uma pessoa só'],
     'medio', 'medio', 'semanal', 4::smallint, 'muito_baixo', 16::numeric,
     '{"schedulable":"parcial","regrasClaras":"sim","decisaoHumana":"parcial","validacaoDados":"sim","temDocumentacao":"parcial","causaReclamacoes":"sim","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":3,"produtividade":3,"reducaoCustos":2,"qualidadeDados":4,"eliminacaoErros":5,"reducaoRetrabalho":5,"compliance":5}'::jsonb,
     'Os grupos existem e estão vazios. Hoje o acesso é dado pessoa a pessoa.'),
    -- CHM-0041 --------------------------------------------------------------
    (41, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Ingestão das APIs de RH na Plataforma de Dados',
     'Mensal', '1 a 3 Vezes', '1 dia (até 8h)', '1 Pessoa',
     array['Ingerir as APIs de RH','Tratar e mascarar CPF e remuneração','Painel de headcount, custo e turnover'],
     array['Indicador de pessoal sem extração manual','Dado de RH com acesso controlado','Base para análise de custo'],
     'medio', 'medio', 'mensal', 5::smallint, 'baixo', 24::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"nao","causaReclamacoes":"parcial","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":4,"produtividade":4,"reducaoCustos":3,"qualidadeDados":5,"eliminacaoErros":4,"reducaoRetrabalho":4,"compliance":5}'::jsonb,
     'Precisa do aceite do RH sobre dado sensível antes de ingerir.'),
    -- CHM-0042 --------------------------------------------------------------
    (42, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Gerência Jurídica', 'Coordenação Jurídica', 'Ingestão da Base de Monitoramento Legislativo (Sigalei)',
     'Diário', '1 a 3 Vezes', 'De 1 a 2 horas', '1 Pessoa',
     array['Ingerir as proposições monitoradas todo dia','Guardar histórico do que sai do monitoramento','Consulta em linguagem natural do radar'],
     array['Acaba o acompanhamento manual','Histórico preservado','Radar junto com as outras bases'],
     'baixo', 'medio', 'diario', 5::smallint, 'baixo', 20::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"sim","causaReclamacoes":"sim","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":5,"produtividade":4,"reducaoCustos":3,"qualidadeDados":4,"eliminacaoErros":4,"reducaoRetrabalho":4,"compliance":5}'::jsonb,
     'Pipeline pronto e testado. Parado porque falta o jurídico cadastrar os temas.'),
    -- CHM-0043 --------------------------------------------------------------
    (43, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Integração entre Monday e Plataforma de Dados',
     'Semanal', '1 a 3 Vezes', 'De 1 a 2 horas', '1 Pessoa',
     array['Integrar a ferramenta de gestão com a plataforma','Sincronizar sem exportar planilha'],
     array['Acaba a exportação manual','Dado de gestão junto com o de negócio'],
     'baixo', 'baixo', 'semanal', 3::smallint, 'muito_baixo', 8::numeric,
     '{"schedulable":"sim","regrasClaras":"parcial","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"nao","causaReclamacoes":"parcial","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":4,"produtividade":4,"reducaoCustos":2,"qualidadeDados":3,"eliminacaoErros":3,"reducaoRetrabalho":4}'::jsonb,
     'Falta definir a direção do fluxo para estimar.'),
    -- CHM-0044 — "Eventual": sem bucket de frequência correspondente -> tempo NULL
    (44, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Provisionamento de Ambiente Analítico Segregado',
     'Eventual', '1 a 3 Vezes', '1 dia (até 8h)', '1 Pessoa',
     array['Área separada com cópia controlada do dado bruto','Acesso só de leitura','Registro de quem acessou'],
     array['Ferramenta externa consome sem tocar no ambiente principal','Cópia e acesso rastreáveis'],
     'medio', 'alto', null, 3::smallint, 'muito_baixo', 8::numeric,
     '{"schedulable":"nao","regrasClaras":"parcial","decisaoHumana":"sim","validacaoDados":"nao","temDocumentacao":"nao","causaReclamacoes":"nao","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":2,"produtividade":3,"reducaoCustos":2,"qualidadeDados":3,"eliminacaoErros":2,"reducaoRetrabalho":2,"compliance":4}'::jsonb,
     'Tira dado regulatório do ambiente governado. Compliance decide antes do desenho.'),
    -- CHM-0045 --------------------------------------------------------------
    (45, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Extração de Conteúdo de Documentos do SharePoint',
     'Semanal', '4 a 8 Vezes', 'De 3 a 4 horas', 'De 2 a 4 pessoas',
     array['Extrair conteúdo de PDF, apresentação e relatório','Estruturar para consulta em linguagem natural','Definir o que entra na base'],
     array['Achar conteúdo sem procurar documento a documento','Conhecimento num lugar só'],
     'alto', 'alto', 'semanal', 4::smallint, 'medio', 64::numeric,
     '{"schedulable":"sim","regrasClaras":"nao","decisaoHumana":"sim","validacaoDados":"nao","temDocumentacao":"nao","causaReclamacoes":"sim","padronizacaoDocs":"sim","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":5,"produtividade":5,"reducaoCustos":3,"qualidadeDados":3,"eliminacaoErros":3,"reducaoRetrabalho":4}'::jsonb,
     'Escopo não alinhado. Falta definir curadoria e acesso ao conteúdo.'),
    -- CHM-0046 --------------------------------------------------------------
    (46, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Governança Corporativa', 'Secretaria de Governança', 'Consulta em Linguagem Natural para o Conselho',
     'Semanal', '1 a 3 Vezes', 'De 1 a 2 horas', 'De 2 a 4 pessoas',
     array['Espaço de consulta próprio do Conselho','Recorte de dado com acesso por grupo','Resposta sempre com período e origem'],
     array['Conselheiro consulta sozinho','Menos pedido de relatório avulso','Dado no recorte certo'],
     'medio', 'medio', 'semanal', 5::smallint, 'baixo', 24::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"parcial","causaReclamacoes":"sim","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":5,"produtividade":5,"reducaoCustos":3,"qualidadeDados":4,"eliminacaoErros":3,"reducaoRetrabalho":4}'::jsonb,
     'Depende dos grupos do catálogo e do recorte de dado do Conselho.'),
    -- CHM-0047 — "Eventual" -> tempo NULL
    (47, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Consulta por Assistente de Voz',
     'Eventual', '1 a 3 Vezes', '30 minutos', '1 Pessoa',
     array['Consultar indicador por voz','Vínculo de conta para identificar quem pergunta'],
     array['Consulta rápida sem abrir tela','Acesso em mobilidade'],
     'alto', 'alto', null, 3::smallint, 'muito_baixo', 2::numeric,
     '{"schedulable":"nao","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"nao","causaReclamacoes":"nao","padronizacaoDocs":"nao","totalmenteManual":"parcial"}'::jsonb,
     '{"reducaoTempo":3,"produtividade":3,"reducaoCustos":2,"qualidadeDados":2,"eliminacaoErros":2,"reducaoRetrabalho":2}'::jsonb,
     'Assistente corta em 8s e a consulta leva mais que isso. Fazer PoC antes de dar prazo.'),
    -- CHM-0048 --------------------------------------------------------------
    (48, 'Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'Segurança da Informação', 'Observabilidade de Postura de Segurança da Plataforma',
     'Mensal', '1 a 3 Vezes', 'De 3 a 4 horas', 'De 2 a 4 pessoas',
     array['Painel de quem tem acesso a que, por grupo e objeto','Sinalizar acesso concedido fora do modelo','Alertar credencial vencendo ou sem uso'],
     array['Segurança medida sempre, não só quando alguém olha','Exceção aparece antes da auditoria','Renovação não depende de memória'],
     'medio', 'medio', 'mensal', 5::smallint, 'baixo', 24::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"parcial","causaReclamacoes":"sim","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":4,"produtividade":4,"reducaoCustos":2,"qualidadeDados":5,"eliminacaoErros":5,"reducaoRetrabalho":4,"compliance":5}'::jsonb,
     'Veio do plano de segurança pedido pela Diretoria.'),
    -- CHM-0049 --------------------------------------------------------------
    (49, 'Sandoval Fernandes Ribeiro Junior', 'sandoval.junior@fgcoop.coop.br',
     'Tecnologia da Informação', 'Infraestrutura e Segurança', 'Inventário e Rotação de Credenciais de Automação',
     'Mensal', '1 a 3 Vezes', 'De 3 a 4 horas', 'De 2 a 4 pessoas',
     array['Inventário de token, service principal e credencial','Alerta antes de vencer','Rotação com responsável registrado'],
     array['Integração para de cair por credencial vencida','Menos acesso fora do controle de identidade','Cada credencial com dono'],
     'medio', 'medio', 'mensal', 5::smallint, 'baixo', 24::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"nao","validacaoDados":"sim","temDocumentacao":"nao","causaReclamacoes":"sim","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":4,"produtividade":4,"reducaoCustos":2,"qualidadeDados":4,"eliminacaoErros":5,"reducaoRetrabalho":5,"compliance":5}'::jsonb,
     'Já tem credencial de fornecedor com prazo para vencer.'),
    -- CHM-0050 --------------------------------------------------------------
    (50, 'Sandoval Fernandes Ribeiro Junior', 'sandoval.junior@fgcoop.coop.br',
     'Tecnologia da Informação', 'Infraestrutura e Segurança', 'Plano de Recuperação de Ambiente da Plataforma de Dados',
     'Anual', '1 a 3 Vezes', 'Acima de 5 horas', 'De 2 a 4 pessoas',
     array['Replicar dado e metadado para outra região','Remontar catálogo, código, jobs e credenciais','Testar a recuperação de tempos em tempos'],
     array['Operação continua se o ambiente cair','Tempo de recuperação conhecido','Atende requisito de continuidade'],
     'alto', 'alto', 'anual', 5::smallint, 'muito_baixo', 12::numeric,
     '{"schedulable":"sim","regrasClaras":"sim","decisaoHumana":"parcial","validacaoDados":"sim","temDocumentacao":"nao","causaReclamacoes":"nao","padronizacaoDocs":"nao","totalmenteManual":"sim"}'::jsonb,
     '{"reducaoTempo":2,"produtividade":2,"reducaoCustos":2,"qualidadeDados":4,"eliminacaoErros":4,"reducaoRetrabalho":2,"compliance":5}'::jsonb,
     'Precisa do tempo aceitável de parada e de perda de dado para dimensionar.')
  )
  insert into opportunities (
    tenant_id, seq_id, source, request_type, fonte,
    solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas,
    escopo_automacao, beneficios_esperados,
    esforco, complexidade, tempo, objetivo, fte, fte_horas,
    criterios, beneficios, observacao, status,
    ai_enrichment_status, ai_enriched_at, created_by
  )
  select
    v_tenant, n.seq_id, 'formulario'::opportunity_source,
    'nova_oportunidade'::opportunity_request_type, 'FGCoop',
    n.solicitante, n.email, n.area, n.subarea, n.processo,
    n.frequencia, n.volume_medio, n.tempo_execucao, n.num_pessoas,
    n.escopo_automacao::text[], n.beneficios_esperados::text[],
    n.esforco::effort_level, n.complexidade::complexity_level,
    n.tempo::frequency_bucket, n.objetivo, n.fte::fte_bucket, n.fte_horas,
    n.criterios, n.beneficios, n.observacao, 'novo'::opportunity_status,
    -- dados vindos de levantamento humano: nunca passam pelo enrichment do app,
    -- marcar 'enriched' evita o overlay de "enriquecendo..." no modal (idem 0023).
    'enriched'::ai_enrichment_status, now(), v_profile
  from novas n
  where not exists (
    select 1 from opportunities o
     where o.tenant_id = v_tenant and o.seq_id = n.seq_id
  );

  get diagnostics v_inserted = row_count;

  -- ---------------------------------------------------------------------------
  -- 3. Atribuição: Thiago Saldanha como executor das 11
  -- ---------------------------------------------------------------------------
  insert into opportunity_assignees (opportunity_id, profile_id, tenant_id, created_by)
  select o.id, v_profile, v_tenant, v_profile
    from opportunities o
   where o.tenant_id = v_tenant
     and o.seq_id between 40 and 50
  on conflict (opportunity_id, profile_id) do nothing;

  get diagnostics v_assigned = row_count;

  raise notice '0052: % oportunidades inseridas, % atribuições criadas (seq_id 40..50, tenant FGCoop).',
    v_inserted, v_assigned;

  if v_inserted < 11 then
    raise notice '0052: % linha(s) pulada(s) — seq_id já ocupado no tenant. '
                 'Confira se são as mesmas oportunidades antes de renumerar.', 11 - v_inserted;
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- Conferência (rodar depois): score/prioridade saem da view, nunca do insert.
-- -----------------------------------------------------------------------------
-- select seq_id, processo, score, priority_level, rpa_score
--   from opportunities_with_score
--  where tenant_id = '11111111-1111-1111-1111-111111111111'
--    and seq_id between 40 and 50
--  order by seq_id;
-- =============================================================================
-- FIM 0052
-- =============================================================================
