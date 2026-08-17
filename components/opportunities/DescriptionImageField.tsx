'use client';

import { useRef, useState } from 'react';
import { uploadInlineImage } from '@/lib/opportunities/inline-image-actions';
import {
  parseDescriptionImages,
  insertImageMarkdown,
  stripDescriptionImages,
  type DescriptionImageRef,
} from '@/lib/opportunities/description-images';
import {
  INLINE_IMAGE_MAX_SIZE_BYTES,
  INLINE_IMAGE_ALLOWED_MIME,
} from '@/lib/opportunities/inline-image-schema';
import { InlineImageThumbs } from './InlineImageThumbs';

type Props = {
  id?: string;
  opportunityId: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className: string;
  placeholder?: string;
};

/**
 * Rejunta a prosa digitada com as imagens anexadas — sempre reconstruído do
 * zero a partir dos dois, nunca acumulado por edição de string. A sintaxe
 * `![alt](inline-image:path)` fica de fora do que a pessoa vê/edita; ela só
 * existe no valor persistido (é isso que separa "digitar texto" de "anexar
 * imagem" — apagar uma palavra nunca apaga uma imagem, só o × da miniatura).
 */
function rebuild(prose: string, images: DescriptionImageRef[]): string {
  return images.reduce(
    (acc, img) => insertImageMarkdown(acc, acc.length, img.alt, img.path).text,
    prose
  );
}

/**
 * Campo de texto livre (Descrição de tarefa/subtarefa em TaskForm.tsx,
 * Anotação em ObservacaoTab.tsx) com suporte a colar (Ctrl+V), arrastar-e-
 * soltar ou o botão "Anexar imagem". A textarea mostra e edita SÓ a prosa —
 * a imagem nunca aparece como texto ali, só como miniatura abaixo
 * (InlineImageThumbs), clicável para abrir em tamanho real ("abrir depois")
 * e com um × próprio para remover — a única forma de remover uma imagem.
 */
export function DescriptionImageField({
  id,
  opportunityId,
  value,
  onChange,
  rows = 3,
  className,
  placeholder,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Prosa é estado local, controlado DIRETO pela textarea a cada tecla — só
  // inicializado (1x, no mount, mesmo padrão de `initial?.description` em
  // TaskForm.tsx) a partir de `value`. NÃO recalcular `stripDescriptionImages`
  // a cada keystroke: isso soma latência suficiente entre o DOM e o valor
  // controlado pra a textarea perder caractere em digitação rápida (bug real,
  // reproduzido 2026-08-14 — "a b" virava "ab"). Só as imagens (miniatura,
  // anexar/remover) continuam derivadas de `value` a cada render — mudam bem
  // menos vezes que cada tecla digitada.
  const [prose, setProse] = useState(() => stripDescriptionImages(value));
  const images = parseDescriptionImages(value);

  function onProseChange(newProse: string) {
    setProse(newProse);
    onChange(rebuild(newProse, images));
  }

  function insertFile(file: File) {
    if (!INLINE_IMAGE_ALLOWED_MIME.includes(file.type as (typeof INLINE_IMAGE_ALLOWED_MIME)[number])) {
      setUploadError('Formato não permitido (JPEG, PNG, GIF ou WebP).');
      return;
    }
    if (file.size > INLINE_IMAGE_MAX_SIZE_BYTES) {
      setUploadError('Imagem acima de 5 MB.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set('file', file);

    uploadInlineImage(opportunityId, fd).then((result) => {
      setUploading(false);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      onChange(rebuild(prose, [...images, { alt: result.nome, path: result.path }]));
    });
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    insertFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    insertFile(file);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) insertFile(file);
  }

  return (
    <div>
      <textarea
        id={id}
        value={prose}
        onChange={(e) => onProseChange(e.target.value)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={onFileInputChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-[10px] font-semibold text-acc hover:underline disabled:opacity-50"
        >
          {uploading ? 'Enviando imagem...' : '🖼️ Anexar imagem'}
        </button>
        <span className="text-[10px] text-mut">ou arraste/cole uma imagem no campo acima</span>
      </div>
      {uploadError && (
        <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">{uploadError}</p>
      )}
      <InlineImageThumbs
        text={value}
        onRemove={(path) => onChange(rebuild(prose, images.filter((img) => img.path !== path)))}
      />
    </div>
  );
}
