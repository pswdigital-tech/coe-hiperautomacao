import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-8">
      <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-5xl mb-3">🔍</div>
        <h2 className="text-lg font-bold text-txt mb-2">Link inválido</h2>
        <p className="text-sm text-mut mb-5">
          Este link de formulário não corresponde a nenhuma empresa ativa. Verifique
          se você acessou a URL correta.
        </p>
        <Link
          href="/"
          className="inline-block text-[12px] text-pri hover:text-pril font-semibold"
        >
          Ir para a página inicial →
        </Link>
      </div>
    </main>
  );
}
