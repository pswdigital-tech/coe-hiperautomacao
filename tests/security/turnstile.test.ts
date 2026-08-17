// =============================================================================
// Turnstile siteverify helper — unit tests (Bloco D)
// =============================================================================
// Cobre HARD-D-01 (token ausente/inválido → ok:false) e HARD-D-02 (token
// duplicado → ok:false com `timeout-or-duplicate`).
//
// 100% unit: fetch é mockado via `vi.spyOn(globalThis, 'fetch')` — NÃO bate
// em challenges.cloudflare.com. NÃO depende de Supabase. Sempre roda
// (mesmo sem .env.test ou DB).
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('verifyTurnstileToken (Bloco D)', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HARD-D-01: retorna ok:false quando Cloudflare responde success:false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
        { status: 200 },
      ),
    );
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    const r = await verifyTurnstileToken('fake-token', '1.2.3.4');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCodes).toContain('invalid-input-response');
  });

  it('HARD-D-02: retorna ok:false para token duplicado (timeout-or-duplicate)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
        { status: 200 },
      ),
    );
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    const r = await verifyTurnstileToken('reused-token', '1.2.3.4');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCodes).toContain('timeout-or-duplicate');
  });

  it('retorna ok:true quando Cloudflare responde success:true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'example.com',
          action: 'submit',
        }),
        { status: 200 },
      ),
    );
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    const r = await verifyTurnstileToken('valid-token', '1.2.3.4');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hostname).toBe('example.com');
      expect(r.action).toBe('submit');
    }
  });

  it('retorna ok:false errorCodes:[missing-secret-config] quando env ausente', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    const r = await verifyTurnstileToken('any', '1.2.3.4');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCodes).toContain('missing-secret-config');
  });

  it('retorna ok:false errorCodes:[network-error] em fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket timeout'));
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    const r = await verifyTurnstileToken('any', '1.2.3.4');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCodes).toContain('network-error');
  });

  it('envia idempotency_key UUID no body (single-use defense)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const { verifyTurnstileToken } = await import('@/lib/security/turnstile');
    await verifyTurnstileToken('token', '5.6.7.8');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0];
    const body = call[1]?.body as URLSearchParams;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get('secret')).toBe('test-secret-key');
    expect(body.get('response')).toBe('token');
    expect(body.get('remoteip')).toBe('5.6.7.8');
    expect(body.get('idempotency_key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
