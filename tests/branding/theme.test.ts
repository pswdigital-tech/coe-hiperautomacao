import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_COLOR,
  brandTokens,
  brandingCss,
  hexToHsl,
  hslToHex,
  isValidHexColor,
  normalizeHexColor,
  readableOn,
} from '@/lib/branding/theme';

describe('validação de hex', () => {
  it('aceita só #rrggbb', () => {
    expect(isValidHexColor('#2341e1')).toBe(true);
    expect(isValidHexColor('#ABC123')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
  });

  it('normaliza para minúsculo e apara espaços', () => {
    expect(normalizeHexColor(' #AABBCC ')).toBe('#aabbcc');
    expect(normalizeHexColor('nope')).toBeNull();
  });
});

describe('round-trip hsl', () => {
  it.each(['#2341e1', '#0f766e', '#ffffff', '#000000', '#808080', '#f59e0b'])(
    'preserva %s',
    (hex) => {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  );
});

describe('brandTokens', () => {
  const tokens = ['--color-primary', '--color-pri', '--color-pril', '--color-nav', '--color-nav-2', '--color-nav-active'];

  it('emite todos os tokens de marca como hex válido nos dois modos', () => {
    for (const mode of ['light', 'dark'] as const) {
      const t = brandTokens('#0f766e', mode);
      for (const k of tokens) {
        expect(isValidHexColor(t[k]), `${mode} ${k}`).toBe(true);
      }
    }
  });

  it('não toca superfícies nem cores semânticas', () => {
    const keys = Object.keys(brandTokens('#0f766e', 'light'));
    for (const forbidden of ['--color-bg', '--color-wh', '--color-txt', '--color-grn', '--color-red']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('a cor de ação fica clara no dark e escura no light', () => {
    const light = hexToHsl(brandTokens('#0b1f6b', 'light')['--color-pril']).l;
    const dark = hexToHsl(brandTokens('#0b1f6b', 'dark')['--color-pril']).l;
    expect(dark).toBeGreaterThan(light);
    // tolerância de 0.5: o arredondamento pra hex de 8 bits move o L um pouco.
    expect(dark).toBeGreaterThanOrEqual(51.5);
  });

  it('escurece cor clara demais no light, pra segurar texto branco', () => {
    // Amarelo puro (l ≈ 50 já, mas lima l=75) não pode virar botão branco-sobre-claro.
    expect(hexToHsl(brandTokens('#fde047', 'light')['--color-pril']).l).toBeLessThanOrEqual(55.5);
  });

  it('navy da sidebar é sempre escuro, em qualquer cor de entrada', () => {
    for (const c of ['#fde047', '#ffffff', '#0f766e', '#000000']) {
      expect(hexToHsl(brandTokens(c, 'light')['--color-nav']).l).toBeLessThanOrEqual(20);
      expect(hexToHsl(brandTokens(c, 'dark')['--color-nav']).l).toBeLessThanOrEqual(15);
    }
  });

  it('mantém a matiz da marca', () => {
    const h = hexToHsl('#0f766e').h;
    expect(Math.abs(hexToHsl(brandTokens('#0f766e', 'light')['--color-nav']).h - h)).toBeLessThan(2);
  });
});

describe('readableOn', () => {
  it('escolhe branco em fundo escuro e navy em fundo claro', () => {
    expect(readableOn('#0f172a')).toBe('#ffffff');
    expect(readableOn('#fde047')).toBe('#0f172a');
  });
});

describe('brandingCss', () => {
  it('não emite nada sem cor, com cor inválida ou com o padrão PSW', () => {
    expect(brandingCss(null)).toBe('');
    expect(brandingCss('roxo')).toBe('');
    expect(brandingCss(DEFAULT_BRAND_COLOR)).toBe('');
  });

  it('emite bloco light e dark com especificidade acima do globals.css', () => {
    const css = brandingCss('#0f766e');
    expect(css).toContain(':root:root{');
    expect(css).toContain('.dark:root{');
    expect(css).toContain('--color-nav-active:');
  });
});
