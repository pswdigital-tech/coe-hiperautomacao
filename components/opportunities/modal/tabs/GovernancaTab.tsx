'use client';

import Link from 'next/link';
import type {
  Opportunity,
  OpportunityRisk,
  OpportunityDocument,
  OpportunityNote,
  OpportunityTask,
} from '@/lib/opportunities/types';
import type { Assignee } from '@/lib/opportunities/assignee-types';
import { assigneeName } from '@/lib/opportunities/assignee-types';
import type { TimelineEntry } from '@/lib/audit/timeline';
import { blockedTasks } from '@/lib/opportunities/overview';
import { RiscoTab } from './RiscoTab';
import { ObservacaoTab } from './ObservacaoTab';
import { DocumentosTab } from './DocumentosTab';
import { HistoricoTab } from './HistoricoTab';

// =============================================================================
// GovernancaTab — controle e rastreabilidade. Absorve Risco, Observações,
// Documentos e Histórico.
//
// COM SUB-NAVEGAÇÃO, ao contrário de Solução e Processo Atual — e a diferença
// não é de gosto, é do tipo de conteúdo:
//   • Solução/Processo são NARRATIVA: leem-se de cima a baixo uma vez, e
//     esconder metade atrás de uma aba quebraria a leitura.
//   • Aqui são quatro REGISTROS independentes, cada um com CRUD próprio, que
//     se consultam separadamente ("vou ver os documentos"). Sub-navegação
//     serve exatamente esse comportamento: voltar a um ponto conhecido.
// Empilhar os quatro numa rolagem só somaria centenas de linhas de tabela sem
// nenhuma leitura contínua ganhando com isso.
//
// "Partes envolvidas" fica FORA da sub-navegação, visível nos quatro: é a
// resposta a "com quem eu falo", e essa pergunta não pertence a nenhum dos
// quatro registros em particular.
//
// Os quatro componentes são reusados INTEIROS — cada um já traz o próprio
// diálogo, upload e confirmação. Nada de CRUD foi reescrito.
// =============================================================================

export type GovernancaSub = 'riscos' | 'notas' | 'documentos' | 'historico';

type Props = {
  opportunity: Opportunity;
  risks: OpportunityRisk[];
  notes: OpportunityNote[];
  documents: OpportunityDocument[];
  history: TimelineEntry[];
  tasks: OpportunityTask[];
  assignees: Assignee[];
  sub: GovernancaSub;
  onSubChange: (s: GovernancaSub) => void;
  readOnly?: boolean;
};

export function GovernancaTab({
  opportunity: o,
  risks,
  notes,
  documents,
  history,
  tasks,
  assignees,
  sub,
  onSubChange,
  readOnly = false,
}: Props) {
  const bloqueadas = blockedTasks(tasks);

  const items: { id: GovernancaSub; label: string; icon: string; count: number }[] = [
    {
      id: 'riscos',
      label: 'Riscos e impedimentos',
      icon: '⚠️',
      count: risks.length + bloqueadas.length,
    },
    { id: 'notas', label: 'Notas', icon: '💬', count: notes.length },
    { id: 'documentos', label: 'Documentos', icon: '📎', count: documents.length },
    { id: 'historico', label: 'Histórico', icon: '🕘', count: history.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PartesEnvolvidas opportunity={o} assignees={assignees} />

      <div className="bg-wh border border-bdr rounded-xl shadow-sm overflow-hidden">
        <nav
          className="flex border-b border-bdr bg-bg overflow-x-auto"
          aria-label="Seções de governança"
        >
          {items.map((it) => {
            const ativo = it.id === sub;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onSubChange(it.id)}
                aria-current={ativo ? 'page' : undefined}
                className={
                  'px-3.5 py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors ' +
                  (ativo
                    ? 'text-pri border-pri bg-wh'
                    : 'text-mut border-transparent hover:bg-slate-100 dark:hover:bg-slate-800')
                }
              >
                <span aria-hidden="true">{it.icon}</span>
                <span>{it.label}</span>
                {it.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-bdr/60 text-[10px] tabular-nums">
                    {it.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-h-[40vh]">
          {sub === 'riscos' && (
            <>
              <RiscoTab opportunity={o} risks={risks} readOnly={readOnly} />
              <Impedimentos opportunityId={o.id} tasks={bloqueadas} />
            </>
          )}
          {sub === 'notas' && (
            <ObservacaoTab opportunity={o} notes={notes} readOnly={readOnly} />
          )}
          {sub === 'documentos' && (
            <DocumentosTab
              opportunityId={o.id}
              documents={documents}
              readOnly={readOnly}
            />
          )}
          {sub === 'historico' && <HistoricoTab history={history} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Impedimentos — as tarefas travadas, agregadas junto dos riscos.
 *
 * Risco é o que PODE dar errado e se gerencia por plano de resposta;
 * impedimento é trabalho que JÁ parou. As duas coisas se leem juntas porque a
 * pergunta é a mesma ("o que precisa de decisão"), mas ficam em listas
 * separadas porque o que se faz com cada uma é diferente. O motivo do bloqueio
 * é obrigatório no cadastro da tarefa e até aqui não era somado em lugar
 * nenhum.
 */
function Impedimentos({
  opportunityId,
  tasks,
}: {
  opportunityId: string;
  tasks: OpportunityTask[];
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="px-5 pb-4">
      <div className="border-t border-bdr pt-4">
        <div className="text-[12px] font-bold text-red-700 dark:text-red-300 mb-2">
          🚫 Impedimentos ativos — {tasks.length}{' '}
          {tasks.length === 1 ? 'tarefa bloqueada' : 'tarefas bloqueadas'}
        </div>
        <ul className="flex flex-col divide-y divide-bdr/60">
          {tasks.map((t) => (
            <li key={t.id} className="py-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-txt truncate">
                  {t.title}
                </span>
                <span className="block text-[11px] text-mut">
                  {t.blocked_reason ?? 'Sem motivo registrado.'}
                </span>
              </span>
              <Link
                href={`/opportunities/${opportunityId}/tarefas?tarefa=${t.id}`}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-bdr bg-wh text-txt text-[11px] font-bold hover:bg-bg transition-colors"
              >
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Quem pediu, quem executa, quando entrou. Fora da sub-navegação de propósito. */
function PartesEnvolvidas({
  opportunity: o,
  assignees,
}: {
  opportunity: Opportunity;
  assignees: Assignee[];
}) {
  const criadoEm = o.created_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
        new Date(o.created_at)
      )
    : null;

  return (
    <section className="bg-wh border border-bdr rounded-xl shadow-sm px-4 py-3.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2.5">
        Partes envolvidas
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
            Solicitante
          </div>
          <div className="text-[13px] font-semibold text-txt">{o.solicitante}</div>
          {o.email && <div className="text-[11px] text-mut break-all">{o.email}</div>}
        </div>

        <div className="sm:col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
            Responsáveis
          </div>
          {assignees.length === 0 ? (
            <p className="text-[12px] text-mut italic">
              Ninguém atribuído. A atribuição é feita em “Gerenciar”, no topo da
              página.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assignees.map((a) => (
                <span
                  key={a.profileId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg border border-bdr text-[11px]"
                  title={a.email}
                >
                  <span className="font-semibold text-txt">{assigneeName(a)}</span>
                  {a.cargo && <span className="text-mut">· {a.cargo}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {criadoEm && (
        <p className="text-[11px] text-mut mt-3 pt-3 border-t border-bdr">
          Cadastrada em {criadoEm}
          {o.source === 'formulario' ? ' pelo formulário público' : ''}
        </p>
      )}
    </section>
  );
}
