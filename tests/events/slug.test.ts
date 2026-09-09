// =============================================================================
// events/slug — derivação e validação do slug de evento (0066)
// =============================================================================
// Spec PURO (sem DB). `EVENT_SLUG_RE` espelha o CHECK `events_slug_format`;
// `slugifyEventName` tem que produzir algo que o CHECK aceite para qualquer
// nome razoável, e '' (nunca lixo) para nomes sem caractere aproveitável.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVENT_SLUG,
  EVENT_SLUG_MAX,
  EVENT_SLUG_RE,
  isValidEventSlug,
  publicEventPath,
  slugifyEventName,
} from '@/lib/events/slug';

describe('slugifyEventName', () => {
  it('remove acentos, baixa caixa e troca separadores por hífen único', () => {
    expect(slugifyEventName('Workshop Financeiro — Set/2026')).toBe(
      'workshop-financeiro-set-2026',
    );
    expect(slugifyEventName('  Ação   Jurídica!!  ')).toBe('acao-juridica');
  });

  it('nunca produz hífen nas pontas nem hífens duplos', () => {
    const s = slugifyEventName('--Evento -- Teste--');
    expect(s).toBe('evento-teste');
    expect(EVENT_SLUG_RE.test(s)).toBe(true);
  });

  it('respeita o tamanho máximo do CHECK e continua válido depois do corte', () => {
    const s = slugifyEventName('a'.repeat(50) + ' ' + 'b'.repeat(50));
    expect(s.length).toBeLessThanOrEqual(EVENT_SLUG_MAX);
    expect(EVENT_SLUG_RE.test(s)).toBe(true);
  });

  it("devolve '' para nome sem caractere aproveitável (o chamador decide)", () => {
    expect(slugifyEventName('!!! ???')).toBe('');
  });

  it('o slug do evento padrão passa no próprio validador', () => {
    expect(isValidEventSlug(DEFAULT_EVENT_SLUG)).toBe(true);
  });
});

describe('isValidEventSlug', () => {
  it('aceita só [a-z0-9] com hífen simples entre blocos', () => {
    expect(isValidEventSlug('workshop-2026')).toBe(true);
    expect(isValidEventSlug('Workshop')).toBe(false);
    expect(isValidEventSlug('work_shop')).toBe(false);
    expect(isValidEventSlug('-inicio')).toBe(false);
    expect(isValidEventSlug('a--b')).toBe(false);
    expect(isValidEventSlug('')).toBe(false);
  });
});

describe('publicEventPath', () => {
  it('monta /r/<empresa>/<evento> escapando os segmentos', () => {
    expect(publicEventPath('psw', 'workshop-2026')).toBe('/r/psw/workshop-2026');
  });
});
