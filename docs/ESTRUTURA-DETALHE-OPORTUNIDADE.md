# Estrutura da página de detalhe da oportunidade

Brief de design para a reorganização da tela `/opportunities/[id]`.
Documento de **arquitetura de informação e layout** — não é especificação de implementação.

> ⚠️ **Este é o brief ORIGINAL, anterior à implementação.** As seis seções e os
> princípios continuam valendo, mas a construção divergiu dele em pontos
> concretos — todos por decisão do PO durante a execução:
>
> - **Benefícios** ficam em **Solução**, não em Processo Atual: benefício é
>   propriedade do que a solução entrega, não descrição do processo de hoje.
> - **Score** deixou de ser seção própria e virou o bloco final de
>   **Processo Atual** ("Por que foi priorizado assim"), na sequência do
>   diagnóstico de critérios.
> - **Cronograma** é só a tabela de estimativa × realizado por fase. O Gantt de
>   fases descrito em §6.3 foi construído e removido; o único Gantt do produto
>   é o de tarefas, no Plano de Atividades.
> - **Visão Geral** não tem o card de prazo estimado × projetado (§6.1) nem
>   "Entregas Principais"; o "Próximo marco" é derivado da próxima fase e some
>   quando não existe.
> - `objetivo_solucao` foi criado e removido: o objetivo é **um só**
>   (`objetivo_projeto`), exibido na Visão Geral e na Solução.
> - Os campos técnicos (Azure Boards, linguagem, execução, usuários de serviço,
>   data de conclusão) não têm tela; as colunas seguem no banco e no CSV.
>
> Para o estado real, leia os componentes em `components/opportunities/`.

---

## 1. Contexto

A tela é o dossiê de uma oportunidade de automação: desde o processo manual que a
originou até o acompanhamento do projeto que a automatiza.

Hoje ela tem **11 abas nomeadas pela estrutura de dados** (Plano de Atividades, Processo,
Critérios, Automação, Benefícios, Score, Fases, Risco, Observações, Documentos, Histórico).
O conteúdo está correto; a organização não comunica nada — o leitor não sabe onde procurar
uma resposta, porque as abas respondem a "que tabela é essa" e não a "o que eu quero saber".

**A proposta reduz para 6 seções organizadas por pergunta do leitor.**

## 2. Os dois públicos

| Público | Quem é | Frequência | O que quer |
|---|---|---|---|
| **Cliente / patrocinador** | área demandante, gestor, perfil somente-leitura | eventual | onde está meu projeto, quando entrega, o que será construído, quanto vale |
| **Time do CoE** | analistas, tech leads, admin | diária | o que fazer agora, o que está atrasado, editar o cadastro |

A tela precisa servir os dois sem virar duas telas. A solução é **ordem por narrativa +
seção inicial por papel + densidade proporcional à frequência de leitura.**

## 3. Princípios de layout

1. **O tamanho da seção segue a frequência de leitura.** Seções consultadas todo dia
   (Visão Geral, Plano) precisam caber acima da dobra e serem densas. Seções lidas uma vez
   (Processo Atual, Solução) podem ser longas e roladas — são narrativas, não painéis.
2. **Um resumo, não três.** Hoje existem o header, uma coluna lateral e o conteúdo da aba
   repetindo os mesmos dados. A Visão Geral absorve a coluna lateral; a coluna lateral deixa
   de existir.
3. **Cada dado tem um dono.** Um campo aparece em uma seção como fonte. Se repetir em outra,
   é eco explícito e clicável, levando à seção dona.
4. **Duas réguas de tempo, rotuladas.** O projeto tem duas linhas do tempo legítimas e
   ambas permanecem (ver §6.3 e §6.4). As duas mostram atividades; o que as separa é a
   pergunta que respondem, não o dado que exibem. Cada uma declara seu escopo no título
   para que ninguém pergunte "qual data vale".
5. **Nada de card vazio.** Campo sem valor não renderiza placeholder; some. Se a seção
   inteira ficar vazia, mostra um estado vazio com uma frase e a ação que a preenche.

## 4. Estrutura persistente (fora das seções)

Um **header fixo**, idêntico nas 6 seções, com:

- Trilha de navegação: `Oportunidades › #0042 · Nome do Solicitante`
- Avatar com iniciais + identificador `#0042 · Nome do Solicitante`
- Linha secundária: nome do processo · área · subárea
- Selo da empresa (só para quem opera múltiplas empresas)
- Selo de enriquecimento por IA (pendente / enriquecido / falhou)
- **Status da oportunidade** — seletor (novo, em análise, planejamento, backlog,
  desenvolvimento, homologação, produção, concluído, descontinuado)
- **Anel de Score** 0–100 com cor por faixa (≥70 verde, ≥40 âmbar, <40 vermelho)
- **Tag de prioridade manual** (alta / média / baixa) — ao lado do anel, visualmente
  distinta dele: uma é julgamento humano, a outra é cálculo
- **Selo de tipo de solicitação** quando for melhoria ou incidente, com link para a
  automação de origem
- **Pilha de responsáveis** (avatares sobrepostos) + ação "Gerenciar"
- Ações: Editar / Salvar / Cancelar · Reprocessar IA · menu de mais ações

Abaixo do header, a **barra de seções**, com um separador visual entre os dois grupos:

```
[ Visão Geral · Plano de Atividades · Cronograma ]  |  [ Solução · Processo Atual · Governança ]
        acompanhamento (vivo, diário)                        dossiê (referência, leitura única)
```

O separador é a peça mais barata e mais informativa do redesenho: sozinho ele diz o que
muda toda semana e o que é documentação.

**Seção inicial por papel:** perfil somente-leitura abre em Visão Geral; os demais abrem
em Plano de Atividades.

---

## 5. Mapa rápido

| Seção | Pergunta que responde | Público principal |
|---|---|---|
| 1. Visão Geral | Como está o projeto agora? | cliente |
| 2. Plano de Atividades | O que está sendo feito e por quem? | CoE |
| 3. Cronograma | Em que fase está e quando entrega? | ambos |
| 4. Solução | O que será construído? | cliente |
| 5. Processo Atual | Como é hoje e por que vale automatizar? | cliente |
| 6. Governança | Riscos, decisões, arquivos, rastro | ambos |

---

## 6. As seções

### 6.1 Visão Geral

Painel executivo. Deve caber em uma tela sem rolagem em desktop.

**Bloco A — Onde está** (faixa superior, 4 indicadores)
- Fase atual do pipeline
- Percentual concluído (rosca com fatia por status de tarefa)
- Prazo: data estimada de conclusão × data projetada pelas tarefas
- FTE economizado por mês

**Bloco B — Alertas** (só aparece se houver algo; caso contrário, some inteiro)
- Tarefas atrasadas (contagem + link)
- Tarefas em bloqueio, com o motivo da mais recente
- Riscos abertos de prioridade alta ou crítica
- Fases com prazo estourado (fim estimado no passado, sem fim realizado)

Cada alerta é uma linha clicável que leva à seção dona. Zero alertas = faixa verde
discreta "sem pendências críticas".

**Bloco C — Próximas entregas**
Até 5 tarefas com data, ordenadas por vencimento: título, status, responsável, data.

**Bloco D — Por que este projeto** (resumo do valor, sempre em eco de §6.5)
- Objetivo do projeto (texto curto)  ⚠️ CAMPO NOVO
- Top 3 benefícios identificados (selos)
- Score de prioridade com a faixa (alta / média / baixa)

---

### 6.2 Plano de Atividades

**Track de desenvolvimento.** É o conteúdo mais usado da tela pelo time do CoE.
Mantém exatamente as três visões que existem hoje, no mesmo alternador:

- **Lista** — hierarquia de 2 níveis (tarefa → subtarefa), expansível, com paginação
  e agrupamentos separados para pendentes, em homologação e concluídas
- **Kanban** — 5 colunas na ordem canônica: Backlog · Em Andamento · Homologação ·
  Finalizado · Bloqueio (bloqueio por último de propósito: é desvio do fluxo, não etapa dele)
- **Gantt de tarefas** — barras por tarefa e subtarefa, escala de dias/semanas

> **O Gantt de tarefas permanece aqui, dentro do Plano.** Ele é o acompanhamento da
> execução do desenvolvimento e pertence ao mesmo alternador de Lista e Kanban.
> Ele **não** se confunde com o Gantt do Cronograma (§6.3) — ver §6.4.

Cabeçalho da seção: título, contagem de tarefas, alternador de visão, botão "Nova Tarefa".

Campos por tarefa: título, descrição, status, prioridade, data de início, data de entrega,
responsável, motivo do bloqueio (obrigatório ao entrar em Bloqueio).

---

### 6.3 Cronograma

**Track do projeto.** A esteira macro, que é o compromisso com o cliente.

**Bloco A — Pipeline de fases**
Uma linha por fase, na ordem: Refinamento · Planejamento · Backlog · Desenvolvimento ·
Homologação · Produção · Concluído. Mais a etapa fora do fluxo: Descontinuado.

Cada linha mostra **duas faixas de tempo distintas**:
- **Estimado** — início e fim planejados, editáveis, salvos na hora
- **Realizado** — início e fim carimbados automaticamente na mudança de status,
  somente leitura

A fase em andamento é destacada. Fase com fim estimado vencido e sem fim realizado
recebe marcação de atraso.

**Bloco B — Gantt do projeto (fases + atividades)**

A régua de tempo macro. Tem **dois níveis**:

*Nível 1 — as fases (sempre visível)*
Cada fase é uma barra-resumo, com a barra **estimada** e a **realizada** sobrepostas
(a realizada mais estreita, desenhada sobre a estimada) para que o desvio salte aos
olhos. Marcadores verticais: hoje e a data de conclusão registrada.

*Nível 2 — as atividades dentro de cada fase (expansível)*
Cada fase pode ser **expandida** para revelar as atividades daquela fase, plotadas na
mesma régua, recolhidas por padrão. ⚠️ DEPENDE DE CAMPO NOVO — ver abaixo.

Regras que mantêm este Gantt distinto do Gantt de tarefas do Plano (§6.2):

| | Gantt do projeto (aqui) | Gantt de tarefas (§6.2) |
|---|---|---|
| Hierarquia | fase → atividade (2 níveis) | tarefa → subtarefa (2 níveis) |
| Estado inicial | tudo recolhido: só as fases | tudo visível: a lista de trabalho |
| Profundidade | só tarefas-raiz; subtarefas não descem aqui | tarefas **e** subtarefas |
| Edição | somente leitura | é a superfície de trabalho |
| Escala | semanas e meses | dias e semanas |
| Barra da fase | resumo estimado × realizado | não existe |

Expandir uma fase **nunca desloca as barras das outras fases** — o eixo é calculado sobre
o conjunto completo, independentemente do que está expandido.

> **A dependência de dados.** Hoje uma tarefa não sabe a que fase pertence: não existe
> vínculo entre atividade e fase no modelo. Enquanto o vínculo não existir, o nível 2
> deve ser desenhado como uma **faixa única de atividades sob as barras de fase** — todas
> as tarefas-raiz na mesma régua, sem agrupamento, com um cabeçalho "Atividades" — e não
> como fases expansíveis. O desenho da versão com agrupamento por fase deve existir no
> material entregue, identificado como dependente do campo novo.

**Bloco C — Ciclo no CoE**
Data de abertura, data de fechamento e tempo decorrido no CoE.

**Bloco D — Próximo marco**
A próxima fase com início estimado e quantos dias faltam.

---

### 6.4 Como as duas visões de tempo convivem

Esta é a decisão de design mais importante do documento. **Os dois Gantts existem e são
mantidos**, porque respondem a perguntas diferentes para públicos diferentes:

| | Gantt de tarefas (§6.2) | Gantt do projeto (§6.3) |
|---|---|---|
| Pergunta | quem está fazendo o quê, e quando entrega | o projeto está no prazo |
| Granularidade | tarefa e subtarefa | fase, com as atividades por baixo |
| Escopo | execução do desenvolvimento | ciclo de vida do projeto |
| Público | time do CoE | cliente e gestão |
| Horizonte | dias e semanas | semanas e meses |
| Estado inicial | tudo aberto | tudo recolhido, só as fases |
| Interação | editar, criar, reordenar | ler; expandir para investigar |
| Origem das datas | preenchidas por quem executa | planejadas por quem gerencia |

**Os dois mostram atividades — e isso é intencional, não duplicação.** A diferença não
está em *quais dados* aparecem, e sim em *que pergunta cada um responde*: o do Plano é a
lista de trabalho aberta na mesa; o do projeto é o retrato de prazo, onde as atividades
só aparecem quando alguém quer entender por que uma fase está atrasada. Um é ferramenta
de execução, o outro é instrumento de leitura.

**Regras de desenho que impedem a confusão:**

1. Cada um declara o escopo no próprio título: *"Gantt de tarefas — execução"* e
   *"Gantt de fases — projeto"*.
2. Paletas deliberadamente distintas: no Gantt de tarefas as barras usam as cores dos
   status de tarefa (as mesmas dos selos e do Kanban); no Gantt do projeto as barras de
   **fase** usam escala neutra com estimado × realizado diferenciados por preenchimento,
   e as barras de **atividade**, quando expandidas, aparecem mais finas e dessaturadas —
   subordinadas à fase, nunca competindo com ela.
3. Cada um traz um link discreto para o outro: no Plano, "ver o cronograma do projeto";
   no Cronograma, "abrir no plano de atividades" a partir de uma barra de atividade.
4. A Visão Geral, ao mostrar prazo, exibe **os dois números lado a lado e rotulados** —
   "estimado (fases)" e "projetado (tarefas)" — com a diferença entre eles em destaque
   quando houver divergência. É aí que a divergência vira informação em vez de dúvida.

---

### 6.5 Solução

O que será construído. Narrativa, pode rolar.

**Bloco A — Objetivo da solução** ⚠️ CAMPO NOVO
Parágrafo curto: o que a automação faz, em linguagem de negócio.

**Bloco B — Ferramentas**
Seleção múltipla do catálogo de ferramentas de automação, como selos com ícone.

**Bloco C — Escopo do projeto**
Lista de itens contemplados.

**Bloco D — Fora do escopo** ⚠️ CAMPO NOVO
Lista do que explicitamente não será feito. Visualmente contraposta ao bloco C
(mesma forma, tratamento apagado). É o bloco que mais evita conflito com o cliente.

**Bloco E — Critérios de aceite** ⚠️ CAMPO NOVO
Lista verificável do que precisa ser verdade para a entrega ser aceita.

**Bloco F — Operacional** (só quando a automação já está implementada; recolhido por padrão)
Código no board de desenvolvimento, linguagem, ambiente de execução, usuários de serviço,
data de conclusão. Conteúdo técnico, secundário na hierarquia visual.

---

### 6.6 Processo Atual

O caso de negócio: como funciona hoje, o que foi diagnosticado, quanto vale.
Narrativa longa, lida uma vez, com três blocos claramente separados.

**Bloco A — Como funciona hoje**
Grade de fichas curtas: frequência de execução · número de execuções · execuções por mês ·
tempo médio de execução · pessoas envolvidas · área responsável · subárea/time ·
tipo de processo · gatilho (o que inicia) · formato das entradas · dados sensíveis (LGPD) ·
criticidade.

Em largura total, texto corrido: descrição de como o processo funciona hoje ·
sistemas utilizados · dor atual e motivação · notas internas.

> As notas internas são conteúdo do CoE. Ocultar do perfil somente-leitura.

**Bloco B — Diagnóstico de automação**
- Barra-resumo "X de 8 critérios favoráveis à automação", com cor por faixa
- Os 8 critérios em grade de duas colunas, cada um com borda lateral verde ou vermelha
  conforme favorável ou não, e um selo Sim / Não / Parcial
- **Indicador de aderência a RPA** (0–6) com selo de faixa — dado que já existe e hoje
  não aparece nesta tela

Nota de leitura necessária: um dos critérios é invertido — "necessidade de decisão humana
frequente" é favorável quando a resposta é **não**. O desenho deve deixar isso legível
sem precisar de rodapé explicativo.

**Bloco C — Valor esperado**
- Dois cartões de destaque: FTE economizado por mês · média dos benefícios (1–5)
- Os 8 benefícios pontuados de 1 a 5, com barra e cor por faixa
- Top 3 benefícios em selos
- Benefícios esperados da automação (lista de texto livre)
- Benefício qualitativo (parágrafo em destaque)

**Bloco D — Composição do score**
- Os três blocos ponderados: Fatores 50% · Benefícios 30% · Critérios 20%,
  cada um de 0 a 100, com barra
- Detalhe dos 5 fatores: esforço/viabilidade · complexidade · frequência/retorno ·
  alinhamento estratégico · impacto em horas (FTE), cada um valendo 20 pontos
- Nota explicando que blocos não informados saem do cálculo e os pesos são renormalizados

O anel de score do header e este bloco são o mesmo número: o header dá o valor,
esta seção dá a explicação.

**Bloco E — Entrevista** (só quando a oportunidade veio de entrevista de persona;
recolhido por padrão)
Cargo · tempo na função · localidade · responsabilidades · objetivos e metas ·
métricas acompanhadas · uso de dados · principais desafios · situação atual de automação ·
expectativas com o CoE · priorização indicada · observações.

---

### 6.7 Governança

Controle e rastreabilidade. Sub-navegação interna de 4 itens — não acordeões empilhados.

**Riscos e impedimentos**
- Tabela de riscos: identificador · descrição · tipo · responsável · impacto ·
  probabilidade · prioridade (calculada pela matriz impacto × probabilidade) · status.
  Criar, editar e excluir. O formulário inclui ainda plano de resposta e descrição do impacto.
- **Impedimentos ativos**, logo abaixo: as tarefas em status Bloqueio com o motivo
  registrado, agregadas aqui. É dado que já existe e nunca foi somado em nenhum lugar.

**Notas**
Registro cronológico: data, autor, texto, imagens anexadas na própria nota.
Campo de escrita no topo.

**Documentos**
Arquivos enviados e links externos: ícone por tipo, nome, tamanho, data, quem enviou,
miniatura quando for imagem, baixar/abrir, excluir. Área de envio e campo de link no topo.

**Histórico**
Registro de auditoria, automático e somente leitura: data e hora · usuário · ação
(criou / alterou / excluiu) · origem (a oportunidade, uma tarefa, um risco, uma nota,
um documento, um responsável) · o que mudou, campo a campo, de → para.

**Partes envolvidas** (bloco fixo no topo da sub-navegação, visível nos 4 itens)
Solicitante e e-mail · responsáveis atribuídos (leitura, com link para o "Gerenciar" do
header) · quem cadastrou e quando.

---

## 7. Estados vazios

Toda seção precisa de um estado vazio com uma frase e, quando cabível, a ação que o resolve:

| Seção | Estado vazio |
|---|---|
| Visão Geral | "Este projeto ainda não tem plano de atividades." + ação criar tarefa |
| Plano de Atividades | "Nenhuma tarefa cadastrada." + ação criar tarefa |
| Cronograma | fases sem data: linhas presentes, campos de data vazios e editáveis |
| Solução | "O escopo ainda não foi definido." |
| Processo Atual | por bloco: "Critérios técnicos ainda não preenchidos", "Benefícios ainda não pontuados" |
| Governança | por sub-item: "Nenhum risco registrado", "Sem anotações", "Nenhum documento", "Nenhuma alteração registrada" |

---

## 8. Estilo visual

O produto já tem uma linguagem estabelecida — o redesenho a mantém, não a substitui.

- Fundo da página cinza muito claro; cartões brancos com borda fina, cantos arredondados
  (12–16px) e sombra sutil. Em tema escuro, fundo quase preto azulado e cartões cinza-ardósia.
- Azul institucional profundo como cor primária; verde-esmeralda para ações de confirmação.
- Tipografia compacta: rótulos de 10–11px em caixa alta com espaçamento entre letras,
  valores de 12–14px, títulos de seção de 15–18px. Números sempre em fonte tabular.
- Escala de status de tarefa (usar as mesmas cores em selo, Kanban, rosca e Gantt de tarefas):
  Backlog âmbar · Em Andamento azul · Homologação ciano · Finalizado verde · Bloqueio vermelho.
- Escala de score e de prioridade: verde ≥70 · âmbar ≥40 · vermelho <40.
- Tema claro e escuro obrigatórios, ambos com contraste verificado.
- Responsivo: em telas estreitas as grades de fichas viram uma coluna; a barra de seções
  vira rolagem horizontal; as tabelas largas (riscos, histórico, Gantt) rolam dentro do
  próprio contêiner — a página nunca rola na horizontal.

---

## 9. O que não fazer

1. **Não criar um terceiro resumo.** A coluna lateral atual deixa de existir; seu conteúdo
   de processo vai para Processo Atual e seu conteúdo de progresso vira a Visão Geral.
2. **Não repetir o status da oportunidade dentro das seções.** Ele mora no header e está
   visível o tempo todo.
3. **Não descer os responsáveis para dentro da Governança.** Eles ficam no header.
4. **Não transformar a Governança em seis acordeões.** Seis acordeões são as mesmas abas
   de antes com um clique a mais.
5. **Não fundir os dois Gantts, nem tratá-los como duplicata.** São dois instrumentos com
   perguntas, públicos e horizontes diferentes (§6.4). O Gantt do projeto mostrar
   atividades **não** o transforma no Gantt do Plano: lá elas são o trabalho, aqui são
   evidência de atraso — recolhidas por padrão, sem subtarefas e sem edição.
6. **Não inventar dado.** Os campos marcados ⚠️ CAMPO NOVO ainda não existem; desenhe-os,
   mas mantenha-os identificáveis para que a implementação saiba que dependem de mudança
   no banco.

---

## 10. Campos que ainda não existem

Marcados com ⚠️ ao longo do documento. Não têm dado hoje e dependem de evolução do modelo:

| Campo | Seção |
|---|---|
| Objetivo do projeto (texto) | Visão Geral |
| Objetivo da solução (texto) | Solução |
| Fora do escopo (lista) | Solução |
| Critérios de aceite (lista) | Solução |
| Papel do responsável (líder técnico, validador, patrocinador) | Governança |
| **Vínculo entre atividade e fase** — sem ele o Gantt do projeto não agrupa as atividades por fase (§6.3 Bloco B) | Cronograma |
| Marcos e responsável por fase | Cronograma |
| Aprovações formais (item, responsável, status, data) | fora deste redesenho |

Tudo o mais descrito neste documento já existe e está gravado.
