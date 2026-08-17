import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { AuditAction, Database, Json } from '@/lib/database.types';

// =============================================================================
// queries.ts — leitura do audit_log (0038)
// -----------------------------------------------------------------------------
// Nenhuma escrita mora aqui, e nem poderia: `audit_log` não tem grant de
// insert/update/delete para `authenticated`. Quem grava é a trigger no banco.
//
// O isolamento é da RLS (`audit_log_select`): platform_admin vê tudo,
// tenant_admin vê o próprio tenant, qualquer outro papel vê zero linhas. O
// filtro explícito de `tenant_id` abaixo é escolha do usuário na tela (o
// seletor de empresa do super-admin), não a barreira de segurança.
// =============================================================================

export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];

export type AuditChange = { de: Json; para: Json };

export type AuditEntry = AuditLogRow & {
  tenants: { name: string } | null;
};

export type AuditFilters = {
  /** Janela em dias a partir de agora. `null` = sem limite de período. */
  dias?: number | null;
  tableName?: string | null;
  action?: AuditAction | null;
  /** Busca parcial no e-mail do ator (snapshot gravado no log). */
  ator?: string | null;
  /** Só faz efeito para platform_admin — tenant_admin já é travado pela RLS. */
  tenantId?: string | null;
  page?: number;
  pageSize?: number;
};

export const AUDIT_PAGE_SIZE = 50;

const AUDIT_COLUMNS =
  'id, tenant_id, table_name, record_id, action, actor_id, actor_email, ' +
  'actor_role, changes, old_data, new_data, contexto, created_at, tenants(name)';

/**
 * Página do log com os filtros da tela. Devolve também o total para a
 * paginação — `count: 'exact'` é aceitável aqui porque o índice
 * `audit_log_tenant_created_idx` cobre o filtro dominante (tenant + período).
 */
export async function fetchAuditLog(
  filters: AuditFilters = {}
): Promise<{ entries: AuditEntry[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? AUDIT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from('audit_log')
    .select(AUDIT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.dias != null) {
    const desde = new Date(Date.now() - filters.dias * 24 * 60 * 60 * 1000);
    query = query.gte('created_at', desde.toISOString());
  }
  if (filters.tableName) query = query.eq('table_name', filters.tableName);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId);
  if (filters.ator) {
    // `%` e `_` do usuário viram literais — senão uma busca por "a_b" casaria
    // qualquer coisa e um "%" sozinho listaria o log inteiro.
    const safe = filters.ator.replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.ilike('actor_email', `%${safe}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Erro ao buscar o log de auditoria: ${error.message}`);
  }

  // O embed de FK vem como objeto ou array dependendo da cardinalidade inferida.
  const entries = (data ?? []).map((row) => {
    const t = (row as { tenants?: unknown }).tenants;
    const tenant = Array.isArray(t) ? t[0] : t;
    return {
      ...(row as unknown as AuditLogRow),
      tenants: (tenant as { name: string } | undefined) ?? null,
    };
  });

  return { entries, total: count ?? 0 };
}

export type AuditTrailEntry = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: AuditAction;
  actor_email: string | null;
  changes: Record<string, AuditChange> | null;
  old_data: Json | null;
  new_data: Json | null;
  contexto: string | null;
  created_at: string;
};

/**
 * Trilha de UMA oportunidade (ela + tarefas/riscos/notas/documentos/
 * responsáveis/fases) para a aba "Histórico". Vai pela RPC
 * `opportunity_audit_trail` porque o select direto em `audit_log` é admin-only
 * e a aba precisa funcionar para membro comum.
 *
 * Falha aqui não deve derrubar a modal inteira da oportunidade — o histórico é
 * observabilidade, não regra de negócio. Devolve lista vazia e loga.
 */
export async function fetchOpportunityAuditTrail(
  opportunityId: string
): Promise<AuditTrailEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('opportunity_audit_trail', {
    p_opportunity_id: opportunityId,
  });

  if (error) {
    console.error(
      '[audit/fetchOpportunityAuditTrail] falha ao buscar trilha:',
      error.message
    );
    return [];
  }

  return (data ?? []) as AuditTrailEntry[];
}

/**
 * Empresas para o seletor da tela de log. Só o platform_admin enxerga mais de
 * uma (RLS de `tenants`), então o caller nem precisa condicionar a chamada.
 */
export async function fetchAuditTenants(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase.from('tenants').select('id, name').order('name');
  return data ?? [];
}
