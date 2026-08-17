import { fteBucketEnum } from './schema';

/**
 * Bucket de FTE (5º fator de score) — deriva do enum existente, sem redefinir
 * os literais. Fonte do tipo: `fteBucketEnum` em `lib/opportunities/schema.ts`.
 */
export type FteBucket = (typeof fteBucketEnum)['options'][number];

/**
 * deriveFteBucket — fonte ÚNICA horas/mês → bucket de FTE (D-01/D-02).
 *
 * O usuário digita apenas `fte_horas` (step Benefícios); o bucket (`prioridade_fte`)
 * é derivado automaticamente — sem campo manual, impossível divergir. Esta função é
 * consumida tanto pela UI (display/preview no step Priorização) quanto pelo submit
 * (persistência), garantindo display === persistência.
 *
 * Faixas (D-02 / `_giba_wsi-dashboard.html:1565`), limites inferiores INCLUSIVOS,
 * superiores EXCLUSIVOS:
 *   horas < 10           → 'muito_baixo'
 *   10  <= horas < 40    → 'baixo'
 *   40  <= horas < 100   → 'medio'
 *   100 <= horas < 200   → 'alto'
 *   horas >= 200         → 'muito_alto'
 *
 * Entrada não-finita (NaN/undefined coerced) ou negativa é tratada como 0
 * (→ 'muito_baixo'), sem throw.
 *
 * NÃO duplica a fórmula de score nem o peso do FTE — apenas mapeia horas→bucket.
 * O peso vive em `lib/opportunities/score.ts` (D-03).
 */
export function deriveFteBucket(horas: number): FteBucket {
  const h = Number.isFinite(horas) && horas > 0 ? horas : 0;
  if (h < 10) return 'muito_baixo';
  if (h < 40) return 'baixo';
  if (h < 100) return 'medio';
  if (h < 200) return 'alto';
  return 'muito_alto';
}

/**
 * parseLeadingNumber — extrai um número de um campo de texto livre.
 *
 * `tempo_execucao` ("Ex: 1 a 2 horas") e `num_pessoas` ("Ex: De 2 a 4 pessoas")
 * são texto livre no modelo. Para o cálculo de FTE precisamos de números:
 *   - pega o(s) primeiro(s) número(s) (aceita vírgula decimal);
 *   - se houver DOIS números (faixa "2 a 4" / "2-4"), devolve a MÉDIA;
 *   - senão devolve o primeiro; null se não houver número.
 *
 * CAVEAT de unidade: assume que `tempo_execucao` está em HORAS (como o
 * placeholder sugere). "30 minutos" seria lido como 30 — o CoE ajusta na edição.
 */
export function parseLeadingNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = String(text).replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.slice(0, 2).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
}

// Estimativa de execuções/mês a partir da frequência (frequency_bucket) — usada
// como FALLBACK quando `execucoes_mes` (contagem precisa) não foi informado.
// Bases: ~22 dias úteis/mês; semana ~4.3; quinzena ~2.17; ano ~0.083.
const FREQUENCY_TO_MONTHLY: Record<string, number> = {
  diario: 22,
  semanal: 4.3,
  quinzenal: 2.17,
  mensal: 1,
  anual: 0.083,
};

/**
 * computeFteHoras — FTE (horas/mês) CALCULADO, não digitado nem gerado por IA.
 *
 *   fte_horas ≈ (execuções/mês) × (horas por execução) × (pessoas envolvidas)
 *
 * execuções/mês: usa `execucoes_mes` (contagem precisa) se houver; senão estima
 * pela frequência (`tempo`, frequency_bucket). horas/execução e pessoas são
 * parseados dos campos de texto livre. Retorna null se não der pra calcular
 * (aí o 5º fator de score cai no fallback — docs/PROJETO.md §3).
 *
 * Consumida pela UI (display read-only na Priorização) E pelo submit
 * (persistência) → display === persistência, mesma regra do deriveFteBucket.
 */
export function computeFteHoras(params: {
  execucoesMes?: number | null;
  tempo?: string | null; // frequency_bucket, fallback de execuções/mês
  tempoExecucao?: string | null; // horas por execução (texto livre)
  numPessoas?: string | null; // pessoas envolvidas (texto livre)
}): number | null {
  const execMes =
    params.execucoesMes != null && Number.isFinite(params.execucoesMes)
      ? params.execucoesMes
      : params.tempo
        ? FREQUENCY_TO_MONTHLY[params.tempo] ?? null
        : null;
  const horas = parseLeadingNumber(params.tempoExecucao);
  const pessoas = parseLeadingNumber(params.numPessoas);

  if (execMes == null || horas == null || pessoas == null) return null;
  if (execMes <= 0 || horas <= 0 || pessoas <= 0) return null;

  const fte = execMes * horas * pessoas;
  if (!Number.isFinite(fte)) return null;
  return Math.round(fte * 100) / 100; // 2 casas
}
