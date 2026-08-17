import type { NextConfig } from "next";
import { withBotId } from 'botid/next/config';

const nextConfig: NextConfig = {
  /* config options here */
};

// Phase 7.5 Bloco D — withBotId injeta a infra do Vercel BotID na build.
// Ativo apenas em deploys Vercel; local dev é no-op (RESEARCH Pitfall 1).
// Headers de segurança (CSP, HSTS, X-Frame, etc.) ficam em proxy.ts (Plan 05).
export default withBotId(nextConfig);
