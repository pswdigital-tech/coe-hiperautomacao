import { initBotId } from 'botid/client/core';

// Phase 7.5 Bloco D — protege Server Actions do formulário público anônimo.
// POSTs em /r/* são interceptados pelo BotID antes de chegarem ao Server Action.
// Em local dev `checkBotId()` sempre retorna isBot:false (RESEARCH Pitfall 1) —
// validação real só acontece em runtime Vercel.
//
// Não confundir com `instrumentation.ts` (server-side). Este arquivo roda no boot
// do client bundle (convenção Next.js 15.3+).
initBotId({
  protect: [
    { path: '/r/*', method: 'POST' },
  ],
});
