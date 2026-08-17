// =============================================================================
// Tradução do audit_log (0038) para pt-BR — lib/audit/labels.ts.
// Puro: nada aqui toca banco. O que se trava é o contrato de exibição do
// de→para, incluindo o comportamento em valores nulos/vazios (que é o caso em
// que um log mal formatado mente para o auditor: "campo apagado" e "campo
// nunca preenchido" TÊM que ser o mesmo traço).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  fieldLabel,
  tableLabel,
  formatValue,
  formatDateTime,
  recordName,
} from '@/lib/audit/labels';

describe('fieldLabel / tableLabel', () => {
  it('usa o rótulo pt-BR mapeado', () => {
    expect(fieldLabel('fte_horas')).toBe('FTE (h/mês)');
    expect(fieldLabel('azure_boards_codigo')).toBe('Código Azure Boards');
    expect(tableLabel('opportunity_tasks')).toBe('Tarefa');
  });

  // Uma coluna nova entra no log no instante em que a migration roda — antes de
  // alguém lembrar de mapear o rótulo. O fallback é o que impede a tela de
  // exibir "undefined" nesse intervalo.
  it('humaniza coluna/tabela sem rótulo em vez de quebrar', () => {
    expect(fieldLabel('nova_coluna_qualquer')).toBe('Nova coluna qualquer');
    expect(tableLabel('tabela_nova')).toBe('Tabela nova');
  });
});

describe('formatValue', () => {
  it('null, undefined e string vazia colapsam no mesmo traço', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('')).toBe('—');
    expect(formatValue([])).toBe('—');
    expect(formatValue({})).toBe('—');
  });

  it('traduz enum e booleano', () => {
    expect(formatValue('em_analise')).toBe('Refinamento');
    expect(formatValue('tenant_admin')).toBe('Admin da empresa');
    expect(formatValue(true)).toBe('Sim');
    expect(formatValue(false)).toBe('Não');
  });

  it('zero e false NÃO viram traço (são valores, não ausência)', () => {
    expect(formatValue(0)).toBe('0');
    expect(formatValue(false)).toBe('Não');
  });

  it('array vira lista legível; objeto vira contagem, não JSON cru', () => {
    expect(formatValue(['sim', 'nao'])).toBe('Sim, Não');
    expect(formatValue({ a: 1, b: 2 })).toBe('{2 campo(s)}');
  });

  it('data ISO vira pt-BR; texto livre parecido com data não vira Invalid Date', () => {
    expect(formatValue('2026-08-05')).toBe('05/08/2026');
    expect(formatValue('2026-13-45')).toBe('2026-13-45');
    expect(formatValue('Processo de fechamento')).toBe('Processo de fechamento');
  });
});

describe('formatDateTime', () => {
  it('devolve a string original se não for data válida', () => {
    expect(formatDateTime('nao-e-data')).toBe('nao-e-data');
  });
});

describe('recordName', () => {
  // O registro pode já ter sido APAGADO quando o admin lê o log — o nome tem
  // que sair da própria linha logada, nunca de um lookup no banco.
  it('extrai a identificação da linha logada, por tabela', () => {
    expect(recordName('opportunity_tasks', { titulo: 'Revisar contrato' })).toBe(
      'Revisar contrato'
    );
    expect(recordName('opportunities', { processo: 'Fechamento', solicitante: 'Ana' })).toBe(
      'Fechamento'
    );
    // Cai para o próximo candidato quando o primeiro está vazio.
    expect(recordName('opportunities', { processo: '', solicitante: 'Ana' })).toBe('Ana');
  });

  it('trunca nome longo e devolve null quando não há candidato', () => {
    const longo = 'x'.repeat(100);
    expect(recordName('opportunity_tasks', { titulo: longo })).toHaveLength(61); // 60 + reticência
    expect(recordName('opportunity_tasks', {})).toBeNull();
    expect(recordName('opportunity_tasks', null)).toBeNull();
  });
});
