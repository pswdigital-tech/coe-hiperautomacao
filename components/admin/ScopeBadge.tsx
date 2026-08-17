import { Icon } from '@/components/shell/icons';

// =============================================================================
// ScopeBadge — "em qual empresa estou agindo" (Phase 18, Plan 07, D-R)
// -----------------------------------------------------------------------------
// Componente de servidor: sem estado, sem interatividade — puro eco visual do
// que o seletor de empresa da Sidebar já resolveu. Não é um controle novo.
//
// Só faz sentido quando existe AMBIGUIDADE real a resolver: um `psw_staff` que
// administra mais de uma empresa ao mesmo tempo. Para um `tenant_admin` de
// cliente (uma única empresa possível) ou um `platform_admin` (cujo tenant-alvo
// de admin é sempre o próprio, nunca o selecionado no seletor — Phase 18, Plan
// 06) o chip é ruído: não existe pergunta "qual empresa?" a responder. Por
// isso `multiple` é o único sinalizador que decide a renderização — nunca o
// papel diretamente, para não duplicar a regra em cada call site.
// =============================================================================

type Props = {
  /** Nome da empresa-alvo já resolvida. `null` quando não há nenhuma resolvida
   *  agora (ex.: várias concessões, nenhuma selecionada) — nesse caso o chip
   *  não renderiza nada, porque "Agindo em: —" seria mais confuso que ausente;
   *  o `NoScopeBanner` já cobre esse estado com a explicação certa. */
  tenantName: string | null;
  /** true só quando a pessoa tem mais de uma empresa possível — a única
   *  condição em que o chip deixa de ser ruído (ver cabeçalho do arquivo). */
  multiple: boolean;
};

export function ScopeBadge({ tenantName, multiple }: Props) {
  if (!multiple || !tenantName) return null;

  return (
    <span
      title={`Agindo em: ${tenantName}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg border border-bdr text-[11px] font-bold text-txt max-w-[220px]"
    >
      <Icon.Building className="w-3.5 h-3.5 shrink-0 text-mut" />
      <span className="truncate">Agindo em: {tenantName}</span>
    </span>
  );
}
