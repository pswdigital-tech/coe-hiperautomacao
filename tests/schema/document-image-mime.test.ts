// =============================================================================
// document-image-mime.test.ts — trava que DOCUMENT_ALLOWED_MIME (upload de
// documento) e INLINE_IMAGE_ALLOWED_MIME (imagem colada/arrastada na
// Descrição de tarefas ou em Anotações) aceitam os 4 formatos de imagem
// suportados e continuam excluindo SVG (risco de XSS — conteúdo ativo
// embutido, ver comentário em document-schema.ts).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { DOCUMENT_ALLOWED_MIME, IMAGE_ALLOWED_MIME } from '@/lib/opportunities/document-schema';
import { INLINE_IMAGE_ALLOWED_MIME } from '@/lib/opportunities/inline-image-schema';

const EXPECTED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

describe('IMAGE_ALLOWED_MIME', () => {
  it('contém exatamente os 4 formatos suportados', () => {
    expect([...IMAGE_ALLOWED_MIME].sort()).toEqual([...EXPECTED_IMAGE_MIME].sort());
  });

  it('não inclui image/svg+xml (XSS via conteúdo ativo embutido)', () => {
    expect(IMAGE_ALLOWED_MIME).not.toContain('image/svg+xml');
  });
});

describe('DOCUMENT_ALLOWED_MIME', () => {
  it('inclui todos os mimes de imagem além dos formatos de documento pré-existentes', () => {
    for (const mime of EXPECTED_IMAGE_MIME) {
      expect(DOCUMENT_ALLOWED_MIME).toContain(mime);
    }
    expect(DOCUMENT_ALLOWED_MIME).toContain('application/pdf');
  });
});

describe('INLINE_IMAGE_ALLOWED_MIME', () => {
  it('é o mesmo conjunto de IMAGE_ALLOWED_MIME (fonte única)', () => {
    expect(INLINE_IMAGE_ALLOWED_MIME).toBe(IMAGE_ALLOWED_MIME);
  });
});
