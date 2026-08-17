'use client';

import { useEffect, useState } from 'react';
import type { WizardFormData } from '../state';

type Props = {
  data: WizardFormData;
  onChange: (patch: Partial<WizardFormData>) => void;
  // Nos fluxos de CRIAÇÃO o FTE não é digitado — é CALCULADO (execuções/mês ×
  // horas/execução × pessoas, ver lib/opportunities/fte.ts computeFteHoras).
  // O input manual de horas/mês só aparece no mode='edit' (CoE ajusta).
  hideEnriched?: boolean;
};

// Phase 11 / D-09: modelo first-class v0.2 — 8 benefícios em `data.beneficios`
// top-level, chaves camelCase EXATAS do schema (schema.ts §260-273), escala 1–5.
// A UX de barras 1–5 + cores é mantida (superior aos dropdowns do mockup).
type BeneficioKey =
  | 'reducaoTempo'
  | 'eliminacaoErros'
  | 'produtividade'
  | 'qualidadeDados'
  | 'reducaoCustos'
  | 'reducaoRetrabalho'
  | 'compliance'
  | 'objetivosEstrategicos';

const BENEFICIOS: { key: BeneficioKey; label: string; color: string }[] = [
  { key: 'reducaoTempo', label: 'Redução de Tempo', color: '#3b82f6' },
  { key: 'eliminacaoErros', label: 'Eliminação de Erros', color: '#8b5cf6' },
  { key: 'produtividade', label: 'Aumento de Produtividade', color: '#10b981' },
  { key: 'qualidadeDados', label: 'Qualidade de Dados', color: '#f59e0b' },
  { key: 'reducaoCustos', label: 'Redução de Custos', color: '#ef4444' },
  { key: 'reducaoRetrabalho', label: 'Redução de Retrabalho', color: '#ec4899' },
  { key: 'compliance', label: 'Compliance & Regulatório', color: '#06b6d4' },
  { key: 'objetivosEstrategicos', label: 'Objetivos Estratégicos', color: '#f97316' },
];

// "Objetivos Estratégicos" saiu dos fluxos de CRIAÇÃO (2026-07-29): quem preenche
// o formulário não tem essa visão. A chave continua no schema e no mode='edit'
// (CoE pontua depois); sem nota, o benefício simplesmente não entra na média.
const BENEFICIOS_CRIACAO = BENEFICIOS.filter((b) => b.key !== 'objetivosEstrategicos');

// Nota 5 é escassa de propósito (2026-07-29): quem preenche precisa escolher no
// máximo 3 benefícios "Totalmente", senão tudo vira 5 e o bloco Ben do score
// perde poder de discriminação. Só o 5 é limitado — 1..4 continuam livres.
const MAX_NOTAS_5 = 3;

export function BeneficiosStep({ data, onChange, hideEnriched }: Props) {
  const beneficios = data.beneficios ?? {};
  const [toast, setToast] = useState<string | null>(null);

  const lista = hideEnriched ? BENEFICIOS_CRIACAO : BENEFICIOS;
  // Conta só o que está visível: no fluxo de criação "Objetivos Estratégicos"
  // nem aparece, então uma nota 5 herdada dele não pode consumir a cota.
  const notas5 = lista.filter((b) => beneficios[b.key] === 5).length;

  // O toast some sozinho; o timer é limpo se outro clique o substituir antes.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // WR-01: desmarcar REMOVE a chave (não grava 0). O schema exige escala 1–5
  // (`min(1)` sob `.strict()`); gravar 0 fazia o submit ser rejeitado pelo Zod.
  // `value == null` → desmarcar; o display (`v ?? '—'`) e `active = v === n` já
  // tratam chave ausente.
  function update(key: BeneficioKey, value: number | null) {
    // Bloqueia o 4º "5". Trocar um 5 já dado por outra nota, ou desmarcá-lo,
    // continua liberado — a checagem só barra quem AINDA não é 5.
    if (value === 5 && beneficios[key] !== 5 && notas5 >= MAX_NOTAS_5) {
      setToast(
        `Você já usou as ${MAX_NOTAS_5} notas 5 disponíveis. Baixe a nota de outro benefício para liberar mais uma.`,
      );
      return;
    }
    const nextBeneficios = { ...beneficios };
    if (value == null) {
      delete nextBeneficios[key];
    } else {
      nextBeneficios[key] = value;
    }
    onChange({ beneficios: nextBeneficios });
  }

  // Phase 11 / D-01: o usuário digita APENAS fte_horas (h/mês). O bucket FTE
  // (5º fator de score) é derivado depois no step Priorização (D-03, Plan 03) —
  // NÃO derivar aqui (fonte única, sem campo manual de bucket).
  function updateFteHoras(v: string) {
    const trimmed = v.trim();
    if (trimmed === '') {
      onChange({ fte_horas: undefined });
      return;
    }
    const n = Number(trimmed);
    onChange({ fte_horas: Number.isFinite(n) ? n : undefined });
  }

  const fteHorasValue =
    data.fte_horas === undefined || data.fte_horas === null
      ? ''
      : String(data.fte_horas);

  return (
    <div className="px-2 py-2">
      {!hideEnriched && (
        <div className="mb-4">
          <div className="mb-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-mut block mb-1">
              FTE estimado (horas/mês)
            </label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={fteHorasValue}
              onChange={(e) => updateFteHoras(e.target.value)}
              placeholder="ex.: 40"
              className="w-full px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15"
            />
          </div>
          <div className="text-[10px] text-mut leading-relaxed">
            Horas/mês economizadas pela automação — usado para classificar o impacto FTE.
          </div>
        </div>
      )}

      <div className="text-[11px] text-mut mb-1">
        Pontue de 1 a 5 cada benefício esperado. Sem pontuação = não considerar.
      </div>
      <div className="text-[11px] mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-txt font-semibold">
          Você pode dar nota 5 a no máximo {MAX_NOTAS_5} benefícios.
        </span>
        <span
          className={
            'px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums border ' +
            (notas5 >= MAX_NOTAS_5
              ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700'
              : 'bg-bg text-mut border-bdr')
          }
        >
          {notas5}/{MAX_NOTAS_5} usadas
        </span>
      </div>
      <div className="space-y-3">
        {lista.map((b) => {
          const v = beneficios[b.key];
          // 5 fica travado quando a cota acabou e este benefício ainda não é 5.
          const cincoBloqueado = v !== 5 && notas5 >= MAX_NOTAS_5;
          return (
            <div key={b.key} className="flex items-center gap-3">
              <span className="text-[11px] text-mut min-w-[170px]">{b.label}</span>
              <div className="flex-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = v === n;
                  // Continua clicável de propósito: o clique dispara o toast que
                  // explica o limite — um botão `disabled` não explicaria nada.
                  const travado = n === 5 && cincoBloqueado;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => update(b.key, active ? null : n)}
                      aria-disabled={travado || undefined}
                      title={
                        travado
                          ? `Limite de ${MAX_NOTAS_5} notas 5 atingido`
                          : undefined
                      }
                      className={
                        'flex-1 py-1.5 rounded text-[11px] font-bold border transition-colors ' +
                        (active
                          ? 'text-white border-transparent'
                          : travado
                            ? 'bg-bg text-mut/50 border-bdr border-dashed cursor-not-allowed'
                            : 'bg-bg text-txt border-bdr hover:border-pril')
                      }
                      style={active ? { background: b.color } : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <span
                className="text-[11px] font-bold min-w-[32px] text-right tabular-nums"
                style={{ color: v ? b.color : 'var(--color-mut)' }}
              >
                {v ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-[10px] text-mut bg-bg rounded-lg px-3 py-2 leading-relaxed">
        <strong>Escala:</strong> 1 = Nada · 2 = Pouco · 3 = Moderadamente · 4 = Muito · 5 = Totalmente
      </div>

      {/* Toast do limite. `fixed` + z alto para aparecer também dentro do modal
          de edição, que tem seu próprio scroll. role=status para leitores de tela. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-[92vw] px-4 py-2.5 rounded-lg shadow-lg text-[12px] font-semibold border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700"
        >
          ⚠️ {toast}
        </div>
      )}
    </div>
  );
}
