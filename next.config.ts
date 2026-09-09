import type { NextConfig } from "next";
import { withBotId } from 'botid/next/config';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload de documentos da oportunidade (DocumentosTab) viaja pela Server Action
      // uploadDocument via FormData. O limite padrão do Next é 1 MB; a regra de negócio
      // aceita até 8 MB (DOCUMENT_MAX_SIZE_BYTES), com folga para o overhead do multipart.
      bodySizeLimit: '10mb',
    },
  },
};

// Phase 7.5 Bloco D — withBotId injeta a infra do Vercel BotID na build.
// Ativo apenas em deploys Vercel; local dev é no-op (RESEARCH Pitfall 1).
// Headers de segurança (CSP, HSTS, X-Frame, etc.) ficam em proxy.ts (Plan 05).
export default withBotId(nextConfig);
