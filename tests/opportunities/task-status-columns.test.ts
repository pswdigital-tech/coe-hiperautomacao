// =============================================================================
// task-status-columns.test.ts — trava a ORDEM e a completude das colunas do
// Kanban de tarefas (0060 — entrada de `homologacao`).
// -----------------------------------------------------------------------------
// `TASK_STATUS_ORDER` não é uma lista qualquer: é a única fonte da ordem das
// colunas do Kanban, das opções do seletor de status (formulário e card) e da
// rosca de progresso do resumo do detalhe. Uma reordenação acidental (ou um
// status novo esquecido em `TASK_STATUS_META`) não quebra tipo nenhum — só
// aparece torto na tela, ou some. Daí a spec.
//
// Puro: sem React, sem DOM, sem banco.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_META,
  TASK_STATUS_OPTIONS,
} from '@/lib/opportunities/task-labels';
import { taskStatusEnum } from '@/lib/opportunities/task-schema';

describe('TASK_STATUS_ORDER — ordem das colunas do Kanban (0060)', () => {
  it('é exatamente Backlog → Em Andamento → Homologação → Finalizado → Bloqueio', () => {
    expect(TASK_STATUS_ORDER).toEqual([
      'backlog',
      'em_andamento',
      'homologacao',
      'finalizado',
      'bloqueio',
    ]);
  });

  it('homologação vem depois de "em andamento" e antes de "finalizado"', () => {
    const i = (s: string) => TASK_STATUS_ORDER.indexOf(s as never);
    expect(i('em_andamento')).toBeLessThan(i('homologacao'));
    expect(i('homologacao')).toBeLessThan(i('finalizado'));
  });

  it('bloqueio é a última coluna — desvio do fluxo, não etapa dele', () => {
    expect(TASK_STATUS_ORDER[TASK_STATUS_ORDER.length - 1]).toBe('bloqueio');
  });

  it('não tem valor repetido', () => {
    expect(new Set(TASK_STATUS_ORDER).size).toBe(TASK_STATUS_ORDER.length);
  });
});

describe('TASK_STATUS_META / enum — nenhum status fica sem coluna ou sem rótulo', () => {
  it('cobre TODOS os valores do enum de validação, e só eles', () => {
    expect([...TASK_STATUS_ORDER].sort()).toEqual([...taskStatusEnum.options].sort());
  });

  it('todo status da ordem tem rótulo, ícone e cores preenchidos', () => {
    for (const status of TASK_STATUS_ORDER) {
      const meta = TASK_STATUS_META[status];
      expect(meta).toBeDefined();
      expect(meta.status).toBe(status);
      expect(meta.label.trim()).not.toBe('');
      expect(meta.icon.trim()).not.toBe('');
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.bg).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('cores de destaque são distintas entre colunas (a legenda da rosca depende disso)', () => {
    const colors = TASK_STATUS_ORDER.map((s) => TASK_STATUS_META[s].color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('as opções do seletor seguem a MESMA ordem das colunas', () => {
    expect(TASK_STATUS_OPTIONS.map((o) => o.value)).toEqual(TASK_STATUS_ORDER);
  });

  it('Homologação usa o rótulo em pt-BR acentuado', () => {
    expect(TASK_STATUS_META.homologacao.label).toBe('Homologação');
  });
});
