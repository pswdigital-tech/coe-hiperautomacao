// =============================================================================
// opportunity_score — fórmula única de 5 fatores (cliente + servidor) — SCORE-04
// =============================================================================
// Fonte da verdade da fórmula de score do produto v0.2. Replica LITERALMENTE os
// pesos e fallbacks de `_giba_wsi-dashboard.html:483-490` (função `calcScore`),
// idênticos aos travados em `tests/schema/score-rule.test.ts` (o SEED da paridade).
//
// Módulo CLIENTE-SAFE (não marcado como server-side): consumido pelo ScorePreview
// (`'use client'`) e pelo teste de paridade. O lado servidor é a função SQL
// `opportunity_score()` (migration 0011); o teste de paridade prova que os dois
// nunca divergem.
//
// Pesos (_giba:483-490):
//   ef = {baixo:20, medio:14, alto:8}      (INVERTIDO 2026-08-14)  fallback 14
//   cx = {baixo:20, medio:13, alto:6}      (INVERTIDO)             fallback 13
//   tm = {diario:20, semanal:16, quinzenal:12, mensal:8, anual:2}  fallback 16
//   ob = objetivo*4 (1→4 .. 5→20)                                  fallback 12
//   ft = {muito_baixo:4, baixo:8, medio:12, alto:16, muito_alto:20} fallback 12
//   score = soma (0–100)
//   priority_level: alta >=70 / media 40–69 / baixa <40
// =============================================================================

export interface Prioridade {
  esforco?: string;
  complexidade?: string;
  tempo?: string;
  objetivo?: number;
  fte?: string;
}

/** Replica LITERAL de calcScore (_giba:483-490), com os mesmos fallbacks. */
export function calcScore(p: Prioridade): number {
  // Esforço é INVERTIDO (2026-08-14): menor esforço de implementação pontua
  // mais — mesma lógica já aplicada à complexidade (cx) abaixo.
  const ef: Record<string, number> = { baixo: 20, medio: 14, alto: 8 };
  const cx: Record<string, number> = { baixo: 20, medio: 13, alto: 6 };
  const tm: Record<string, number> = { diario: 20, semanal: 16, quinzenal: 12, mensal: 8, anual: 2 };
  const ob: Record<number, number> = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 };
  const ft: Record<string, number> = { muito_baixo: 4, baixo: 8, medio: 12, alto: 16, muito_alto: 20 };
  return (
    (ef[p.esforco as string] ?? 14) +
    (cx[p.complexidade as string] ?? 13) +
    (tm[p.tempo as string] ?? 16) +
    (ob[p.objetivo as number] ?? 12) +
    (ft[p.fte as string] ?? 12)
  );
}

/** priority_level conforme SCORE-02 (alta>=70 / media 40–69 / baixa<40). */
export function priorityLevel(score: number): 'alta' | 'media' | 'baixa' {
  return score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baixa';
}

// =============================================================================
// SCORE v0.4 — prioridade = média ponderada de 3 blocos (50/30/20)
// -----------------------------------------------------------------------------
// Decisão de produto (2026-07-22): benefícios (8×1–5) e critérios (8×sim/nao/
// parcial) passam a compor o score de prioridade, além dos 5 fatores. Método:
//   score = round( (5·Fat + 3·Ben + 2·Crit) / (5 + 3·[ben?] + 2·[crit?]) )
// com cada bloco normalizado 0–100. Blocos ausentes saem do denominador
// (renormalização) → row sem benefícios/critérios cai no score de Fatores (compat
// legado). Sub-scores são ARREDONDADOS a inteiro ANTES do blend — assim o client
// (Math.round) e a função SQL `opportunity_score()` (round numeric) batem à
// unidade (sem divergência de float). Espelhado em migration 0027 + parity test.
// =============================================================================

const BENEFICIO_KEYS = [
  'reducaoTempo',
  'eliminacaoErros',
  'produtividade',
  'qualidadeDados',
  'reducaoCustos',
  'reducaoRetrabalho',
  'compliance',
  'objetivosEstrategicos',
] as const;

// Direção favorável de cada critério (a que ajuda a automação). 'decisaoHumana'
// é INVERTIDO (menos decisão humana = melhor candidato) — idem lógica do rpa_score.
const CRITERIO_FAVORAVEL: Record<string, 'sim' | 'nao'> = {
  causaReclamacoes: 'sim',
  totalmenteManual: 'sim',
  regrasClaras: 'sim',
  decisaoHumana: 'nao',
  padronizacaoDocs: 'sim',
  validacaoDados: 'sim',
  schedulable: 'sim',
  temDocumentacao: 'sim',
};

/**
 * Sub-score de benefícios (0–100) — média das notas pontuadas (1–5) normalizada:
 * (média − 1) / 4 × 100. Benefício sem nota = "não considerar" (fora da média).
 * Retorna null se nenhum benefício foi pontuado (bloco ausente → sai do blend).
 */
export function beneficiosSubscore(
  beneficios?: Record<string, number | null | undefined> | null,
): number | null {
  if (!beneficios) return null;
  let sum = 0;
  let n = 0;
  for (const k of BENEFICIO_KEYS) {
    const v = beneficios[k];
    if (typeof v === 'number' && v >= 1 && v <= 5) {
      sum += v;
      n += 1;
    }
  }
  if (n === 0) return null;
  return Math.round((25 * (sum - n)) / n); // (mean-1)/4*100
}

/**
 * Sub-score de critérios (0–100) — favorabilidade dos 8 critérios (sim=1 /
 * parcial=0.5 / não=0 na direção favorável) / 8 × 100. Retorna null se criterios
 * ausente (bloco fora do blend). Chave faltando conta como 0 (defensivo; o CHECK
 * do banco exige as 8 quando não-null).
 */
export function criteriosSubscore(
  criterios?: Record<string, string | null | undefined> | null,
): number | null {
  if (!criterios) return null;
  let sum = 0;
  for (const k of Object.keys(CRITERIO_FAVORAVEL)) {
    const v = criterios[k];
    if (v == null) continue;
    const fav = CRITERIO_FAVORAVEL[k];
    if (fav === 'sim') {
      sum += v === 'sim' ? 1 : v === 'parcial' ? 0.5 : 0;
    } else {
      sum += v === 'nao' ? 1 : v === 'parcial' ? 0.5 : 0;
    }
  }
  return Math.round(12.5 * sum); // sum/8*100
}

/**
 * Score de prioridade v0.4 (0–100) — blend ponderado 50/30/20 dos 3 blocos.
 * Fonte ÚNICA client-side; a função SQL `opportunity_score()` (0027) replica.
 */
export function calcPriorityScore(args: {
  prioridade: Prioridade;
  beneficios?: Record<string, number | null | undefined> | null;
  criterios?: Record<string, string | null | undefined> | null;
}): number {
  const sFat = calcScore(args.prioridade); // 0–100 (sempre presente)
  const sBen = beneficiosSubscore(args.beneficios);
  const sCrit = criteriosSubscore(args.criterios);

  let num = 5 * sFat;
  let den = 5;
  if (sBen !== null) {
    num += 3 * sBen;
    den += 3;
  }
  if (sCrit !== null) {
    num += 2 * sCrit;
    den += 2;
  }
  return Math.round(num / den);
}
