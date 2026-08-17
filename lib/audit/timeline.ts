import 'server-only';

import { fetchOpportunityAuditTrail, type AuditChange } from './queries';
import { fetchHistoryForOpportunity } from '@/lib/opportunities/queries';
import { recordName } from './labels';
import type { AuditAction } from '@/lib/database.types';

// =============================================================================
// timeline.ts — a aba "Histórico" de uma oportunidade
// -----------------------------------------------------------------------------
// A partir da 0038 o histórico vem do `audit_log` (de→para estruturado, e agora
// cobrindo também tarefas, riscos, notas, documentos e responsáveis — não só o
// update da oportunidade).
//
// A tabela antiga `opportunity_history` (0018) está CONGELADA: nada escreve
// mais nela, mas o que já foi gravado continua sendo mostrado, senão o cliente
// perderia o passado no dia do deploy. Aquelas linhas só têm um `resumo` em
// texto — entram na timeline com `action: 'legado'` e sem de→para estruturado.
//
// As duas fontes são unidas e reordenadas por data aqui, não no banco: são
// dezenas de linhas por oportunidade, e um union SQL exigiria mais uma view só
// para uma tabela que vai parar de crescer.
// =============================================================================

export type TimelineEntry = {
  /** Chave de render — as duas fontes têm espaços de id independentes. */
  key: string;
  created_at: string;
  /** E-mail de quem fez. `null` = formulário público / rotina de sistema. */
  actor: string | null;
  action: AuditAction | 'legado';
  /** `null` nas linhas legadas (a tabela antiga não guardava a origem). */
  table: string | null;
  /** Identificação do registro afetado ("Tarefa: revisar contrato"). */
  alvo: string | null;
  changes: Record<string, AuditChange> | null;
  /** Texto pronto — só nas linhas legadas de `opportunity_history`. */
  resumo: string | null;
  contexto: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export async function fetchOpportunityTimeline(
  opportunityId: string
): Promise<TimelineEntry[]> {
  const [trail, legacy] = await Promise.all([
    fetchOpportunityAuditTrail(opportunityId),
    fetchHistoryForOpportunity(opportunityId),
  ]);

  const fromAudit: TimelineEntry[] = trail.map((e) => ({
    key: `a${e.id}`,
    created_at: e.created_at,
    actor: e.actor_email,
    action: e.action,
    table: e.table_name,
    alvo:
      recordName(e.table_name, asRecord(e.new_data)) ??
      recordName(e.table_name, asRecord(e.old_data)),
    changes: e.changes,
    resumo: null,
    contexto: e.contexto,
  }));

  const fromLegacy: TimelineEntry[] = legacy.map((h) => ({
    key: `h${h.id}`,
    created_at: h.created_at,
    actor: null,
    action: 'legado',
    table: null,
    alvo: null,
    changes: null,
    resumo: h.resumo,
    contexto: h.comentario,
  }));

  return [...fromAudit, ...fromLegacy].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}
