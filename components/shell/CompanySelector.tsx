'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon } from './icons';
import { getListUrlForCompany } from '@/lib/opportunities/filters-storage';

type Tenant = { slug: string; name: string };

/**
 * Seletor de empresa — só para platform_admin. "Todas as empresas" mostra o
 * portfólio consolidado (RLS cross-tenant); escolher uma empresa adiciona
 * `?empresa=<slug>` — SLUG legível na URL, nunca o UUID. O server resolve para
 * tenant_id.
 */
export function CompanySelector({
  tenants,
  selected = '',
}: {
  tenants: Tenant[];
  /** Slug lembrado no cookie — usado quando a URL não traz `?empresa=`. */
  selected?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('empresa') ?? selected;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    // Cookie = memória da escolha: sobrevive a redirects/refresh que perdem a
    // query string. "Todas as empresas" (value vazio) apaga o cookie.
    document.cookie = value
      ? `coe_empresa=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
      : 'coe_empresa=; path=/; max-age=0; samesite=lax';

    // Trocar de empresa dentro de Oportunidades (lista OU detalhe) restaura os
    // FILTROS PRÓPRIOS daquela empresa (memória isolada por empresa em
    // filters-storage.ts) em vez de herdar os filtros da empresa anterior —
    // staff PSW reclamou que via os filtros "vazarem" de uma empresa pra
    // outra. Nas demais páginas (Admin, Configurações...) o comportamento
    // continua o de sempre: só troca `?empresa=` mantendo o resto da URL.
    if (pathname.startsWith('/opportunities')) {
      const stored = getListUrlForCompany(value);
      const target =
        stored ?? (value ? `/opportunities?empresa=${encodeURIComponent(value)}` : '/opportunities');
      router.push(target);
      router.refresh();
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('empresa', value);
    else params.delete('empresa');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className="px-3 py-3">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-nav-muted mb-1.5 px-1">
        Empresa
      </label>
      <div className="relative">
        <select
          value={current}
          onChange={onChange}
          className="w-full appearance-none bg-nav-active text-white text-[13px] font-medium rounded-lg pl-3 pr-8 py-2 border border-white/10 focus:outline-none focus:border-white/30 cursor-pointer"
        >
          <option value="">Todas as empresas</option>
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <Icon.Chevron className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-nav-muted" />
      </div>
    </div>
  );
}
