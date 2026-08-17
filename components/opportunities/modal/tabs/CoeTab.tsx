import type { Opportunity } from '@/lib/opportunities/types';
import { Field } from './Field';

type Props = { opportunity: Opportunity };

export function CoeTab({ opportunity: o }: Props) {
  const extras = o.persona_extras ?? {};
  return (
    <div className="px-5 py-4">
      <Field label="Expectativas com o CoE" value={extras.expectativas} multiline />
      <Field
        label="Priorização Indicada"
        value={extras.priorizacao_desc}
        multiline
      />
      <Field
        label="Observações"
        value={extras.observacoes}
        multiline
        hideIfEmpty
      />
    </div>
  );
}
