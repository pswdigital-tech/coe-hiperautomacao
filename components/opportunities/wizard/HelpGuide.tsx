'use client';

import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
};

const STEPS = [
  {
    icon: '👤',
    title: 'Passo 1 — Identificação',
    fields: [
      ['Nome do Solicitante*', 'quem pediu / é dono do processo. Importa para contato e responsabilização.'],
      ['E-mail', 'contato do solicitante. Facilita retorno e validações.'],
      ['Área*', 'área de negócio (ex.: Comercial, TI). Usada em filtros e KPIs por área.'],
      ['Subárea / Time', 'time ou cadeia de valor. Refina a análise por subárea.'],
    ],
  },
  {
    icon: '📋',
    title: 'Passo 2 — Processo',
    fields: [
      ['Processo*', 'nome do bot / processo a automatizar. É o identificador principal na lista e no kanban.'],
      ['Frequência', 'diário, semanal, mensal... Quanto mais frequente, maior o retorno da automação.'],
      ['Pessoas Envolvidas', 'quantas pessoas executam hoje. Indica o esforço manual envolvido.'],
      ['Tempo de Execução', 'tempo gasto por execução. Base para estimar a economia.'],
      ['Criticidade', 'Baixa/Média/Alta/Crítica — quão sensível é o processo hoje (SLA, impacto de falha).'],
    ],
  },
  {
    icon: '✅',
    title: 'Passo 3 — Critérios (fit para automação)',
    fields: [
      ['SIM / NÃO / PARCIAL', 'quanto mais critérios favoráveis, melhor o "fit" pra RPA/n8n. Atenção: em "Necessita decisão humana?" o favorável é NÃO.'],
    ],
  },
  {
    icon: '📈',
    title: 'Passo 4 — Benefícios (escala 1 a 5)',
    fields: [
      ['1 a 5', 'avalie o impacto esperado de 1 (muito baixo) a 5 (muito alto) em cada dimensão.'],
      ['Estimativa FTE (horas/mês)', 'horas de trabalho humano economizadas por mês — a principal medida de ganho da automação.'],
    ],
  },
  {
    icon: '🎯',
    title: 'Passo 5 — Priorização (forma o Score)',
    fields: [
      ['Esforço', 'quão fácil de implementar. Menor esforço = prioridade maior.'],
      ['Frequência', 'já vem do Passo 2 — mais frequente = mais retorno.'],
      ['Alinhamento Estratégico (1–5)', 'aderência aos objetivos do CoE. Pesa na priorização.'],
      ['FTE (derivado)', 'faixa de horas economizadas, calculada automaticamente do Passo 4.'],
    ],
  },
] as const;

/**
 * Guia de ajuda contextual do wizard de criação (v0.3) — modal explicando o
 * propósito de cada campo, pra quem preenche sozinho sem acompanhamento do CoE.
 * Overlay empilhado (z-[60]) sobre o wizard (z-50), mesmo padrão de
 * RiskFormDialog/DeleteButton.
 */
export function HelpGuide({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto p-4"
    >
      <div className="relative my-8 w-full max-w-xl bg-wh rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-pri to-pril text-white px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">❓ Como preencher uma Nova Oportunidade</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-sm font-bold flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto text-[13px] leading-relaxed">
          <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2.5 text-[12.5px] mb-4">
            <b>Por que preencher bem importa:</b> as informações alimentam o{' '}
            <b>Score de priorização</b>, o <b>RPA Fit</b> e os <b>KPIs</b> do CoE. Dados
            incompletos levam a priorização errada — use dados reais.
          </div>
          {STEPS.map((step) => (
            <div key={step.title} className="bg-bg rounded-lg p-3.5 mb-2.5">
              <div className="text-[13px] font-extrabold text-pri mb-2">
                {step.icon} {step.title}
              </div>
              {step.fields.map(([field, hint]) => (
                <div key={field} className="my-1.5">
                  <b>{field}</b> — <span className="text-mut">{hint}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="text-[12px] text-mut bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 mt-3">
            💡 Use dados reais (evite &quot;chutes&quot;) e preencha todos os 5 passos. Dá
            pra editar depois pelo botão ✏️ Editar no card.
          </div>
        </div>
        <div className="border-t border-bdr px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-pri hover:bg-pril text-white text-[12px] font-bold rounded-lg"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
