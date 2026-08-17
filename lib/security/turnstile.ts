import 'server-only';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { ok: true; hostname: string; action: string | null }
  | { ok: false; errorCodes: string[] };

/**
 * Valida um token Turnstile contra Cloudflare. Tokens são single-use e válidos 5min.
 * Não cachear. Não retry — token reutilizado retorna 'timeout-or-duplicate'.
 *
 * Phase 7.5 Bloco D — defesa em camadas (BotID edge + Turnstile challenge + DB limits).
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: false, errorCodes: ['missing-secret-config'] };
  }

  const body = new URLSearchParams();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);
  body.append('idempotency_key', crypto.randomUUID());

  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, { method: 'POST', body, cache: 'no-store' });
  } catch {
    return { ok: false, errorCodes: ['network-error'] };
  }

  if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };

  const data = (await res.json()) as {
    success: boolean;
    hostname?: string;
    action?: string;
    'error-codes'?: string[];
  };

  if (!data.success) {
    return { ok: false, errorCodes: data['error-codes'] ?? ['unknown'] };
  }

  return { ok: true, hostname: data.hostname ?? '', action: data.action ?? null };
}
