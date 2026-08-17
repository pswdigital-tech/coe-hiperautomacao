'use client';

import type { WizardFormData } from '../state';
import { TextField } from './fields';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  errors: Record<string, string>;
  // Público: e-mail é obrigatório (a RPC exige — é o contato do solicitante).
  // No wizard da home permanece opcional (default false).
  emailRequired?: boolean;
};

export function IdentificacaoStep({ data, onChange, errors, emailRequired }: Props) {
  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <TextField
          label="Solicitante"
          required
          value={data.solicitante ?? ''}
          onChange={(v) => onChange({ solicitante: v })}
          error={errors.solicitante}
          placeholder="Nome completo"
        />
        <TextField
          label="E-mail"
          type="email"
          required={emailRequired}
          value={data.email ?? ''}
          onChange={(v) => onChange({ email: v })}
          error={errors.email}
          placeholder="email@empresa.com"
        />
        <TextField
          label="Área"
          required
          value={data.area ?? ''}
          onChange={(v) => onChange({ area: v })}
          error={errors.area}
          placeholder="Ex: Gerência Jurídica"
        />
        <TextField
          label="Subárea / Time"
          value={data.subarea ?? ''}
          onChange={(v) => onChange({ subarea: v })}
          placeholder="Ex: Coordenação de Riscos"
        />
        <div className="col-span-2">
          <TextField
            label="Nome do processo / oportunidade"
            required
            value={data.processo ?? ''}
            onChange={(v) => onChange({ processo: v })}
            error={errors.processo}
            placeholder="Nome curto — ex: Conciliação bancária diária"
          />
        </div>
      </div>
    </div>
  );
}
