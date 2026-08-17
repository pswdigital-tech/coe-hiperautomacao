export default function Loading() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-1 bg-pri/30 overflow-hidden">
        <div className="h-full w-1/3 bg-pri animate-pulse" />
      </div>
      <div className="p-6 text-mut text-sm">
        <span className="sr-only">Carregando…</span>
        Carregando…
      </div>
    </div>
  );
}
