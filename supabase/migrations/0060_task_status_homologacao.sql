-- =============================================================================
-- 0060_task_status_homologacao.sql — 5º status de tarefa: Homologação
-- =============================================================================
-- CONTEXTO: o enum `task_status` (0037) nasceu com 4 valores fixos mapeando
-- 1:1 nas 4 colunas do Kanban de tarefas/subtarefas (D-03). Decisão de produto
-- (2026-08-18): existe uma etapa de VALIDAÇÃO entre "em andamento" e "pronto"
-- — o trabalho já foi feito, mas ainda está sendo conferido por quem pediu.
-- Hoje isso se esconde dentro de "Em Andamento" (o card fica lá até alguém
-- lembrar de fechar) ou é fechado cedo demais em "Finalizado" (e o % concluído
-- do plano mente). O novo valor dá lugar próprio a essa espera.
--
-- Ordem das colunas do Kanban passa a ser:
--   Backlog → Em Andamento → Homologação → Finalizado → Bloqueio
-- (`bloqueio` vai para o fim: não é uma etapa do fluxo, é um desvio dele —
-- deixá-lo no meio quebrava a leitura da esteira da esquerda para a direita.)
--
-- NOME DO VALOR: `homologacao`, o MESMO literal já usado pelo enum
-- `opportunity_status` (0001) — por isso `lib/audit/labels.ts` já traduz
-- 'homologacao' → 'Homologação' sem nenhuma linha nova, e a paleta da coluna
-- reusa a da fase homônima da oportunidade (🧪 / #06b6d4).
--
-- POSIÇÃO NO ENUM (`before 'finalizado'`): a ordenação das COLUNAS na tela vem
-- de `TASK_STATUS_ORDER` (lib/opportunities/task-labels.ts), não do enum —
-- nenhuma query ordena tarefa por status. O `before` é só para que um
-- `order by status` eventual (psql, export, debug) saia na ordem do fluxo em
-- vez de jogar o valor novo no fim.
--
-- SEM IMPACTO NO QUE JÁ EXISTE: nenhuma linha muda de status, o default
-- continua 'backlog', e a constraint `opportunity_tasks_blocked_reason_chk`
-- segue exigindo motivo APENAS quando `status = 'bloqueio'` — homologação não
-- pede motivo nenhum (é `status <> 'bloqueio'`, portanto já satisfeita).
-- Também não conta como concluída: `task-rollup.ts`/`task-summary.ts` medem
-- progresso por `status === 'finalizado'`, e uma tarefa em homologação
-- corretamente ainda não fechou.
--
-- IDEMPOTENTE (`add value if not exists`) — seguro de re-rodar.
-- NOTA DE EXECUÇÃO: `alter type ... add value` NÃO pode rodar dentro de um
-- bloco `do $$ ... $$` ("ALTER TYPE ... ADD cannot be executed from a
-- function") — por isso é statement de topo, sem o wrapper `do` das demais
-- migrations. No Postgres 12+ (Supabase) ele roda em transação normalmente,
-- desde que o valor novo não seja USADO na mesma transação — esta migration
-- só o declara.
-- WRITE-ONLY MODE — aplicar manualmente no Supabase Cloud SQL Editor.
-- Pré-requisito: 0037 (enum `task_status`, tabela `opportunity_tasks`).
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

alter type task_status add value if not exists 'homologacao' before 'finalizado';

-- =============================================================================
-- FIM 0060 — verificação:
--   select unnest(enum_range(null::task_status));
--   -- esperado: backlog, em_andamento, bloqueio, homologacao, finalizado
--   -- (ordem do ENUM; a ordem das COLUNAS do Kanban é a de TASK_STATUS_ORDER)
-- =============================================================================
