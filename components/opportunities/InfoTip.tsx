// =============================================================================
// InfoTip — ícone de informação com explicação no hover/foco.
//
// SEM estado e SEM hooks de propósito: é `group-hover` + `focus-within` puro,
// então funciona dentro de Server Component (as abas de leitura do detalhe são
// server) e de Client Component, sem precisar marcar 'use client' em nenhum
// dos dois. O repo não tem shadcn/ui — composição na mão, como os demais
// overlays daqui.
//
// O gatilho é um <button> real, não um <span>: assim chega por teclado (Tab
// abre pelo `focus-within`) e responde ao toque em telas sem hover. Por isso
// também não usamos o `title` nativo, que só aparece com mouse parado e
// depois de um atraso longo.
// =============================================================================

type Props = {
  /** Texto lido por leitor de tela e mostrado no balão. */
  children: React.ReactNode;
  /** Rótulo do que está sendo explicado — compõe o aria-label do gatilho. */
  label: string;
  /** Lado para onde o balão abre. `right` alinha à direita (evita corte). */
  align?: 'left' | 'right';
};

export function InfoTip({ children, label, align = 'right' }: Props) {
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label={`O que é ${label}`}
        className="w-4 h-4 rounded-full border border-bdr text-mut text-[9px] font-bold leading-none flex items-center justify-center hover:border-pri hover:text-pri focus:outline-none focus:ring-2 focus:ring-pri/40 transition-colors"
      >
        i
      </button>

      <span
        role="tooltip"
        className={
          'pointer-events-none absolute top-full mt-1.5 z-30 w-[240px] rounded-lg border border-bdr bg-wh shadow-lg px-3 py-2 ' +
          'text-[11px] font-normal leading-relaxed text-txt normal-case tracking-normal text-left ' +
          'opacity-0 invisible transition-opacity ' +
          'group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible ' +
          (align === 'right' ? 'right-0' : 'left-0')
        }
      >
        {children}
      </span>
    </span>
  );
}
