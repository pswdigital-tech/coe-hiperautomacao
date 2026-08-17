// =============================================================================
// steps.test.ts — invariantes estruturais do PublicForm.tsx (Phase 7.6 Plan 05)
// =============================================================================
// Verifica via leitura do source code (NÃO renderiza o componente) que:
//
//   1. AI-PUB-01: STEPS array reduzido a [identificacao, processo] (2 items;
//      ou até 3 se algum classificacao for adicionado no futuro)
//   2. AI-PUB-01 cross-check: nenhum dos 4 IDs de step removidos sobrevive
//      no source (automacao, criterios, beneficios, priorizacao)
//   3. AI-PUB-01: FormState type NÃO declara campos enriquecidos pela IA
//      (ferramenta, escopo_automacao, beneficios_esperados, esforco,
//      complexidade, tempo, objetivo)
//   4. Regression: widget Turnstile + state turnstileToken + ref turnstileRef
//      preservados (Phase 7.5 Plan 06 hardening)
//   5. Regression: submit() ainda chama createPublicOpportunity + 3º arg
//      turnstileToken (assinatura locked com Plan 03 / Plan 07.5-06)
//   6. Regression: import de @marsidev/react-turnstile presente
//   7. Payload do submit NÃO inclui referências a data.ferramenta/data.esforco/
//      data.complexidade/data.objetivo (campos não fazem mais parte do
//      FormState após Plan 05 — Server Action injeta defaults antes da RPC)
//
// Pattern: como PublicForm.tsx é client component com hooks React + Turnstile
// widget, renderizar em vitest exige jsdom + @testing-library/react + setup
// complexo. Para invariantes ESTRUTURAIS (não comportamentais), regex sobre o
// source é proporcional ao risco. Comportamento end-to-end fica para UAT
// manual (Phase 7.6 Plan 07 / Phase 8).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC_FORM_PATH = resolve(__dirname, '../../app/r/[slug]/PublicForm.tsx');
const SOURCE = readFileSync(PUBLIC_FORM_PATH, 'utf8');

describe('PublicForm.tsx — Phase 7.6 Plan 05 refactor', () => {
  it('AI-PUB-01: STEPS array contém apenas identificacao + processo (ou até 3 com classificacao)', () => {
    const stepsBlock = SOURCE.match(/const STEPS[^=]*=\s*\[([\s\S]*?)\];/);
    expect(stepsBlock).not.toBeNull();
    const stepIds = Array.from(
      (stepsBlock?.[1] ?? '').matchAll(/id:\s*'([^']+)'/g),
      (m) => m[1],
    );
    // Aceita 2 ou 3 steps (caso classificacao seja extraído como step próprio
    // no futuro — não é o caso hoje, mas o PLAN tolera).
    expect(stepIds.length).toBeGreaterThanOrEqual(2);
    expect(stepIds.length).toBeLessThanOrEqual(3);
    expect(stepIds).toContain('identificacao');
    expect(stepIds).toContain('processo');
  });

  it('AI-PUB-01 cross-check: STEPS array NÃO contém automacao/criterios/beneficios/priorizacao', () => {
    const stepsBlock = SOURCE.match(/const STEPS[^=]*=\s*\[([\s\S]*?)\];/);
    const stepIds = Array.from(
      (stepsBlock?.[1] ?? '').matchAll(/id:\s*'([^']+)'/g),
      (m) => m[1],
    );
    expect(stepIds).not.toContain('automacao');
    expect(stepIds).not.toContain('criterios');
    expect(stepIds).not.toContain('beneficios');
    expect(stepIds).not.toContain('priorizacao');
  });

  it('AI-PUB-01: FormState type NÃO declara campos enriquecidos pela IA', () => {
    // FormState type body — entre `type FormState = {` e `};`
    const formStateBlock = SOURCE.match(/type FormState\s*=\s*\{([\s\S]*?)\n\};/);
    expect(formStateBlock).not.toBeNull();
    const fields = formStateBlock?.[1] ?? '';

    // Strip line-comments (// ...) — comentários documentam o que foi removido
    // e não devem fazer parte da verificação semântica do type body.
    const fieldsNoComments = fields
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    const forbidden = [
      'ferramenta',
      'escopo_automacao',
      'beneficios_esperados',
      'esforco',
      'complexidade',
      'objetivo',
    ];
    for (const field of forbidden) {
      // word boundary + opcional `?` + `:` — match declaração de campo no type
      const regex = new RegExp(`\\b${field}\\b\\s*\\??\\s*:`);
      expect(
        fieldsNoComments,
        `FormState NÃO pode declarar campo '${field}' (Phase 7.6 — IA gera)`,
      ).not.toMatch(regex);
    }
    // 'tempo' separadamente — 'tempo_execucao' continua no FormState; só
    // declaração `tempo:` (sem _execucao) é proibida.
    expect(
      fieldsNoComments,
      "FormState NÃO pode declarar 'tempo:' (Phase 7.6 — IA gera; tempo_execucao continua)",
    ).not.toMatch(/\btempo\s*\??\s*:\s*['"]/);
  });

  it('regression: Turnstile widget + turnstileToken state + turnstileRef PRESERVADOS (Plan 07.5-06)', () => {
    // Componente Turnstile renderizado (JSX tag)
    expect(SOURCE).toMatch(/<Turnstile/);
    // State + ref do hardening 7.5-06
    expect(SOURCE).toMatch(/turnstileToken/);
    expect(SOURCE).toMatch(/turnstileRef/);
  });

  it('regression: submit() chama createPublicOpportunity com turnstileToken como 3º arg', () => {
    expect(SOURCE).toMatch(/createPublicOpportunity\(/);
    // Token é o 3º argumento (mesmo que multi-linha)
    expect(SOURCE).toMatch(
      /createPublicOpportunity\(\s*tenant\.slug,\s*input,\s*turnstileToken/,
    );
  });

  it('regression: import @marsidev/react-turnstile presente', () => {
    expect(SOURCE).toMatch(/from '@marsidev\/react-turnstile'/);
  });

  it('AI-PUB-01: payload do submit NÃO referencia data.{ferramenta|esforco|complexidade}', () => {
    // Estes campos não fazem mais parte do FormState — qualquer `data.X`
    // residual quebraria typecheck, mas regex defensivo + redundante.
    expect(SOURCE).not.toMatch(/data\.ferramenta\b/);
    expect(SOURCE).not.toMatch(/data\.esforco\b/);
    expect(SOURCE).not.toMatch(/data\.complexidade\b/);
    expect(SOURCE).not.toMatch(/data\.escopo_automacao\b/);
    expect(SOURCE).not.toMatch(/data\.beneficios_esperados\b/);
    expect(SOURCE).not.toMatch(/data\.observacao\b/);
    expect(SOURCE).not.toMatch(/data\.risco\b/);
    expect(SOURCE).not.toMatch(/data\.criterios\b/);
    expect(SOURCE).not.toMatch(/data\.beneficios\b/);
    // `data.objetivo` também — Plan 05 envia default neutro literal, não state.
    expect(SOURCE).not.toMatch(/data\.objetivo\b/);
  });
});
