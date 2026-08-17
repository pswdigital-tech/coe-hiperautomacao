import type { Opportunity } from '@/lib/opportunities/types';
import { StatusBadge, CriticidadeBadge } from '@/components/opportunities/cells';
import { tempoAbertoCoe } from '@/lib/opportunities/coe';
// Discovery v2 — rótulos compartilhados com o "Resumo da Oportunidade" da
// coluna lateral do detalhe (fonte única, ver `discovery-labels.ts`).
import {
  GATILHO_LABELS,
  FORMATO_ENTRADA_LABELS,
  DADOS_SENSIVEIS_LABELS,
  labelOf,
} from '@/lib/opportunities/discovery-labels';

type Props = { opportunity: Opportunity };

// Grid de cards (bg-bg, label uppercase + valor 14px) que preenche a largura —
// 1 col (mobile) / 2 (tablet) / 3 (desktop). Campos longos ocupam a linha inteira.
export function ProcessoTab({ opportunity: o }: Props) {
  const extras = o.formulario_extras ?? {};
  const tempoAberto = tempoAbertoCoe(o.data_abertura_coe, o.data_fechamento_coe);

  const temOperacional =
    o.criticidade ||
    o.azure_boards_codigo ||
    o.linguagem ||
    o.execucao ||
    o.usuarios_servico ||
    o.data_conclusao;

  return (
    <div className="px-5 py-5 flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        <InfoItem label="Frequência de Execução" value={o.frequencia} />
        <InfoItem label="Número de Execuções" value={o.volume_medio} />
        <InfoItem label="Tempo Médio de Execução" value={o.tempo_execucao} />
        <InfoItem label="Pessoas Envolvidas" value={o.num_pessoas} />
        <InfoItem label="E-mail do Solicitante" value={o.email} small />
        <InfoItem label="Área Responsável" value={o.area} />
        <InfoItem label="Subárea / Time" value={o.subarea} />
        <InfoItem label="Tipo do Processo" value={extras.tipo_processo} />
        <InfoItem
          label="Gatilho (o que inicia)"
          value={labelOf(GATILHO_LABELS, extras.gatilho)}
          hideIfEmpty
        />
        <InfoItem
          label="Formato das Entradas"
          value={labelOf(FORMATO_ENTRADA_LABELS, extras.formato_entrada)}
          hideIfEmpty
        />
        <InfoItem
          label="Dados Sensíveis (LGPD)"
          value={labelOf(DADOS_SENSIVEIS_LABELS, extras.dados_sensiveis)}
          hideIfEmpty
        />
        <InfoItem label="Status Atual">
          <StatusBadge status={o.status} />
        </InfoItem>
      </div>

      {/* v0.3 — operacionais (automação já implementada) */}
      {temOperacional && (
        <div>
          <SectionLabel>Operacional (automação já implementada)</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            <InfoItem label="Criticidade">
              <CriticidadeBadge value={o.criticidade} />
            </InfoItem>
            <InfoItem label="Código Azure Boards" value={o.azure_boards_codigo} hideIfEmpty />
            <InfoItem label="Linguagem" value={o.linguagem} hideIfEmpty />
            <InfoItem label="Execução" value={o.execucao} hideIfEmpty />
            <InfoItem label="Usuários de Serviço" value={o.usuarios_servico} hideIfEmpty />
            <InfoItem label="Data de Conclusão" value={o.data_conclusao} hideIfEmpty />
          </div>
        </div>
      )}

      {/* Campos de texto livre — largura total */}
      <div className="grid grid-cols-1 gap-2.5">
        <InfoItem
          label="Como o Processo Funciona Hoje"
          value={extras.descricao}
          multiline
          hideIfEmpty
        />
        <InfoItem label="Sistemas Utilizados" value={extras.sistemas} multiline />
        <InfoItem
          label="Dor Atual / Motivação"
          value={extras.dor}
          multiline
          hideIfEmpty
        />
        <InfoItem label="Notas" value={o.notas} multiline hideIfEmpty />
      </div>

      {tempoAberto && (
        <p className="text-[12px] text-mut">⏱️ {tempoAberto} no COE</p>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2">
      {children}
    </div>
  );
}

type InfoItemProps = {
  label: string;
  value?: string | null;
  small?: boolean;
  multiline?: boolean;
  hideIfEmpty?: boolean;
  children?: React.ReactNode;
};

function InfoItem({
  label,
  value,
  small,
  multiline,
  hideIfEmpty,
  children,
}: InfoItemProps) {
  const empty = !value || value === '–' || value.trim() === '';
  if (empty && hideIfEmpty && !children) return null;

  return (
    <div className="bg-bg rounded-lg px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1">
        {label}
      </div>
      {children ?? (
        <div
          className={`font-semibold text-txt leading-relaxed ${
            small ? 'text-[13px]' : 'text-[14px]'
          }`}
        >
          {empty ? (
            <span className="text-mut font-normal">—</span>
          ) : multiline ? (
            value!.split('\n').map((line, i) => <div key={i}>{line || ' '}</div>)
          ) : (
            value
          )}
        </div>
      )}
    </div>
  );
}
