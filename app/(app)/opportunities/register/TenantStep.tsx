'use client';

import type { TenantSummary } from '@/lib/tenants/queries';

// Etapa EXCLUSIVA do registro interno (staff PSW / super-admin): escolher em
// nome de QUAL empresa a oportunidade será registrada. Deliberadamente NÃO
// existe no formulário público (`/r/<slug>`) — lá o tenant já vem do slug da
// URL e quem preenche é anônimo; oferecer uma lista de empresas ali seria
// vazar a carteira de clientes para qualquer visitante. Por isso ela mora
// aqui, nesta rota, e não em `components/opportunities/wizard/` (compartilhado
// com o público e com o modal da home).
//
// A lista JÁ VEM RECORTADA do servidor (`staff_writable_tenant_ids()`, 0051) —
// este componente nunca filtra nem decide escopo, só desenha o que recebeu.

type Props = {
  tenants: TenantSummary[];
  selectedId: string | null;
  error: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
};

export function TenantStep({
  tenants,
  selectedId,
  error,
  onSelect,
  onContinue,
}: Props) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-extrabold text-txt leading-tight">
        Para qual empresa é este registro?
      </h2>
      <p className="text-sm text-mut mt-1">
        A oportunidade será criada no pipeline da empresa escolhida — como se
        tivesse chegado pelo formulário dela.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {tenants.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={selectedId === t.id}
            className={
              'text-left p-4 rounded-xl border-2 transition-all ' +
              (selectedId === t.id
                ? 'border-pri bg-pri/5 shadow-md'
                : 'border-bdr bg-wh hover:border-pril hover:bg-blue-50/40 dark:hover:bg-blue-950/40')
            }
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pri/10 text-pri flex items-center justify-center text-[13px] font-black shrink-0">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-txt truncate">
                  {t.name}
                </div>
                <div className="text-[11px] text-mut truncate">{t.slug}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-5 text-[13px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="mt-8 pt-5 border-t border-bdr flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
