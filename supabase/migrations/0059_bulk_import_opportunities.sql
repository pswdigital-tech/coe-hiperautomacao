-- =============================================================================
-- 0059_bulk_import_opportunities.sql — importação em massa de oportunidades
-- =============================================================================
-- CONTEXTO: uma oportunidade nasce hoje por três caminhos — formulário público
-- (`create_public_opportunity`, 0026/0035), wizard autenticado
-- (`/opportunities/new`, insert direto) e registro pelo staff em nome do cliente
-- (`create_staff_opportunity`, 0051). Falta o quarto: subir DE UMA VEZ o
-- levantamento inteiro que já existe em planilha — o que hoje só acontece por
-- migration escrita à mão (0003, 0013, 0023, 0052, 0058). Cada lote desses é uma
-- ida ao SQL Editor com dado de cliente colado dentro; esta RPC tira isso do
-- caminho manual e devolve à tela, com autorização de verdade.
--
-- QUEM PODE (regra de produto, 2026-08-18):
--   platform_admin → qualquer empresa (é o dono da carteira).
--   tenant_admin   → a PRÓPRIA empresa.
--   psw_staff      → SOMENTE as empresas que administra (`psw_tenant_admins`,
--                    0045). Diferente de `create_staff_opportunity` (0051), que
--                    aceita também a empresa onde o staff só tem oportunidade
--                    ATRIBUÍDA: uma coisa é registrar UMA demanda levantada
--                    numa reunião, outra é despejar 500 linhas no acervo de um
--                    cliente. Importação em massa é ato de administração.
--   member/viewer  → NADA.
-- Os dois primeiros ramos + o terceiro são exatamente `is_platform_admin()`
-- (0021) ∪ `is_tenant_admin_of(t)` (0045, reemitida como fonte única na 0047) —
-- nenhum predicado novo é inventado aqui.
--
-- O QUE A FUNÇÃO **NÃO** DEIXA O CHAMADOR ESCOLHER: `tenant_id` vem do
-- parâmetro validado (nunca do payload), `created_by` é `auth.uid()`, e
-- `seq_id`/`rpa_score`/`score` continuam do trigger/GENERATED/view
-- (docs/PROJETO.md §3). `ferramenta` (enum legado) NÃO é escrita: o trigger
-- `sync_opportunity_ferramentas()` (0055) a deriva de `ferramentas`.
--
-- SÓ CRIA, NUNCA ATUALIZA (decisão do PO, 2026-08-18): linha cujo `processo` já
-- existe naquele tenant é PULADA e devolvida em `puladas`, com o `seq_id` da que
-- já estava lá. Sem upsert não há como uma planilha desatualizada apagar em
-- massa um campo que alguém editou no app.
--
-- ATOMICIDADE: uma função plpgsql roda numa transação só. Se a linha 300
-- estourar uma constraint, TUDO volta atrás — não fica meio lote importado sem
-- ninguém saber onde parou. Erro de conteúdo, porém, deveria ter sido pego pelo
-- parser (lib/opportunities/import-csv.ts) antes de chegar aqui; o que sobra
-- para o banco recusar é o que só ele sabe (CHECKs, triggers de coerência).
--
-- IDEMPOTENTE (create or replace + grants reemitidos).
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0021, 0032, 0040, 0045, 0047, 0051, 0055.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- 1. import_writable_tenant_ids() — "onde posso IMPORTAR"
-- -----------------------------------------------------------------------------
-- Mesma forma de `staff_writable_tenant_ids()` (0051): `setof uuid`, `stable`,
-- `security definer` com `search_path` fixo. FONTE ÚNICA do seletor de empresa
-- da tela e da autorização da RPC abaixo — a UI não pode oferecer empresa que o
-- banco recusaria, nem esconder uma que ele aceitaria.
--
-- O ramo do `platform_admin` devolve a carteira inteira (só tenants ativos, como
-- 0051 faz); os demais papéis saem de `effective_admin_tenant_ids()` (0045), que
-- já embute o gate de papel de `tenant_admin` e de `psw_staff`.
create or replace function import_writable_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from tenants t
   where is_platform_admin()
  union
  select e
    from effective_admin_tenant_ids() e
$$;

comment on function import_writable_tenant_ids() is
  'Empresas em que o usuário corrente pode IMPORTAR oportunidades em massa (0059): carteira inteira para platform_admin; própria empresa para tenant_admin; empresas administradas para psw_staff.';

grant execute on function import_writable_tenant_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. import_opportunities(tenant, linhas, responsáveis) → resumo jsonb
-- -----------------------------------------------------------------------------
-- `p_rows` é um ARRAY jsonb, um objeto por linha, com as chaves das colunas de
-- `opportunities` (o `ImportRowPayload` de lib/opportunities/import-csv.ts).
-- Payload como jsonb, e não 50 parâmetros posicionais, pelo mesmo motivo da
-- 0051: acrescentar campo não obriga a dropar overload e reemitir grant.
--
-- `p_assignee_ids` são os profiles a atribuir a TODAS as linhas importadas
-- (`opportunity_assignees`, 0032) — o "a quem atrelar" da tela. Validados
-- ANTES do primeiro insert: um id fora da regra derruba o lote inteiro com
-- mensagem legível, em vez de estourar `check_assignee_tenant()` no meio.
--
-- Retorno (jsonb):
--   { "inseridas": int,
--     "ids": [uuid, ...],
--     "atribuicoes": int,
--     "puladas": [{ "linha": int, "processo": text, "seq_id": int }, ...] }
create or replace function import_opportunities(
  p_tenant_id    uuid,
  p_rows         jsonb,
  p_assignee_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row          jsonb;
  v_linha        int;
  v_processo     text;
  v_existente    int;
  v_opp_id       uuid;
  v_ids          uuid[] := '{}'::uuid[];
  v_puladas      jsonb  := '[]'::jsonb;
  v_assignees    uuid[];
  v_atribuicoes  int    := 0;
  v_invalido     uuid;
  v_total        int;
begin
  -- ── autorização (antes de qualquer escrita) ──────────────────────────────
  if p_tenant_id is null then
    raise exception 'Empresa é obrigatória';
  end if;

  if not (is_platform_admin() or is_tenant_admin_of(p_tenant_id)) then
    -- Mensagem única e deliberadamente ambígua: não distingue "empresa não
    -- existe" de "empresa fora do seu escopo" (mesma disciplina de
    -- ADMIN_SCOPE_DENIED_MESSAGE em lib/security/role.ts).
    raise exception 'Empresa não encontrada ou fora do seu escopo de administração';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Nenhuma linha para importar';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Nenhuma linha para importar';
  end if;
  -- Espelha MAX_IMPORT_ROWS do parser (lib/opportunities/import-csv.ts). O teto
  -- existe nos dois lados de propósito: o do parser é UX, este é o real.
  if v_total > 500 then
    raise exception 'Máximo de 500 linhas por importação (vieram %)', v_total;
  end if;

  -- ── responsáveis: mesma regra de check_assignee_tenant() (0040) ──────────
  -- Aceita profile DO TENANT-ALVO sempre; de outro tenant, só se for
  -- `psw_staff`. Validar aqui é o que transforma um `check_violation` cru numa
  -- frase que a pessoa entende.
  v_assignees := coalesce(
    (select array_agg(distinct a) from unnest(p_assignee_ids) a where a is not null),
    '{}'::uuid[]
  );

  if array_length(v_assignees, 1) > 0 then
    select a into v_invalido
      from unnest(v_assignees) a
     where not exists (
       select 1 from profiles p
        where p.id = a
          and (p.tenant_id = p_tenant_id or p.role::text = 'psw_staff')
     )
     limit 1;

    if v_invalido is not null then
      raise exception
        'Pessoa % não pertence à empresa escolhida e não é staff da PSW — não pode ser responsável por estas oportunidades.',
        v_invalido;
    end if;
  end if;

  -- ── linha a linha ────────────────────────────────────────────────────────
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_linha    := coalesce((v_row->>'linha')::int, 0);
    v_processo := trim(coalesce(v_row->>'processo', ''));

    if length(v_processo) < 3 then
      raise exception 'Linha %: processo é obrigatório', v_linha;
    end if;

    -- Já existe no tenant? Pula e registra (só cria, nunca atualiza).
    select o.seq_id into v_existente
      from opportunities o
     where o.tenant_id = p_tenant_id
       and lower(trim(o.processo)) = lower(v_processo)
     limit 1;

    if found then
      v_puladas := v_puladas || jsonb_build_object(
        'linha', v_linha, 'processo', v_processo, 'seq_id', v_existente
      );
      continue;
    end if;

    insert into opportunities (
      tenant_id, source, request_type,
      solicitante, email, area, subarea, processo,
      frequencia, volume_medio, tempo_execucao, num_pessoas,
      ferramentas, fonte, tipo_processo,
      escopo_automacao, beneficios_esperados, beneficio_qualitativo,
      esforco, complexidade, tempo, objetivo, fte, fte_horas,
      criterios, beneficios,
      status, criticidade, priority_tag, responsavel,
      notas, observacao, risco,
      azure_boards_codigo, linguagem, execucao, usuarios_servico, execucoes_mes,
      data_abertura_coe, data_fechamento_coe, data_conclusao,
      ai_enrichment_status, ai_enriched_at, created_by
    ) values (
      p_tenant_id,
      -- Coerções defensivas: valor fora do domínio vira o default, nunca
      -- exceção de cast. O parser TS já recusou o inválido antes de chegar
      -- aqui — isto é a segunda camada, não a primeira.
      case when v_row->>'source' in ('persona','formulario')
           then (v_row->>'source')::opportunity_source else 'formulario' end,
      case when v_row->>'request_type' in ('nova_oportunidade','melhoria_automacao',
                                           'duvidas_terceiros','incidente','treinamento')
           then (v_row->>'request_type')::opportunity_request_type
           else 'nova_oportunidade' end,
      left(trim(coalesce(v_row->>'solicitante', '')), 200),
      nullif(trim(coalesce(v_row->>'email', '')), ''),
      left(trim(coalesce(v_row->>'area', '')), 200),
      nullif(left(trim(coalesce(v_row->>'subarea', '')), 200), ''),
      left(v_processo, 2000),
      nullif(left(trim(coalesce(v_row->>'frequencia', '')), 60), ''),
      nullif(left(trim(coalesce(v_row->>'volume_medio', '')), 60), ''),
      nullif(left(trim(coalesce(v_row->>'tempo_execucao', '')), 60), ''),
      nullif(left(trim(coalesce(v_row->>'num_pessoas', '')), 60), ''),
      -- `ferramentas` é a fonte da verdade (0055); o trigger normaliza e deriva
      -- o enum legado `ferramenta`. Array ausente → '{}', nunca null (NOT NULL).
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
           case when jsonb_typeof(v_row->'ferramentas') = 'array'
                then v_row->'ferramentas' else '[]'::jsonb end) as value),
        '{}'::text[]
      ),
      nullif(left(trim(coalesce(v_row->>'fonte', '')), 200), ''),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
           case when jsonb_typeof(v_row->'tipo_processo') = 'array'
                then v_row->'tipo_processo' else '[]'::jsonb end) as value),
        '{}'::text[]
      ),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
           case when jsonb_typeof(v_row->'escopo_automacao') = 'array'
                then v_row->'escopo_automacao' else '[]'::jsonb end) as value),
        '{}'::text[]
      ),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
           case when jsonb_typeof(v_row->'beneficios_esperados') = 'array'
                then v_row->'beneficios_esperados' else '[]'::jsonb end) as value),
        '{}'::text[]
      ),
      nullif(left(trim(coalesce(v_row->>'beneficio_qualitativo', '')), 2000), ''),
      case when v_row->>'esforco' in ('baixo','medio','alto')
           then (v_row->>'esforco')::effort_level end,
      case when v_row->>'complexidade' in ('baixo','medio','alto')
           then (v_row->>'complexidade')::complexity_level end,
      case when v_row->>'tempo' in ('diario','semanal','quinzenal','mensal','anual')
           then (v_row->>'tempo')::frequency_bucket end,
      case when (v_row->>'objetivo') ~ '^[1-5]$'
           then (v_row->>'objetivo')::smallint end,
      case when v_row->>'fte' in ('muito_baixo','baixo','medio','alto','muito_alto')
           then (v_row->>'fte')::fte_bucket end,
      case when jsonb_typeof(v_row->'fte_horas') = 'number'
           then (v_row->>'fte_horas')::numeric end,
      case when jsonb_typeof(v_row->'criterios') = 'object' then v_row->'criterios' end,
      case when jsonb_typeof(v_row->'beneficios') = 'object' then v_row->'beneficios' end,
      case when v_row->>'status' in ('novo','em_analise','planejamento','backlog',
                                     'desenvolvimento','homologacao','producao',
                                     'concluido','gestao','manutencao','descontinuado')
           then (v_row->>'status')::opportunity_status else 'novo' end,
      case when v_row->>'criticidade' in ('baixa','media','alta','critica')
           then (v_row->>'criticidade')::criticidade_level end,
      case when v_row->>'priority_tag' in ('alta','media','baixa')
           then (v_row->>'priority_tag')::manual_priority end,
      nullif(left(trim(coalesce(v_row->>'responsavel', '')), 200), ''),
      nullif(left(trim(coalesce(v_row->>'notas', '')), 2000), ''),
      nullif(left(trim(coalesce(v_row->>'observacao', '')), 2000), ''),
      nullif(left(trim(coalesce(v_row->>'risco', '')), 2000), ''),
      nullif(left(trim(coalesce(v_row->>'azure_boards_codigo', '')), 200), ''),
      nullif(left(trim(coalesce(v_row->>'linguagem', '')), 60), ''),
      nullif(left(trim(coalesce(v_row->>'execucao', '')), 60), ''),
      nullif(left(trim(coalesce(v_row->>'usuarios_servico', '')), 200), ''),
      case when (v_row->>'execucoes_mes') ~ '^\d+$'
           then (v_row->>'execucoes_mes')::int end,
      -- Datas já chegam normalizadas pelo parser (ISO). Cast defensivo: texto
      -- irreconhecível vira null em vez de derrubar o lote.
      nullif(v_row->>'data_abertura_coe', '')::timestamptz,
      nullif(v_row->>'data_fechamento_coe', '')::timestamptz,
      nullif(v_row->>'data_conclusao', '')::date,
      -- Dado de levantamento humano nunca passa pelo enrichment por IA (que só
      -- roda no after() de createOpportunity). Sem isto herda 'pending' e o
      -- modal mostra "Enriquecendo com IA…" para sempre (mesmo motivo de
      -- 0023/0052/0058).
      'enriched'::ai_enrichment_status, now(), (select auth.uid())
    )
    returning id into v_opp_id;

    v_ids := v_ids || v_opp_id;
  end loop;

  -- ── atribuição em bloco ──────────────────────────────────────────────────
  if array_length(v_ids, 1) > 0 and array_length(v_assignees, 1) > 0 then
    insert into opportunity_assignees (opportunity_id, profile_id, tenant_id, created_by)
    select o, a, p_tenant_id, (select auth.uid())
      from unnest(v_ids) o
     cross join unnest(v_assignees) a
    on conflict (opportunity_id, profile_id) do nothing;

    get diagnostics v_atribuicoes = row_count;
  end if;

  return jsonb_build_object(
    'inseridas',   coalesce(array_length(v_ids, 1), 0),
    'ids',         to_jsonb(v_ids),
    'atribuicoes', v_atribuicoes,
    'puladas',     v_puladas
  );
end;
$$;

comment on function import_opportunities(uuid, jsonb, uuid[]) is
  'Importa oportunidades em massa numa empresa (0059). Autoriza o tenant-alvo contra is_platform_admin() ∪ is_tenant_admin_of(); só CRIA (linha com processo já existente é pulada e devolvida); atribui os profiles informados a todas as criadas.';

grant execute on function import_opportunities(uuid, jsonb, uuid[]) to authenticated;

-- =============================================================================
-- Smoke (rodar AUTENTICADO, não como service role — como postgres o
-- current_user_role() é null e o resultado é corretamente vazio/negado):
--
--   -- 1. empresas em que posso importar:
--   select * from import_writable_tenant_ids();
--
--   -- 2. importar duas linhas (troque o uuid):
--   select import_opportunities('<tenant-uuid>'::uuid, '[
--     {"linha":2,"solicitante":"smoke","area":"TI","processo":"proc smoke import 1",
--      "status":"novo","objetivo":3,"ferramentas":["n8n"]},
--     {"linha":3,"solicitante":"smoke","area":"TI","processo":"proc smoke import 2"}
--   ]'::jsonb, '{}'::uuid[]);
--
--   -- 3. reimportar as MESMAS duas — esperado: inseridas 0, puladas com seq_id
--   --    (só cria, nunca atualiza).
--
--   -- 4. empresa fora do escopo — esperado: exceção
--   select import_opportunities('<uuid-alheio>'::uuid, '[{"linha":2,"solicitante":"x",
--     "area":"y","processo":"zzz"}]'::jsonb);
--
--   -- 5. limpeza:
--   delete from opportunities where solicitante = 'smoke';
-- =============================================================================
-- FIM 0059
-- =============================================================================
