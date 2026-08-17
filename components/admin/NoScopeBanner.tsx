// =============================================================================
// NoScopeBanner — aviso de escrita desabilitada (Phase 18, Plan 07, D-R)
// -----------------------------------------------------------------------------
// Por que existe: a partir desta fase, o seletor de empresa da Sidebar é o
// CONTEXTO DE ESCRITA das telas de admin (Equipe, Configurações, Logs,
// Convites). Quando ele resolve para "Todas as empresas" (ou não resolve para
// nenhuma concessão do staff-admin), não existe um tenant-alvo definido —
// escrever nesse estado seria gravar num tenant ADIVINHADO.
//
// Por que os controles ficam DESABILITADOS e VISÍVEIS, nunca escondidos:
// esconder sugeriria que a funcionalidade não existe; desabilitado com
// explicação diz a verdade — falta escolher a empresa. A leitura (tabela/
// lista) continua visível normalmente quando houver o que mostrar.
//
// Este aviso NÃO é autorização. O servidor valida o tenant-alvo contra a
// concessão de qualquer forma (`resolveAdminTenantId`/`isTenantAdminOf`,
// Phase 18 Plan 06) — a interface só evita o clique inútil. Se alguém forçar
// o envio de um formulário desabilitado, a Server Action nega com
// `ADMIN_SCOPE_DENIED_MESSAGE` do mesmo jeito.
//
// Texto fixo, sem interpolação (§Copywriting Contract do 18-UI-SPEC.md) — não
// há transbordo possível.
// =============================================================================

export function NoScopeBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 rounded-lg px-4 py-3 text-sm"
    >
      <p>Selecione uma empresa na barra lateral para editar.</p>
      {children}
    </div>
  );
}
