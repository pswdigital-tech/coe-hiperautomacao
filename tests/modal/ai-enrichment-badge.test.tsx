// @vitest-environment jsdom
/**
 * Phase 7.6 Plan 06 — AiEnrichmentBadge unit tests
 *
 * Cobre o requisito AI-UI-01 (badge visível no modal de detalhe) + threat
 * T-07.6-F-01 (admin nunca vê falha → row fica com defaults piores que IA).
 *
 * Estados verificados:
 *   - pending  → renderiza 'Enriquecendo…'
 *   - failed   → renderiza 'Falha — preencher manualmente'
 *   - failed + error → title attribute contém o erro técnico
 *   - enriched → null (silêncio)
 *   - null/undefined → null (defensivo)
 *
 * Ambiente: jsdom (via environmentMatchGlobs em vitest.config.ts + pragma no
 * topo do arquivo como redundância — pragma vence se houver conflito).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiEnrichmentBadge } from '@/components/opportunities/modal/AiEnrichmentBadge';

describe('AiEnrichmentBadge (Phase 7.6 — AI-UI-01)', () => {
  it('AI-UI-01: status="pending" → renderiza "Enriquecendo…"', () => {
    render(<AiEnrichmentBadge status="pending" />);
    expect(screen.getByText(/Enriquecendo/)).toBeInTheDocument();
  });

  it('AI-UI-01: status="failed" → renderiza "Falha — preencher manualmente"', () => {
    render(<AiEnrichmentBadge status="failed" />);
    expect(
      screen.getByText(/Falha — preencher manualmente/),
    ).toBeInTheDocument();
  });

  it('T-07.6-F-01: status="failed" + error → title attribute contém o erro técnico', () => {
    const { container } = render(
      <AiEnrichmentBadge
        status="failed"
        error="refusal: I cannot help with that"
      />,
    );
    const badge = container.querySelector('[title]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('title')).toMatch(/refusal/);
  });

  it('status="enriched" → componente retorna null (silêncio)', () => {
    const { container } = render(<AiEnrichmentBadge status="enriched" />);
    expect(container.firstChild).toBeNull();
  });

  it('status=null → componente retorna null (defensivo)', () => {
    const { container } = render(<AiEnrichmentBadge status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('status=undefined → componente retorna null (defensivo)', () => {
    const { container } = render(<AiEnrichmentBadge status={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
