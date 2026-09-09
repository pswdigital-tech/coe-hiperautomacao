// =============================================================================
// Esqueletos da área de Oportunidades — usados pelos `loading.tsx` das rotas
// (feedback imediato na navegação, antes de qualquer byte do servidor) e como
// fallback dos <Suspense> das páginas (streaming: cada bloco entra quando os
// dados dele chegam). Mesma ordem e dimensões aproximadas do conteúdo real,
// para a tela não "pular" na troca.
// =============================================================================

const PULSE = 'bg-slate-100 dark:bg-slate-800 animate-pulse rounded';

/** Duas linhas da toolbar: switcher/busca/export e filtros. */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className={`h-10 w-full ${PULSE}`} />
      <div className={`h-9 w-full ${PULSE}`} />
    </div>
  );
}

/** KPI bar + linhas da tabela. */
export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-[76px] ${PULSE}`} />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 bg-wh border border-bdr rounded-lg animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/** Filtro de área + blocos do relatório (valor, matriz, esteira, riscos). */
export function RelatorioSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className={`h-12 w-full ${PULSE}`} />
      <div className={`h-28 w-full ${PULSE}`} />
      <div className="grid md:grid-cols-2 gap-4">
        <div className={`h-64 ${PULSE}`} />
        <div className={`h-64 ${PULSE}`} />
      </div>
      <div className={`h-48 w-full ${PULSE}`} />
      <div className={`h-40 w-full ${PULSE}`} />
    </div>
  );
}
