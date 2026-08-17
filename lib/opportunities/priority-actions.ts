'use server';

// =============================================================================
// priority-actions.ts — reordenação manual de prioridade (0049)
// -----------------------------------------------------------------------------
// Uma action só, consumida pelas TRÊS views que permitem arrastar (Lista,
// Cards e Kanban). Elas mandam o mesmo payload — o array de ids VISÍVEIS já na
// ordem final — e nenhuma delas calcula posição: quem numera é a função SQL
// `set_opportunity_priority_order` (0049), atomicamente, com a regra de slots
// que preserva a posição global de quem está fora do recorte filtrado.
//
// Camadas de defesa:
//   1. `requireEditorRole()` barra `viewer` com mensagem pt-BR (a RLS de
//      `opportunities` já barraria com 42501 cru — este gate é a mensagem, não
//      a defesa; mesmo padrão de `task-actions.ts`).
//   2. A RPC é `security invoker` — todo SELECT/UPDATE dentro dela passa pelas
//      policies do chamador. Id de outro tenant não é encontrado e a função
//      devolve 0 sem escrever.
//   3. Validação de forma no servidor: só UUIDs, sem repetidos, com teto. O
//      array vem do cliente; sem isso um payload gigante ou com o mesmo id
//      repetido chegaria à RPC.
//   4. Erro devolvido ao cliente é sempre pt-BR genérico — nunca interpola
//      `error.message` do driver (T-16-13).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireEditorRole } from '@/lib/security/role';
import { PRIORITY_ORDER, type PriorityValue } from './priority-labels';
import type { ManualPriority } from './types';

export type ReorderResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Teto defensivo do payload — bem acima de qualquer lista real de um tenant. */
const MAX_IDS = 2000;

/**
 * Normaliza o array de ids vindo do cliente: só UUIDs bem formados, sem
 * duplicata, respeitando o teto. Retorna `null` quando o payload não é
 * aproveitável — o chamador trata como "dados inválidos", nunca reordena
 * parcialmente com o que sobrou.
 */
function normalizeIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return null;
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return ids as string[];
}

/**
 * Grava a ordem manual de prioridade das oportunidades.
 *
 * `orderedIds` é a lista VISÍVEL na tela, do topo para baixo. Não precisa ser o
 * tenant inteiro: a função SQL redistribui entre esses ids apenas as posições
 * que eles já ocupavam na ordem global, então arrastar numa lista filtrada não
 * faz os itens escondidos pularem de lugar.
 */
export async function reorderOpportunities(
  orderedIds: unknown
): Promise<ReorderResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const ids = normalizeIds(orderedIds);
  if (!ids) return { ok: false, error: 'Ordem inválida.' };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('set_opportunity_priority_order', {
    p_ids: ids,
  });

  if (error) {
    return { ok: false, error: 'Erro ao salvar a ordem de prioridade.' };
  }
  // A RPC devolve 0 quando nenhum dos ids é visível para o chamador (ex:
  // tentativa cross-tenant) — mas TAMBÉM quando a ordem enviada já é a
  // gravada. Só o primeiro caso é erro, e não dá para distingui-los pelo
  // retorno; tratamos ambos como sucesso silencioso, porque o efeito visível
  // ao usuário legítimo é idêntico e o cross-tenant não escreveu nada.
  void data;

  revalidatePath('/opportunities');
  return { ok: true };
}

/**
 * Grava a TAG de prioridade manual de uma oportunidade (0050).
 *
 * `tag` é `null` para desclassificar (volta a "—"). Diferente da ordem, esta é
 * uma mutação de campo único — não precisa de RPC nem de renumeração; a policy
 * de UPDATE de `opportunities` é o que barra `viewer` e cross-tenant.
 *
 * NÃO toca em `score`/`priority_level`: a prioridade calculada continua
 * existindo e sendo exibida ao lado, independente desta.
 */
export async function setOpportunityPriorityTag(
  opportunityId: string,
  tag: unknown
): Promise<ReorderResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  if (typeof opportunityId !== 'string' || !UUID_RE.test(opportunityId)) {
    return { ok: false, error: 'Oportunidade inválida.' };
  }

  // Whitelist a partir da fonte única dos valores — nunca confia na string do
  // cliente, mesmo com a coluna sendo enum (o erro do Postgres seria cru).
  let value: ManualPriority | null;
  if (tag === null || tag === '') {
    value = null;
  } else if (
    typeof tag === 'string' &&
    (PRIORITY_ORDER as string[]).includes(tag)
  ) {
    value = tag as PriorityValue;
  } else {
    return { ok: false, error: 'Prioridade inválida.' };
  }

  const supabase = await createClient();

  // `.select()` para detectar o no-op silencioso da RLS: um UPDATE que casa 0
  // linhas retorna error=null, e sem isto a UI confirmaria uma mudança que o
  // banco nunca gravou (mesmo cuidado de `updateOpportunityStatus`).
  const { data, error } = await supabase
    .from('opportunities')
    .update({ priority_tag: value })
    .eq('id', opportunityId)
    .select('id');

  if (error) {
    return { ok: false, error: 'Erro ao salvar a prioridade.' };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Sem permissão de escrita para esta oportunidade.',
    };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}

/**
 * Grava a ordem manual das tarefas/subtarefas de UMA oportunidade.
 *
 * `orderedIds` é o grupo de irmãos rearranjado (as raízes, ou as filhas de uma
 * mesma tarefa-pai) — nunca os dois misturados. A regra de slots da função SQL
 * garante que reordenar um grupo não desloca o outro.
 */
export async function reorderTasks(
  opportunityId: string,
  orderedIds: unknown
): Promise<ReorderResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  if (typeof opportunityId !== 'string' || !UUID_RE.test(opportunityId)) {
    return { ok: false, error: 'Oportunidade inválida.' };
  }

  const ids = normalizeIds(orderedIds);
  if (!ids) return { ok: false, error: 'Ordem inválida.' };

  const supabase = await createClient();

  const { error } = await supabase.rpc('set_task_priority_order', {
    p_opportunity_id: opportunityId,
    p_ids: ids,
  });

  if (error) {
    return { ok: false, error: 'Erro ao salvar a ordem das tarefas.' };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/tarefas`);
  return { ok: true };
}
