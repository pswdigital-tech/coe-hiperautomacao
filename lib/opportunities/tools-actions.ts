'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import {
  slugifyTool,
  MAX_TOOL_NAME_LENGTH,
  type AutomationToolOption,
} from './tools';

/**
 * Catálogo de ferramentas (0055). Duas operações e nada mais: LISTAR (para o
 * seletor da edição e para o filtro da lista) e REGISTRAR uma nova.
 *
 * Nenhuma das duas decide visibilidade por conta própria — quem decide é a RLS
 * de `automation_tools`: o SELECT enxerga o catálogo global + o do tenant (+ o
 * dos tenants em que um papel da PSW trabalha), e o INSERT recusa `tenant_id`
 * nulo, o que torna impossível criar ferramenta GLOBAL pela app.
 */

const SELECT_COLUMNS = 'id, slug, nome, icone, tenant_id';

type ToolRow = {
  id: string;
  slug: string;
  nome: string;
  icone: string | null;
  tenant_id: string | null;
};

function toOption(row: ToolRow): AutomationToolOption {
  return {
    id: row.id,
    slug: row.slug,
    nome: row.nome,
    icone: row.icone,
    global: row.tenant_id === null,
  };
}

/**
 * Ferramentas disponíveis para o usuário corrente, na ordem de exibição do
 * seletor (`ordem` do seed primeiro, depois alfabética). Devolve `[]` em erro
 * — é um seletor, não um dado crítico: a tela degrada para "nenhuma ferramenta
 * cadastrada" em vez de estourar a edição inteira.
 */
export async function listAutomationTools(): Promise<AutomationToolOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('automation_tools')
    .select(SELECT_COLUMNS)
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (error || !data) return [];
  return (data as ToolRow[]).map(toOption);
}

export type CreateToolResult =
  | { ok: true; tool: AutomationToolOption; alreadyExisted: boolean }
  | { ok: false; error: string };

/**
 * Registra uma ferramenta nova no catálogo do tenant.
 *
 * `opportunityId` é opcional e existe por causa dos papéis da PSW: um
 * `psw_staff` editando a oportunidade de um cliente tem `profile.tenantId` = o
 * tenant da PSW, então registrar "pelo profile" criaria a ferramenta na PSW —
 * invisível justo para a empresa que vai usá-la. Passando a oportunidade em
 * edição, `resolveWriteTenantId()` devolve o tenant DELA (a mesma resolução
 * que `updateOpportunity` usa), e a ferramenta nasce no lugar certo.
 *
 * Idempotente por (tenant, slug): registrar "SAP" onde já existe "SAP" devolve
 * a existente com `alreadyExisted: true`, em vez de erro de constraint. Também
 * cobre o caso de o nome colidir com o catálogo GLOBAL — aí devolve a global,
 * sem duplicar.
 */
export async function createAutomationTool(
  nome: string,
  opportunityId?: string,
): Promise<CreateToolResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  const trimmed = nome.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) {
    return { ok: false, error: 'Informe um nome com pelo menos 2 caracteres.' };
  }
  if (trimmed.length > MAX_TOOL_NAME_LENGTH) {
    return {
      ok: false,
      error: `Nome muito longo (máximo ${MAX_TOOL_NAME_LENGTH} caracteres).`,
    };
  }

  const slug = slugifyTool(trimmed);
  if (!slug) {
    return {
      ok: false,
      error: 'Use letras ou números no nome da ferramenta.',
    };
  }

  const tenantId = opportunityId
    ? await resolveWriteTenantId(profile, opportunityId)
    : profile.tenantId;
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const supabase = await createClient();

  // Já existe (global ou deste tenant)? Devolve em vez de tentar inserir — a
  // RLS de SELECT já limita o que pode ser encontrado aqui.
  const { data: existing } = await supabase
    .from('automation_tools')
    .select(SELECT_COLUMNS)
    .eq('slug', slug)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      tool: toOption(existing as ToolRow),
      alreadyExisted: true,
    };
  }

  const { data, error } = await supabase
    .from('automation_tools')
    .insert({
      tenant_id: tenantId,
      slug,
      nome: trimmed,
      created_by: profile.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        'Não foi possível registrar a ferramenta. Verifique se você tem permissão para editar esta empresa.',
    };
  }

  revalidatePath('/opportunities');
  return { ok: true, tool: toOption(data as ToolRow), alreadyExisted: false };
}
