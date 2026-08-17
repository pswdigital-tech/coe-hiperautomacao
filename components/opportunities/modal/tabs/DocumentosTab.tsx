'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OpportunityDocument } from '@/lib/opportunities/types';
import {
  addDocumentLink,
  uploadDocumentFile,
  deleteDocument,
  getDocumentDownloadUrl,
} from '@/lib/opportunities/document-actions';

type Props = {
  opportunityId: string;
  documents: OpportunityDocument[];
  readOnly?: boolean;
};

const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;

/** Documento de imagem: arquivo com mime image/* OU link cuja URL "parece" imagem. */
function isImageDoc(doc: OpportunityDocument): boolean {
  if (doc.kind === 'arquivo') return Boolean(doc.tipo?.startsWith('image/'));
  return IMAGE_URL_RE.test(doc.url ?? '');
}

function docIcon(doc: OpportunityDocument): string {
  if (isImageDoc(doc)) return '🖼️';
  const t = `${doc.tipo ?? ''} ${doc.nome}`.toLowerCase();
  if (t.includes('pdf')) return '📕';
  if (t.includes('word') || t.includes('.doc')) return '📘';
  if (t.includes('presentation') || t.includes('.ppt')) return '📙';
  if (t.includes('sheet') || t.includes('excel') || t.includes('.xls') || t.includes('csv'))
    return '📗';
  if (doc.kind === 'arquivo') return '📄';
  return '🔗';
}

function fmtSize(n: number | null): string {
  if (!n) return '';
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function DocumentosTab({ opportunityId, documents, readOnly = false }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Miniaturas de imagem: arquivo (bucket privado) precisa de signed URL
  // resolvida sob demanda; link é externo, renderizado direto — com fallback
  // para a linha "normal" quando a URL não carrega (hotlink bloqueado, etc.).
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [brokenLinkImgs, setBrokenLinkImgs] = useState<Set<string>>(new Set());
  const resolvedFor = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = documents.filter(
      (d) => d.kind === 'arquivo' && isImageDoc(d) && d.storage_path && !resolvedFor.current.has(d.id)
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const d of missing) {
        const result = await getDocumentDownloadUrl(d.storage_path!, 3600);
        // Só marca como resolvido DEPOIS do fetch ter sucesso, nunca antes —
        // o StrictMode do dev roda este efeito 2x na montagem inicial
        // (cleanup + re-run síncronos); marcar cedo faria a 2ª execução
        // pular o documento como "já resolvido" enquanto a 1ª tentativa, já
        // cancelada, descartava o resultado — miniatura presa em loading
        // pra sempre. Sem marcar cedo, a 2ª execução tenta de novo e conclui.
        if (!cancelled && result.ok) {
          resolvedFor.current.add(d.id);
          setImgUrls((prev) => ({ ...prev, [d.id]: result.url }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documents]);

  function submitLink() {
    setError(null);
    startTransition(async () => {
      const result = await addDocumentLink(opportunityId, { nome, url });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNome('');
      setUrl('');
      router.refresh();
    });
  }

  function submitFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const result = await uploadDocumentFile(opportunityId, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete(docId: string) {
    if (!confirm('Remover este documento?')) return;
    startTransition(async () => {
      const result = await deleteDocument(docId, opportunityId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  async function onDownload(doc: OpportunityDocument) {
    if (doc.kind === 'link') {
      window.open(doc.url ?? '#', '_blank', 'noopener');
      return;
    }
    if (!doc.storage_path) return;
    const result = await getDocumentDownloadUrl(doc.storage_path);
    if (result.ok) window.open(result.url, '_blank', 'noopener');
    else setError(result.error);
  }

  return (
    <div className="px-5 py-4">
      <div className="text-[12px] font-bold text-pri mb-3">
        📎 Documentos — {documents.length} anexo(s)
      </div>

      {!readOnly && (
        <div className="mb-4 space-y-2 bg-bg rounded-lg p-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
                Nome (opcional)
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Manual técnico"
                className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-wh"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
                Link (URL)
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-wh"
              />
            </div>
            <button
              type="button"
              onClick={submitLink}
              disabled={pending || !url.trim()}
              className="px-3 py-1.5 bg-wh border border-bdr hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold rounded-lg disabled:opacity-50"
            >
              🔗 Anexar link
            </button>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
              className="hidden"
              onChange={submitFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
            >
              ⬆️ Enviar arquivo (PDF/Word/PPT/Excel/Imagem, até 8 MB)
            </button>
          </div>
          {error && <div className="text-[11px] text-red-700 dark:text-red-300">{error}</div>}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-[12px] text-mut italic">Nenhum documento anexado.</p>
      ) : (
        <table className="w-full text-[12px]">
          <tbody>
            {documents.map((doc) => {
              const thumbSrc =
                doc.kind === 'arquivo'
                  ? imgUrls[doc.id]
                  : isImageDoc(doc) && !brokenLinkImgs.has(doc.id)
                    ? doc.url
                    : undefined;
              return (
              <tr key={doc.id} className="border-b border-bdr last:border-b-0">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    {thumbSrc && (
                      <button
                        type="button"
                        onClick={() => onDownload(doc)}
                        title={`Abrir ${doc.nome}`}
                        className="flex-shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL externa/assinada, sem domínio fixo para next/image */}
                        <img
                          src={thumbSrc}
                          alt={doc.nome}
                          className="w-10 h-10 object-cover rounded border border-bdr"
                          onError={() =>
                            doc.kind === 'link' &&
                            setBrokenLinkImgs((prev) => new Set(prev).add(doc.id))
                          }
                        />
                      </button>
                    )}
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onDownload(doc)}
                        className="text-acc font-semibold hover:underline text-left"
                      >
                        {docIcon(doc)} {doc.nome}
                      </button>
                      <div className="text-[10px] text-mut">
                        {doc.kind === 'arquivo'
                          ? `${doc.tipo ?? 'arquivo'}${doc.size_bytes ? ` · ${fmtSize(doc.size_bytes)}` : ''} · 🔒 requer login`
                          : doc.url}
                      </div>
                    </div>
                  </div>
                </td>
                {!readOnly && (
                  <td className="py-2 text-right w-16">
                    <button
                      type="button"
                      onClick={() => onDelete(doc.id)}
                      title="Remover"
                      className="bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 rounded px-2 py-1 text-[10px] font-bold"
                    >
                      🗑️
                    </button>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
