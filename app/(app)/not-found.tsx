import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-5xl mb-3">🔍</div>
        <h2 className="text-lg font-bold text-txt mb-2">
          Não encontramos isso
        </h2>
        <p className="text-sm text-mut mb-5">
          A oportunidade ou página solicitada não existe — pode ter sido
          excluída ou nunca ter existido.
        </p>
        <Link
          href="/opportunities"
          className="inline-block px-4 py-2 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg transition-colors"
        >
          ← Voltar à lista
        </Link>
      </div>
    </div>
  );
}
