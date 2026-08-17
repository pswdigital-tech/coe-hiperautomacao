/**
 * Phase 7.6 Plan 06 — Setup de matchers DOM para Vitest.
 *
 * `@testing-library/jest-dom/vitest` adiciona matchers como `toBeInTheDocument`,
 * `toHaveAttribute`, `toHaveTextContent`. Estes matchers só fazem sentido em
 * ambiente jsdom — em testes node-only não há DOM e o import é desnecessário.
 *
 * Vitest carrega este arquivo via `setupFiles` em vitest.config.ts e roda UMA
 * vez por worker. Como temos `environmentMatchGlobs: [['tests/modal/**',
 * 'jsdom']]`, o env só é jsdom para testes em tests/modal/**; demais rodam em
 * node. Por isso fazemos o import condicional: se `typeof window` é 'object'
 * (jsdom presente), carrega; senão é no-op.
 *
 * Padrão recomendado pela própria doc do @testing-library/jest-dom.
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Dynamic import async via top-level await — Vitest 3 + Node 20 suportam.
  // O `export {}` abaixo marca o arquivo como módulo ES (requerido pelo TS
  // para top-level await).
  await import('@testing-library/jest-dom/vitest');
}

export {};
