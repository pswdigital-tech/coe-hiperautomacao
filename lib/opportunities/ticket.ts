import type { Opportunity } from './types';

// =============================================================================
// ticket.ts — "Código do Chamado" (v0.3)
// -----------------------------------------------------------------------------
// A referência externa (COE — COPA ENERGIA) tem um contador `CHM-0001` próprio.
// Este produto JÁ tem um contador atômico por tenant — `seq_id` (trigger
// `trg_opportunities_seq_id`, 0001) — então o código do chamado é só uma
// FORMATAÇÃO de exibição do seq_id existente, não um novo contador/coluna/
// migration. Zero risco de divergência entre os dois (são o mesmo número).
// =============================================================================

/** "CHM-0001" a partir do seq_id (mesmo padrão de zero-pad usado em SeqIdDisplay). */
export function formatCodigoChamado(seqId: number): string {
  return `CHM-${String(seqId).padStart(4, '0')}`;
}

/**
 * Detecta `processo` (nome do BOT/automação) duplicado dentro da lista — mesmo
 * heurística da referência (slugify + comparar), usada pra sinalizar "⚠ nome
 * duplicado" na tabela/modal. Client-side puro, opera sobre a lista já carregada
 * (RLS já filtrou por tenant — nunca cruza tenants).
 */
function slugifyProcesso(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isProcessoDuplicado(
  opportunity: Pick<Opportunity, 'id' | 'processo'>,
  all: Pick<Opportunity, 'id' | 'processo'>[]
): boolean {
  const slug = slugifyProcesso(opportunity.processo);
  if (!slug) return false;
  return all.some((o) => o.id !== opportunity.id && slugifyProcesso(o.processo) === slug);
}
