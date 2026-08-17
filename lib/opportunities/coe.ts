// =============================================================================
// coe.ts — display helper de "tempo aberto no COE" (v0.3)
// -----------------------------------------------------------------------------
// `data_abertura_coe`/`data_fechamento_coe` (migration 0017) são geridas pelo
// trigger `sync_coe_dates()` no servidor — este módulo só formata a duração
// pra exibição (mesma lógica de `tempoAbertoCOE` da referência COPA ENERGIA).
// =============================================================================

export function tempoAbertoCoe(
  dataAberturaCoe: string | null,
  dataFechamentoCoe: string | null
): string {
  if (!dataAberturaCoe) return '';
  const inicio = new Date(dataAberturaCoe).getTime();
  if (Number.isNaN(inicio)) return '';

  const fechado = !!dataFechamentoCoe;
  const fim = fechado ? new Date(dataFechamentoCoe!).getTime() : Date.now();
  if (Number.isNaN(fim)) return '';

  let ms = fim - inicio;
  if (ms < 0) ms = 0;

  const min = Math.floor(ms / 60000);
  const horas = Math.floor(min / 60);
  const dias = Math.floor(horas / 24);

  let duracao: string;
  if (dias > 0) duracao = `${dias}d${horas % 24 ? ` ${horas % 24}h` : ''}`;
  else if (horas > 0) duracao = `${horas}h${min % 60 ? ` ${min % 60}min` : ''}`;
  else duracao = `${min || 0}min`;

  return fechado ? `ficou aberto ${duracao}` : `aberto há ${duracao}`;
}
