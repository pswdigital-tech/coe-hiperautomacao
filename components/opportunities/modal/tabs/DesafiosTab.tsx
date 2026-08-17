import type { Opportunity } from '@/lib/opportunities/types';
import { Field } from './Field';

type Props = { opportunity: Opportunity };

export function DesafiosTab({ opportunity: o }: Props) {
  const extras = o.persona_extras ?? {};
  return (
    <div className="px-5 py-4">
      <Field label="Principais Desafios" value={extras.desafios} multiline />
      <Field
        label="Situação Atual de Automação"
        value={extras.automacao_atual}
        multiline
      />
    </div>
  );
}
