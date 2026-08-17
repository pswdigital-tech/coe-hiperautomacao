'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon } from './icons';
import { CompanySelector } from './CompanySelector';
import { ThemeToggle } from './ThemeToggle';
import { getLastListUrl } from '@/lib/opportunities/filters-storage';
import type { TenantRole } from '@/lib/database.types';

const RAIL_WIDTH = 'w-16'; // recolhida — só ícones
const PANEL_WIDTH = 'w-60'; // expandida — ícones + rótulos

type SidebarProfile = {
  fullName: string | null;
  email: string;
  role: TenantRole;
  tenantName: string | null;
};

type Tenant = { slug: string; name: string };

type NavItem = {
  label: string;
  href: string;
  icon: (p: { className?: string }) => React.ReactElement;
  isActive: (pathname: string, view: string | null) => boolean;
};

const NAV: NavItem[] = [
  {
    label: 'Oportunidades',
    href: '/opportunities',
    icon: Icon.Opportunities,
    // `/opportunities/register` tem item PRÓPRIO (abaixo) — sem esta exclusão
    // os dois acenderiam ao mesmo tempo.
    isActive: (p, view) =>
      p.startsWith('/opportunities') &&
      !p.startsWith('/opportunities/register') &&
      view !== 'relatorio',
  },
  {
    label: 'Relatórios',
    href: '/opportunities?view=relatorio',
    icon: Icon.Reports,
    isActive: (p, view) => p.startsWith('/opportunities') && view === 'relatorio',
  },
];

// Registro em nome de uma empresa cliente (0051) — só para quem é da PSW
// (`platform_admin` ou `psw_staff`), gateado pelo sinalizador
// `canRegisterForTenant`, calculado no servidor. Fica junto do bloco principal
// (e não em Administração): é trabalho de pipeline, não de configuração.
const REGISTER_NAV: NavItem = {
  label: 'Registrar Oportunidade',
  href: '/opportunities/register',
  icon: Icon.NewOpportunity,
  isActive: (p) => p.startsWith('/opportunities/register'),
};

const ADMIN_NAV: NavItem[] = [
  {
    label: 'Proposta',
    href: '/admin/proposta',
    icon: Icon.Proposal,
    isActive: (p) => p.startsWith('/admin/proposta'),
  },
  {
    label: 'Convites',
    href: '/admin/invites',
    icon: Icon.Invites,
    isActive: (p) => p.startsWith('/admin/invites'),
  },
  // Tela de concessão pessoa × empresa (Phase 18, Plan 04) — só o super-admin
  // concede/revoga admin de tenant a um `psw_staff` (GRANT-09/SC-9).
  {
    label: 'Staff PSW',
    href: '/admin/staff',
    icon: Icon.Building,
    isActive: (p) => p.startsWith('/admin/staff'),
  },
  // Mesma rota do tenant_admin — o que muda é o alcance, resolvido pela RLS:
  // aqui o super-admin vê todas as empresas e ganha o seletor de empresa.
  {
    label: 'Rastreabilidade',
    href: '/logs',
    icon: Icon.Audit,
    isActive: (p) => p.startsWith('/logs'),
  },
  // A tela é a mesma do tenant_admin e age sobre o tenant do PRÓPRIO usuário —
  // o super-admin não pinta a empresa alheia daqui.
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Icon.Settings,
    isActive: (p) => p.startsWith('/configuracoes'),
  },
];

// Admin da PRÓPRIA empresa (v0.4) — não confundir com ADMIN_NAV, que é do
// super-admin de plataforma (PSW) e cruza tenants. A partir da Phase 18
// (Plan 08) este bloco também é oferecido a um `psw_staff` que administra ao
// menos uma empresa (concessão em `psw_tenant_admins`) — o gate é o
// sinalizador `canAdminister`, calculado no servidor (ver componente abaixo),
// nunca um teste de papel isolado feito aqui no client.
const TENANT_ADMIN_NAV: NavItem[] = [
  {
    label: 'Equipe',
    href: '/team',
    icon: Icon.Invites,
    isActive: (p) => p.startsWith('/team'),
  },
  {
    label: 'Rastreabilidade',
    href: '/logs',
    icon: Icon.Audit,
    isActive: (p) => p.startsWith('/logs'),
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Icon.Settings,
    isActive: (p) => p.startsWith('/configuracoes'),
  },
];

function initials(name: string | null, email: string): string {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const roleLabel: Record<TenantRole, string> = {
  platform_admin: 'Administrador',
  tenant_admin: 'Admin da empresa',
  member: 'Membro',
  viewer: 'Somente leitura',
  psw_staff: 'Staff PSW',
};

export function Sidebar({
  profile,
  tenants,
  canAdminister,
  canRegisterForTenant = false,
  logoUrl,
  selectedEmpresa = '',
}: {
  profile: SidebarProfile;
  tenants: Tenant[];
  /**
   * "É da PSW e pode registrar oportunidade em nome de um cliente" —
   * `platform_admin` ou `psw_staff` (0051). Como `canAdminister`, é resolvido
   * no servidor; a Sidebar só desenha. Gateia o item Registrar Oportunidade.
   */
  canRegisterForTenant?: boolean;
  /**
   * "Administra ao menos uma empresa" — calculado no servidor, uma camada
   * acima (app/(app)/layout.tsx): `tenant_admin` de cliente (sempre a própria
   * empresa) OU `psw_staff` com concessão em `psw_tenant_admins`. A Sidebar
   * (client component) não consulta concessão por conta própria — só recebe
   * o resultado já resolvido. Gateia Equipe, Configurações e Logs.
   */
  canAdminister: boolean;
  /** Empresa lembrada no cookie — vale quando a URL não traz `?empresa=`. */
  selectedEmpresa?: string;
  /** Logo da empresa (/configuracoes). null → identidade PSW padrão. */
  logoUrl?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const empresa = searchParams.get('empresa') ?? selectedEmpresa;
  const isAdmin = profile.role === 'platform_admin';
  const [expanded, setExpanded] = useState(false);

  const label = (text: string) => (
    <span
      className={`whitespace-nowrap transition-opacity duration-150 ${
        expanded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {text}
    </span>
  );

  const renderItem = (item: NavItem) => {
    const active = item.isActive(pathname, view);
    const I = item.icon;
    // Preserva a empresa selecionada ao navegar entre abas admin — o relatório
    // de proposta depende de ?empresa=<slug>, e perder a seleção derruba pro
    // empty state.
    const href =
      empresa && item.href.startsWith('/admin')
        ? `${item.href}?empresa=${encodeURIComponent(empresa)}`
        : item.href;
    // "Oportunidades" (só este item — "Relatórios" tem href próprio) volta pra
    // onde a pessoa deixou a lista (view + filtros), não pra `/opportunities`
    // crua. Memória lida do sessionStorage (filters-storage.ts), gravada pelo
    // Toolbar a cada mudança de filtro/view.
    function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
      if (item.href !== '/opportunities') return;
      const stored = getLastListUrl();
      if (stored && stored !== '/opportunities') {
        e.preventDefault();
        router.push(stored);
      }
    }
    return (
      <Link
        key={item.label}
        href={href}
        onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors ${
          active
            ? 'bg-nav-active text-white font-semibold'
            : 'text-nav-fg hover:bg-white/5'
        }`}
      >
        <I className="w-[18px] h-[18px] shrink-0" />
        {label(item.label)}
      </Link>
    );
  };

  return (
    <>
      {/* Reserva o espaço da rail recolhida no layout — o painel expandido
          flutua por cima (fixed) sem empurrar o conteúdo. */}
      <div className={`${RAIL_WIDTH} shrink-0 h-screen`} aria-hidden="true" />

      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`fixed left-0 top-0 z-40 h-screen flex flex-col bg-gradient-to-b from-nav-2 to-nav text-nav-fg overflow-hidden transition-[width] duration-200 ease-in-out ${
          expanded ? `${PANEL_WIDTH} shadow-2xl` : RAIL_WIDTH
        }`}
      >
        {/* Conteúdo interno com largura fixa (w-60) — a rail só recorta a
            largura visível via overflow-hidden acima, então nada reflow. */}
        <div className="w-60 flex flex-col h-full shrink-0">
          {/* Logo — a da empresa quando configurada, senão a da PSW */}
          <div className="px-5 py-5 flex items-center gap-2.5">
            {logoUrl ? (
              // Sem moldura branca: a logo da empresa preenche a caixa toda e
              // fica direto sobre o navy. Quem envia PNG transparente não quer
              // um quadrado branco em volta; quem envia PNG com fundo próprio
              // já traz o seu. `object-contain` preserva a proporção.
              // <img> e não next/image: a URL vem do Storage do tenant (host
              // dinâmico), não vale configurar remotePatterns por uma logo.
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt={profile.tenantName ?? 'Logo da empresa'}
                className="w-9 h-9 rounded-lg object-contain shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
                <Image src="/brand/psw-icone.png" alt="PSW Digital" width={22} height={22} />
              </div>
            )}
            <div className="leading-tight">
              <div className="text-white font-bold text-[15px] tracking-tight truncate">
                {logoUrl ? (
                  label(profile.tenantName ?? 'CoE')
                ) : (
                  <>
                    {label('PSW ')}
                    <span
                      className={`font-light transition-opacity duration-150 ${
                        expanded ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      DIGITAL
                    </span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-nav-muted">{label('CoE Hiperautomação')}</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-2 flex flex-col gap-1 overflow-y-auto">
            {NAV.map(renderItem)}
            {canRegisterForTenant && renderItem(REGISTER_NAV)}
            {isAdmin && (
              <>
                <div className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-nav-muted">
                  {label('Administração')}
                </div>
                {ADMIN_NAV.map(renderItem)}
              </>
            )}
            {canAdminister && (
              <>
                <div className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-nav-muted">
                  {label('Administração')}
                </div>
                {TENANT_ADMIN_NAV.map(renderItem)}
              </>
            )}
          </nav>

          {/* Seletor de empresa — super-admin (carteira inteira) ou
              staff-admin que administra ao menos uma empresa (lista
              recortada, resolvida uma camada acima); só quando expandida. */}
          {(isAdmin || canAdminister) && expanded && tenants.length > 0 && (
            <div className="border-t border-white/10">
              <CompanySelector tenants={tenants} selected={selectedEmpresa} />
            </div>
          )}

          {/* Usuário + logout */}
          <div className="border-t border-white/10 p-3 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-nav-active flex items-center justify-center text-white text-[12px] font-bold shrink-0">
              {initials(profile.fullName, profile.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-[13px] font-semibold truncate">
                {label(profile.fullName ?? profile.email)}
              </div>
              <div className="text-[11px] text-nav-muted truncate">
                {label(
                  `${profile.tenantName ? `${profile.tenantName} · ` : ''}${roleLabel[profile.role]}`,
                )}
              </div>
            </div>
            <ThemeToggle className="p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5 transition-colors shrink-0" />
            <form action="/logout" method="post">
              <button
                type="submit"
                title="Sair"
                aria-label="Sair"
                className="p-2 rounded-lg text-nav-muted hover:text-white hover:bg-white/5 transition-colors shrink-0"
              >
                <Icon.Logout className="w-[18px] h-[18px]" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
