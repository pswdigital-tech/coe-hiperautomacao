import { config as loadEnv } from 'dotenv';
import { seedTestTenants } from './seed-test-tenants';

// Carrega .env.test ANTES de qualquer import que toque process.env
loadEnv({ path: '.env.test' });

/**
 * Detecta se o ambiente de teste com Supabase está configurado.
 *
 * - Se `NEXT_PUBLIC_SUPABASE_URL` está vazio: assume **modo unit-only** (sem DB).
 *   Pure-unit tests (ex: `tests/security/mass-assignment.test.ts`) podem rodar
 *   sem instância Supabase. Specs de integração devem checar o env por conta
 *   própria via `process.env.NEXT_PUBLIC_SUPABASE_URL` e usar `it.skipIf(...)`
 *   ou um `describe.skipIf(...)` para que falhem cedo de forma explícita.
 * - Se URL está preenchido mas **não** aponta para localhost / *-test.supabase.co:
 *   ABORTA — defesa hard contra rodar testes destrutivos contra produção.
 */
function envMode(): 'unit-only' | 'integration' {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url) {
    return 'unit-only';
  }
  const allowed =
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://localhost') ||
    url.includes('-test.supabase.co'); // projeto de teste dedicado
  if (!allowed) {
    throw new Error(
      `[ABORT] NEXT_PUBLIC_SUPABASE_URL=${url} parece apontar para produção. ` +
        `Tests só rodam contra localhost ou *-test.supabase.co.`,
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('[ABORT] SUPABASE_SERVICE_ROLE_KEY ausente em .env.test');
  }
  return 'integration';
}

export default async function globalSetup() {
  const mode = envMode();
  if (mode === 'unit-only') {
    // eslint-disable-next-line no-console
    console.log(
      '[vitest globalSetup] modo unit-only — Supabase não configurado em .env.test; seed pulado.',
    );
    return;
  }
  await seedTestTenants();
}
