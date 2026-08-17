'use client';

import type { WizardFormData } from '../state';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
};

export function TipoStep({ data, onChange }: Props) {
  return (
    <div className="px-2 py-4">
      <h3 className="text-[15px] font-bold text-txt mb-1">
        Qual o tipo desta oportunidade?
      </h3>
      <p className="text-[11px] text-mut mb-5">
        Persona = entrevista com pessoa-chave. Formulário = solicitação direta
        com critérios objetivos.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Card
          icon="👤"
          title="Persona"
          desc="Mapeada via entrevista com um stakeholder. Campos narrativos de papel, desafios, expectativas."
          active={data.source === 'persona'}
          onClick={() => onChange({ source: 'persona' })}
        />
        <Card
          icon="📋"
          title="Formulário"
          desc="Solicitação autoatendimento. Campos estruturados: 10 critérios técnicos + 8 benefícios pontuados."
          active={data.source === 'formulario'}
          onClick={() => onChange({ source: 'formulario' })}
        />
      </div>
    </div>
  );
}

type CardProps = {
  icon: string;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
};

function Card({ icon, title, desc, active, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left p-4 rounded-xl border-2 transition-all ' +
        (active
          ? 'border-pri bg-pri/5 shadow-md'
          : 'border-bdr bg-wh hover:border-pril hover:bg-blue-50/40 dark:hover:bg-blue-950/40')
      }
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-[14px] font-bold text-txt mb-1">{title}</div>
      <div className="text-[11px] text-mut leading-relaxed">{desc}</div>
    </button>
  );
}
