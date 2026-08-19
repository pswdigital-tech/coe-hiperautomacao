export type TabId =
  // Visão Geral (0061) — painel executivo derivado. É a PRIMEIRA aba e a aba
  // inicial de quem tem perfil somente-leitura (o cliente); quem trabalha na
  // oportunidade continua caindo no Plano de Atividades.
  | 'visao-geral'
  // v0.5 — o Plano de Atividades virou a PRIMEIRA aba do detalhe (antes era
  // sub-rota alcançada por um card). A sub-rota /tarefas continua existindo.
  | 'tarefas'
  // 'processo' = seção "Processo Atual" (0063): absorveu a aba Critérios —
  // o diagnóstico é feito SOBRE o processo descrito, não é outro assunto.
  | 'processo'
  // Solução (0062) — substitui "Automação", nome que não distinguia nada
  // numa plataforma em que tudo é automação.
  | 'solucao'
  // Governança (0063) — absorve Risco, Observações, Documentos e Histórico.
  // Ao contrário das outras seções, tem sub-navegação: são quatro REGISTROS
  // independentes com CRUD próprio, não uma narrativa contínua.
  | 'governanca'
  // Cronograma (0061) — substitui a antiga aba "Fases": reusa a tabela de
  // estimativas dela por dentro e acrescenta o Gantt do projeto e os
  // indicadores de prazo.
  | 'cronograma'
  | 'historico';

export type TabDef = {
  id: TabId;
  label: string;
  icon: string;
};
