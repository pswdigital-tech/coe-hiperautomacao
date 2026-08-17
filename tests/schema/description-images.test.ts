// =============================================================================
// description-images.test.ts — specs puras de parse/insert/strip de
// referências de imagem embutidas em campos de texto livre
// (opportunity_tasks.description, opportunity_notes.texto —
// `![alt](inline-image:path)`, lib/opportunities/description-images.ts)
// -----------------------------------------------------------------------------
// Sem banco (modelo: score-rule.test.ts) — cobre a sintaxe custom usada por
// DescriptionImageField.tsx (colar/arrastar imagem) e InlineImageThumbs.tsx
// (miniaturas, editável ou somente-leitura) em TaskForm.tsx e ObservacaoTab.tsx.
// Não existe "remover" aqui: no campo editável, remover uma imagem é filtrar
// a lista de DescriptionImageRef e reconstruir com insertImageMarkdown (ver
// DescriptionImageField.tsx) — não uma operação de string neste módulo.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseDescriptionImages,
  insertImageMarkdown,
  stripDescriptionImages,
} from '@/lib/opportunities/description-images';

describe('parseDescriptionImages', () => {
  it('texto sem referência devolve array vazio', () => {
    expect(parseDescriptionImages('Descrição qualquer, sem imagem.')).toEqual([]);
  });

  it('uma referência é extraída com alt e path corretos', () => {
    const text =
      'Ver print: ![print-erro.png](inline-image:tenant-1/opp-1/inline-images/1-print-erro.png) obrigado';
    expect(parseDescriptionImages(text)).toEqual([
      { alt: 'print-erro.png', path: 'tenant-1/opp-1/inline-images/1-print-erro.png' },
    ]);
  });

  it('múltiplas referências são extraídas na ordem em que aparecem', () => {
    const text =
      '![a.png](inline-image:t/o/inline-images/1-a.png) meio ![b.png](inline-image:t/o/inline-images/2-b.png)';
    expect(parseDescriptionImages(text)).toEqual([
      { alt: 'a.png', path: 't/o/inline-images/1-a.png' },
      { alt: 'b.png', path: 't/o/inline-images/2-b.png' },
    ]);
  });

  it('markdown de imagem "puro" (sem o prefixo inline-image:) NÃO casa — evita path arbitrário', () => {
    const text = '![foto](https://example.com/foto.png)';
    expect(parseDescriptionImages(text)).toEqual([]);
  });

  it('link comum ![]() vazio não quebra o parser', () => {
    expect(parseDescriptionImages('![](inline-image:t/o/x.png)')).toEqual([
      { alt: '', path: 't/o/x.png' },
    ]);
  });
});

describe('insertImageMarkdown', () => {
  it('insere no fim de um texto vazio, sem espaços supérfluos', () => {
    const { text, cursorPos } = insertImageMarkdown('', 0, 'foto.png', 't/o/x.png');
    expect(text).toBe('![foto.png](inline-image:t/o/x.png)');
    expect(cursorPos).toBe(text.length);
  });

  it('insere no meio do texto com espaço de separação nos dois lados', () => {
    const before = 'Ver aqui:algo depois';
    const pos = 'Ver aqui:'.length;
    const { text } = insertImageMarkdown(before, pos, 'x.png', 't/o/x.png');
    expect(text).toBe('Ver aqui: ![x.png](inline-image:t/o/x.png) algo depois');
  });

  it('não duplica espaço quando já há espaço adjacente ao cursor', () => {
    const before = 'Ver aqui: depois';
    const pos = 'Ver aqui: '.length;
    const { text } = insertImageMarkdown(before, pos, 'x.png', 't/o/x.png');
    expect(text).toBe('Ver aqui: ![x.png](inline-image:t/o/x.png) depois');
  });

  it('sanitiza colchetes no alt (nome de arquivo malicioso não quebra a sintaxe)', () => {
    const { text } = insertImageMarkdown('', 0, 'a[b]c.png', 't/o/x.png');
    expect(text).toBe('![abc.png](inline-image:t/o/x.png)');
  });

  it('cursorPos fora dos limites do texto é grampeado (clamp)', () => {
    const { text } = insertImageMarkdown('abc', 999, 'x.png', 't/o/x.png');
    expect(text).toBe('abc ![x.png](inline-image:t/o/x.png)');
  });
});

describe('stripDescriptionImages', () => {
  it('texto sem imagem é devolvido igual (só trim)', () => {
    expect(stripDescriptionImages('  anotação normal  ')).toBe('anotação normal');
  });

  it('remove a sintaxe crua, mantendo o resto da prosa legível', () => {
    const text = 'Ver print: ![x.png](inline-image:t/o/x.png) segue o resto';
    expect(stripDescriptionImages(text)).toBe('Ver print: segue o resto');
  });

  it('texto composto só pela imagem vira string vazia (a miniatura carrega o conteúdo)', () => {
    expect(stripDescriptionImages('![x.png](inline-image:t/o/x.png)')).toBe('');
  });

  it('múltiplas imagens intercaladas: todas removidas, prosa preservada', () => {
    const text = '![a.png](inline-image:t/o/a.png) meio ![b.png](inline-image:t/o/b.png) fim';
    expect(stripDescriptionImages(text)).toBe('meio fim');
  });
});
