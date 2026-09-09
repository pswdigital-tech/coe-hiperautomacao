-- =============================================================================
-- 0065_sdd_premissas_restricoes_versoes.sql — insumos e versionamento do SDD
-- =============================================================================
-- CONTEXTO: o Documento de Desenho da Solução (SDD) é um PDF gerado por
-- oportunidade e entregue ao cliente. Duas lacunas o bloqueiam:
--
--   1. PREMISSAS e RESTRIÇÕES não têm campo. São a seção que protege
--      comercialmente ("assumimos que o cliente libera acesso ao sistema X
--      até a data Y") — sem ela escrita, premissa quebrada não tem respaldo.
--      Hoje o mais próximo é `observacao`/`risco`, texto solto que não
--      renderiza como lista no documento.
--
--   2. O PDF gerado precisa ser GUARDADO e VERSIONADO: o botão baixa o
--      arquivo já existente em vez de regerar, e cada nova geração vira uma
--      versão nova em vez de sobrescrever a anterior. Sobrescrever tornaria
--      o número de versão impresso na capa não-rastreável e apagaria o que a
--      versão entregue ao cliente dizia — que é justamente o problema que a
--      capa versionada existe para resolver.
--
-- POR QUE NÃO UMA TABELA NOVA `opportunity_sdd_versions`:
-- era o desenho inicial, e foi descartado ao levantar o custo real. Uma
-- tabela filha de `opportunities` só fica correta depois de replicar a pilha
-- de RLS que `opportunity_documents` acumulou em DOZE migrations:
--   0018 (permissivas por tenant + 3 policies em storage.objects)
--   0025 (platform_admin: select/insert/delete)
--   0040/0041 (psw_staff por atribuição, tabela + storage)
--   0043 (trigger de coerência de tenant filha × oportunidade)
--   0044 (RESTRICTIVE `_psw_staff_only_assigned`)
--   0046 (staff-admin por tenant concedido)
--   0047 (predicado do psw_admin em storage.objects)
--   0053/0057 (visibilidade por profile e storage do platform_admin)
-- Errar um disjunto ali dá acesso quebrado para `psw_staff` e
-- `platform_admin` — exatamente quem mais usa — ou, pior, acesso largo
-- demais. Duas COLUNAS em `opportunity_documents` herdam as doze camadas
-- inteiras sem escrever uma policy sequer, e o SDD passa a aparecer na aba
-- Documentos junto dos demais arquivos do projeto, que é onde o cliente já
-- procura. O custo dessa escolha é um guard de app para não deixar apagar
-- versão gerada pelo botão de excluir da aba (fora do escopo deste arquivo:
-- é UI, e reversível).
--
-- O arquivo vai para o MESMO bucket privado 'opportunity-documents', no
-- MESMO path `{tenant_id}/{opportunity_id}/{arquivo}` — a forma contra a
-- qual todas as policies de storage foram escritas (o 1º segmento do path é
-- lido como tenant_id). Um path próprio tipo `sdd/...` quebraria o download
-- em silêncio para `psw_staff`, cujo `tenant_id` de profile é o da PSW e não
-- o do tenant onde o arquivo mora (T-17-33).
--
-- A VIEW É RECRIADA — mesma razão de 0061/0062/0063, e a lição que elas
-- custaram: `opportunities_with_score` foi criada como `select o.*`, o
-- Postgres expande o `*` na criação e CONGELA a lista. Sem o bloco 3 o
-- `alter table` acusa sucesso e o app inteiro quebra com "column ... does not
-- exist", porque tudo lê da view. `create or replace view` não serve: as
-- colunas novas entram antes de `score`/`priority_level` e o replace só
-- admite acrescentar no fim. A definição do bloco 3 é IDÊNTICA à da 0063
-- (0064 não toca a view) — só a expansão de `o.*` muda.
--
-- RLS: nenhuma policy nova, nos dois blocos. São colunas de tabelas
-- existentes, cobertas pelas policies que já valem para elas. Auditoria: a
-- trigger `audit_trigger()` (0038) é genérica por coluna — premissas e
-- restrições passam a aparecer no Histórico sem alteração lá (rótulos em
-- lib/audit/labels.ts).
--
-- IDEMPOTENTE.
--
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisitos: 0001, 0011, 0018, 0027, 0038, 0056, 0061, 0062, 0063.
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

-- -----------------------------------------------------------------------------
-- 1. opportunities — premissas e restrições
-- -----------------------------------------------------------------------------
-- Espelham a forma de `fora_escopo`/`criterios_aceite` (0062), que por sua vez
-- espelham `escopo_automacao` (0001): `text[] not null default '{}'`, para que
-- a UI nunca precise tratar null e array vazio como coisas diferentes.
alter table opportunities
  add column if not exists premissas  text[] not null default '{}',
  add column if not exists restricoes text[] not null default '{}';

comment on column opportunities.premissas is
  'Condições assumidas como verdadeiras para o prazo e o escopo valerem (ex.: acesso liberado até certa data). Seção "Premissas e restrições" do SDD.';
comment on column opportunities.restricoes is
  'Limites impostos ao projeto (janela de execução, tecnologia obrigatória, indisponibilidade de ambiente). Contraponto de `premissas`.';

-- -----------------------------------------------------------------------------
-- 2. opportunity_documents — marcação de documento GERADO + número de versão
-- -----------------------------------------------------------------------------
-- `gerado_tipo` null = upload manual da pessoa (todo o acervo existente).
-- `gerado_tipo = 'sdd'` = PDF produzido pelo gerador. É text + CHECK em vez de
-- enum novo porque a lista deve crescer sem migration de tipo (proposta
-- comercial, relatório de fechamento) — e um enum com um valor só é cerimônia
-- sem retorno.
alter table opportunity_documents
  add column if not exists gerado_tipo   text,
  add column if not exists gerado_versao int;

alter table opportunity_documents
  drop constraint if exists opportunity_documents_gerado_chk;

-- Os dois campos andam juntos: ou a linha é upload manual (ambos null), ou é
-- documento gerado (ambos preenchidos, versão >= 1). Um par meio-preenchido
-- produziria "v null" na capa ou versão órfã sem tipo.
alter table opportunity_documents
  add constraint opportunity_documents_gerado_chk check (
    (gerado_tipo is null and gerado_versao is null) or
    (gerado_tipo in ('sdd') and gerado_versao is not null and gerado_versao >= 1)
  );

-- Corrida de duplo clique: dois geradores concorrentes leem `max(versao)=1` e
-- ambos gravam v2. O índice único faz o segundo insert FALHAR em vez de criar
-- duas v2 — a action recalcula max+1 e repete. Parcial (só linhas geradas)
-- para não impor nada ao acervo de uploads manuais, que tem os dois campos null.
create unique index if not exists opportunity_documents_gerado_versao_uk
  on opportunity_documents (opportunity_id, gerado_tipo, gerado_versao)
  where gerado_tipo is not null;

-- Busca "última versão do SDD desta oportunidade", que é o que o botão de
-- download resolve a cada render do detalhe.
create index if not exists opportunity_documents_gerado_idx
  on opportunity_documents (opportunity_id, gerado_tipo, gerado_versao desc)
  where gerado_tipo is not null;

comment on column opportunity_documents.gerado_tipo is
  'null = upload manual. Não-null = documento gerado pelo sistema (hoje só ''sdd''). Distingue arquivo produzido de arquivo enviado por pessoa.';
comment on column opportunity_documents.gerado_versao is
  'Número da versão do documento gerado, 1..N, imutável. Null para upload manual. É o número impresso na capa do PDF.';

-- -----------------------------------------------------------------------------
-- 3. View — recriada para enxergar as colunas novas (ver nota no cabeçalho)
-- -----------------------------------------------------------------------------
-- Só `opportunities` entra na view; as colunas do bloco 2 são de
-- `opportunity_documents` e não passam por aqui.
drop view if exists opportunities_with_score;

create view opportunities_with_score with (security_invoker = true) as
select o.*,
  opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
  case
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
    when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
    else 'baixa'
  end as priority_level
from opportunities o;

-- O grant cai junto com o drop da view — reemitir é obrigatório, não opcional.
grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APPLY — rodar as 6 e conferir cada resultado
-- =============================================================================
-- -- 1. As duas colunas existem na TABELA, not null, default '{}' (2 linhas):
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_name = 'opportunities'
--    and column_name in ('premissas','restricoes');
--
-- -- 2. E na VIEW — o teste que a 0061 ensinou a não esquecer (2 linhas):
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'opportunities_with_score'
--    and column_name in ('premissas','restricoes');
--
-- -- 3. A view continua calculando score e devolvendo linhas:
-- select id, seq_id, premissas, restricoes, score, priority_level
--   from opportunities_with_score limit 5;
--
-- -- 4. As colunas de versionamento existem (2 linhas, ambas nullable):
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'opportunity_documents'
--    and column_name in ('gerado_tipo','gerado_versao');
--
-- -- 5. O acervo existente permaneceu intacto — todo upload manual com os dois
-- --    campos null (a 2ª coluna deve ser 0):
-- select count(*) as total,
--        count(*) filter (where gerado_tipo is not null) as gerados
--   from opportunity_documents;
--
-- -- 6. O CHECK barra par meio-preenchido (deve dar ERRO 23514, não inserir):
-- --    rodar dentro de uma transação e dar rollback.
-- -- begin;
-- --   insert into opportunity_documents
-- --     (opportunity_id, tenant_id, kind, nome, storage_path, gerado_tipo)
-- --   select id, tenant_id, 'arquivo', 'chk.pdf', 'x/y/chk.pdf', 'sdd'
-- --     from opportunities limit 1;
-- -- rollback;

-- =============================================================================
-- ROLLBACK — derrubar a view ANTES de dropar as colunas, e recriá-la depois
-- =============================================================================
-- drop view if exists opportunities_with_score;
-- alter table opportunities
--   drop column if exists premissas,
--   drop column if exists restricoes;
-- drop index if exists opportunity_documents_gerado_versao_uk;
-- drop index if exists opportunity_documents_gerado_idx;
-- alter table opportunity_documents drop constraint if exists opportunity_documents_gerado_chk;
-- alter table opportunity_documents
--   drop column if exists gerado_tipo,
--   drop column if exists gerado_versao;
-- create view opportunities_with_score with (security_invoker = true) as
-- select o.*,
--   opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) as score,
--   case
--     when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 70 then 'alta'
--     when opportunity_score(o.esforco, o.complexidade, o.tempo, o.objetivo, o.fte, o.criterios, o.beneficios) >= 40 then 'media'
--     else 'baixa'
--   end as priority_level
-- from opportunities o;
-- grant select on opportunities_with_score to authenticated;

-- =============================================================================
-- FIM 0065
-- =============================================================================
