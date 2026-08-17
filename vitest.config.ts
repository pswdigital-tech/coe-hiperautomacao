import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // `server-only` é um marker do Next.js que existe apenas no bundler para
      // impedir que módulos server-side vazem para o client bundle. Em ambiente
      // de teste (Node puro), o pacote não está instalado e não tem efeito —
      // resolvemos para um stub vazio para que `import 'server-only'` passe.
      // Padrão recomendado pela própria doc do Next para Vitest.
      'server-only': path.resolve(__dirname, './tests/setup/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    globalSetup: ['./tests/setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Phase 7.6 Plan 06: aceita `.test.tsx` p/ testes de componentes React
    // (tests/modal/ai-enrichment-badge.test.tsx etc.). Padrão server-side
    // continua sendo `.test.ts` em tests/**.
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'supabase/**', 'get-shit-done/**'],
    // Phase 7.6 Plan 06: tests de modal (UI React) precisam de DOM. Vitest
    // resolve o env por glob match; demais tests permanecem em node. Vitest 3
    // ainda suporta esta opção (deprecada em favor de `projects` mas funcional);
    // migrar p/ projects fica em backlog 999.x se virar dor real.
    environmentMatchGlobs: [
      ['tests/modal/**', 'jsdom'],
    ],
    // Setup global p/ matchers do @testing-library/jest-dom (toBeInTheDocument
    // etc.). O arquivo importa o entry `@testing-library/jest-dom/vitest` só
    // se rodando em jsdom (defesa interna do setup file) — em node, no-op safe.
    setupFiles: ['./tests/setup/dom-matchers.ts'],
  },
});
