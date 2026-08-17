// =============================================================================
// discovery-labels.ts — rótulos legíveis dos códigos guardados em
// `opportunities.formulario_extras` (Discovery v2).
//
// Extraído de `modal/tabs/ProcessoTab.tsx` quando o "Resumo da Oportunidade"
// da coluna lateral do detalhe passou a exibir os MESMOS campos: duas cópias
// dos mapas divergiriam no primeiro rótulo ajustado (mesma motivação do
// cabeçalho de `status.ts`). Sem I/O, sem React — só dados + um helper puro.
// =============================================================================

export const GATILHO_LABELS: Record<string, string> = {
  email: 'Chega um e-mail / mensagem',
  horario: 'Horário / agenda',
  solicitacao: 'Alguém solicita / abre chamado',
  evento_sistema: 'Evento em um sistema',
  planilha: 'Atualização de planilha / arquivo',
  outro: 'Outro',
};

export const FORMATO_ENTRADA_LABELS: Record<string, string> = {
  estruturado: 'Estruturado (planilha, sistema, formulário)',
  nao_estruturado: 'Não estruturado (PDF, e-mail, imagem, papel)',
  misto: 'Misto',
};

export const DADOS_SENSIVEIS_LABELS: Record<string, string> = {
  sim: 'Sim — dados pessoais/sensíveis',
  nao: 'Não',
  nao_sei: 'Não sei',
};

/** Código → rótulo, caindo no próprio código quando desconhecido (dado legado). */
export function labelOf(
  map: Record<string, string>,
  code?: string | null
): string | null {
  if (!code) return null;
  return map[code] ?? code;
}
