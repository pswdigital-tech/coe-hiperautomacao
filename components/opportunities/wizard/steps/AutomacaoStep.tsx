'use client';

import type { WizardFormData } from '../state';
import { DynamicList } from './DynamicList';
import { ToolPicker } from './ToolPicker';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  /** Repassado ao `ToolPicker` para registrar ferramenta no tenant certo. */
  opportunityId?: string;
};

// 0055: os três radios fixos (RPA / n8n / Ambos) viraram checkbox sobre o
// catálogo `automation_tools`. 'Ambos' deixou de existir como opção — marcar
// RPA e n8n diz a mesma coisa sem ambiguidade (a coluna legada `ferramenta`
// continua recebendo 'ambos' por derivação no banco, para quem lê ela).
export function AutomacaoStep({ data, onChange, opportunityId }: Props) {
  return (
    <div className="px-2 py-2 space-y-5">
      <ToolPicker
        value={data.ferramentas ?? []}
        onChange={(next) => onChange({ ferramentas: next })}
        opportunityId={opportunityId}
      />

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Escopo de Automação Sugerido
        </div>
        <DynamicList
          items={data.escopo_automacao ?? ['']}
          onChange={(next) => onChange({ escopo_automacao: next })}
          placeholder="Ex: Geração automática de relatório X"
          addLabel="+ Adicionar item ao escopo"
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Benefícios Esperados
        </div>
        <DynamicList
          items={data.beneficios_esperados ?? ['']}
          onChange={(next) => onChange({ beneficios_esperados: next })}
          placeholder="Ex: Redução de 60% no tempo"
          addLabel="+ Adicionar benefício"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
          Observação
        </label>
        <textarea
          value={data.observacao ?? ''}
          onChange={(e) => onChange({ observacao: e.target.value })}
          placeholder="Detalhes adicionais, contexto, premissas..."
          rows={3}
          maxLength={2000}
          className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15 leading-relaxed"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
          Risco
        </label>
        <textarea
          value={data.risco ?? ''}
          onChange={(e) => onChange({ risco: e.target.value })}
          placeholder="Riscos identificados, dependências críticas, pontos de atenção..."
          rows={3}
          maxLength={2000}
          className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15 leading-relaxed"
        />
      </div>
    </div>
  );
}
