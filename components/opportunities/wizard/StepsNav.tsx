'use client';

import type { StepDef } from './state';

type Props = {
  steps: StepDef[];
  currentIndex: number;
  /** índices já visitados (com sucesso) — permite navegação reversa */
  reachedIndex: number;
  onJump: (index: number) => void;
};

export function StepsNav({ steps, currentIndex, reachedIndex, onJump }: Props) {
  return (
    <div className="bg-bg border-b border-bdr px-5 flex gap-0 overflow-x-auto">
      {steps.map((s, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        const reachable = i <= reachedIndex;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!reachable}
            onClick={() => reachable && onJump(i)}
            className={
              'px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 border-b-2 transition-colors ' +
              (isActive
                ? 'text-pri border-pri bg-wh'
                : isDone
                  ? 'text-emerald-600 dark:text-emerald-400 border-transparent hover:bg-emerald-50/50 dark:hover:bg-emerald-950/40'
                  : 'text-mut border-transparent') +
              (reachable ? ' cursor-pointer' : ' cursor-not-allowed opacity-60')
            }
          >
            <span
              className={
                'w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center ' +
                (isActive
                  ? 'bg-pri text-white'
                  : isDone
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-mut')
              }
            >
              {isDone ? '✓' : i + 1}
            </span>
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
