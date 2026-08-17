'use client';

import type { TabDef, TabId } from './types';

type Props = {
  tabs: TabDef[];
  activeTab: TabId;
  onChange: (id: TabId) => void;
  /** `vertical` = rail lateral (detail fullscreen); `horizontal` = barra de abas. */
  orientation?: 'horizontal' | 'vertical';
};

export function TabsNav({
  tabs,
  activeTab,
  onChange,
  orientation = 'horizontal',
}: Props) {
  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col gap-0.5">
        {tabs.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => onChange(t.id)}
              className={
                'flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold text-left transition-colors ' +
                (isActive
                  ? 'bg-pri text-white'
                  : 'text-mut hover:bg-slate-100 dark:hover:bg-slate-800')
              }
            >
              <span className="w-4 text-center">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex border-b border-bdr bg-bg overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.id === activeTab;
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onChange(t.id)}
            className={
              'px-3.5 py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-colors ' +
              (isActive
                ? 'text-pri border-pri bg-wh'
                : 'text-mut border-transparent hover:bg-slate-100 dark:hover:bg-slate-800')
            }
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
