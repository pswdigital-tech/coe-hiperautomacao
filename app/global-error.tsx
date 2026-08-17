'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-bg p-8">
        <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-md">
          <div className="text-4xl mb-3">💥</div>
          <h2 className="text-lg font-bold mb-2 text-txt">Erro crítico</h2>
          <p className="text-sm text-mut mb-5">
            Ocorreu um erro inesperado. Recarregue a página.
          </p>
          {error.digest && (
            <div className="text-[10px] text-mut font-mono mb-4">
              ID: {error.digest}
            </div>
          )}
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-lg transition-colors"
          >
            ↻ Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
