'use client';

import type { WizardFormData } from '../state';
import { TextareaField } from './fields';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
};

export function ContextoStep({ data, onChange }: Props) {
  function patch(p: Record<string, string>) {
    onChange({
      persona_extras: { ...(data.persona_extras ?? {}), ...p },
    });
  }

  return (
    <div className="px-2 py-2 space-y-1">
      <TextareaField
        label="Papel / Responsabilidades"
        value={data.persona_extras?.papel ?? ''}
        onChange={(v) => patch({ papel: v })}
        rows={3}
        placeholder="• Atribuições principais..."
      />
      <TextareaField
        label="Objetivos & Metas"
        value={data.persona_extras?.objetivos ?? ''}
        onChange={(v) => patch({ objetivos: v })}
        rows={2}
      />
      <TextareaField
        label="Métricas Acompanhadas"
        value={data.persona_extras?.metricas ?? ''}
        onChange={(v) => patch({ metricas: v })}
        rows={2}
      />
      <TextareaField
        label="Principais Desafios e Dores"
        value={data.persona_extras?.desafios ?? ''}
        onChange={(v) => patch({ desafios: v })}
        rows={3}
        placeholder="• Validação manual demorada..."
      />
      <TextareaField
        label="Uso de Dados"
        value={data.persona_extras?.dados ?? ''}
        onChange={(v) => patch({ dados: v })}
        rows={2}
      />
      <TextareaField
        label="Situação Atual de Automação"
        value={data.persona_extras?.automacao_atual ?? ''}
        onChange={(v) => patch({ automacao_atual: v })}
        rows={2}
      />
      <TextareaField
        label="Expectativas com o CoE"
        value={data.persona_extras?.expectativas ?? ''}
        onChange={(v) => patch({ expectativas: v })}
        rows={2}
      />
      <TextareaField
        label="Priorização Indicada pelo Solicitante"
        value={data.persona_extras?.priorizacao_desc ?? ''}
        onChange={(v) => patch({ priorizacao_desc: v })}
        rows={2}
      />
      <TextareaField
        label="Observações Adicionais"
        value={data.persona_extras?.observacoes ?? ''}
        onChange={(v) => patch({ observacoes: v })}
        rows={2}
      />
    </div>
  );
}
