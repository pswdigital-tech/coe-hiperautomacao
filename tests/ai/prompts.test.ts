// =============================================================================
// buildEnrichmentPrompt — unit tests
// =============================================================================
// 6 testes focados em sanidade do builder + defesa anti prompt-injection:
//   1. Snapshot do output formulario (system + user prompts estáveis)
//   2. Snapshot persona — persona_extras incluído
//   3. AI-TEST-02 — userPrompt NÃO contém UUID quando input é válido
//   4. tenant_id NÃO atravessa o builder mesmo via cast malicioso
//   5. null fields → 'unknown' (não 'null' nem 'undefined')
//   6. solicitante full name → só primeiro nome no prompt (PII reduction)
//
// `prompts.ts` é função pura — sem mocks necessários.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildEnrichmentPrompt, type EnrichmentInput } from '@/lib/ai/prompts';

const BASE_INPUT: EnrichmentInput = {
  source: 'formulario',
  request_type: 'nova_oportunidade',
  solicitante: 'Alice Silva',
  area: 'TI',
  subarea: 'Infraestrutura',
  processo: 'Conciliação bancária diária',
  frequencia: 'diario',
  volume_medio: '100',
  tempo_execucao: '2h',
  num_pessoas: '3',
  persona_extras: null,
  formulario_extras: { tipo_processo: 'Backoffice' },
};

const TENANT_UUID_LITERAL = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('buildEnrichmentPrompt', () => {
  it('snapshot formulario — systemPrompt + userPrompt estáveis', () => {
    const result = buildEnrichmentPrompt(BASE_INPUT);
    expect(result.systemPrompt).toMatchSnapshot();
    expect(result.userPrompt).toMatchSnapshot();
  });

  it('snapshot persona — persona_extras incluído', () => {
    const result = buildEnrichmentPrompt({
      ...BASE_INPUT,
      source: 'persona',
      persona_extras: { cargo: 'Analista', tempo_funcao: '5 anos' },
      formulario_extras: null,
    });
    expect(result.userPrompt).toMatchSnapshot();
  });

  it('AI-TEST-02: userPrompt NÃO contém UUID — defesa contra geração espontânea de IDs', () => {
    // O builder NUNCA deve emitir um UUID (não há campo de UUID no
    // EnrichmentInput type). Esta asserção pega regressões caso alguém
    // adicione um id-pattern no template literal.
    const result = buildEnrichmentPrompt(BASE_INPUT);
    expect(result.userPrompt).not.toMatch(UUID_REGEX);
    expect(result.systemPrompt).not.toMatch(UUID_REGEX);
  });

  it('userPrompt NÃO contém ID-do-tenant mesmo quando passado em prop maliciosa via cast', () => {
    // Compile-time defense: EnrichmentInput não tem o campo de tenant.
    // Runtime defense: mesmo se TypeScript falhar (any), builder NÃO usa o campo
    // porque acessa apenas as props declaradas no type.
    const malicious = {
      ...BASE_INPUT,
      tenant_id: TENANT_UUID_LITERAL,
    } as unknown as EnrichmentInput;
    const result = buildEnrichmentPrompt(malicious);
    expect(result.userPrompt).not.toContain(TENANT_UUID_LITERAL);
    expect(result.systemPrompt).not.toContain(TENANT_UUID_LITERAL);
  });

  it('lida com null fields graciosamente — "unknown" em vez de "null"/"undefined"', () => {
    const input: EnrichmentInput = {
      ...BASE_INPUT,
      subarea: null,
      frequencia: null,
      volume_medio: null,
      tempo_execucao: null,
      num_pessoas: null,
      formulario_extras: null,
      persona_extras: null,
    };
    const result = buildEnrichmentPrompt(input);
    expect(result.userPrompt).toContain('unknown');
    expect(result.userPrompt).not.toContain('null');
    expect(result.userPrompt).not.toContain('undefined');
  });

  it('solicitante com nome completo → prompt só usa primeiro nome (PII reduction)', () => {
    const result = buildEnrichmentPrompt({
      ...BASE_INPUT,
      solicitante: 'João Pedro Almeida Costa',
    });
    expect(result.userPrompt).toContain('João');
    expect(result.userPrompt).not.toContain('Almeida');
    expect(result.userPrompt).not.toContain('Costa');
  });
});
