import 'server-only';
import { checkBotId } from 'botid/server';

/**
 * Retorna true se a request foi classificada como bot pelo Vercel BotID.
 * Local dev SEMPRE retorna `isBot: false` (RESEARCH Pitfall 1) — BotID só ativa
 * quando o deploy está rodando na Vercel. Por isso E2E ficam manuais em preview.
 *
 * Phase 7.5 Bloco D — primeira linha de defesa, edge-side, antes de qualquer
 * trabalho do Server Action.
 */
export async function isBotRequest(): Promise<boolean> {
  const verification = await checkBotId();
  return verification.isBot === true;
}
