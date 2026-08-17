-- =============================================================================
-- 0043-recarimbar-linhas-divergentes.sql — correção das linhas filhas cujo
-- `tenant_id` diverge do tenant da sua oportunidade
-- =============================================================================
-- ✅ JÁ EXECUTADO EM PRODUÇÃO — 2026-08-07
--
-- O PO inspecionou as linhas e escolheu o PASSO 2B (apagar): 5 notas, 2 riscos
-- e 1 linha de histórico. Conferência pós-execução devolveu 0 nas quatro
-- tabelas. Este arquivo fica versionado como registro do que foi feito e como
-- ferramenta reutilizável caso a divergência reapareça.
--
-- Nota sobre o que sobreviveu: `audit_trigger` (0038) cobre `opportunity_notes`
-- e `opportunity_risks`, então o teor das 7 linhas dessas duas tabelas está
-- preservado em `audit_log.old_data`, carimbado com o tenant PSW — visível
-- para a PSW, invisível para o cliente dono da oportunidade, que era
-- exatamente o objetivo. A linha de `opportunity_history` não é auditada
-- (a 0038 não instala trigger nessa tabela) e foi perdida de vez.
--
-- Complemento de `supabase/migrations/0043_child_tenant_coherence.sql`. Aquela
-- migration impede que linhas assim NASÇAM; este script corrige as que já
-- existem. Está separado de propósito: a correção MUDA QUEM ENXERGA a linha,
-- e essa decisão exige olhar o conteúdo antes.
--
-- ⚠️ LEIA ANTES DE RODAR O PASSO 2
--
-- Hoje essas linhas estão carimbadas com o tenant de QUEM AS ESCREVEU (o
-- tenant PSW), não com o tenant da oportunidade. Consequência atual:
--   • quem é da PSW enxerga;
--   • o cliente dono da oportunidade NÃO enxerga.
--
-- Recarimbar inverte exatamente isso: passa a aparecer para o cliente e some
-- para a PSW. Isso é o comportamento correto do modelo — mas se essas linhas
-- contiverem anotação INTERNA (avaliação de esforço, ressalva sobre o
-- cliente, negociação), a correção expõe esse conteúdo a ele.
--
-- Por isso o PASSO 1 abaixo mostra o conteúdo. Decida com ele à vista:
--   • conteúdo neutro/operacional → PASSO 2A (recarimbar) — preserva a informação
--   • conteúdo interno            → PASSO 2B (apagar)     — some para todos
--
-- Não existe terceira opção boa: deixar como está mantém a linha invisível
-- para o dono e visível para quem não deveria, que é o próprio defeito.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASSO 1 — Inspeção (somente leitura, rode primeiro)
-- -----------------------------------------------------------------------------
select
  'nota'                                   as tipo,
  n.id::text                               as id,
  left(n.texto, 200)                       as conteudo,
  n.created_at,
  coalesce(p.email, '(autor removido)')    as autor,
  tl.name                                  as tenant_carimbado_na_linha,
  td.name                                  as tenant_dono_da_oportunidade,
  o.seq_id                                 as oportunidade
from opportunity_notes n
join opportunities o on o.id = n.opportunity_id
join tenants td      on td.id = o.tenant_id
join tenants tl      on tl.id = n.tenant_id
left join profiles p on p.id = n.created_by
where n.tenant_id is distinct from o.tenant_id

union all

select
  'risco',
  r.id::text,
  left(r.descricao || coalesce(' | ' || r.resposta, ''), 200),
  r.created_at,
  coalesce(p.email, '(autor removido)'),
  tl.name,
  td.name,
  o.seq_id
from opportunity_risks r
join opportunities o on o.id = r.opportunity_id
join tenants td      on td.id = o.tenant_id
join tenants tl      on tl.id = r.tenant_id
left join profiles p on p.id = r.created_by
where r.tenant_id is distinct from o.tenant_id

union all

-- opportunity_history é legado congelado (nada escreve nela desde a 0038),
-- mas a verificação da 0043 encontrou 1 linha divergente aqui também.
select
  'historico',
  h.id::text,
  left(h.resumo || coalesce(' | ' || h.comentario, ''), 200),
  h.created_at,
  coalesce(p.email, '(autor removido)'),
  tl.name,
  td.name,
  o.seq_id
from opportunity_history h
join opportunities o on o.id = h.opportunity_id
join tenants td      on td.id = o.tenant_id
join tenants tl      on tl.id = h.tenant_id
left join profiles p on p.id = h.changed_by
where h.tenant_id is distinct from o.tenant_id

union all

select
  'documento',
  d.id::text,
  left(d.nome || coalesce(' | ' || d.url, ''), 200),
  d.created_at,
  coalesce(p.email, '(autor removido)'),
  tl.name,
  td.name,
  o.seq_id
from opportunity_documents d
join opportunities o on o.id = d.opportunity_id
join tenants td      on td.id = o.tenant_id
join tenants tl      on tl.id = d.tenant_id
left join profiles p on p.id = d.created_by
where d.tenant_id is distinct from o.tenant_id

order by tipo, created_at;

-- -----------------------------------------------------------------------------
-- PASSO 2A — Recarimbar (conteúdo neutro): a linha passa a pertencer ao
-- tenant da sua oportunidade. Preserva a informação.
-- -----------------------------------------------------------------------------
-- Rode dentro de begin/commit para conferir a contagem antes de confirmar.
-- Passa pela guarda da 0043 sem problema: o valor novo é exatamente o que ela
-- exige.
--
-- begin;
--
-- update opportunity_notes n
--    set tenant_id = o.tenant_id
--   from opportunities o
--  where o.id = n.opportunity_id
--    and n.tenant_id is distinct from o.tenant_id;
--
-- update opportunity_risks r
--    set tenant_id = o.tenant_id
--   from opportunities o
--  where o.id = r.opportunity_id
--    and r.tenant_id is distinct from o.tenant_id;
--
-- update opportunity_documents d
--    set tenant_id = o.tenant_id
--   from opportunities o
--  where o.id = d.opportunity_id
--    and d.tenant_id is distinct from o.tenant_id;
--
-- update opportunity_history h
--    set tenant_id = o.tenant_id
--   from opportunities o
--  where o.id = h.opportunity_id
--    and h.tenant_id is distinct from o.tenant_id;
--
-- -- confira: deve dar 0 em todas as linhas
-- select 'notes' as t, count(*) from opportunity_notes n join opportunities o on o.id=n.opportunity_id where n.tenant_id is distinct from o.tenant_id
-- union all select 'risks', count(*) from opportunity_risks r join opportunities o on o.id=r.opportunity_id where r.tenant_id is distinct from o.tenant_id
-- union all select 'documents', count(*) from opportunity_documents d join opportunities o on o.id=d.opportunity_id where d.tenant_id is distinct from o.tenant_id
-- union all select 'history', count(*) from opportunity_history h join opportunities o on o.id=h.opportunity_id where h.tenant_id is distinct from o.tenant_id;
--
-- commit;   -- ou rollback; se a contagem não zerar

-- -----------------------------------------------------------------------------
-- PASSO 2B — Apagar (conteúdo interno): a linha some para todos.
-- -----------------------------------------------------------------------------
-- IRREVERSÍVEL. Rode o PASSO 1 e salve o resultado antes, se quiser guardar o
-- teor em algum lugar fora do banco.
--
-- A trilha de auditoria (audit_log, 0038) registra o delete, então o evento
-- não some — só o conteúdo sai das telas.
--
-- begin;
--
-- delete from opportunity_notes n
--  using opportunities o
--  where o.id = n.opportunity_id
--    and n.tenant_id is distinct from o.tenant_id;
--
-- delete from opportunity_risks r
--  using opportunities o
--  where o.id = r.opportunity_id
--    and r.tenant_id is distinct from o.tenant_id;
--
-- delete from opportunity_documents d
--  using opportunities o
--  where o.id = d.opportunity_id
--    and d.tenant_id is distinct from o.tenant_id;
--
-- delete from opportunity_history h
--  using opportunities o
--  where o.id = h.opportunity_id
--    and h.tenant_id is distinct from o.tenant_id;
--
-- commit;   -- ou rollback;
--
-- ATENÇÃO no 2B para `opportunity_documents`: apagar a linha NÃO apaga o
-- arquivo no bucket do Storage. Se houver documento divergente com
-- `kind='arquivo'`, guarde o `storage_path` do Passo 1 antes e remova o
-- objeto à mão. Na verificação atual documents=0, então isto não se aplica —
-- fica registrado para o caso de rodar este script de novo no futuro.

-- =============================================================================
-- Esperado após 2A ou 2B: a query de verificação nº 2 da migration 0043
-- devolve 0 em todas as tabelas.
-- =============================================================================
