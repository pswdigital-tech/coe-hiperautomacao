// =============================================================================
// v0.3 — testes puros (sem DB): status.ts, ticket.ts, coe.ts
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  STATUS_ORDER,
  SEGMENTO_STATUSES,
  matchesSegmento,
  STATUS_META,
} from '@/lib/opportunities/status';
import { formatCodigoChamado, isProcessoDuplicado } from '@/lib/opportunities/ticket';
import { tempoAbertoCoe } from '@/lib/opportunities/coe';
import type { Opportunity } from '@/lib/opportunities/types';

describe('status.ts — 11 status', () => {
  it('STATUS_ORDER tem exatamente 11 status únicos', () => {
    expect(STATUS_ORDER).toHaveLength(11);
    expect(new Set(STATUS_ORDER).size).toBe(11);
  });

  it('todo status em STATUS_ORDER tem metadado em STATUS_META', () => {
    for (const s of STATUS_ORDER) {
      expect(STATUS_META[s], `faltou metadado para '${s}'`).toBeDefined();
      expect(STATUS_META[s].label).toBeTruthy();
    }
  });

  it('SEGMENTO_STATUSES cobre os 11 status exatamente uma vez (sem overlap, sem buraco)', () => {
    const all = Object.values(SEGMENTO_STATUSES).flat();
    expect(all).toHaveLength(11);
    expect(new Set(all).size).toBe(11);
    for (const s of STATUS_ORDER) expect(all).toContain(s);
  });

  it('matchesSegmento: "todos" aceita qualquer status', () => {
    for (const s of STATUS_ORDER) expect(matchesSegmento(s, 'todos')).toBe(true);
  });

  it('matchesSegmento: "manutencao" só aceita status manutencao', () => {
    expect(matchesSegmento('manutencao', 'manutencao')).toBe(true);
    expect(matchesSegmento('producao', 'manutencao')).toBe(false);
  });

  it('matchesSegmento: "legado" cobre producao/concluido/descontinuado', () => {
    expect(matchesSegmento('producao', 'legado')).toBe(true);
    expect(matchesSegmento('concluido', 'legado')).toBe(true);
    expect(matchesSegmento('descontinuado', 'legado')).toBe(true);
    expect(matchesSegmento('novo', 'legado')).toBe(false);
  });
});

describe('ticket.ts — Código do Chamado', () => {
  it('formatCodigoChamado zero-pad até 4 dígitos', () => {
    expect(formatCodigoChamado(1)).toBe('CHM-0001');
    expect(formatCodigoChamado(42)).toBe('CHM-0042');
    expect(formatCodigoChamado(12345)).toBe('CHM-12345');
  });

  it('isProcessoDuplicado detecta nomes iguais ignorando acento/caixa', () => {
    const all = [
      { id: 'a', processo: 'Fechamento Contábil' },
      { id: 'b', processo: 'fechamento contabil' },
      { id: 'c', processo: 'Outro processo' },
    ] as Pick<Opportunity, 'id' | 'processo'>[];
    expect(isProcessoDuplicado(all[0], all)).toBe(true);
    expect(isProcessoDuplicado(all[1], all)).toBe(true);
    expect(isProcessoDuplicado(all[2], all)).toBe(false);
  });

  it('isProcessoDuplicado não compara consigo mesmo', () => {
    const all = [{ id: 'a', processo: 'Único' }] as Pick<Opportunity, 'id' | 'processo'>[];
    expect(isProcessoDuplicado(all[0], all)).toBe(false);
  });
});

describe('coe.ts — tempoAbertoCoe', () => {
  it('retorna string vazia sem data de abertura', () => {
    expect(tempoAbertoCoe(null, null)).toBe('');
  });

  it('formata "ficou aberto" quando já fechado', () => {
    const abertura = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 dias atrás
    const fechamento = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 dia atrás
    const r = tempoAbertoCoe(abertura, fechamento);
    expect(r).toMatch(/^ficou aberto /);
  });

  it('formata "aberto há" quando ainda aberto', () => {
    const abertura = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h atrás
    const r = tempoAbertoCoe(abertura, null);
    expect(r).toMatch(/^aberto há /);
  });
});
