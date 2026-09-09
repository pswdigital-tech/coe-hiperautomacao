import { RelatorioSkeleton } from '@/components/opportunities/skeletons';

/**
 * Esqueleto do relatório — aparece no clique, antes de qualquer byte do
 * servidor. Sem este arquivo a rota caía no esqueleto da LISTAGEM
 * (`../loading.tsx`, que cobre os segmentos filhos), com a forma errada.
 */
export default function Loading() {
  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">
          Relatórios
        </h1>
        <p className="text-[13px] text-mut mt-0.5">
          Visão estratégica do portfólio — valor, priorização, esteira e riscos
        </p>
      </header>
      <RelatorioSkeleton />
    </div>
  );
}
