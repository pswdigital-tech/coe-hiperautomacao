'use client';

type Props = {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  /** Espelha o `.max(N)` de cada item no Zod (escopo_automacao/beneficios_esperados:
   *  200 — schema.ts). `maxLength` no `<input>` trunca colar/digitar ANTES do
   *  submit, em vez de deixar o texto crescer livre e só falhar (silenciosamente,
   *  "Dados inválidos.") no salvar — reproduzido 2026-08-14 colando ~1600
   *  caracteres num item de Escopo. */
  maxLength?: number;
  /** Espelha o `.max(N)` do array no Zod (mesmos campos: 20 itens). */
  maxItems?: number;
};

export function DynamicList({
  items,
  onChange,
  placeholder,
  addLabel = '+ Adicionar item',
  maxLength = 200,
  maxItems = 20,
}: Props) {
  const list = items.length === 0 ? [''] : items;
  const atMax = list.length >= maxItems;

  function update(i: number, v: string) {
    const next = [...list];
    next[i] = v.slice(0, maxLength);
    onChange(next);
  }

  function add() {
    if (atMax) return;
    onChange([...list, '']);
  }

  function remove(i: number) {
    if (list.length === 1) {
      onChange(['']);
      return;
    }
    onChange(list.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map((value, i) => {
        const nearLimit = value.length >= maxLength * 0.9;
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex gap-2 items-start">
              <input
                type="text"
                value={value}
                onChange={(e) => update(i, e.target.value)}
                maxLength={maxLength}
                placeholder={placeholder}
                className="flex-1 px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remover"
                className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 text-base flex items-center justify-center flex-shrink-0"
              >
                ×
              </button>
            </div>
            {/* Contador só aparece perto do limite — não polui a lista inteira
                por padrão (a maioria dos itens é curta). */}
            {nearLimit && (
              <span className="text-[10px] text-mut pl-0.5">
                {value.length}/{maxLength}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        disabled={atMax}
        title={atMax ? `Máximo de ${maxItems} itens` : undefined}
        className="w-full px-3 py-1.5 bg-violet-50 dark:bg-violet-950/40 border border-dashed border-violet-400 dark:border-violet-600 rounded-lg text-violet-700 dark:text-violet-300 text-[11px] font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-violet-50 dark:disabled:hover:bg-violet-950/40"
      >
        {atMax ? `Máximo de ${maxItems} itens atingido` : addLabel}
      </button>
    </div>
  );
}
