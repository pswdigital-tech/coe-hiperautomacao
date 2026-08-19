import 'server-only';
import OpenAI from 'openai';
import { APIError, LengthFinishReasonError } from 'openai/error';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceRoleClient } from '@/lib/supabase/server';
import {
  OpportunityEnrichedFieldsSchema,
  type OpportunityEnrichedFields,
} from './schema';
import { buildEnrichmentPrompt, type EnrichmentInput } from './prompts';
import type { Database } from '@/lib/database.types';

// =============================================================================
// enrichOpportunity — wrapper read + chamada OpenAI + UPDATE defensivo.
//
// Consumido via `after()` do Next.js no Server Action (Plan 03). Fire-and-forget.
//
// GARANTIAS:
//   - ID-do-tenant NUNCA aparece no prompt (Pitfall 5 — defesa em camadas
//     via `EnrichmentInput` type que não inclui o campo).
//   - UPDATE filtra por id + tenant_id + ai_enrichment_status='pending'
//     (anti cross-tenant write + idempotência).
//   - Refusal, LengthFinishReasonError, network errors viram `failed`
//     com mensagem truncada em `ai_enrichment_error`.
//   - `new OpenAI()` failure (env var ausente) catched → markFailed
//     com prefix 'openai-init:' (cobertura simétrica ao path service-role
//     missing, que retorna early sem update porque não há `sb` para escrever).
//   - NUNCA APAGA DADO DO USUÁRIO: o patch final passa por
//     `buildEnrichmentPatch()` (abaixo), que decide campo a campo o que pode
//     ser escrito. Ver as três regras documentadas lá.
//
// REPROCESSAMENTO MANUAL (`options.preserveFilled`): o botão "Reprocessar IA"
// do detalhe (lib/ai/reprocess-actions.ts) reusa esta mesma função. A única
// diferença é o modo de mesclagem — ver `EnrichmentOptions`.
// =============================================================================

type Sb = SupabaseClient<Database>;

export type EnrichmentOptions = {
  /**
   * `true` (reprocesso em modo "completar"): campo JÁ PREENCHIDO na linha nunca
   * é tocado — a IA só preenche buraco. `false`/ausente (default, usado pelo
   * enriquecimento pós-INSERT e pelo reprocesso em modo "refazer"): os campos
   * derivados são reescritos, respeitando ainda assim as regras 1 e 2 de
   * `buildEnrichmentPatch()` (ferramenta e valor-vazio nunca destroem input).
   */
  preserveFilled?: boolean;
};

export async function enrichOpportunity(
  opportunityId: string,
  tenantId: string,
  options: EnrichmentOptions = {},
): Promise<void> {
  let sb: Sb;
  try {
    sb = serviceRoleClient();
  } catch (e) {
    // serviceRoleClient throws se env vars ausentes — log e sai
    // (não temos sb para escrever 'failed' no DB).
    console.error('[ai/enrichment] serviceRoleClient indisponível:', errMsg(e));
    return;
  }

  // 1. Read row — defensive triplo filter (id + tenant_id + pending)
  const { data: row, error: readErr } = await sb
    .from('opportunities')
    .select(
      'source, request_type, solicitante, area, subarea, processo, ' +
        'frequencia, volume_medio, tempo_execucao, num_pessoas, ' +
        'persona_extras, formulario_extras, ' +
        // Valores ATUAIS dos campos derivados — entram só no merge
        // (`buildEnrichmentPatch`), nunca no prompt (`EnrichmentInput` não os
        // aceita). É o que permite não sobrescrever o que a pessoa digitou.
        'ferramentas, escopo_automacao, beneficios_esperados, observacao, ' +
        'risco, esforco, complexidade, objetivo',
    )
    .eq('id', opportunityId)
    .eq('tenant_id', tenantId)
    .eq('ai_enrichment_status', 'pending')
    .maybeSingle();

  if (readErr) {
    console.error('[ai/enrichment] read falhou:', readErr.message);
    return;
  }
  if (!row) {
    // Idempotência: row não está mais pending (já enriched OU já failed
    // por chamada anterior). Saída silenciosa — não rewriting.
    return;
  }

  // 2. Build prompt — type EnrichmentInput não permite ID-do-tenant (compile-time)
  const rowTyped = row as unknown as {
    source: 'persona' | 'formulario';
    request_type: string | null;
    solicitante: string;
    area: string;
    subarea: string | null;
    processo: string;
    frequencia: string | null;
    volume_medio: string | null;
    tempo_execucao: string | null;
    num_pessoas: string | null;
    persona_extras: Record<string, unknown> | null;
    formulario_extras: Record<string, unknown> | null;
  } & CurrentValues;
  const promptInput: EnrichmentInput = {
    source: rowTyped.source,
    request_type: rowTyped.request_type,
    solicitante: rowTyped.solicitante,
    area: rowTyped.area,
    subarea: rowTyped.subarea,
    processo: rowTyped.processo,
    frequencia: rowTyped.frequencia,
    volume_medio: rowTyped.volume_medio,
    tempo_execucao: rowTyped.tempo_execucao,
    num_pessoas: rowTyped.num_pessoas,
    persona_extras: rowTyped.persona_extras,
    formulario_extras: rowTyped.formulario_extras,
  };

  const { systemPrompt, userPrompt } = buildEnrichmentPrompt(promptInput);

  // 3. Call OpenAI — OPENAI_API_KEY lido automaticamente da env.
  // Catch dedicado para o constructor: SDK pode throw se a env var não estiver
  // presente (cobertura simétrica ao path service-role missing).
  let client: OpenAI;
  try {
    client = new OpenAI();
  } catch (e) {
    await markFailed(sb, opportunityId, tenantId, `openai-init: ${errMsg(e)}`);
    return;
  }

  try {
    const completion = await client.chat.completions.parse({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(
        OpportunityEnrichedFieldsSchema,
        'opportunity_enriched_fields',
      ),
      max_tokens: 800,
    });

    const message = completion.choices[0]?.message;

    if (message?.refusal) {
      await markFailed(
        sb,
        opportunityId,
        tenantId,
        `refusal: ${truncate(message.refusal, 480)}`,
      );
      return;
    }

    if (!message?.parsed) {
      await markFailed(sb, opportunityId, tenantId, 'no parsed content in response');
      return;
    }

    const enriched = message.parsed;

    // 4. UPDATE com WHERE defensivo triplo — idempotência + anti cross-tenant.
    // O QUE entra no patch é decidido por `buildEnrichmentPatch` (regras de
    // preservação de input do usuário); o status/carimbo é sempre escrito.
    const { error: updateErr } = await sb
      .from('opportunities')
      .update({
        ...buildEnrichmentPatch(enriched, rowTyped, options),
        ai_enrichment_status: 'enriched',
        ai_enriched_at: new Date().toISOString(),
        ai_enrichment_error: null,
      })
      .eq('id', opportunityId)
      .eq('tenant_id', tenantId)
      .eq('ai_enrichment_status', 'pending');

    if (updateErr) {
      await markFailed(
        sb,
        opportunityId,
        tenantId,
        `update: ${truncate(updateErr.message, 480)}`,
      );
    }
  } catch (err) {
    // LengthFinishReasonError, network errors, etc. — todos viram failed.
    const errorClass =
      err instanceof LengthFinishReasonError
        ? 'length_finish'
        : err instanceof APIError
          ? `api_${err.status ?? 'unknown'}`
          : 'unknown';
    await markFailed(
      sb,
      opportunityId,
      tenantId,
      `${errorClass}: ${truncate(errMsg(err), 480)}`,
    );
  }
}

// =============================================================================
// buildEnrichmentPatch — o que a IA PODE escrever numa linha que já existe
// -----------------------------------------------------------------------------
// A IA deriva 8 campos. Nenhum deles é exclusivo dela: o wizard, o formulário
// público e a edição in-modal escrevem nos mesmos campos. Um UPDATE cru com os
// 8 valores, portanto, APAGA trabalho de gente — e é exatamente isso que o
// botão "Reprocessar IA" (que roda esta função em cima de uma linha madura,
// com tarefas, riscos e edições manuais em volta) não pode fazer.
//
// TRÊS REGRAS, aplicadas nesta ordem:
//
//   1. `ferramenta` só é escrita quando `ferramentas` está VAZIO. Desde a 0055
//      o array `ferramentas` é a fonte da verdade e o enum `ferramenta` é
//      derivado dele por trigger — mas a trigger é bidirecional: escrever o
//      enum com um valor diferente do atual faz ela REESCREVER o array. Uma
//      seleção de duas ferramentas (['sap','databricks']) viraria ['rpa'] sem
//      ninguém ter pedido. Se a pessoa escolheu, a IA não opina.
//
//   2. Valor VAZIO da IA nunca sobrescreve valor preenchido. O schema de
//      resposta (lib/ai/schema.ts) exige todos os campos, e o modelo devolve
//      `''`/`[]` quando não tem o que dizer — trocar um texto escrito por uma
//      string vazia seria perda pura, sem nada em troca.
//
//   3. `preserveFilled` (modo "completar" do reprocesso): NADA que já esteja
//      preenchido é tocado — a IA só preenche buraco. É o modo default do
//      botão de reprocessar, e o que torna clicar nele uma operação sem risco.
//
// FORA DO PATCH POR DESIGN: `tempo`. REALIGN-7.6 (deferido) — a IA ainda produz
// o domínio antigo de DURAÇÃO (pequeno/medio/grande, lib/ai/schema.ts) e a 0011
// mudou a coluna `opportunities.tempo` para FREQUÊNCIA (frequency_bucket). Não
// há mapeamento 1:1, então o enrichment não escreve `tempo` até a IA ser
// realinhada. Os outros 8 campos seguem normais.
// =============================================================================

/** Valores ATUAIS dos campos que a IA deriva — lidos junto com o input. */
export type CurrentValues = {
  ferramentas: string[] | null;
  escopo_automacao: string[] | null;
  beneficios_esperados: string[] | null;
  observacao: string | null;
  risco: string | null;
  esforco: string | null;
  complexidade: string | null;
  objetivo: number | null;
};

export type EnrichmentPatch = Partial<
  Pick<
    OpportunityEnrichedFields,
    | 'ferramenta'
    | 'escopo_automacao'
    | 'beneficios_esperados'
    | 'observacao'
    | 'risco'
    | 'esforco'
    | 'complexidade'
    | 'objetivo'
  >
>;

export function buildEnrichmentPatch(
  enriched: OpportunityEnrichedFields,
  current: Partial<CurrentValues>,
  options: EnrichmentOptions = {},
): EnrichmentPatch {
  const preserve = options.preserveFilled === true;
  const patch: EnrichmentPatch = {};

  /** Escreve `value` só se as regras 2 e 3 permitirem. */
  function put<K extends keyof EnrichmentPatch>(
    key: K,
    value: NonNullable<EnrichmentPatch[K]>,
    currentValue: unknown,
  ): void {
    // Buraco: escreve sempre — inclusive valor vazio da IA, que aqui é no-op
    // (vazio sobre vazio) e mantém o payload do enriquecimento pós-INSERT
    // byte-idêntico ao de antes desta função existir.
    if (isEmptyValue(currentValue)) {
      patch[key] = value;
      return;
    }
    if (preserve) return; // regra 3 — nada preenchido é tocado
    if (isEmptyValue(value)) return; // regra 2 — vazio da IA não apaga texto
    patch[key] = value;
  }

  // Regra 1 — a seleção de ferramentas da pessoa é intocável.
  if (isEmptyValue(current.ferramentas)) {
    put('ferramenta', enriched.ferramenta, null);
  }

  put('escopo_automacao', enriched.escopo_automacao, current.escopo_automacao);
  put(
    'beneficios_esperados',
    enriched.beneficios_esperados,
    current.beneficios_esperados,
  );
  put('observacao', enriched.observacao, current.observacao);
  put('risco', enriched.risco, current.risco);
  put('esforco', enriched.esforco, current.esforco);
  put('complexidade', enriched.complexidade, current.complexidade);
  put('objetivo', enriched.objetivo, current.objetivo);

  return patch;
}

/**
 * "Vazio" para efeito das regras acima: `null`/`undefined`, string só de
 * espaço, array sem itens. `0` não aparece nos domínios envolvidos (`objetivo`
 * é 1–5), então não há armadilha de falsy aqui.
 */
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

async function markFailed(
  sb: Sb,
  opportunityId: string,
  tenantId: string,
  errorMsg: string,
): Promise<void> {
  const { error } = await sb
    .from('opportunities')
    .update({
      ai_enrichment_status: 'failed',
      ai_enrichment_error: errorMsg,
      ai_enriched_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('tenant_id', tenantId)
    .eq('ai_enrichment_status', 'pending');
  if (error) {
    // NUNCA logar ID-do-tenant raw — só primeiros 8 chars
    console.error(
      '[ai/enrichment] markFailed falhou para opp=%s tenant=%s...:',
      opportunityId,
      tenantId.slice(0, 8),
      error.message,
    );
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
