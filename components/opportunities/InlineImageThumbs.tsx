'use client';

import { useEffect, useRef, useState } from 'react';
import { getDocumentDownloadUrl } from '@/lib/opportunities/document-actions';
import { parseDescriptionImages } from '@/lib/opportunities/description-images';

type Props = {
  /** Texto bruto (com a sintaxe `![alt](inline-image:path)`) — as referências
   * são extraídas daqui, nunca passadas prontas. */
  text: string;
  /** Presente = miniatura mostra botão de remover (campo editável). Ausente =
   * somente leitura (ex.: Anotação já salva). */
  onRemove?: (path: string) => void;
};

/**
 * Miniaturas das imagens embutidas num texto livre (Descrição de tarefa,
 * Anotação) — resolve a signed URL de cada referência sob demanda (TTL de 1h,
 * maior que o download avulso porque fica visível na tela enquanto a pessoa
 * lê/edita, não só no instante do clique) e abre a imagem em tamanho real ao
 * clicar ("abrir depois"). Compartilhado entre o campo editável
 * (DescriptionImageField.tsx) e a exibição somente-leitura das Anotações
 * (ObservacaoTab.tsx).
 */
export function InlineImageThumbs({ text, onRemove }: Props) {
  const images = parseDescriptionImages(text);
  const resolvedFor = useRef<Set<string>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

  useEffect(() => {
    const missing = images.filter((img) => !resolvedFor.current.has(img.path));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const img of missing) {
        const result = await getDocumentDownloadUrl(img.path, 3600);
        if (cancelled) continue;
        // Só marca como resolvido DEPOIS do fetch (sucesso OU falha), nunca
        // antes — o StrictMode do dev roda este efeito 2x na montagem inicial
        // (cleanup + re-run síncronos); marcar cedo faria a 2ª execução pular
        // o path como "já resolvido" enquanto a 1ª tentativa, já cancelada,
        // descartava o resultado — miniatura presa em loading pra sempre.
        resolvedFor.current.add(img.path);
        if (result.ok) {
          setUrls((prev) => ({ ...prev, [img.path]: result.url }));
        } else {
          setFailed((prev) => ({ ...prev, [img.path]: result.error }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((img) => (
        <div key={img.path} className="relative group">
          {urls[img.path] ? (
            <button
              type="button"
              onClick={() => window.open(urls[img.path], '_blank', 'noopener')}
              title={`Abrir ${img.alt}`}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL externa temporária, next/image exigiria domínio fixo */}
              <img
                src={urls[img.path]}
                alt={img.alt}
                className="w-14 h-14 object-cover rounded-lg border border-bdr"
              />
            </button>
          ) : failed[img.path] ? (
            <div
              title={failed[img.path]}
              className="w-14 h-14 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-[16px]"
            >
              ⚠️
            </div>
          ) : (
            <div className="w-14 h-14 rounded-lg border border-bdr bg-bg animate-pulse" />
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(img.path)}
              title="Remover imagem"
              aria-label={`Remover ${img.alt}`}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
