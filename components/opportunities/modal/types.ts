export type TabId =
  // v0.5 — o Plano de Atividades virou a PRIMEIRA aba do detalhe (antes era
  // sub-rota alcançada por um card). A sub-rota /tarefas continua existindo.
  | 'tarefas'
  | 'processo'
  | 'criterios'
  | 'automacao'
  | 'beneficios'
  | 'score'
  | 'fases'
  | 'risco'
  | 'observacao'
  | 'documentos'
  | 'historico';

export type TabDef = {
  id: TabId;
  label: string;
  icon: string;
};
