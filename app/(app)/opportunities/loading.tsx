import { ListSkeleton, ToolbarSkeleton } from '@/components/opportunities/skeletons';

/**
 * Esqueleto da listagem — mesmo layout da página (header → toolbar → KPIs →
 * linhas), para a tela não "pular" quando o conteúdo real chega. As peças são
 * as mesmas que a página usa como fallback dos seus <Suspense>.
 */
export default function Loading() {
  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">
          Oportunidades
        </h1>
        <p className="text-[13px] text-mut mt-0.5">
          Gerencie e acompanhe todas as oportunidades de automação
        </p>
      </header>
      <ToolbarSkeleton />
      <ListSkeleton />
    </div>
  );
}
