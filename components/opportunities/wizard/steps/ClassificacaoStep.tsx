'use client';

import type { WizardFormData } from '../state';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  errors: Record<string, string>;
};

type RequestType = NonNullable<WizardFormData['request_type']>;

type Option = {
  value: RequestType;
  icon: string;
  title: string;
  desc: string;
};

const OPTIONS: Option[] = [
  {
    value: 'nova_oportunidade',
    icon: '✨',
    title: 'Nova Oportunidade',
    desc: 'Processo ainda não automatizado — primeira análise pelo CoE.',
  },
  {
    value: 'melhoria_automacao',
    icon: '🔧',
    title: 'Melhoria da Automação já Existente',
    desc: 'Evolução, ajuste ou expansão de automação já em produção.',
  },
  {
    value: 'duvidas_terceiros',
    icon: '❓',
    title: 'Dúvidas — Avaliar soluções de terceiros',
    desc: 'Apoio na avaliação de ferramentas/fornecedores externos.',
  },
  {
    value: 'incidente',
    icon: '🚨',
    title: 'Incidente',
    desc: 'Falha em produção, comportamento inesperado ou indisponibilidade.',
  },
  {
    value: 'treinamento',
    icon: '🎓',
    title: 'Pedido de Treinamento',
    desc: 'Capacitação do time em ferramentas ou processos do CoE.',
  },
];

export function ClassificacaoStep({ data, onChange, errors }: Props) {
  return (
    <div className="px-2 py-4">
      <h3 className="text-[15px] font-bold text-txt mb-1">
        Qual a classificação desta solicitação?
      </h3>
      <p className="text-[11px] text-mut mb-5">
        Ajuda o CoE a priorizar e rotear corretamente.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((o) => (
          <Card
            key={o.value}
            icon={o.icon}
            title={o.title}
            desc={o.desc}
            active={data.request_type === o.value}
            onClick={() => onChange({ request_type: o.value })}
          />
        ))}
      </div>
      {errors.request_type && (
        <div className="text-[11px] text-red-700 dark:text-red-300 mt-3">{errors.request_type}</div>
      )}
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
