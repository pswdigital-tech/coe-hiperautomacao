// =============================================================================
// branding/theme.ts — UMA cor no banco → paleta de marca completa, em CSS
// -----------------------------------------------------------------------------
// O app consome cor por token (`bg-primary`, `bg-nav`, `text-pri`, …) definidos
// em app/globals.css via @theme do Tailwind v4 — ou seja, custom properties em
// :root. Isso deixa o tema trocável em runtime sem rebuild: basta redeclarar as
// mesmas variáveis depois, com mais especificidade.
//
// Só `brand_color` é persistido. Todos os tons (hover, navy da sidebar, item
// ativo) são DERIVADOS aqui — mesma razão pela qual o score não é persistido:
// se a regra de derivação mudar, ninguém precisa migrar dados.
//
// DARK MODE: a cor da marca vale nos dois temas, mas não com a mesma
// luminosidade — um azul escuro que funciona sobre #f8fafc desaparece sobre
// #0b1220. Por isso emitimos DOIS blocos: `:root` (light) e `.dark` (o mesmo
// seletor que globals.css usa, controlado pelo ThemeToggle).
//
// Módulo puro (sem 'server-only'): roda no servidor pra montar o <style> e é
// testado em tests/branding/theme.test.ts.
// =============================================================================

export const DEFAULT_BRAND_COLOR = '#2341e1'; // PSW azul vivo (--color-primary)

type Hsl = { h: number; s: number; l: number };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Valida hex '#rrggbb' — espelha o CHECK `tenants_brand_color_hex` (0033). */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Normaliza para '#rrggbb' minúsculo, ou null se não for hex válido. */
export function normalizeHexColor(value: unknown): string | null {
  return isValidHexColor(value) ? value.trim().toLowerCase() : null;
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: ((h * 60) % 360 + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];

  const m = ln - c / 2;
  const to = (v: number) =>
    Math.round(clamp((v + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, '0');

  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Mesma matiz/saturação, luminosidade fixada (com piso de saturação). */
function shade(base: Hsl, l: number, minS = 0): string {
  return hslToHex({ h: base.h, s: Math.max(base.s, minS), l });
}

/**
 * Luminância relativa (WCAG) — usada só pra decidir texto branco vs. escuro
 * sobre a cor da marca. Cor clara (amarelo, lima) com texto branco é ilegível.
 */
function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

/** Cor de texto legível sobre um fundo — branco ou o navy de texto do app. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#0f172a' : '#ffffff';
}

/**
 * Tokens de marca para um tema. `mode` muda as faixas de luminosidade:
 *  - light: cor de ação escurecida o suficiente pra segurar texto branco;
 *  - dark: clareada, pra não sumir sobre #0b1220.
 * Só tokens de MARCA — superfícies (bg/wh/txt/mut/bdr) e semânticas
 * (grn/yel/red/rpa/n8n/both) continuam sob controle de globals.css.
 */
export function brandTokens(
  color: string,
  mode: 'light' | 'dark'
): Record<string, string> {
  const base = hexToHsl(color);
  // Cinza puro não tem matiz pra derivar navy — dá um mínimo de saturação.
  const minS = base.s < 8 ? 0 : 25;

  const action =
    mode === 'light'
      ? shade(base, clamp(base.l, 32, 55))
      : shade(base, clamp(base.l, 52, 72));

  return {
    '--color-primary': action,
    '--color-primary-hover': shade(base, hexToHsl(action).l + (mode === 'light' ? -8 : 8)),

    // legado (login, links `text-pri`): `pri` é o tom profundo, `pril` o vivo
    '--color-pri': mode === 'light' ? shade(base, clamp(base.l - 12, 26, 46)) : action,
    '--color-pril': action,

    // sidebar — gradiente nav-2 (topo) → nav (base) + item ativo
    '--color-nav': shade(base, mode === 'light' ? 19 : 14, minS),
    '--color-nav-2': shade(base, mode === 'light' ? 33 : 26, minS),
    '--color-nav-active': action,
  };
}

function block(selector: string, tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `${selector}{${body}}`;
}

/**
 * CSS pronto pra injetar num <style> no layout. Retorna '' quando a empresa
 * não escolheu cor (ou o valor no banco é inválido) — nesse caso globals.css
 * fica no comando, sem nenhum override.
 *
 * O seletor `:root:root` sobe a especificidade acima do `:root` de globals.css
 * sem precisar de !important; `.dark:root` faz o mesmo pelo bloco dark. Assim a
 * ordem de injeção do <style> vs. o CSS da build deixa de importar.
 */
export function brandingCss(color: string | null | undefined): string {
  const hex = normalizeHexColor(color);
  if (!hex || hex === DEFAULT_BRAND_COLOR) return '';
  return (
    block(':root:root', brandTokens(hex, 'light')) +
    block('.dark:root', brandTokens(hex, 'dark'))
  );
}
