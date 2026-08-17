import 'server-only';
import { headers } from 'next/headers';

/**
 * Lê o IP do cliente a partir do header `x-forwarded-for` (cadeia Vercel/Cloudflare).
 * Toma o PRIMEIRO IP da cadeia — esse é o cliente real (os demais são proxies).
 * Fallback para `x-real-ip` (legacy) e por fim `0.0.0.0` (defensivo).
 *
 * Atenção: NUNCA persistir o valor retornado direto — usar `hashIp()` antes.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first || h.get('x-real-ip') || '0.0.0.0';
}
