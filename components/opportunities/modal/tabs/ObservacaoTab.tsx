'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Opportunity, OpportunityNote } from '@/lib/opportunities/types';
import { createNote, deleteNote } from '@/lib/opportunities/note-actions';
import { stripDescriptionImages } from '@/lib/opportunities/description-images';
import { DescriptionImageField } from '../../DescriptionImageField';
import { InlineImageThumbs } from '../../InlineImageThumbs';

type Props = {
  opportunity: Opportunity;
  notes: OpportunityNote[];
  readOnly?: boolean;
};

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

// Anotações estruturadas (autor+data, `opportunity_notes`). Os campos legados de
// texto livre (`observacao`/`risco` da 0009) foram removidos da UI — os dados
// permanecem no banco; o registro estruturado de riscos fica na aba Risco.
export function ObservacaoTab({ opportunity: o, notes, readOnly = false }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!texto.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createNote(o.id, { texto: texto.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTexto('');
      router.refresh();
    });
  }

  function onDelete(noteId: string) {
    if (!confirm('Excluir esta anotação?')) return;
    startTransition(async () => {
      const result = await deleteNote(noteId, o.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Anotações
        </div>

        {!readOnly && (
          <div className="mb-3">
            <DescriptionImageField
              opportunityId={o.id}
              value={texto}
              onChange={setTexto}
              rows={2}
              placeholder="Escreva uma anotação..."
              className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg"
            />
            <button
              type="button"
              onClick={submit}
              disabled={pending || !texto.trim()}
              className="mt-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
            >
              ➕ Adicionar anotação
            </button>
            {error && <div className="text-[11px] text-red-700 dark:text-red-300 mt-1">{error}</div>}
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-[12px] text-mut italic">Sem anotações registradas.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {notes.map((n) => (
                <tr key={n.id} className="border-b border-bdr last:border-b-0 align-top">
                  <td className="py-2 pr-2 w-20 text-[10px] text-mut whitespace-nowrap">
                    {fmtData(n.created_at)}
                  </td>
                  <td className="py-2 whitespace-pre-wrap">
                    {stripDescriptionImages(n.texto)}
                    <InlineImageThumbs text={n.texto} />
                  </td>
                  {!readOnly && (
                    <td className="py-2 text-right w-10">
                      <button
                        type="button"
                        onClick={() => onDelete(n.id)}
                        title="Excluir anotação"
                        className="bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 rounded px-2 py-1 text-[10px] font-bold"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
