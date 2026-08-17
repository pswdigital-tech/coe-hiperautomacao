'use server';

import { revalidatePath } from 'next/cache';
import { headers as nextHeaders } from 'next/headers';
import { after } from 'next/server';
import { createClient, serviceRoleClient } from '@/lib/supabase/server';
import type { OpportunityStatus } from './types';
import { opportunityInputSchema } from './schema';
import { describeValidationError } from './validation-errors';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { getClientIp } from '@/lib/security/client-ip';
import { hashIp } from '@/lib/security/hash-ip';
import { isBotRequest } from '@/lib/security/botid-guard';
import {
  logPublicFormAttempt,
  updatePublicFormAttempt,
} from '@/lib/public-form/log';
import { enrichOpportunity } from '@/lib/ai/enrichment';
import { normalizeToolSlugs } from './tools';
import {
  fetchPublicOpportunities,
  type PublicOpportunityOption,
} from '@/lib/tenants/queries';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  writesCrossTenant,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';

export type UpdateStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Atualiza status de uma oportunidade. RLS protege por tenant.
 * O trigger SQL sync_opportunity_phase (0004) mantém opportunity_phases em dia.
 */
export async function updateOpportunityStatus(
  id: string,
  newStatus: OpportunityStatus
): Promise<UpdateStatusResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const supabase = await createClient();

  // `.select()` para detectar no-op silencioso do RLS: um UPDATE que casa 0
  // linhas (registro não visível para escrita — ex. cross-tenant) retorna
  // error=null. Sem checar as linhas afetadas, a UI "confirmaria" uma mudança
  // que o banco nunca gravou (revertia no refresh).
  const { data, error } = await supabase
    .from('opportunities')
    .update({ status: newStatus })
    .eq('id', id)
    .select('id');

  if (error) {
    return { ok: false, error: `Falha ao atualizar status: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Não foi possível alterar o status: sem permissão de escrita para este registro.',
    };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

// =============================================================================
// createPublicOpportunity — submit do formulário público (sem auth)
// =============================================================================
// Usa RPC SECURITY DEFINER (`create_public_opportunity`) — bypassa RLS dentro
// da função, mas faz validações próprias e respeita o slug do tenant.
//
// Não revalida rotas autenticadas — o gestor do tenant verá no próximo refresh.
// =============================================================================
export type PublicSubmitInput = {
  solicitante: string;
  email: string;
  area: string;
  subarea?: string;
  processo: string;
  frequencia?: string;
  volume_medio?: string;
  tempo_execucao?: string;
  num_pessoas?: string;
  ferramenta?: 'rpa' | 'n8n' | 'ambos' | null;
  escopo_automacao?: string[];
  beneficios_esperados?: string[];
  esforco?: 'baixo' | 'medio' | 'alto';
  complexidade?: 'baixo' | 'medio' | 'alto';
  // v0.2 (0011/0012): `tempo` é FREQUÊNCIA (a RPC pública 0012 aceita esse domínio).
  tempo?: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';
  objetivo: number;
  formulario_extras?: Record<string, unknown>;
  request_type?:
    | 'nova_oportunidade'
    | 'melhoria_automacao'
    | 'duvidas_terceiros'
    | 'incidente'
    | 'treinamento';
  observacao?: string;
  risco?: string;
  // Paridade 5 steps (0026): o formulário público agora coleta os mesmos campos
  // da home (WizardShell mode='create'). A RPC persiste; enrichment sobrescreve
  // só esforco/complexidade/objetivo — criterios/beneficios/fte_horas sobrevivem.
  criterios?: Record<string, 'sim' | 'nao' | 'parcial'> | null;
  beneficios?: Record<string, number> | null;
  fte_horas?: number | null;
  fte?: 'muito_baixo' | 'baixo' | 'medio' | 'alto' | 'muito_alto' | null;
  responsavel?: string;
  criticidade?: 'baixa' | 'media' | 'alta' | 'critica' | null;
  execucoes_mes?: number | null;
  // 0035 — automação existente a que Melhoria/Incidente se refere. A RPC
  // descarta id que não seja do mesmo tenant (vira null), então não é preciso
  // confiar no que o cliente anônimo mandou.
  parent_opportunity_id?: string | null;
};

export type CreatePublicResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Submit do formulário público anônimo. Defesa em camadas (Phase 7.5 Bloco D):
 *
 *   1. Hash IP (defesa privacy) — throws sem IP_HASH_SALT → pt-BR genérico
 *   2. Log pending em public_form_submissions (best-effort, não bloqueia)
 *   3. BotID edge classifier (no-op em local dev; ativo em Vercel)
 *   4. Turnstile siteverify (token single-use)
 *   5. RPC create_public_opportunity (length/array/jsonb limits enforced no DB)
 *   6. Atualiza log com status final (success | invalid | captcha_failed)
 *
 * NUNCA retorna `error.message` raw — mensagens pt-BR genéricas (T-07.5-D-06).
 * `error.message` real só vai para `public_form_submissions.error_message` (auditoria).
 */
export async function createPublicOpportunity(
  tenantSlug: string,
  input: PublicSubmitInput,
  turnstileToken: string,
): Promise<CreatePublicResult> {
  // 1. IP + user-agent
  const ip = await getClientIp();
  const ua = (await nextHeaders()).get('user-agent') ?? null;

  // 2. Hash IP — defensivo se salt ausente
  let ipHash: string;
  try {
    ipHash = hashIp(ip);
  } catch {
    return {
      ok: false,
      error: 'Erro de configuração do servidor. Tente novamente mais tarde.',
    };
  }

  // 3. Log pending — best-effort, não bloqueia se falhar
  const logId = await logPublicFormAttempt({
    slug: tenantSlug,
    ipHash,
    userAgent: ua,
  });

  // 4. BotID — defesa edge-side (no-op em local dev; ativo em Vercel)
  const isBot = await isBotRequest();
  if (isBot) {
    await updatePublicFormAttempt(logId, 'captcha_failed', 'botid:flagged');
    return { ok: false, error: 'Acesso negado.' };
  }

  // 5. Turnstile — defesa client-challenge. Se a secret não estiver definida
  // (ex.: deploy temporário sem chaves Cloudflare), pulamos a validação para
  // não bloquear a submissão. Em produção configure `TURNSTILE_SECRET_KEY`.
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    if (!turnstileToken || turnstileToken.length === 0) {
      await updatePublicFormAttempt(logId, 'captcha_failed', 'no-token');
      return {
        ok: false,
        error: 'Verificação anti-bot ausente. Recarregue a página e tente novamente.',
      };
    }
    const captcha = await verifyTurnstileToken(turnstileToken, ip);
    if (!captcha.ok) {
      await updatePublicFormAttempt(
        logId,
        'captcha_failed',
        captcha.errorCodes.join(',')
      );
      return {
        ok: false,
        error: 'Verificação anti-bot falhou. Recarregue a página e tente novamente.',
      };
    }
  } else {
    console.warn('[actions/createPublicOpportunity] TURNSTILE_SECRET_KEY ausente — pulando validação Turnstile.');
  }

  // ── Phase 7.6: resolve tenant_id para enriquecimento via SERVICE ROLE ────
  // POR QUÊ service role e não o anon client deste handler:
  //   RLS policy `tenants_select_own` em 0001_init.sql usa
  //   `id = current_tenant_id()` que requer auth.uid(). Session anônima do
  //   form público faz `current_tenant_id()` retornar NULL → query retorna
  //   ZERO rows → after() NUNCA dispararia silenciosamente. serviceRoleClient
  //   bypassa RLS de forma segura: executado server-only; `tenantSlug` já
  //   passou pelos guardas anteriores (BotID + Turnstile) e a query é
  //   defensiva por `eq('status', 'active')`.
  // Resolução SEPARADA da RPC para capturar tenant_id em closure do after()
  // — a RPC continua a resolver internamente como autoridade.
  let tenantRow: { id: string } | null = null;
  try {
    const adminSb = serviceRoleClient();
    const result = await adminSb
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .maybeSingle();
    tenantRow = result.data;
  } catch (e) {
    // serviceRoleClient throw (env var missing) — log e continua.
    // RPC abaixo dá o error path autoritativo; after() não dispara.
    console.error(
      '[actions/createPublicOpportunity] tenant lookup falhou (serviceRoleClient):',
      e instanceof Error ? e.message : String(e),
    );
  }

  // 6. RPC — length/array/jsonb limits enforced no DB (migration 0007)
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_public_opportunity', {
    p_tenant_slug: tenantSlug,
    p_solicitante: input.solicitante,
    p_email: input.email,
    p_area: input.area,
    p_subarea: input.subarea ?? '',
    p_processo: input.processo,
    p_frequencia: input.frequencia ?? '',
    p_volume_medio: input.volume_medio ?? '',
    p_tempo_execucao: input.tempo_execucao ?? '',
    p_num_pessoas: input.num_pessoas ?? '',
    p_ferramenta: input.ferramenta ?? '',
    p_escopo_automacao: (input.escopo_automacao ?? []).filter(
      (s) => s.trim().length > 0
    ),
    p_beneficios_esperados: (input.beneficios_esperados ?? []).filter(
      (s) => s.trim().length > 0
    ),
    p_esforco: input.esforco ?? 'medio',
    p_complexidade: input.complexidade ?? 'medio',
    // tempo agora é FREQUÊNCIA (0011/0012). Sem valor → '' (a RPC mapeia fora-do-
    // domínio para null). 'medio' era o domínio antigo (duração) — removido.
    p_tempo: input.tempo ?? '',
    p_objetivo: input.objetivo,
    p_formulario_extras: (input.formulario_extras ?? {}) as never,
    p_request_type: input.request_type ?? 'nova_oportunidade',
    p_observacao: input.observacao ?? null,
    p_risco: input.risco ?? null,
    // Paridade 5 steps (0026). criterios exige as 8 chaves (CHECK) — o wizard
    // já valida; beneficios aceita subconjunto 1–5. fte é o bucket derivado.
    p_criterios: (input.criterios ?? null) as never,
    p_beneficios: (input.beneficios ?? null) as never,
    p_fte_horas: input.fte_horas ?? null,
    p_fte: input.fte ?? null,
    p_responsavel: input.responsavel ?? null,
    p_criticidade: input.criticidade ?? null,
    p_execucoes_mes: input.execucoes_mes ?? null,
    // 0035 — validado contra o tenant dentro da RPC.
    p_parent_opportunity_id: input.parent_opportunity_id ?? null,
  });

  // 7. Erro: log mensagem REAL no DB, mensagem GENÉRICA ao cliente (Falha Segura)
  if (error || !data) {
    await updatePublicFormAttempt(
      logId,
      'invalid',
      error?.message ?? 'unknown',
    );
    return {
      ok: false,
      error: 'Não foi possível registrar sua solicitação. Tente novamente em alguns minutos.',
    };
  }

  // 8. Sucesso
  await updatePublicFormAttempt(logId, 'success');

  // ── Phase 7.6: dispara enrichment se RPC sucedeu E tenant resolveu ───────
  // Mesma defesa em camadas de createOpportunity: try/catch no callback,
  // closure de primitivos, sem cookies/headers dentro. Fallback null-safe
  // — row já está criada (RPC sucedeu); admin pode editar manualmente.
  const oppId = data as unknown as string;
  const tenantId = tenantRow?.id;
  if (tenantId) {
    after(async () => {
      try {
        await enrichOpportunity(oppId, tenantId);
      } catch (e) {
        console.error(
          '[actions/createPublicOpportunity] enrichment after() inesperado:',
          e instanceof Error ? e.message : String(e),
        );
      }
    });
  } else {
    // Log estruturado — NÃO retorna erro ao client; row já foi criada.
    console.error(
      '[actions/createPublicOpportunity] tenant_id ausente após RPC success (slug=%s) — enrichment NÃO disparado',
      tenantSlug,
    );
  }

  return { ok: true, id: oppId };
}

// =============================================================================
// createStaffOpportunity — registro EM NOME de uma empresa cliente (0051)
// -----------------------------------------------------------------------------
// O terceiro caminho de criação, ao lado de `createOpportunity` (grava sempre
// no tenant do PROFILE) e `createPublicOpportunity` (grava no tenant do SLUG,
// anônimo). Aqui quem escreve é alguém da PSW — staff ou super-admin — e o
// tenant-alvo é ESCOLHIDO na tela, entre as empresas que a pessoa já alcança.
//
// A AUTORIZAÇÃO É DO BANCO, não daqui: a RPC `create_staff_opportunity`
// valida `p_tenant_id` contra `staff_writable_tenant_ids()` antes de escrever
// e levanta exceção se estiver fora. Esta action não repete a checagem por um
// motivo específico — repetir criaria uma SEGUNDA definição do escopo, que
// poderia divergir da do banco numa evolução futura (o clássico "a UI deixou,
// o banco recusou", ou o bem pior "a UI barrou algo que era permitido"). O
// que ela faz é o que só o app pode fazer: validar o formato do payload
// (zod), traduzir a exceção para pt-BR e revalidar a rota.
//
// POR QUE NÃO PASSA PELO `.insert()` DIRETO como `createOpportunity`: para um
// `psw_staff` a policy RESTRICTIVE de 0045 barra o INSERT em tenant onde ele
// só tem ATRIBUIÇÃO (a linha nova ainda não tem assignee, então o disjunto
// nominal nunca casa) — o insert casaria zero linhas e devolveria sucesso
// silencioso. Ver o cabeçalho da migration 0051 para o raciocínio completo.
// =============================================================================
export type StaffSubmitInput = Omit<PublicSubmitInput, 'email'> & {
  /** Opcional aqui (obrigatório no público): quem registra é o próprio CoE. */
  email?: string;
};

/**
 * Automações da empresa ESCOLHIDA, para o seletor de "projeto associado"
 * (Melhoria / Incidente) da tela de registro. Só pode ser buscada DEPOIS que
 * o staff escolhe a empresa — daí ser uma action e não um fetch de página.
 * Reusa a mesma RPC do formulário público (recorte mínimo definido em
 * 0035/0036), então não abre nenhum dado novo.
 */
export async function listTenantProjects(
  slug: string,
): Promise<PublicOpportunityOption[]> {
  if (!slug) return [];
  return fetchPublicOpportunities(slug);
}

export type CreateStaffResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createStaffOpportunity(
  tenantId: string,
  input: StaffSubmitInput,
): Promise<CreateStaffResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  if (!tenantId) {
    return { ok: false, error: 'Selecione a empresa antes de registrar.' };
  }

  // Validações mínimas de UX (as autoritativas são da RPC, que roda mesmo se
  // alguém chamar a action fora da tela).
  if (!input.solicitante || input.solicitante.trim().length < 2) {
    return { ok: false, error: 'Informe o nome do solicitante.' };
  }
  if (!input.area || input.area.trim().length < 2) {
    return { ok: false, error: 'Informe a área.' };
  }
  if (!input.processo || input.processo.trim().length < 3) {
    return { ok: false, error: 'Descreva o processo.' };
  }

  const payload = {
    solicitante: input.solicitante.trim(),
    email: input.email?.trim() || null,
    area: input.area.trim(),
    subarea: input.subarea?.trim() || null,
    processo: input.processo.trim(),
    frequencia: input.frequencia?.trim() || null,
    volume_medio: input.volume_medio?.trim() || null,
    tempo_execucao: input.tempo_execucao?.trim() || null,
    num_pessoas: input.num_pessoas?.trim() || null,
    ferramenta: input.ferramenta ?? null,
    esforco: input.esforco ?? 'medio',
    complexidade: input.complexidade ?? 'medio',
    tempo: input.tempo ?? null,
    objetivo: input.objetivo,
    request_type: input.request_type ?? 'nova_oportunidade',
    parent_opportunity_id: input.parent_opportunity_id ?? null,
    criterios: input.criterios ?? null,
    beneficios: input.beneficios ?? null,
    fte_horas: input.fte_horas ?? null,
    fte: input.fte ?? null,
    responsavel: input.responsavel?.trim() || null,
    criticidade: input.criticidade ?? null,
    execucoes_mes: input.execucoes_mes ?? null,
    observacao: input.observacao?.trim() || null,
    formulario_extras: input.formulario_extras ?? {},
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_staff_opportunity', {
    p_tenant_id: tenantId,
    p_payload: payload as never,
  });

  if (error || !data) {
    // As exceções desta RPC são todas mensagens pt-BR escritas por nós (escopo
    // negado, campo obrigatório, limite de tamanho) — repassá-las é útil, não
    // vazamento. Só o caso sem mensagem cai no genérico.
    return {
      ok: false,
      error: error?.message ?? 'Não foi possível registrar a oportunidade.',
    };
  }

  const oppId = data as unknown as string;

  // Enriquecimento por IA — mesmo contrato dos outros dois caminhos de
  // criação (fire-and-forget, erro nunca propaga; a row já existe).
  after(async () => {
    try {
      await enrichOpportunity(oppId, tenantId);
    } catch (e) {
      console.error(
        '[actions/createStaffOpportunity] enrichment after() inesperado:',
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  revalidatePath('/opportunities');
  return { ok: true, id: oppId };
}

// =============================================================================
// deleteOpportunity — remove uma oportunidade (RLS protege tenant)
// =============================================================================
export type DeleteOpportunityResult = { ok: true } | { ok: false; error: string };

export async function deleteOpportunity(
  id: string
): Promise<DeleteOpportunityResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const supabase = await createClient();
  const { error } = await supabase.from('opportunities').delete().eq('id', id);

  if (error) {
    return { ok: false, error: `Erro ao excluir: ${error.message}` };
  }

  revalidatePath('/opportunities');
  return { ok: true };
}

// =============================================================================
// createOpportunity — insere nova oportunidade após validação Zod
// -----------------------------------------------------------------------------
// Mass Assignment defense layers (Phase 7.5, HARDEN-B-01):
//   1. `opportunityInputSchema.strict()` rejeita tenant_id, created_by,
//      seq_id, id, created_at, updated_at no input (parse falha com
//      `unrecognized_keys`).
//   2. `.insert({...})` abaixo enumera campos explicitamente — sem
//      spread cego de `data`/`input`. tenant_id e created_by vêm do
//      `auth.uid()` lookup (server-derived).
//   3. RLS `WITH CHECK (tenant_id = current_tenant_id())` em opportunities
//      bloqueia em DB caso algo escape.
//   4. Trigger `trg_opportunities_seq_id` sobrescreve `seq_id` sempre,
//      ignorando qualquer valor que viesse do cliente.
// =============================================================================
export type CreateOpportunityResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createOpportunity(
  input: unknown
): Promise<CreateOpportunityResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = opportunityInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Profile não encontrado.' };

  // Este wizard grava SEMPRE no tenant de lotação de quem preenche — o que só
  // é verdade para papel de cliente. Para os papéis da PSW (`psw_staff`,
  // `platform_admin`) o tenant de lotação é o da PSW, então seguir daqui
  // criaria a oportunidade DENTRO da PSW: invisível para a empresa que ela
  // descreve e sem nenhum erro na tela. O caminho correto deles é
  // `/opportunities/register`, que começa escolhendo a empresa e grava por
  // `createStaffOpportunity()` (tenant-alvo autorizado na RPC). Mesma raiz do
  // bug de `resolveWriteTenantId` corrigido em 2026-08-13 — ver
  // `writesCrossTenant()`.
  if (writesCrossTenant({ role: profile.role })) {
    return {
      ok: false,
      error:
        'Use "Registrar oportunidade" (/opportunities/register) para escolher a empresa antes de registrar.',
    };
  }

  const { data: inserted, error } = await supabase
    .from('opportunities')
    .insert({
      tenant_id: profile.tenant_id,
      source: data.source,
      request_type: data.request_type,
      solicitante: data.solicitante,
      email: data.email || null,
      area: data.area,
      subarea: data.subarea || null,
      processo: data.processo,
      frequencia: data.frequencia || null,
      volume_medio: data.volume_medio || null,
      tempo_execucao: data.tempo_execucao || null,
      num_pessoas: data.num_pessoas || null,
      // 0055 — só o array é escrito. A coluna legada `ferramenta` é DERIVADA
      // pelo trigger `sync_opportunity_ferramentas()`; mandá-la daqui só
      // criaria duas fontes para o mesmo dado (e o trigger sobrescreveria).
      ferramentas: normalizeToolSlugs(data.ferramentas ?? []),
      escopo_automacao: data.escopo_automacao,
      beneficios_esperados: data.beneficios_esperados,
      esforco: data.esforco,
      complexidade: data.complexidade,
      tempo: data.tempo,
      objetivo: data.objetivo,
      status: data.status,
      responsavel: data.responsavel || null,
      notas: data.notas || null,
      observacao: data.observacao || null,
      risco: data.risco || null,
      // v0.2 (0011) — opcionais. rpa_score/score/priority NÃO entram (GENERATED/
      // calculados no DB). `prioridade_fte` mapeia para a coluna `fte`.
      fonte: data.fonte || null,
      tipo_processo: data.tipo_processo ?? [],
      beneficio_qualitativo: data.beneficio_qualitativo || null,
      fte_horas: data.fte_horas ?? null,
      fte: data.prioridade_fte ?? null,
      criterios: data.criterios ?? null,
      beneficios: data.beneficios ?? null,
      persona_extras:
        data.source === 'persona' ? data.persona_extras ?? null : null,
      formulario_extras:
        data.source === 'formulario' ? data.formulario_extras ?? null : null,
      // v0.3 — operacionais/criticidade. data_abertura_coe/data_fechamento_coe
      // NÃO entram: geridas pelo trigger sync_coe_dates() (0017), nunca input.
      criticidade: data.criticidade || null,
      azure_boards_codigo: data.azure_boards_codigo || null,
      linguagem: data.linguagem || null,
      execucao: data.execucao || null,
      usuarios_servico: data.usuarios_servico || null,
      execucoes_mes: data.execucoes_mes ?? null,
      data_conclusao: data.data_conclusao || null,
      created_by: user.id,
    })
    .select('id, tenant_id')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error: `Erro ao criar: ${error?.message ?? 'desconhecido'}`,
    };
  }

  // ── Phase 7.6: enriquecimento por IA assíncrono (fire-and-forget) ────────
  // - Não bloqueia a response (after() roda após HTTP response enviado).
  // - Closure captura primitivos (oppId, tenantId) — NÃO usa cookies/headers
  //   dentro do callback (T-07.6-C-02).
  // - try/catch defensivo garante que erros não propaguem (T-07.6-C-01).
  // - Se cold-restart matar a função antes do callback, row fica em
  //   ai_enrichment_status='pending' (default da migration 0010) — job de
  //   catch-up futuro (backlog 999.x) pode re-enriquecer.
  const oppId = inserted.id;
  const tenantId = inserted.tenant_id as string;
  after(async () => {
    try {
      await enrichOpportunity(oppId, tenantId);
    } catch (e) {
      console.error(
        '[actions/createOpportunity] enrichment after() inesperado:',
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  revalidatePath('/opportunities');
  return { ok: true, id: oppId };
}

// =============================================================================
// updateOpportunity — atualiza campos da oportunidade (NÃO inclui status)
// -----------------------------------------------------------------------------
// Mass Assignment defense layers (Phase 7.5, HARDEN-B-01):
//   1. `opportunityInputSchema.strict()` rejeita tenant_id, created_by,
//      seq_id, id, created_at, updated_at no input (parse falha com
//      `unrecognized_keys`).
//   2. `.update({...})` abaixo NÃO inclui tenant_id, created_by, seq_id,
//      id — campos imutáveis pelo cliente. Enumeração explícita
//      (sem spread cego).
//   3. `.eq('id', id).eq('tenant_id', tenantId)` escopa o update ao tenant
//      RESOLVIDO NO SERVIDOR para a oportunidade-alvo (Phase 17, D-11,
//      `resolveWriteTenantId()`) — defesa em profundidade sobre o RLS
//      (USING + WITH CHECK). Para papéis de cliente é idêntico a
//      `profile.tenant_id`; para `psw_staff` (multi-tenant por atribuição)
//      NÃO é o tenant do profile, é o da oportunidade — se a oportunidade não
//      estiver no escopo, o retorno é `null` e a action recusa ANTES do
//      update, em vez de um `.eq()` casando zero linhas silenciosamente.
//   4. RLS bloqueia em DB caso o eq escape (defesa final).
// =============================================================================
export type UpdateOpportunityResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateOpportunity(
  id: string,
  input: unknown
): Promise<UpdateOpportunityResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const parsed = opportunityInputSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: describeValidationError(flat),
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita resolvido no servidor (Phase 17, D-11) — ANTES da
  // mutação. `null` significa oportunidade inexistente OU fora do escopo do
  // usuário (nunca revelamos qual das duas).
  const tenantId = await resolveWriteTenantId(profile, id);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  // A auditoria deixou de ser responsabilidade desta action: a trigger
  // `audit_trigger()` (migration 0038) grava o de→para campo a campo direto no
  // banco, para TODA mutação — inclusive as que não passam por aqui. O buscar-
  // o-"antes" + diffOpportunity que existia neste ponto foi removido: era um
  // round-trip a mais para produzir um resumo pior (texto concatenado) e que
  // silenciosamente não cobria create, delete, nem as tabelas filhas.
  const { error } = await supabase
    .from('opportunities')
    .update({
      source: data.source,
      request_type: data.request_type,
      solicitante: data.solicitante,
      email: data.email || null,
      area: data.area,
      subarea: data.subarea || null,
      processo: data.processo,
      frequencia: data.frequencia || null,
      volume_medio: data.volume_medio || null,
      tempo_execucao: data.tempo_execucao || null,
      num_pessoas: data.num_pessoas || null,
      // 0055 — só o array é escrito. A coluna legada `ferramenta` é DERIVADA
      // pelo trigger `sync_opportunity_ferramentas()`; mandá-la daqui só
      // criaria duas fontes para o mesmo dado (e o trigger sobrescreveria).
      ferramentas: normalizeToolSlugs(data.ferramentas ?? []),
      escopo_automacao: data.escopo_automacao,
      beneficios_esperados: data.beneficios_esperados,
      esforco: data.esforco,
      complexidade: data.complexidade,
      tempo: data.tempo,
      objetivo: data.objetivo,
      responsavel: data.responsavel || null,
      notas: data.notas || null,
      observacao: data.observacao || null,
      risco: data.risco || null,
      // v0.2 (0011) — opcionais (idem createOpportunity). `prioridade_fte` → `fte`.
      fonte: data.fonte || null,
      tipo_processo: data.tipo_processo ?? [],
      beneficio_qualitativo: data.beneficio_qualitativo || null,
      fte_horas: data.fte_horas ?? null,
      fte: data.prioridade_fte ?? null,
      criterios: data.criterios ?? null,
      beneficios: data.beneficios ?? null,
      // v0.3 — operacionais/criticidade. Datas COE NÃO entram (trigger-managed).
      criticidade: data.criticidade || null,
      azure_boards_codigo: data.azure_boards_codigo || null,
      linguagem: data.linguagem || null,
      execucao: data.execucao || null,
      usuarios_servico: data.usuarios_servico || null,
      execucoes_mes: data.execucoes_mes ?? null,
      data_conclusao: data.data_conclusao || null,
      persona_extras:
        data.source === 'persona' ? data.persona_extras ?? null : null,
      formulario_extras:
        data.source === 'formulario' ? data.formulario_extras ?? null : null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ok: false, error: `Erro ao atualizar: ${error.message}` };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}
