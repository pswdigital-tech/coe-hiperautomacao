import { describe, it, expect } from 'vitest';
import {
  slugifyTool,
  toolLabel,
  toolIcon,
  normalizeToolSlugs,
  DEFAULT_TOOL_ICON,
  MAX_TOOLS_PER_OPPORTUNITY,
  type AutomationToolOption,
} from '@/lib/opportunities/tools';
import { opportunityInputSchema } from '@/lib/opportunities/schema';

// =============================================================================
// Catálogo de ferramentas (0055) — helpers puros.
//
// O invariante que estes testes protegem: `slugifyTool` NUNCA pode produzir
// algo que o CHECK `automation_tools_slug_chk` rejeite. Um slug inválido não
// falha na tela — falha no INSERT, depois que o usuário já digitou o nome.
// =============================================================================

const SLUG_CHECK = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const catalog: AutomationToolOption[] = [
  { id: '1', slug: 'rpa', nome: 'RPA', icone: '🤖', global: true },
  { id: '2', slug: 'sap-s4', nome: 'SAP S/4', icone: null, global: false },
];

describe('slugifyTool', () => {
  it('normaliza acento, maiúscula e espaço', () => {
    expect(slugifyTool('Automação Contábil')).toBe('automacao-contabil');
    expect(slugifyTool('UiPath')).toBe('uipath');
    expect(slugifyTool('  Power   Automate  ')).toBe('power-automate');
  });

  it('descarta pontuação sem deixar traço solto na borda', () => {
    expect(slugifyTool('SAP S/4')).toBe('sap-s-4');
    expect(slugifyTool('...n8n!!!')).toBe('n8n');
  });

  it('devolve string vazia quando não sobra nada de aproveitável', () => {
    expect(slugifyTool('🤖')).toBe('');
    expect(slugifyTool('///')).toBe('');
    expect(slugifyTool('   ')).toBe('');
  });

  it('todo slug não-vazio satisfaz o CHECK do banco', () => {
    const nomes = [
      'RPA',
      'n8n',
      'Databricks',
      'SAP',
      'UiPath',
      'Automação Contábil',
      'SAP S/4',
      '9-to-5 Bot',
      'Ferramenta com um nome absurdamente longo que passa dos quarenta caracteres',
    ];
    for (const n of nomes) {
      const slug = slugifyTool(n);
      expect(slug, `nome: ${n}`).toMatch(SLUG_CHECK);
    }
  });
});

describe('toolLabel / toolIcon', () => {
  it('usa o catálogo quando a ferramenta está nele', () => {
    expect(toolLabel('sap-s4', catalog)).toBe('SAP S/4');
    expect(toolIcon('rpa', catalog)).toBe('🤖');
  });

  it('sem catálogo, cai no fallback do seed global', () => {
    expect(toolLabel('databricks')).toBe('Databricks');
    expect(toolIcon('n8n')).toBe('⚡');
  });

  it('slug desconhecido vira rótulo legível em vez de sumir', () => {
    expect(toolLabel('power-automate')).toBe('Power Automate');
    expect(toolIcon('power-automate')).toBe(DEFAULT_TOOL_ICON);
  });

  it('ferramenta do catálogo sem ícone cai no genérico', () => {
    expect(toolIcon('sap-s4', catalog)).toBe(DEFAULT_TOOL_ICON);
  });
});

describe('normalizeToolSlugs — espelho do trigger sync_opportunity_ferramentas', () => {
  it('minúscula, sem espaço nas bordas, sem repetido, ordenado', () => {
    expect(normalizeToolSlugs([' RPA ', 'n8n', 'rpa'])).toEqual(['n8n', 'rpa']);
  });

  it('descarta entradas vazias', () => {
    expect(normalizeToolSlugs(['', '   ', 'sap'])).toEqual(['sap']);
  });

  it('é idempotente', () => {
    const once = normalizeToolSlugs(['sap', 'rpa', 'rpa']);
    expect(normalizeToolSlugs(once)).toEqual(once);
  });
});

describe('opportunityInputSchema.ferramentas', () => {
  const base = {
    source: 'formulario' as const,
    solicitante: 'Fulano',
    area: 'TI',
    processo: 'Processo qualquer de teste',
    objetivo: 3,
  };

  it('aceita multi-seleção de slugs válidos', () => {
    const r = opportunityInputSchema.safeParse({
      ...base,
      ferramentas: ['rpa', 'n8n', 'sap'],
    });
    expect(r.success).toBe(true);
  });

  it('default é array vazio quando o campo não vem', () => {
    const r = opportunityInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ferramentas).toEqual([]);
  });

  it('rejeita slug fora do formato do catálogo', () => {
    for (const bad of ['RPA', 'sap interno', '-sap', 'sap;drop']) {
      const r = opportunityInputSchema.safeParse({ ...base, ferramentas: [bad] });
      expect(r.success, `deveria rejeitar: ${bad}`).toBe(false);
    }
  });

  it('rejeita acima do teto do CHECK opportunities_ferramentas_chk', () => {
    const demais = Array.from(
      { length: MAX_TOOLS_PER_OPPORTUNITY + 1 },
      (_, i) => `tool${i}`,
    );
    expect(
      opportunityInputSchema.safeParse({ ...base, ferramentas: demais }).success,
    ).toBe(false);
  });
});
