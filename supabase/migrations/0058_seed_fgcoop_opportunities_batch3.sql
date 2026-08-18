-- =============================================================================
-- 0058_seed_fgcoop_opportunities_batch3.sql — 6 oportunidades FGCoop (lote 3)
-- =============================================================================
-- Insere 6 oportunidades no tenant FGCoop (11111111-...) e atribui TODAS a
-- thiago.saldanha (profiles.id ddd974fa-0484-4e1c-9d9d-60c2da1b29f2) como
-- executor, via `opportunity_assignees` (0032). O campo legado
-- `responsavel` (texto livre, fora da UI desde 2026-07-30) também é gravado
-- porque veio preenchido na planilha de origem — o vínculo que a UI lê é o da
-- tabela de assignees.
--
-- ATRIBUIÇÃO CROSS-TENANT: o profile do Thiago vive no tenant da PSW, não no da
-- FGCoop. Isso só passa no trigger `check_assignee_tenant()` (reescrito na 0040)
-- se o papel dele for `psw_staff`. O bloco §1 valida isso ANTES e aborta com
-- mensagem clara se o papel for outro — senão o erro seria um check_violation cru.
--
-- seq_id NÃO é informado: desde a 0006 o trigger `set_opportunity_seq_id()`
-- SEMPRE sobrescreve o valor do payload (`new.seq_id := next_seq_id(...)`), de
-- modo que passar o número seria inócuo. A numeração sai de `tenant_sequences`,
-- continuando de onde a FGCoop parou. IDEMPOTÊNCIA, portanto, é por `processo`
-- dentro do tenant — rodar duas vezes não duplica.
--
-- NUNCA inserimos: score / priority_level (view), rpa_score (GENERATED) — docs/PROJETO.md §3.
-- `ferramenta` (enum legado) também NÃO é inserida: desde a 0055 ela é DERIVADA
-- de `ferramentas` pelo trigger `sync_opportunity_ferramentas()`. Como o lote usa
-- 'databricks' (e 'n8n' numa linha), o enum derivado fica null em 5 linhas e
-- 'n8n' na quarta — comportamento esperado, não perda de dado.
--
-- FREQUÊNCIA vs BUCKET: `frequencia` é o texto do levantamento ("Eventual",
-- "Diário", …) e `tempo` é o bucket de score (frequency_bucket). Nas três linhas
-- "Eventual" o levantamento informou o bucket explicitamente (mensal/anual/mensal),
-- então ele é usado — diferente da 0052, onde "Eventual" ficou com `tempo` null.
--
-- EFEITOS DE TRIGGER esperados neste insert:
--   • `sync_coe_dates()` (0017) só preenche `data_abertura_coe` quando null — as
--     6 linhas trazem a data da planilha, então ela é preservada.
--     `data_fechamento_coe` NÃO é tocada no INSERT (só na troca de status), por
--     isso as duas linhas concluídas trazem o valor explícito.
--   • `sync_opportunity_phase()` (0004/0017) cria a phase row do status inicial
--     ('concluido' / 'desenvolvimento') com started_at = now(). O histórico de
--     fases anterior a este seed não existe e não é reconstituível aqui.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0001..0057 aplicadas.
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
  -- 2. As 6 oportunidades
  -- ---------------------------------------------------------------------------
  with novas (
    solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas, ferramentas,
    escopo_automacao, beneficios_esperados, beneficio_qualitativo,
    esforco, complexidade, tempo, objetivo, fte, fte_horas,
    criterios, beneficios,
    status, criticidade, priority_tag, responsavel,
    notas, observacao, risco,
    linguagem, execucao, usuarios_servico, execucoes_mes,
    data_abertura_coe, data_fechamento_coe, data_conclusao
  ) as (
    values
    -- 01 — Gestão de Custo da Plataforma de Dados (FinOps) --------------------
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Gestão de Custo da Plataforma de Dados (FinOps)',
     'Mensal', '1 a 3 Vezes', 'De 3 a 4 horas', 'De 2 a 4 pessoas', array['databricks'],
     array['Painel de custo por origem, usuário e objeto','Identificação de consumo ocioso e de rotina redundante','Otimização de armazenamento e de agendamento'],
     array['Custo previsível e atribuível a quem consome','Redução comprovada de leitura por consulta','Dimensionamento decidido por medição'],
     'Custo deixa de ser caixa-preta: cada real gasto tem origem identificada e responsável.',
     'alto', 'medio', 'mensal', 5::smallint, 'medio', 40::numeric,
     '{"causaReclamacoes":"sim","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"parcial","padronizacaoDocs":"nao","validacaoDados":"sim","schedulable":"sim","temDocumentacao":"parcial"}'::jsonb,
     '{"reducaoTempo":4,"eliminacaoErros":3,"produtividade":4,"qualidadeDados":3,"reducaoCustos":5,"reducaoRetrabalho":3,"compliance":3,"objetivosEstrategicos":4}'::jsonb,
     'concluido', 'media', 'alta', 'Thiago Saldanha',
     'Esforço: 60h. Estimativa de construção equivalente: 100 a 120h. Painel de cinco abas com custo por origem, identidade e objeto. Clustering aplicado às visões materializadas, com redução de 63% na leitura por consulta. Redimensionamento do warehouse e migração da ingestão diária para computação dedicada.',
     'Identificado e desativado processo agendado que recriava as visões materializadas diariamente, desfazendo a otimização e relendo cerca de 40 milhões de linhas por execução.',
     'Sem painel de custo, o consumo cresce sem controle e a correção só acontece depois da fatura.',
     'Python | SQL', 'automatica', '8', 30::int,
     '2026-08-17T13:57:47.686185+00:00', '2026-08-17T13:57:47.686185+00:00', '2026-08-17'),

    -- 02 — Encaminhamento de Registros de Auditoria ao Monitoramento Corporativo
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'Segurança da Informação', 'Encaminhamento de Registros de Auditoria ao Monitoramento Corporativo',
     'Diário', 'Acima de 20 Vezes', '30 minutos', '1 Pessoa', array['databricks'],
     array['Exportação contínua dos registros de acesso, cópia e inserção','Filtro de eventos relevantes na origem','Controle de carga para não duplicar envio'],
     array['Registros correlacionados com os demais sistemas','Guarda além da retenção nativa','Base para regras de detecção pelo time de segurança'],
     'A plataforma deixa de ser um ponto cego no monitoramento corporativo.',
     'medio', 'medio', 'diario', 5::smallint, 'muito_baixo', 8::numeric,
     '{"causaReclamacoes":"nao","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"nao","padronizacaoDocs":"nao","validacaoDados":"sim","schedulable":"sim","temDocumentacao":"sim"}'::jsonb,
     '{"reducaoTempo":3,"eliminacaoErros":4,"produtividade":3,"qualidadeDados":4,"reducaoCustos":2,"reducaoRetrabalho":3,"compliance":5,"objetivosEstrategicos":4}'::jsonb,
     'desenvolvimento', 'alta', 'alta', 'Thiago Saldanha',
     'Esforço: 20h. Estimativa de construção equivalente: 40 a 60h. Rotina de exportação escrita e testada, com carga incremental e filtro de eventos de segurança na origem. Volume medido em cerca de 50 MB por mês.',
     'Aguarda provisionamento no ambiente corporativo de monitoramento: identidade de aplicação, endpoint de coleta e regra de ingestão.',
     'Sem encaminhamento, os registros permanecem apenas na plataforma, com retenção limitada e sem correlação com os demais sistemas.',
     'Python', 'automatica', '3', 720::int,
     '2026-08-17T13:57:47.686185+00:00', null, null),

    -- 03 — Ingestão das Bases Públicas do Regulador --------------------------
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Ingestão das Bases Públicas do Regulador',
     'Diário', '1 a 3 Vezes', 'De 1 a 2 horas', '1 Pessoa', array['databricks'],
     array['Ingestão diária das bases contábeis e cadastrais','Camadas bronze, silver e gold com histórico','Tabelas analíticas prontas para consumo'],
     array['Base contábil disponível sem coleta manual','Histórico preservado para série temporal','Origem única para todos os painéis'],
     'Elimina a coleta manual de base pública e garante que todos os painéis leiam do mesmo lugar.',
     'alto', 'alto', 'diario', 5::smallint, 'medio', 40::numeric,
     '{"causaReclamacoes":"sim","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"nao","padronizacaoDocs":"sim","validacaoDados":"sim","schedulable":"sim","temDocumentacao":"sim"}'::jsonb,
     '{"reducaoTempo":5,"eliminacaoErros":5,"produtividade":5,"qualidadeDados":5,"reducaoCustos":3,"reducaoRetrabalho":5,"compliance":4,"objetivosEstrategicos":5}'::jsonb,
     'concluido', 'alta', 'alta', 'Thiago Saldanha',
     'Esforço: 70h. Estimativa de construção equivalente: 120 a 160h. Ingestão das bases contábeis, cadastrais e de indicadores do regulador, com carga incremental e visões materializadas para consumo analítico.',
     'Corrigido travamento na base de indicadores prudenciais: a origem é trimestral e estava sendo consultada mensalmente, retornando vazio sem gerar erro. A carga estava parada havia meses sem detecção.',
     'Falha silenciosa em carga de base regulatória pode passar meses sem ser percebida, como já ocorreu.',
     'Python | SQL', 'automatica', '15', 30::int,
     '2026-08-17T13:57:47.686185+00:00', '2026-08-17T13:57:47.686185+00:00', '2026-08-17'),

    -- 04 — Migração de Automações para Conta de Serviço -----------------------
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'Infraestrutura e Segurança', 'Migração de Automações para Conta de Serviço',
     'Eventual', '1 a 3 Vezes', 'De 1 a 2 horas', '1 Pessoa', array['n8n','databricks'],
     array['Substituição de credencial pessoal por conta de serviço','Concessão mínima por objeto acessado','Registro no inventário de credenciais'],
     array['Automação não para quando alguém muda de função','Registro distingue ação humana de rotina','Credencial passa a ter prazo e responsável'],
     'Elimina a dependência de pessoa física para que a automação continue funcionando.',
     'baixo', 'medio', 'mensal', 4::smallint, 'muito_baixo', 8::numeric,
     '{"causaReclamacoes":"sim","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"parcial","padronizacaoDocs":"nao","validacaoDados":"sim","schedulable":"parcial","temDocumentacao":"parcial"}'::jsonb,
     '{"reducaoTempo":2,"eliminacaoErros":4,"produtividade":2,"qualidadeDados":3,"reducaoCustos":2,"reducaoRetrabalho":4,"compliance":5,"objetivosEstrategicos":4}'::jsonb,
     'desenvolvimento', 'alta', 'media', 'Thiago Saldanha',
     'Esforço: 10h. Estimativa de construção equivalente: 16 a 24h. Primeira migração concluída: a automação de contas a pagar passou a autenticar por conta de serviço, com leitura restrita à única tabela que consome.',
     'Restam cinco credenciais pessoais no inventário a migrar. Cada uma depende de alinhamento com quem opera a automação correspondente.',
     'Automação apoiada em credencial pessoal para de funcionar sem aviso quando a pessoa sai ou troca de função.',
     'Python | SQL', 'automatica', '2', 30::int,
     '2026-08-17T13:57:47.686185+00:00', null, null),

    -- 05 — Racionalização de Catálogos e Conexões Externas --------------------
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Tecnologia da Informação', 'COE de Dados', 'Racionalização de Catálogos e Conexões Externas',
     'Eventual', '1 a 3 Vezes', '1 dia (até 8h)', '1 Pessoa', array['databricks'],
     array['Inventário de catálogos e conexões existentes','Identificação de estrutura duplicada ou sem uso','Descomissionamento com registro da decisão'],
     array['Menos superfície para governar e auditar','Fim da ambiguidade entre catálogos de nome parecido','Credencial de sistema externo sem uso deixa de existir'],
     'Reduz o que precisa ser auditado e elimina credencial ativa apontando para sistema crítico sem uso.',
     'medio', 'baixo', 'anual', 4::smallint, 'muito_baixo', 4::numeric,
     '{"causaReclamacoes":"nao","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"sim","padronizacaoDocs":"nao","validacaoDados":"sim","schedulable":"parcial","temDocumentacao":"parcial"}'::jsonb,
     '{"reducaoTempo":2,"eliminacaoErros":3,"produtividade":2,"qualidadeDados":4,"reducaoCustos":3,"reducaoRetrabalho":3,"compliance":4,"objetivosEstrategicos":3}'::jsonb,
     'desenvolvimento', 'media', 'media', 'Thiago Saldanha',
     'Esforço: 15h. Estimativa de construção equivalente: 24 a 32h. Levantamento completo de catálogos, conexões e uso efetivo por linhagem.',
     'Dois catálogos de federação com mais de seis mil objetos e nenhum acesso desde a criação, candidatos a remoção. Quatro conexões apontando para o mesmo servidor, com validação de certificado inconsistente entre elas. Remoção depende de confirmação com a equipe de dados.',
     'Conexão ativa para sistema crítico, sem uso e com validação de certificado desabilitada.',
     'SQL', 'manual', '3', 1::int,
     '2026-08-17T13:57:47.686185+00:00', null, null),

    -- 06 — Segregação de Ambiente para Diretoria e Conselho -------------------
    ('Arley Costa', 'arley.costa@fgcoop.coop.br',
     'Governança Corporativa', 'Secretaria de Governança', 'Segregação de Ambiente para Diretoria e Conselho',
     'Eventual', '1 a 3 Vezes', 'De 3 a 4 horas', '1 Pessoa', array['databricks'],
     array['Ambiente próprio por instância de governança','Acesso restrito ao conteúdo destinado a cada uma','Camada de consumo por visão, não por tabela'],
     array['Conselho e Diretoria consultam apenas o que lhes cabe','Conteúdo pode mudar sem alterar permissão','Sem exposição do ambiente operacional'],
     'Instâncias de governança passam a ter ambiente próprio, sem acesso ao operacional.',
     'medio', 'medio', 'mensal', 5::smallint, 'muito_baixo', 8::numeric,
     '{"causaReclamacoes":"sim","totalmenteManual":"sim","regrasClaras":"sim","decisaoHumana":"sim","padronizacaoDocs":"nao","validacaoDados":"sim","schedulable":"parcial","temDocumentacao":"parcial"}'::jsonb,
     '{"reducaoTempo":3,"eliminacaoErros":4,"produtividade":3,"qualidadeDados":4,"reducaoCustos":2,"reducaoRetrabalho":3,"compliance":5,"objetivosEstrategicos":5}'::jsonb,
     'desenvolvimento', 'alta', 'alta', 'Thiago Saldanha',
     'Esforço: 18h. Estimativa de construção equivalente: 40 a 60h. Ambientes separados provisionados e vínculo de catálogo corrigido: o ambiente operacional deixou de ser visível a partir dos ambientes de governança.',
     'A camada de consumo do conselho está sendo montada. A definição de quais conteúdos cada instância acessa, e de quem são os participantes, depende da área de governança.',
     'Conselheiros enxergavam a totalidade das tabelas operacionais antes da correção do vínculo de catálogo.',
     'SQL', 'manual', '10', 4::int,
     '2026-08-17T13:57:47.686185+00:00', null, null)
  )
  insert into opportunities (
    tenant_id, source, request_type, fonte, tipo_processo,
    solicitante, email, area, subarea, processo,
    frequencia, volume_medio, tempo_execucao, num_pessoas, ferramentas,
    escopo_automacao, beneficios_esperados, beneficio_qualitativo,
    esforco, complexidade, tempo, objetivo, fte, fte_horas,
    criterios, beneficios,
    status, criticidade, priority_tag, responsavel,
    notas, observacao, risco,
    linguagem, execucao, usuarios_servico, execucoes_mes,
    data_abertura_coe, data_fechamento_coe, data_conclusao,
    ai_enrichment_status, ai_enriched_at, created_by
  )
  select
    v_tenant, 'formulario'::opportunity_source,
    'nova_oportunidade'::opportunity_request_type, 'FGCoop', array['automacao']::text[],
    n.solicitante, n.email, n.area, n.subarea, n.processo,
    n.frequencia, n.volume_medio, n.tempo_execucao, n.num_pessoas, n.ferramentas::text[],
    n.escopo_automacao::text[], n.beneficios_esperados::text[], n.beneficio_qualitativo,
    n.esforco::effort_level, n.complexidade::complexity_level,
    n.tempo::frequency_bucket, n.objetivo, n.fte::fte_bucket, n.fte_horas,
    n.criterios, n.beneficios,
    n.status::opportunity_status, n.criticidade::criticidade_level,
    n.priority_tag::manual_priority, n.responsavel,
    n.notas, n.observacao, n.risco,
    n.linguagem, n.execucao, n.usuarios_servico, n.execucoes_mes,
    n.data_abertura_coe::timestamptz, n.data_fechamento_coe::timestamptz,
    n.data_conclusao::date,
    -- dados vindos de levantamento humano: nunca passam pelo enrichment do app,
    -- marcar 'enriched' evita o overlay de "enriquecendo..." no modal (idem 0023/0052).
    'enriched'::ai_enrichment_status, now(), v_profile
  from novas n
  where not exists (
    select 1 from opportunities o
     where o.tenant_id = v_tenant and o.processo = n.processo
  );

  get diagnostics v_inserted = row_count;

  -- ---------------------------------------------------------------------------
  -- 3. Atribuição: Thiago Saldanha como executor das 6
  -- ---------------------------------------------------------------------------
  insert into opportunity_assignees (opportunity_id, profile_id, tenant_id, created_by)
  select o.id, v_profile, v_tenant, v_profile
    from opportunities o
   where o.tenant_id = v_tenant
     and o.processo in (
       'Gestão de Custo da Plataforma de Dados (FinOps)',
       'Encaminhamento de Registros de Auditoria ao Monitoramento Corporativo',
       'Ingestão das Bases Públicas do Regulador',
       'Migração de Automações para Conta de Serviço',
       'Racionalização de Catálogos e Conexões Externas',
       'Segregação de Ambiente para Diretoria e Conselho'
     )
  on conflict (opportunity_id, profile_id) do nothing;

  get diagnostics v_assigned = row_count;

  raise notice '0058: % oportunidades inseridas, % atribuições criadas (tenant FGCoop).',
    v_inserted, v_assigned;

  if v_inserted < 6 then
    raise notice '0058: % linha(s) pulada(s) — já existe oportunidade com o mesmo '
                 '`processo` no tenant (idempotência).', 6 - v_inserted;
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- Conferência (rodar depois): score/prioridade saem da view, nunca do insert.
-- -----------------------------------------------------------------------------
-- select o.seq_id, o.processo, o.status, o.criticidade, o.priority_tag,
--        o.ferramentas, o.score, o.priority_level, o.rpa_score,
--        (select count(*) from opportunity_assignees a where a.opportunity_id = o.id) as assignees
--   from opportunities_with_score o
--  where o.tenant_id = '11111111-1111-1111-1111-111111111111'
--    and o.processo in (
--      'Gestão de Custo da Plataforma de Dados (FinOps)',
--      'Encaminhamento de Registros de Auditoria ao Monitoramento Corporativo',
--      'Ingestão das Bases Públicas do Regulador',
--      'Migração de Automações para Conta de Serviço',
--      'Racionalização de Catálogos e Conexões Externas',
--      'Segregação de Ambiente para Diretoria e Conselho')
--  order by o.seq_id;
-- =============================================================================
-- FIM 0058
-- =============================================================================
