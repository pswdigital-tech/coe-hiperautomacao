'use server';

// =============================================================================
// reprocess-actions.ts — botão "Reprocessar IA" do detalhe da oportunidade
// -----------------------------------------------------------------------------
// POR QUE EXISTE: o enriquecimento por IA roda UMA vez, logo depois do INSERT,
// em `after()` (fire-and-forget). Se ele falhar — chave da OpenAI vencida,
// timeout, recusa do modelo — a oportunidade fica com os campos derivados
// vazios e o score sai errado, e não havia nenhum caminho na interface para
// tentar de novo: só um UPDATE manual no SQL Editor. O segundo caso de uso é o
// inverso do erro: a pessoa CORRIGIU a descrição do processo (ou a frequência,
// ou o volume) e quer a análise refeita em cima do texto novo.
//
// TRÊS CAMADAS DE DEFESA, na ordem em que rodam:
//   1. `tenant_id` derivado da OPORTUNIDADE (via client autenticado, então a
//      RLS já recorta o que a pessoa enxerga) — nunca do formulário.
//   2. Gate de papel aqui: `platform_admin` em qualquer empresa OU o par
//      pessoa × empresa (`isTenantAdminOf`) contra o tenant DESTA
//      oportunidade — mesmo critério do gate visual em
//      `app/(app)/opportunities/[id]/page.tsx` e do gate de atribuição em
//      `assignee-actions.ts`. Cobre os três papéis pedidos: super-admin da
//      plataforma, staff PSW com concessão de admin naquela empresa (0045) e
//      admin da própria empresa.
//   3. RLS (0015/0021/0025/0047) é o bloqueio real do UPDATE, e o
//      `.select('id')` depois dele existe para transformar "casou zero linhas"
//      em erro visível em vez de sucesso silencioso.
//
// PRESERVAÇÃO DE INPUT: esta action NÃO decide o que é escrito — quem decide é
// `buildEnrichmentPatch()` (lib/ai/enrichment.ts), que documenta as três
// regras. Daqui sai apenas o MODO de mesclagem escolhido na interface.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { enrichOpportunity } from '@/lib/ai/enrichment';

/**
 * `fill-empty` — a IA só preenche campo vazio; nada que já esteja preenchido é
 * tocado. É o default do diálogo, e o modo que resolve o caso de ERRO.
 *
 * `overwrite` — refaz os campos derivados pela IA (escopo, benefícios
 * esperados, observação, risco, esforço, complexidade, objetivo). É o modo do
 * caso "corrigi o processo, quero a análise nova". Continua sem tocar em nada
 * que a IA não gera — e continua respeitando as regras 1 e 2 de
 * `buildEnrichmentPatch()`: a seleção de ferramentas da pessoa é intocável, e
 * resposta vazia da IA nunca apaga texto escrito.
 */
export type ReprocessMode = 'fill-empty' | 'overwrite';

export type ReprocessResult = { ok: true } | { ok: false; error: string };

const NOT_ADMIN_MESSAGE =
  'Apenas administradores da empresa podem reprocessar a análise da IA.';

export async function reprocessOpportunityEnrichment(
  opportunityId: string,
  mode: ReprocessMode = 'fill-empty',
): Promise<ReprocessResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const supabase = await createClient();

  // Camada 1 — tenant vem do dado-alvo. "Não existe" e "fora do escopo"
  // colapsam de propósito na mesma mensagem (mesma disciplina de
  // `resolveWriteTenantId`): nunca revelar qual dos dois casos ocorreu.
  const { data: opp } = await supabase
    .from('opportunities')
    .select('id, tenant_id')
    .eq('id', opportunityId)
    .maybeSingle();

  if (!opp) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  // Camada 2 — gate de papel contra o tenant DESTA oportunidade.
  const canReprocess =
    isPlatformAdmin(profile) || (await isTenantAdminOf(profile, opp.tenant_id));
  if (!canReprocess) return { ok: false, error: NOT_ADMIN_MESSAGE };

  // Volta para 'pending' ANTES de chamar a IA: `enrichOpportunity` filtra por
  // `ai_enrichment_status = 'pending'` no read e no UPDATE (idempotência da
  // Phase 7.6). Sem este passo o reprocesso seria um no-op silencioso em toda
  // linha já 'enriched'. Nenhum campo de conteúdo é limpo aqui — só o estado.
  const { data: marked, error: markErr } = await supabase
    .from('opportunities')
    .update({ ai_enrichment_status: 'pending', ai_enrichment_error: null })
    .eq('id', opportunityId)
    .eq('tenant_id', opp.tenant_id)
    .select('id');

  if (markErr) {
    return { ok: false, error: 'Não foi possível iniciar o reprocessamento.' };
  }
  if (!marked || marked.length === 0) {
    // Camada 3 — UPDATE que casa zero linhas volta com `error: null`. Sem esta
    // checagem a interface confirmaria um reprocesso que o banco recusou.
    return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };
  }

  // Diferente do caminho pós-INSERT (`after()`, fire-and-forget), aqui o
  // enriquecimento é AGUARDADO: quem clicou está olhando para a tela e precisa
  // saber se funcionou. `enrichOpportunity` captura os próprios erros e nunca
  // rejeita — o resultado é lido do estado que ela grava, logo abaixo.
  await enrichOpportunity(opportunityId, opp.tenant_id, {
    preserveFilled: mode === 'fill-empty',
  });

  const { data: after } = await supabase
    .from('opportunities')
    .select('ai_enrichment_status, ai_enrichment_error')
    .eq('id', opportunityId)
    .maybeSingle();

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);

  if (after?.ai_enrichment_status === 'failed') {
    const detail = after.ai_enrichment_error?.slice(0, 200);
    return {
      ok: false,
      error: detail
        ? `A IA não concluiu a análise. Detalhe técnico: ${detail}`
        : 'A IA não concluiu a análise. Tente novamente em alguns instantes.',
    };
  }

  if (after?.ai_enrichment_status === 'pending') {
    // `enrichOpportunity` saiu antes de escrever qualquer estado — na prática,
    // service-role indisponível (env var ausente). O log do servidor tem a
    // causa; aqui fica a mensagem legível.
    return {
      ok: false,
      error: 'O serviço de IA não está disponível no momento. Avise o suporte.',
    };
  }

  return { ok: true };
}
