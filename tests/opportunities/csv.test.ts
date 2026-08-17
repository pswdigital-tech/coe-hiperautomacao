// =============================================================================
// opportunitiesToCsv — serialização pura (sem DB), formato Excel pt-BR.
// Portado junto com lib/opportunities/csv.ts (origin/feat/v0.3-produtizacao,
// commit 6ce45d1, nunca mesclada) — cobertura de teste nova (o commit original
// não tinha).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { opportunitiesToCsv } from '@/lib/opportunities/csv';

const base = {
  seq_id: 1,
  source: 'formulario',
  request_type: null,
  solicitante: 'Ana',
  email: 'ana@empresa.com',
  area: 'Financeiro',
  subarea: null,
  processo: 'Conciliação',
  frequencia: 'diario',
  volume_medio: null,
  tempo_execucao: null,
  num_pessoas: null,
  ferramenta: 'n8n',
  escopo_automacao: ['Extrair dados', 'Validar; conferir'],
  beneficios_esperados: [],
  esforco: 'medio',
  complexidade: 'baixo',
  tempo: 'diario',
  objetivo: 4,
  fte: 'alto',
  fte_horas: 40,
  score: 79,
  priority_level: 'alta',
  rpa_score: 5,
  status: 'novo',
  responsavel: null,
  fonte: 'formulario',
  tipo_processo: null,
  beneficio_qualitativo: null,
  criterios: null,
  beneficios: null,
  notas: null,
  observacao: 'Contém "aspas" e ; ponto-e-vírgula',
  risco: null,
  criticidade: 'alta',
  azure_boards_codigo: null,
  linguagem: null,
  execucao: null,
  usuarios_servico: null,
  execucoes_mes: null,
  data_conclusao: null,
  data_abertura_coe: null,
  data_fechamento_coe: null,
  ai_enrichment_status: 'enriched',
  ai_enrichment_error: null,
  ai_enriched_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as any;

describe('opportunitiesToCsv', () => {
  it('inclui BOM UTF-8 no início', () => {
    const csv = opportunitiesToCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('emite só o cabeçalho quando a lista está vazia', () => {
    const csv = opportunitiesToCsv([]);
    const lines = csv.replace('﻿', '').split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ID;');
    expect(lines[0]).toContain('Criticidade');
  });

  it('junta arrays com " | " sem escapar (sem ; " ou quebra de linha)', () => {
    const csv = opportunitiesToCsv([{ ...base, escopo_automacao: ['a', 'b'] }]);
    expect(csv).toContain('a | b');
  });

  it('escapa células que contêm ; ou " — aspas duplicadas e envolvidas em aspas', () => {
    const csv = opportunitiesToCsv([base]);
    // observacao tem `"aspas"` e `;` — deve virar "...""aspas""... ; ..."
    expect(csv).toContain('"Contém ""aspas"" e ; ponto-e-vírgula"');
  });

  it('null/undefined viram célula vazia, não a string "null"', () => {
    const csv = opportunitiesToCsv([base]);
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('não recalcula score/priority_level/rpa_score — só lê o que veio da view', () => {
    const csv = opportunitiesToCsv([{ ...base, score: 999, priority_level: 'baixa', rpa_score: 0 }]);
    expect(csv).toContain(';999;');
    expect(csv).toContain(';baixa;');
  });
});
