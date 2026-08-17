import type { Opportunity } from '@/lib/opportunities/types';

type Props = { opportunity: Opportunity };

// D-11: lê a coluna first-class v0.2 `o.criterios` (8 chaves camelCase, valores
// 'sim'|'nao'|'parcial' em minúsculo) — autoridade: wizard CriteriosStep.tsx:27-49.
// Layout espelha `renderCritTab` do mockup (_giba:1029-1052): barra "X/8
// favoráveis" no topo + grid 2-col com borda esquerda colorida + pill.
type CriterioValor = 'sim' | 'nao' | 'parcial';

type CriterioKey =
  | 'causaReclamacoes'
  | 'totalmenteManual'
  | 'regrasClaras'
  | 'decisaoHumana'
  | 'padronizacaoDocs'
  | 'validacaoDados'
  | 'schedulable'
  | 'temDocumentacao';

const CRITERIOS: { key: CriterioKey; label: string }[] = [
  { key: 'causaReclamacoes', label: 'Causa reclamações quando falha' },
  { key: 'totalmenteManual', label: 'Totalmente Manual' },
  { key: 'regrasClaras', label: 'Processo baseado em regras claras' },
  { key: 'decisaoHumana', label: 'Necessidade de decisão humana frequente' },
  { key: 'padronizacaoDocs', label: 'Padronização em documentos (PDFs, formulários)' },
  { key: 'validacaoDados', label: 'Validação ou conferência de dados simples' },
  { key: 'schedulable', label: 'Pode ser programado para horários específicos' },
  { key: 'temDocumentacao', label: 'Possui documentação do processo' },
];

// `decisaoHumana` é INVERTIDO: o favorável à automação é 'nao' (sem decisão
// humana frequente). Para os demais, favorável = 'sim'. 'parcial' nunca conta.
function isFavoravel(key: CriterioKey, v: CriterioValor | undefined): boolean {
  return key === 'decisaoHumana' ? v === 'nao' : v === 'sim';
}

function pill(v: CriterioValor | undefined) {
  if (v === 'sim')
    return { label: 'Sim', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
  if (v === 'nao')
    return { label: 'Não', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
  if (v === 'parcial')
    return { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200' };
  return { label: '—', cls: 'bg-slate-100 text-mut dark:bg-slate-800' };
}

export function CriteriosTab({ opportunity: o }: Props) {
  const criterios = (o.criterios ?? null) as Partial<
    Record<CriterioKey, CriterioValor>
  > | null;

  if (criterios == null) {
    return (
      <div className="px-5 py-10 text-center text-mut text-[13px]">
        Critérios técnicos ainda não preenchidos para esta oportunidade.
      </div>
    );
  }

  const fav = CRITERIOS.filter((c) => isFavoravel(c.key, criterios[c.key])).length;
  const pctFav = (fav / 8) * 100;
  const barColor = fav >= 6 ? '#22c55e' : fav >= 4 ? '#f59e0b' : '#ef4444';

  return (
    <div className="px-5 py-5">
      {/* Resumo favoráveis */}
      <div className="mb-4 bg-bg rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-[14px] font-bold text-pri whitespace-nowrap">
          {fav}/8 critérios favoráveis à automação
        </span>
        <div className="flex-1 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pctFav}%`, background: barColor }}
          />
        </div>
      </div>

      {/* Grid de critérios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {CRITERIOS.map((c) => {
          const v = criterios[c.key];
          const good = isFavoravel(c.key, v);
          const p = pill(v);
          return (
            <div
              key={c.key}
              className="bg-bg rounded-lg pl-3.5 pr-4 py-3 flex justify-between items-center gap-2 border-l-[3px]"
              style={{ borderLeftColor: good ? '#22c55e' : '#ef4444' }}
            >
              <span className="text-[13px] text-txt flex-1">{c.label}</span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${p.cls}`}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
