'use client';

import type { WizardFormData } from '../state';
import { TextField, TextareaField, SelectField } from './fields';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  // Nos fluxos de CRIAÇÃO, "Ferramenta Sugerida" é preenchida pelo enrichment
  // da IA (lib/ai/enrichment.ts) — não pela pessoa. Só aparece no mode='edit',
  // onde o CoE corrige o que a IA gerou.
  hideEnriched?: boolean;
};

type Frequency = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';

// Frequência é a FONTE ÚNICA do fator de score `tempo` (diario..anual, 0011) —
// não pedir frequência de novo na Priorização. Pesos do score NÃO aparecem nos
// rótulos (decisão 2026-07-22): quem preenche não precisa ver a pontuação.
const FREQUENCY_OPTIONS = [
  { value: 'diario', label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];

// Ferramenta Sugerida (D-07), default n8n. Domínio = toolEnum.
const TOOL_OPTIONS = [
  { value: 'rpa', label: 'RPA' },
  { value: 'n8n', label: 'n8n' },
  { value: 'ambos', label: 'Ambos' },
];

// Discovery v2 — o que dispara o processo (define orquestração / n8n vs RPA).
const GATILHO_OPTIONS = [
  { value: 'email', label: 'Chega um e-mail / mensagem' },
  { value: 'horario', label: 'Horário / agenda (todo dia, toda segunda...)' },
  { value: 'solicitacao', label: 'Alguém solicita / abre um chamado' },
  { value: 'evento_sistema', label: 'Evento em um sistema (novo registro, status muda)' },
  { value: 'planilha', label: 'Atualização de planilha / arquivo' },
  { value: 'outro', label: 'Outro' },
];

// Discovery v2 — formato das entradas (maior divisor: RPA simples vs OCR/IDP/IA).
const FORMATO_ENTRADA_OPTIONS = [
  { value: 'estruturado', label: 'Estruturado (planilha, sistema, formulário)' },
  { value: 'nao_estruturado', label: 'Não estruturado (PDF, e-mail livre, imagem, papel)' },
  { value: 'misto', label: 'Misto' },
];

// Discovery v2 — governança LGPD.
const DADOS_SENSIVEIS_OPTIONS = [
  { value: 'sim', label: 'Sim, dados pessoais/sensíveis' },
  { value: 'nao', label: 'Não' },
  { value: 'nao_sei', label: 'Não sei' },
];

// v0.3 — criticidade (separada do Score, input manual).
const CRITICIDADE_OPTIONS = [
  { value: 'baixa', label: '🟢 Baixa' },
  { value: 'media', label: '🟡 Média' },
  { value: 'alta', label: '🟠 Alta' },
  { value: 'critica', label: '🔴 Crítica' },
];

// Rótulo legível espelhado em `frequencia` (texto) p/ compat de display — o
// fator de score é `data.tempo`.
const FREQUENCY_LABEL: Record<string, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  anual: 'Anual',
};

export function ProcessoStep({ data, onChange, hideEnriched }: Props) {
  const isFormulario = data.source === 'formulario';

  function patchFormularioExtras(patch: Record<string, string>) {
    onChange({
      formulario_extras: { ...(data.formulario_extras ?? {}), ...patch },
    });
  }

  function patchPersonaExtras(patch: Record<string, string>) {
    onChange({
      persona_extras: { ...(data.persona_extras ?? {}), ...patch },
    });
  }

  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {isFormulario && (
          <>
            <div className="sm:col-span-2">
              <TextareaField
                label="Como o processo funciona hoje"
                value={data.formulario_extras?.descricao ?? ''}
                onChange={(v) => patchFormularioExtras({ descricao: v })}
                rows={4}
                placeholder="Descreva o passo a passo: o que você faz, em que ordem, em quais sistemas — e onde costuma travar ou dar erro."
              />
            </div>
            <SelectField
              label="O que inicia o processo?"
              value={data.formulario_extras?.gatilho ?? ''}
              onChange={(v) => patchFormularioExtras({ gatilho: v })}
              options={GATILHO_OPTIONS}
            />
            <SelectField
              label="Formato das informações de entrada"
              value={data.formulario_extras?.formato_entrada ?? ''}
              onChange={(v) => patchFormularioExtras({ formato_entrada: v })}
              options={FORMATO_ENTRADA_OPTIONS}
            />
          </>
        )}
        <SelectField
          label="Frequência"
          value={data.tempo}
          onChange={(v) =>
            // frequência é a fonte única do fator `tempo`; espelha rótulo em `frequencia` p/ display
            onChange({ tempo: v as Frequency, frequencia: FREQUENCY_LABEL[v] ?? '' })
          }
          options={FREQUENCY_OPTIONS}
        />
        {!hideEnriched && (
          <SelectField
            label="Ferramenta Sugerida"
            value={data.ferramenta ?? 'n8n'}
            onChange={(v) =>
              onChange({ ferramenta: v as 'rpa' | 'n8n' | 'ambos' })
            }
            options={TOOL_OPTIONS}
          />
        )}
        {/* Semântica: execuções = Frequência × Número de Execuções.
            Ex.: Frequência "Semanal" + Número de Execuções "4" = 4 execuções por semana. */}
        <TextField
          label="Número de Execuções"
          value={data.volume_medio ?? ''}
          onChange={(v) => onChange({ volume_medio: v })}
          placeholder="Ex: 4 — com frequência Semanal, 4 execuções por semana"
        />
        <TextField
          label="Tempo de Execução"
          value={data.tempo_execucao ?? ''}
          onChange={(v) => onChange({ tempo_execucao: v })}
          placeholder="Ex: 1 a 2 horas"
        />
        <TextField
          label="Pessoas Envolvidas"
          value={data.num_pessoas ?? ''}
          onChange={(v) => onChange({ num_pessoas: v })}
          placeholder="Ex: De 2 a 4 pessoas"
        />
        {/* Criticidade saiu do fluxo de CRIAÇÃO (2026-07-29) — inferida pela IA,
            editável no mode='edit'. "Responsável CoE" saiu de vez (0032): quem
            conduz agora são os assignees, atribuídos pelo admin no detalhe. */}
        {!hideEnriched && (
          <>
            <SelectField
              label="Criticidade"
              value={data.criticidade ?? ''}
              onChange={(v) =>
                onChange({
                  criticidade: (v || undefined) as WizardFormData['criticidade'],
                })
              }
              options={CRITICIDADE_OPTIONS}
            />
          </>
        )}
        {isFormulario && (
          <>
            <TextField
              label="Tipo do Processo"
              value={data.formulario_extras?.tipo_processo ?? ''}
              onChange={(v) => patchFormularioExtras({ tipo_processo: v })}
              placeholder="Ex: Financeiro; Compliance"
            />
            <TextField
              label="Sistemas Utilizados"
              value={data.formulario_extras?.sistemas ?? ''}
              onChange={(v) => patchFormularioExtras({ sistemas: v })}
              placeholder="Ex: Protheus, Fluig, E-mail"
            />
            <div className="sm:col-span-2">
              <TextareaField
                label="Qual a maior dor hoje? Por que automatizar?"
                value={data.formulario_extras?.dor ?? ''}
                onChange={(v) => patchFormularioExtras({ dor: v })}
                rows={2}
                placeholder="Ex: consome 3h/dia, gera retrabalho, atrasa o fechamento, causa erros que geram reclamação..."
              />
            </div>
            <SelectField
              label="Envolve dados pessoais/sensíveis? (LGPD)"
              value={data.formulario_extras?.dados_sensiveis ?? ''}
              onChange={(v) => patchFormularioExtras({ dados_sensiveis: v })}
              options={DADOS_SENSIVEIS_OPTIONS}
            />
          </>
        )}

        {!isFormulario && (
          <>
            <TextField
              label="Cargo do Solicitante"
              value={data.persona_extras?.cargo ?? ''}
              onChange={(v) => patchPersonaExtras({ cargo: v })}
            />
            <TextField
              label="Tempo na Função"
              value={data.persona_extras?.tempo_funcao ?? ''}
              onChange={(v) => patchPersonaExtras({ tempo_funcao: v })}
              placeholder="Ex: 5 anos"
            />
            <TextField
              label="Localidade"
              value={data.persona_extras?.local ?? ''}
              onChange={(v) => patchPersonaExtras({ local: v })}
              placeholder="Ex: Brasília/DF"
            />
            <TextField
              label="Sistemas que utiliza"
              value={data.persona_extras?.sistemas ?? ''}
              onChange={(v) => patchPersonaExtras({ sistemas: v })}
              placeholder="Ex: Protheus, Teams, Excel"
            />
          </>
        )}
      </div>
    </div>
  );
}
