export default function Loading() {
  return (
    <div className="flex flex-col min-h-full">
      {/* KPI bar skeleton */}
      <div className="bg-wh border-b border-bdr px-6 py-2.5 flex gap-4 items-center overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded"
          />
        ))}
      </div>
      {/* Toolbar skeleton (2 linhas) */}
      <div className="bg-wh border-b border-bdr px-6 py-2 flex flex-col gap-2">
        <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
        <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
      </div>
      {/* Table skeleton */}
      <div className="px-6 py-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-10 bg-wh border border-bdr rounded animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
