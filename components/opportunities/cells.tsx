import type { Opportunity } from '@/lib/opportunities/types';
import { rpaTier } from '@/lib/opportunities/cells';
import { STATUS_META } from '@/lib/opportunities/status';
import {
  toolIcon,
  toolLabel,
  type AutomationToolOption,
} from '@/lib/opportunities/tools';

// rpaTier (fn pura, _giba:520-525) vive em lib/opportunities/cells.ts — fonte
// única importável também pelos specs puros. Reexportado aqui para os consumidores
// de UI (tabela/kanban) que já importam de './cells'.
export { rpaTier };

// =============================================================================
// SourceBadge — persona / formulario
// =============================================================================
const SOURCE_LABEL = {
  persona: 'Persona',
  formulario: 'Formulário',
} as const;

export function SourceBadge({ source }: { source: Opportunity['source'] }) {
  const isPersona = source === 'persona';
  return (
    <span
      className={
        'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ' +
        (isPersona
          ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300')
      }
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

// =============================================================================
// ToolBadges — uma pílula por ferramenta de `opportunities.ferramentas` (0055)
// -----------------------------------------------------------------------------
// RPA e n8n mantêm as cores de marca do mockup (`--color-rpa`/`--color-n8n`);
// o resto do catálogo cai numa pílula neutra. O `catalog` é opcional de
// propósito: sem ele o rótulo vem do fallback de `lib/opportunities/tools.ts`,
// que cobre o seed e prettifica slug desconhecido — nenhuma tela fica sem o
// dado só por não ter recebido a lista.
// =============================================================================
const TOOL_PILL: Record<string, string> = {
  rpa: 'bg-violet-100 dark:bg-violet-900/40 text-rpa',
  n8n: 'bg-orange-50 dark:bg-orange-950/40 text-n8n',
};
const TOOL_PILL_DEFAULT =
  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

export function ToolBadges({
  tools,
  catalog,
}: {
  tools: Opportunity['ferramentas'] | null;
  catalog?: AutomationToolOption[];
}) {
  const list = tools ?? [];
  if (list.length === 0) return <span className="text-mut text-xs">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {list.map((slug) => (
        <span
          key={slug}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
            TOOL_PILL[slug] ?? TOOL_PILL_DEFAULT
          }`}
        >
          {toolIcon(slug, catalog)} {toolLabel(slug, catalog)}
        </span>
      ))}
    </span>
  );
}

// =============================================================================
// StatusBadge — 11 status com cor+ícone (fonte única: lib/opportunities/status.ts)
// -----------------------------------------------------------------------------
// STATUS_META.bg/color continuam hex puro (consumidos via style por
// kanban/Column.tsx, que precisa compor tinta translúcida `${color}15` — não dá
// pra expressar isso em className). Aqui, badge pill isolado, className com
// dark: funciona e evita o par pastel ficar sem contraste em fundo escuro.
// =============================================================================
const STATUS_BADGE_CLASS: Record<Opportunity['status'], string> = {
  novo: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  em_analise: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  planejamento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  backlog: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  desenvolvimento: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  homologacao: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  producao: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  concluido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  gestao: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  manutencao: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  descontinuado: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function StatusBadge({ status }: { status: Opportunity['status'] }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE_CLASS[status]}`}
    >
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

// =============================================================================
// ComplexityBadge — baixo / medio / alto
// =============================================================================
const COMPLEX_MAP = {
  baixo: { label: 'Baixa', bg: 'bg-green-100 dark:bg-green-900/40', fg: 'text-green-800 dark:text-green-300' },
  medio: { label: 'Média', bg: 'bg-yellow-100 dark:bg-yellow-900/40', fg: 'text-yellow-900 dark:text-yellow-200' },
  alto: { label: 'Alta', bg: 'bg-red-100 dark:bg-red-900/40', fg: 'text-red-800 dark:text-red-300' },
} as const;

export function ComplexityBadge({ value }: { value: Opportunity['complexidade'] }) {
  if (!value) return <span className="text-mut text-xs">—</span>;
  const m = COMPLEX_MAP[value];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${m.bg} ${m.fg}`}
    >
      {m.label}
    </span>
  );
}

// =============================================================================
// RpaFitBadge — badge por faixa de rpa_score (D-05 / _giba:520-525)
//   rs >= 5 → ⭐ RPA Ideal (n/6)   (âmbar)
//   rs >= 3 → ✓  RPA+n8n (n/6)     (índigo)
//   else    → n8n (n/6)            (cinza)
// Reusa rpaTier (lib/opportunities/cells — fonte única do rótulo/ícone) e
// mapeia o tom da faixa para as cores inline do mockup.
// =============================================================================
function rpaColors(rs: number): string {
  if (rs >= 5) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  if (rs >= 3) return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

export function RpaFitBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-mut text-xs">—</span>;
  const tier = rpaTier(score);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${rpaColors(score)}`}
    >
      {tier.icon ? `${tier.icon} ` : ''}
      {tier.label}
    </span>
  );
}

// =============================================================================
// FteCell — FTE em h/mês (D-05). null → travessão.
// =============================================================================
export function FteCell({ fte }: { fte: number | null }) {
  if (fte == null) return <span className="text-mut text-xs">—</span>;
  return <span className="text-[12px] tabular-nums">{Math.round(fte)}h</span>;
}

// =============================================================================
// ScoreDisplay — número + dot colorido (>=70 verde, >=40 amarelo, <40 vermelho)
// =============================================================================
function scoreColor(s: number) {
  if (s >= 70) return 'var(--color-grn)';
  if (s >= 40) return 'var(--color-yel)';
  return 'var(--color-red)';
}

export function ScoreDisplay({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: scoreColor(score) }}
      />
      <span
        className="text-sm font-extrabold tabular-nums"
        style={{ color: scoreColor(score) }}
      >
        {score}
      </span>
    </div>
  );
}

// =============================================================================
// PriorityPill — alta / media / baixa
// =============================================================================
const PRIORITY_MAP = {
  alta: { label: 'Alta', bg: 'bg-green-500', fg: 'text-white' },
  media: { label: 'Média', bg: 'bg-amber-500', fg: 'text-white' },
  baixa: { label: 'Baixa', bg: 'bg-red-500', fg: 'text-white' },
} as const;

export function PriorityPill({ level }: { level: Opportunity['priority_level'] }) {
  const m = PRIORITY_MAP[level];
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${m.bg} ${m.fg}`}
    >
      {m.label}
    </span>
  );
}

// =============================================================================
// CriticidadeBadge — baixa / media / alta / critica (v0.3, separada do Score)
// =============================================================================
const CRITICIDADE_MAP = {
  baixa: { label: 'Baixa', icon: '🟢', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  media: { label: 'Média', icon: '🟡', cls: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200' },
  alta: { label: 'Alta', icon: '🟠', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  critica: { label: 'Crítica', icon: '🔴', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
} as const;

export function CriticidadeBadge({ value }: { value: Opportunity['criticidade'] }) {
  if (!value) return <span className="text-mut text-xs">—</span>;
  const m = CRITICIDADE_MAP[value];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.cls}`}
    >
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

// =============================================================================
// CodigoChamadoDisplay — "CHM-0001" derivado do seq_id por tenant (v0.3)
// -----------------------------------------------------------------------------
// Fonte única em lib/opportunities/ticket.ts (formatCodigoChamado) — reexportado
// aqui só para os consumidores de UI que já importam badges/cells daqui.
// =============================================================================
export { formatCodigoChamado } from '@/lib/opportunities/ticket';

// =============================================================================
// SeqIdDisplay — #0001 zero-padded
// =============================================================================
export function SeqIdDisplay({ seqId }: { seqId: number }) {
  return (
    <span className="font-extrabold text-[11px] text-pri tracking-wider">
      #{String(seqId).padStart(4, '0')}
    </span>
  );
}
