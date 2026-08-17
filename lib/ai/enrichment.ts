import 'server-only';
import OpenAI from 'openai';
import { APIError, LengthFinishReasonError } from 'openai/error';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceRoleClient } from '@/lib/supabase/server';
import { OpportunityEnrichedFieldsSchema } from './schema';
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
// =============================================================================

type Sb = SupabaseClient<Database>;

export async function enrichOpportunity(
  opportunityId: string,
  tenantId: string,
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
        'persona_extras, formulario_extras',
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
  };
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

    // 4. UPDATE com WHERE defensivo triplo — idempotência + anti cross-tenant
    const { error: updateErr } = await sb
      .from('opportunities')
      .update({
        ferramenta: enriched.ferramenta,
        escopo_automacao: enriched.escopo_automacao,
        beneficios_esperados: enriched.beneficios_esperados,
        observacao: enriched.observacao,
        risco: enriched.risco,
        esforco: enriched.esforco,
        complexidade: enriched.complexidade,
        // REALIGN-7.6 (deferido): a IA ainda produz `tempo` no domínio antigo de
        // DURAÇÃO (pequeno/medio/grande, lib/ai/schema.ts), mas 0011 mudou a coluna
        // `opportunities.tempo` para FREQUÊNCIA (frequency_bucket). Não há mapeamento
        // 1:1 entre duração e frequência — então o enrichment NÃO sobrescreve `tempo`
        // até a IA ser realinhada (REALIGN-7.6). Os outros 8 campos seguem normais.
        objetivo: enriched.objetivo,
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
