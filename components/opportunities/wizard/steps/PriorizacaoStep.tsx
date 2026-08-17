'use client';

import type { WizardFormData } from '../state';
import { SelectField } from './fields';
import { ScorePreview } from '../ScorePreview';
import {
  computeFteHoras,
  deriveFteBucket,
  type FteBucket,
} from '@/lib/opportunities/fte';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  errors: Record<string, string>;
  // Nos fluxos de CRIAÇÃO, Esforço e Complexidade são preenchidos pelo enrichment
  // da IA (não pela pessoa) e o FTE é CALCULADO (não digitado). Só no mode='edit'
  // esses campos viram input manual (CoE corrige a IA).
  hideEnriched?: boolean;
};

// Pesos alinhados à fórmula de 5 fatores (lib/opportunities/score.ts / _giba:483-490).
// Esforço é INVERTIDO (2026-08-14): menos esforço de implementação pontua mais.
const EFFORT_OPTIONS = [
  { value: 'baixo', label: 'Baixo (+20)' },
  { value: 'medio', label: 'Médio (+14)' },
  { value: 'alto', label: 'Alto (+8)' },
];

// Complexidade é INVERTIDA: menos complexo pontua mais.
const COMPLEXITY_OPTIONS = [
  { value: 'baixo', label: 'Baixo (+20)' },
  { value: 'medio', label: 'Médio (+13)' },
  { value: 'alto', label: 'Alto (+6)' },
];

// O fator `tempo` (frequência) agora é fonte única no step Processo — removido daqui.

// 5º fator: bucket FTE DERIVADO de fte_horas (D-01/D-03), read-only. Rótulo +
// peso alinhados à fórmula de score (ft = {muito_baixo:4..muito_alto:20}).
const FTE_BUCKET_DISPLAY: Record<FteBucket, { label: string; weight: string }> = {
  muito_baixo: { label: 'Muito Baixo', weight: '+4' },
  baixo: { label: 'Baixo', weight: '+8' },
  medio: { label: 'Médio', weight: '+12' },
  alto: { label: 'Alto', weight: '+16' },
  muito_alto: { label: 'Muito Alto', weight: '+20' },
};

export function PriorizacaoStep({ data, onChange, errors, hideEnriched }: Props) {
  // FTE (horas/mês): no CRIAÇÃO é CALCULADO (execuções/mês × horas/execução ×
  // pessoas); na EDIÇÃO usa o valor manual de fte_horas. Mesma fn do submit →
  // display === persistência.
  const fteHoras = hideEnriched
    ? computeFteHoras({
        execucoesMes: data.execucoes_mes,
        tempo: data.tempo,
        tempoExecucao: data.tempo_execucao,
        numPessoas: data.num_pessoas,
      })
    : data.fte_horas ?? null;
  const fteBucket =
    fteHoras != null ? deriveFteBucket(Number(fteHoras)) : undefined;

  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {!hideEnriched && (
          <>
            <SelectField
              label="Esforço de Implementação"
              required
              value={data.esforco}
              onChange={(v) => onChange({ esforco: v as 'baixo' | 'medio' | 'alto' })}
              options={EFFORT_OPTIONS}
              error={errors.esforco}
            />
            <SelectField
              label="Complexidade Técnica"
              required
              value={data.complexidade}
              onChange={(v) =>
                onChange({ complexidade: v as 'baixo' | 'medio' | 'alto' })
              }
              options={COMPLEXITY_OPTIONS}
              error={errors.complexidade}
            />
          </>
        )}
        <div className={'mb-3' + (hideEnriched ? ' sm:col-span-2' : '')}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
            Alinhamento Estratégico <span className="text-red-500">*</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = data.objetivo === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ objetivo: n })}
                  className={
                    'flex-1 py-1.5 rounded-lg text-[12px] font-bold border ' +
                    (active
                      ? 'bg-pri text-white border-pri'
                      : 'bg-bg text-txt border-bdr hover:border-pril')
                  }
                >
                  {n}
                </button>
              );
            })}
          </div>
          {errors.objetivo && (
            <div className="text-[11px] text-red-700 mt-1">{errors.objetivo}</div>
          )}
        </div>
      </div>

      {/* 5º fator — bucket FTE DERIVADO (read-only, D-01/D-03). */}
      <div className="mt-1 mb-3 rounded-lg border border-bdr bg-bg px-3 py-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
          Impacto FTE (derivado)
        </div>
        {fteBucket ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-txt">
                {FTE_BUCKET_DISPLAY[fteBucket].label}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pri text-white text-[11px] font-bold">
                {FTE_BUCKET_DISPLAY[fteBucket].weight}
              </span>
            </div>
            <span className="text-[11px] text-mut">
              {Number(fteHoras)} h/mês
            </span>
          </div>
        ) : (
          <div className="text-[12px] text-mut">
            {hideEnriched
              ? 'Informe execuções/mês (ou frequência), tempo de execução e pessoas no passo Processo.'
              : 'Informe o FTE (h/mês) no passo Benefícios.'}
          </div>
        )}
        <div className="text-[10px] text-mut mt-1.5">
          {hideEnriched
            ? 'Calculado: execuções/mês × horas por execução × pessoas envolvidas.'
            : 'Calculado a partir das horas/mês informadas em Benefícios.'}
        </div>
      </div>

      {hideEnriched && (
        <div className="mb-3 rounded-lg border border-bdr bg-bg px-3 py-2 text-[11px] text-mut leading-relaxed">
          🤖 <strong className="text-txt">Ferramenta sugerida, esforço e
          complexidade</strong> são preenchidos automaticamente pela IA após o
          envio — você não precisa informar.
        </div>
      )}

      <div className="mt-3">
        <ScorePreview
          esforco={data.esforco}
          complexidade={data.complexidade}
          tempo={data.tempo}
          objetivo={data.objetivo}
          fte={fteBucket}
          criterios={data.criterios}
          beneficios={data.beneficios}
        />
      </div>
    </div>
  );
}
