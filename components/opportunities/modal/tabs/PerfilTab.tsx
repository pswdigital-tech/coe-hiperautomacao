import type { Opportunity } from '@/lib/opportunities/types';
import { Field } from './Field';

type Props = { opportunity: Opportunity };

export function PerfilTab({ opportunity: o }: Props) {
  const extras = o.persona_extras ?? {};

  return (
    <div className="px-5 py-4">
      <div className="grid grid-cols-2 gap-x-5 gap-y-0">
        <div>
          <Field label="Cargo" value={extras.cargo ?? o.subarea} />
          <Field label="Tempo na Função" value={extras.tempo_funcao} />
          <Field label="Localidade" value={extras.local} />
          <Field label="Sistemas Utilizados" value={extras.sistemas} multiline />
        </div>
        <div>
          <Field label="Objetivos & Metas" value={extras.objetivos} multiline />
          <Field label="Métricas Acompanhadas" value={extras.metricas} multiline />
          <Field label="Uso de Dados" value={extras.dados} multiline />
        </div>
      </div>

      <Field label="Principais Responsabilidades" value={extras.papel} multiline />
      <Field label="Notas" value={o.notas} multiline hideIfEmpty />
    </div>
  );
}
