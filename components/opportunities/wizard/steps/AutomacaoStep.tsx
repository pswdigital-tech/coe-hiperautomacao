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

      {/* 0065 — os quatro blocos abaixo alinham este step ao formulário de
          edição do modal de detalhe (OpportunityDetail.tsx). Eles existiam lá
          e não aqui: quem editava pelo wizard em mode='edit' simplesmente não
          enxergava Fora do Escopo nem Critérios de Aceite, e salvava por cima
          sem saber que os campos existiam. Duas superfícies de edição da mesma
          oportunidade precisam mostrar o mesmo conjunto de campos. */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Fora do Escopo
        </div>
        <DynamicList
          items={data.fora_escopo ?? ['']}
          onChange={(next) => onChange({ fora_escopo: next })}
          placeholder="Ex: Integração com o sistema legado Y"
          addLabel="+ Adicionar exclusão"
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Critérios de Aceite
        </div>
        <DynamicList
          items={data.criterios_aceite ?? ['']}
          onChange={(next) => onChange({ criterios_aceite: next })}
          placeholder="Ex: Relatório gerado em até 5 minutos"
          addLabel="+ Adicionar critério"
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Premissas
        </div>
        <DynamicList
          items={data.premissas ?? ['']}
          onChange={(next) => onChange({ premissas: next })}
          placeholder="Ex: Acessos liberados até o início do desenvolvimento"
          addLabel="+ Adicionar premissa"
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
          Restrições
        </div>
        <DynamicList
          items={data.restricoes ?? ['']}
          onChange={(next) => onChange({ restricoes: next })}
          placeholder="Ex: Execução apenas fora do horário comercial"
          addLabel="+ Adicionar restrição"
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
