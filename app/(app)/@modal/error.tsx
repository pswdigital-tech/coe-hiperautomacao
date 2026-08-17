'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Error boundary do slot paralelo @modal. Sem este arquivo, um erro dentro do
 * modal interceptado (wizard) escapa do (app)/error.tsx — que só cobre o slot
 * `children` — e estoura direto no global-error.tsx ("Erro crítico").
 */
export default function ModalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-8">
      <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="text-lg font-bold text-txt mb-2">Algo deu errado</h2>
        <p className="text-sm text-mut mb-5">
          Ocorreu um erro neste formulário. Sua sessão pode ter expirado —
          tente novamente ou recarregue a página.
        </p>
        {error.digest && (
          <div className="text-[10px] text-mut font-mono mb-4">
            ID: {error.digest}
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-bdr text-txt text-sm font-bold rounded-lg hover:bg-bg transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg transition-colors"
          >
            ↻ Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
