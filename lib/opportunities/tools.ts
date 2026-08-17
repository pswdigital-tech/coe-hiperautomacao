/**
 * Catálogo de ferramentas de automação (migration 0055).
 *
 * `opportunities.ferramentas` guarda SLUGS (não nomes): a chave é estável e o
 * rótulo pode ser corrigido depois sem tocar em nenhuma oportunidade. Toda a
 * renderização passa por `toolLabel`/`toolIcon`, que aceitam o catálogo quando
 * ele está disponível e caem num fallback legível quando não está — uma tela
 * que não recebeu o catálogo mostra "Sap Interno" em vez de sumir com o dado.
 *
 * Sem `server-only`: estes helpers são puros e rodam nos dois lados (o seletor
 * do wizard é client component).
 */

/**
 * Uma entrada do catálogo. Nome com sufixo `Option` de propósito: o tipo
 * `AutomationTool` de `./types` é o ENUM LEGADO ('rpa'|'n8n'|'ambos') da coluna
 * derivada — coisa diferente, e confundir os dois é o erro fácil aqui.
 */
export type AutomationToolOption = {
  id: string;
  slug: string;
  nome: string;
  icone: string | null;
  /** `true` = catálogo global da plataforma (tenant_id null na 0055). */
  global: boolean;
};

/** Espelha `opportunities_ferramentas_chk` (cardinality <= 12) da 0055. */
export const MAX_TOOLS_PER_OPPORTUNITY = 12;

/** Espelha `automation_tools_nome_chk` (1..40) da 0055. */
export const MAX_TOOL_NAME_LENGTH = 40;

/**
 * Rótulos das ferramentas-base, para quando a lista não tem o catálogo em mãos
 * (ex: badge da tabela renderizado sem prop). São exatamente os `nome`/`icone`
 * do seed global — se mudarem lá, mudam aqui.
 */
const SEED_FALLBACK: Record<string, { nome: string; icone: string }> = {
  rpa: { nome: 'RPA', icone: '🤖' },
  n8n: { nome: 'n8n', icone: '⚡' },
  databricks: { nome: 'Databricks', icone: '🧱' },
  sap: { nome: 'SAP', icone: '🏢' },
  uipath: { nome: 'UiPath', icone: '🔷' },
};

/** Ícone usado por ferramenta registrada pelo usuário (o seed tem o seu). */
export const DEFAULT_TOOL_ICON = '🛠️';

/**
 * Nome digitado → slug. Mesmas regras do CHECK `automation_tools_slug_chk`:
 * minúsculo, sem acento, `[a-z0-9_-]`, começando por alfanumérico, até 40.
 * Devolve '' quando não sobra nada de aproveitável (ex: nome só com emoji) —
 * o caller trata como entrada inválida.
 */
export function slugifyTool(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  // O CHECK exige alfanumérico no primeiro caractere; o trim de '-' acima já
  // garante isso, mas um nome que vira só '-' cai aqui.
  return /^[a-z0-9]/.test(base) ? base : '';
}

/** Prettify de slug desconhecido: 'sap-interno' → 'Sap Interno'. */
function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function toolLabel(slug: string, catalog?: AutomationToolOption[]): string {
  const found = catalog?.find((t) => t.slug === slug);
  if (found) return found.nome;
  return SEED_FALLBACK[slug]?.nome ?? prettifySlug(slug);
}

export function toolIcon(slug: string, catalog?: AutomationToolOption[]): string {
  const found = catalog?.find((t) => t.slug === slug);
  if (found?.icone) return found.icone;
  return SEED_FALLBACK[slug]?.icone ?? DEFAULT_TOOL_ICON;
}

/**
 * Normalização client-side, espelho do que o trigger
 * `sync_opportunity_ferramentas()` faz no banco: minúsculo, sem vazio, sem
 * repetido, ordenado. Aplicar antes de enviar evita que a tela mostre uma
 * ordem e o banco devolva outra depois do refresh.
 */
export function normalizeToolSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of slugs) {
    const s = raw.trim().toLowerCase();
    if (s) seen.add(s);
  }
  return [...seen].sort();
}
