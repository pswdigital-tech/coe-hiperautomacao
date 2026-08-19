// @vitest-environment jsdom
/**
 * ReprocessAiButton — o diálogo que escolhe o MODO de mesclagem.
 *
 * O botão existe para dois casos opostos (erro do enriquecimento × dados do
 * processo corrigidos), e a diferença entre eles é só o modo. O que estas
 * asserções travam:
 *   - o modo seguro (`fill-empty`) é o pré-selecionado — clicar em
 *     "Reprocessar" sem ler nada nunca sobrescreve campo preenchido;
 *   - escolher "Refazer a análise" chega à Server Action como `overwrite`;
 *   - o erro devolvido pela action aparece no diálogo (que fica aberto);
 *   - o estado 'failed' mostra o detalhe técnico da última tentativa.
 *
 * A Server Action é mock — o gate de papel dela é coberto por
 * tests/security/reprocess-ai-gate.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// `fireEvent` e não `user-event`: o pacote não é dependência deste projeto e
// nada aqui depende de simulação fiel de teclado/foco — são cliques simples.
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';

const mockReprocess = vi.fn();
vi.mock('@/lib/ai/reprocess-actions', () => ({
  reprocessOpportunityEnrichment: (...args: unknown[]) => mockReprocess(...args),
}));

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { ReprocessAiButton } from '@/components/opportunities/modal/ReprocessAiButton';

const OPP_ID = '11111111-2222-3333-4444-555555555555';

describe('ReprocessAiButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReprocess.mockResolvedValue({ ok: true });
  });

  // `globals: false` no vitest.config.ts — sem isso o auto-cleanup da RTL não
  // roda e as árvores dos testes anteriores continuam no document.
  afterEach(cleanup);

  it('modo seguro é o default: reprocessar sem escolher nada manda fill-empty', async () => {
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));
    fireEvent.click(screen.getByRole('button', { name: '🤖 Reprocessar' }));

    await waitFor(() =>
      expect(mockReprocess).toHaveBeenCalledWith(OPP_ID, 'fill-empty'),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('"Refazer a análise" chega à action como overwrite, com aviso na tela', async () => {
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Refazer a análise/ }));

    // O aviso de sobrescrita só aparece neste modo — é o consentimento visível.
    expect(screen.getByText(/será substituído pelo que a IA gerar/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🤖 Reprocessar' }));

    await waitFor(() =>
      expect(mockReprocess).toHaveBeenCalledWith(OPP_ID, 'overwrite'),
    );
  });

  it('lista do que nunca é alterado fica visível ANTES do clique', async () => {
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));

    expect(screen.getByText(/Nunca é alterado/)).toBeInTheDocument();
    expect(screen.getByText(/ferramentas selecionadas/)).toBeInTheDocument();
  });

  it('estado failed: diálogo mostra o detalhe técnico da última tentativa', async () => {
    render(
      <ReprocessAiButton
        opportunityId={OPP_ID}
        status="failed"
        error="api_429: rate limit"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));

    expect(screen.getByText(/A última tentativa falhou/)).toBeInTheDocument();
    expect(screen.getByText(/api_429: rate limit/)).toBeInTheDocument();
  });

  it('enquanto a IA roda: painel de progresso na tela e controles travados', async () => {
    // Promise que não resolve até o teste mandar — é assim que o estado
    // intermediário (o que a pessoa vê durante os 5-15s) fica observável.
    let resolveAction: (v: { ok: true }) => void = () => {};
    mockReprocess.mockReturnValue(
      new Promise<{ ok: true }>((r) => {
        resolveAction = r;
      }),
    );
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));
    fireEvent.click(screen.getByRole('button', { name: '🤖 Reprocessar' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Analisando com IA/),
    );
    // Nada de segundo disparo nem de fechar no meio do voo.
    expect(screen.getByRole('button', { name: /Reprocessando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Refazer a análise/ })).toBeDisabled();
    // "nada foi gravado ainda" é literal: nesta etapa a action ainda não voltou.
    expect(screen.getByRole('status')).toHaveTextContent(/nada foi gravado ainda/);

    resolveAction({ ok: true });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('clique no fundo NÃO fecha o diálogo com uma chamada em voo', async () => {
    mockReprocess.mockReturnValue(new Promise(() => {})); // nunca resolve
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));
    fireEvent.click(screen.getByRole('button', { name: '🤖 Reprocessar' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByRole('dialog'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('action recusa: erro aparece no diálogo, que continua aberto', async () => {
    mockReprocess.mockResolvedValue({
      ok: false,
      error: 'Apenas administradores da empresa podem reprocessar a análise da IA.',
    });
    render(<ReprocessAiButton opportunityId={OPP_ID} status="enriched" />);

    fireEvent.click(screen.getByRole('button', { name: /Reprocessar IA/ }));
    fireEvent.click(screen.getByRole('button', { name: '🤖 Reprocessar' }));

    await waitFor(() =>
      expect(screen.getByText(/Apenas administradores/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
