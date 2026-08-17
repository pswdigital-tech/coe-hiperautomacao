'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

// Abas da área de Proposta: Relatório ↔ Cronograma (Gantt). Preserva ?empresa
// para não derrubar a seleção do admin ao trocar de aba.
const TABS = [
  { label: 'Relatório', href: '/admin/proposta' },
  { label: 'Cronograma', href: '/admin/proposta/gantt' },
];

export function PropostaTabs() {
  const pathname = usePathname();
  const empresa = useSearchParams().get('empresa');

  return (
    <nav className="flex gap-1 border-b border-bdr">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const href = empresa ? `${t.href}?empresa=${encodeURIComponent(empresa)}` : t.href;
        return (
          <Link
            key={t.href}
            href={href}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-mut hover:text-txt'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
