import type { TimelineEntry } from '@/lib/audit/timeline';
import { ACTION_LABEL, formatDateTime, tableLabel } from '@/lib/audit/labels';
import { ChangesList } from '@/components/audit/ChangesList';

type Props = {
  history: TimelineEntry[];
};

const ACTION_STYLE: Record<string, string> = {
  insert: 'bg-acc/10 text-acc',
  update: 'bg-pri/10 text-pri',
  delete: 'bg-red/10 text-red',
  legado: 'bg-mut/10 text-mut',
};

/**
 * Aba "Histórico" — auditoria 100% automática e somente leitura.
 *
 * A partir da migration 0038 as linhas vêm da trigger de banco (`audit_log`),
 * o que ampliou a cobertura: além do update da oportunidade, aparecem aqui as
 * criações/edições/exclusões de tarefas, riscos, anotações, documentos e
 * responsáveis dela. Não existe ação de usuário que crie/edite/apague estes
 * registros — `audit_log` não tem grant de escrita para a aplicação.
 */
export function HistoricoTab({ history }: Props) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] text-mut mb-3">
        🔒 Registro de auditoria — automático e somente leitura ({history.length}{' '}
        alteração(ões)).
      </div>
      {history.length === 0 ? (
        <p className="text-[12px] text-mut italic">Nenhuma alteração registrada.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-mut border-b border-bdr">
              <th className="pb-2 pr-2 whitespace-nowrap">Data/Hora</th>
              <th className="pb-2 pr-2">Usuário</th>
              <th className="pb-2 pr-2">Ação</th>
              <th className="pb-2">Alteração</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.key} className="border-b border-bdr last:border-b-0 align-top">
                <td className="py-2 pr-2 text-[11px] text-mut whitespace-nowrap">
                  {formatDateTime(h.created_at)}
                </td>
                <td className="py-2 pr-2 text-[11px] text-mut">{h.actor ?? '—'}</td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      ACTION_STYLE[h.action] ?? ACTION_STYLE.legado
                    }`}
                  >
                    {h.action === 'legado' ? 'Alterou' : ACTION_LABEL[h.action]}
                  </span>
                  {/* Só rotula a origem quando NÃO é a própria oportunidade —
                      dizer "Oportunidade" em toda linha da aba dela é ruído. */}
                  {h.table && h.table !== 'opportunities' && (
                    <div className="text-[10px] text-mut mt-0.5">
                      {tableLabel(h.table)}
                    </div>
                  )}
                </td>
                <td className="py-2">
                  {h.alvo && h.table !== 'opportunities' && (
                    <div className="text-[11px] font-semibold text-txt mb-0.5">
                      {h.alvo}
                    </div>
                  )}
                  {h.action === 'update' ? (
                    <ChangesList changes={h.changes} limit={8} />
                  ) : h.resumo ? (
                    /* Linha legada de opportunity_history (0018): o de→para já
                       veio concatenado em texto, não há como destrinchar. */
                    <div>{h.resumo}</div>
                  ) : (
                    <span className="text-[11px] text-mut italic">
                      {h.action === 'insert'
                        ? 'Registro criado.'
                        : 'Registro excluído.'}
                    </span>
                  )}
                  {h.contexto && (
                    <div className="text-[11px] text-mut mt-0.5">{h.contexto}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
