// =============================================================================
// description-images.ts — referências de imagem embutidas em campos de texto
// livre (opportunity_tasks.description, opportunity_notes.texto) via sintaxe
// custom `![alt](inline-image:{storage_path})`
// -----------------------------------------------------------------------------
// NÃO é um parser de markdown de verdade — só o suficiente para achar,
// inserir e (na leitura) esconder essas referências num texto livre, sem
// depender de nenhuma lib. Remover uma imagem NÃO é uma operação de string
// (não existe "removeDescriptionImage") — é filtrar a lista de
// DescriptionImageRef e reconstruir com insertImageMarkdown; ver
// DescriptionImageField.tsx. O prefixo `inline-image:` (em vez de markdown
// de imagem "puro", `![alt](url)`) existe de propósito: evita que um link
// comum que a pessoa digite/cole no texto seja confundido com uma referência
// de imagem resolvível (a resolução busca uma signed URL no Storage a partir
// do path — um path arbitrário digitado por engano falharia silenciosamente,
// o esquema custom torna essa ambiguidade impossível).
//
// Módulo puro (sem 'use server'/'use client') — importado por
// components/opportunities/DescriptionImageField.tsx (campo editável) e
// components/opportunities/InlineImageThumbs.tsx (miniaturas, editável ou
// somente-leitura), além dos testes em tests/schema/description-images.test.ts.
// =============================================================================

export const INLINE_IMAGE_SCHEME = 'inline-image:';

export type DescriptionImageRef = { alt: string; path: string };

const IMAGE_REF_RE = /!\[([^\]]*)\]\(inline-image:([^)]+)\)/g;

/** Todas as referências de imagem presentes no texto, na ordem em que aparecem. */
export function parseDescriptionImages(text: string): DescriptionImageRef[] {
  const refs: DescriptionImageRef[] = [];
  for (const match of text.matchAll(IMAGE_REF_RE)) {
    refs.push({ alt: match[1], path: match[2] });
  }
  return refs;
}

/**
 * Insere `![alt](inline-image:path)` na posição do cursor, com espaço de
 * separação quando necessário (não gruda no texto vizinho). Devolve o texto
 * novo e a posição de cursor pós-inserção (para reposicionar o textarea).
 */
export function insertImageMarkdown(
  text: string,
  cursorPos: number,
  alt: string,
  path: string
): { text: string; cursorPos: number } {
  const safeAlt = alt.replace(/[[\]]/g, '');
  const pos = Math.max(0, Math.min(cursorPos, text.length));
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const leading = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trailing = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const insertion = `${leading}![${safeAlt}](${INLINE_IMAGE_SCHEME}${path})${trailing}`;
  return { text: before + insertion + after, cursorPos: pos + insertion.length };
}

/**
 * Texto para exibição SOMENTE-LEITURA (ex.: linha de Anotação já salva): remove
 * todas as referências de imagem, deixando só a prosa — as miniaturas são
 * renderizadas à parte por InlineImageThumbs, nunca a sintaxe crua.
 */
export function stripDescriptionImages(text: string): string {
  return text.replace(IMAGE_REF_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
}
