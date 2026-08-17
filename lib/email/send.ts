import 'server-only';

/**
 * Envio de e-mail transacional via Resend (HTTP API direta — sem SDK, para não
 * carregar dependência nova só por um POST).
 *
 * Env vars:
 *   RESEND_API_KEY  — injetada pela integração do Vercel Marketplace.
 *   EMAIL_FROM      — remetente verificado no Resend, ex.
 *                     "CoE Hiperautomação <coe@pswdigital.com.br>".
 *                     Sem domínio verificado, use "onboarding@resend.dev"
 *                     (só entrega para o e-mail dono da conta Resend).
 *
 * NUNCA lança: e-mail é efeito colateral, não pode derrubar a operação de
 * negócio que o disparou. Quem chama decide o que fazer com `ok: false`.
 */
export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'provider_error'; detail: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'CoE Hiperautomação <onboarding@resend.dev>';

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev local sem chave: loga e segue. Em produção isso aparece nos logs da
    // função e o admin vê o aviso "e-mail não enviado" na UI.
    console.warn('[email] RESEND_API_KEY ausente — envio ignorado para', params.to);
    return { ok: false, reason: 'not_configured', detail: 'RESEND_API_KEY ausente' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[email] Resend respondeu', res.status, detail);
      return { ok: false, reason: 'provider_error', detail: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch (err) {
    console.error('[email] falha de rede ao chamar Resend', err);
    return {
      ok: false,
      reason: 'provider_error',
      detail: err instanceof Error ? err.message : 'erro desconhecido',
    };
  }
}
