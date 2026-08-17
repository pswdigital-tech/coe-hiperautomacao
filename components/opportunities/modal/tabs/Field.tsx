/**
 * Render helper para campo "label uppercase + valor multiline".
 * Usado pelas tabs de detalhe (Perfil, Desafios, CoE, Processo).
 */

type FieldProps = {
  label: string;
  value: string | null | undefined;
  /** Se true, preserva quebras de linha (\n vira parágrafo). */
  multiline?: boolean;
  /** Se true, não renderiza nada quando vazio. Default: mostra em-dash. */
  hideIfEmpty?: boolean;
};

export function Field({ label, value, multiline, hideIfEmpty }: FieldProps) {
  const isEmpty = !value || value === '–' || value.trim() === '';
  if (isEmpty && hideIfEmpty) return null;

  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
        {label}
      </div>
      <div className="text-[12px] leading-relaxed text-txt">
        {isEmpty ? (
          <span className="text-mut">—</span>
        ) : multiline ? (
          renderMultiline(value!)
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function renderMultiline(text: string) {
  return text.split('\n').map((line, i) => (
    <div key={i}>{line || ' '}</div>
  ));
}
