import type { Json } from '@/lib/database.types';
import { fieldLabel, formatValue } from '@/lib/audit/labels';

type Props = {
  changes: Record<string, { de: Json; para: Json }> | null;
  /** Quantos campos mostrar antes de resumir o resto. */
  limit?: number;
};

/**
 * O de→para de um UPDATE, campo a campo. `changes` vem pronto da trigger
 * `audit_trigger()` (0038) — a app não recalcula diff nenhum, só traduz.
 *
 * Um update que toca 30 colunas viraria uma parede de texto na listagem, então
 * cortamos em `limit` e indicamos quantos ficaram de fora. A tabela do banco
 * guarda todos.
 */
export function ChangesList({ changes, limit = 6 }: Props) {
  if (!changes) return null;

  const keys = Object.keys(changes);
  if (keys.length === 0) return null;

  const shown = keys.slice(0, limit);
  const hidden = keys.length - shown.length;

  return (
    <div className="flex flex-col gap-1">
      {shown.map((key) => (
        <div key={key} className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
          <span className="font-semibold text-txt">{fieldLabel(key)}:</span>
          <span className="text-mut line-through decoration-mut/50">
            {formatValue(changes[key].de)}
          </span>
          <span className="text-mut" aria-hidden="true">
            →
          </span>
          <span className="font-medium text-txt">{formatValue(changes[key].para)}</span>
        </div>
      ))}
      {hidden > 0 && (
        <div className="text-[11px] text-mut italic">
          + {hidden} outro(s) campo(s) alterado(s)
        </div>
      )}
    </div>
  );
}
