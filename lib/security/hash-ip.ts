import 'server-only';
import { createHash } from 'node:crypto';

/**
 * SHA-256(IP_HASH_SALT + ':' + ip). Determinístico (mesmo IP gera mesmo hash dentro
 * da mesma sessão de salt), mas inviável de reverter — defesa contra tabela rainbow.
 *
 * THROWS se `IP_HASH_SALT` ausente. Defensivo: persistir IP sem salt é vetor de
 * privacy leak via rainbow table trivial. Server Action deve capturar e retornar
 * mensagem pt-BR genérica.
 *
 * Salt deve vir de `openssl rand -hex 32` no Vercel env.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error('IP_HASH_SALT ausente — não é seguro persistir IP sem salt');
  }
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
