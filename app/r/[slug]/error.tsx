'use client';

import { useEffect } from 'react';

/**
 * Error boundary do formulário público. Sem este arquivo, qualquer erro em
 * /r/[slug] cai no global-error.tsx ("Erro crítico") — péssimo para um
 * visitante anônimo que estava preenchendo o form.
 */
export default function PublicFormError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="text-lg font-bold text-txt mb-2">Algo deu errado</h2>
        <p className="text-sm text-mut mb-5">
          Ocorreu um erro ao carregar o formulário. Tente novamente — suas
          informações podem precisar ser preenchidas de novo.
        </p>
        {error.digest && (
          <div className="text-[10px] text-mut font-mono mb-4">
            ID: {error.digest}
          </div>
        )}
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg transition-colors"
        >
          ↻ Tentar novamente
        </button>
      </div>
    </main>
  );
}
