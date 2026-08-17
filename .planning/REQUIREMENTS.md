# Requirements — Milestone v0.2 (Evolução do Modelo / Workshop I)

Fonte da verdade do delta: [`_giba_wsi-dashboard.html`](../_giba_wsi-dashboard.html). Cada requisito é específico, testável e centrado no usuário/sistema. REQ-IDs novos para o v0.2.

## v0.2 Requirements

### MODEL — Evolução do schema de oportunidades

- [ ] **MODEL-01**: Oportunidade armazena `fteHoras` (numeric, FTE estimado em horas/mês)
- [ ] **MODEL-02**: Oportunidade armazena `rpaScore` (int 0–6, RPA Fit)
- [ ] **MODEL-03**: Oportunidade armazena `fonte` (text, rótulo de origem/coleta, ex. "Workshop I")
- [ ] **MODEL-04**: Oportunidade armazena `tipoProcesso` (text[], categorias do processo)
- [ ] **MODEL-05**: Oportunidade armazena `beneficioQualitativo` (text)
- [ ] **MODEL-06**: Critérios viram 8 campos first-class com valores `SIM`/`NÃO`/`PARCIAL` (causaReclamacoes, totalmenteManual, regrasClaras, decisaoHumana, padronizacaoDocs, validacaoDados, schedulable, temDocumentacao)
- [ ] **MODEL-07**: Oportunidade armazena `prioridade.fte` (enum bucket muito_baixo…muito_alto) como fator de score
- [ ] **MODEL-08**: `prioridade.tempo` passa a representar **frequência** (diario/semanal/quinzenal/mensal/anual) em vez de bucket de duração; enum/migração tratam a mudança de semântica
- [ ] **MODEL-09**: Migration aplica a todos os tenants existentes e faz backfill/compat dos critérios antigos (`formulario_extras` jsonb) para os 8 critérios first-class, sem perda de dados
- [ ] **MODEL-10**: Schema fica **compatível com o enrichment por IA** (campos derivados preenchíveis manualmente agora, por IA no 2º momento — sem refatoração de schema necessária depois)

### SCORE — Fórmula de priorização reescrita

- [ ] **SCORE-01**: Função SQL `opportunity_score()` calcula 5 fatores × 20 = 100 (esforço + complexidade + tempo[frequência] + objetivo + fte), conforme `_giba:483-490`
- [ ] **SCORE-02**: View `opportunities_with_score` expõe o novo `score` + `priority_level` (alta ≥70 / média 40–69 / baixa <40)
- [ ] **SCORE-03**: `rpaScore` (0–6) derivado dos 8 critérios por regra determinística documentada
- [x] **SCORE-04**: Preview de score no wizard usa exatamente a mesma fórmula do backend (sem divergência cliente/servidor) — Phase 10: `lib/opportunities/score.ts` único, paridade validada ao vivo (100/88/59/36/67)

### RISK — Registro de Riscos

- [x] **RISK-01**: Usuário cadastra um risco de uma oportunidade com descrição, tipo (Impedimento/Risco/Oportunidade), responsável (PSW/UnidaSul), impacto, probabilidade, status (Novo/Gerenciado/Mitigado/Ocorrido), resposta ao risco e descrição do impacto — Phase 12-01: camada de dados `createRisk` (Zod + tenant server-derived); UI de cadastro em 12-02
- [x] **RISK-02**: Prioridade do risco (Crítica/Alta/Média/Baixa) é **auto-calculada** pela matriz impacto×probabilidade (`_giba:1180-1185`) — Phase 12-01: trigger `set_risk_priority()` é a autoridade; query lê `priority` GENERATED, nunca no payload; parity test 16/16
- [x] **RISK-03**: Usuário edita e remove riscos de uma oportunidade — Phase 12-01: `updateRisk`/`deleteRisk` (escopo `.eq('tenant_id', profile.tenant_id)`); UI em 12-02
- [ ] **RISK-04**: Riscos são isolados por tenant — nova tabela `opportunity_risks` com `tenant_id` + RLS (policy padrão)
- [x] **RISK-05**: Aba "Risco" do modal lista os riscos em tabela (ID Rxxx, descrição, tipo, responsável, impacto, probabilidade, prioridade, status, ações)

### REPORT — View "Relatório"

- [x] **REPORT-01**: Nova view "📈 Relatório" acessível pelo seletor de views da toolbar — Phase 14
- [x] **REPORT-02**: Cards de portfólio: total de oportunidades, FTE Total/mês, prioridade Alta/Média, RPA Ideal, RPA+n8n, nº de áreas — Phase 14
- [x] **REPORT-03**: Distribuição por área de negócio com barras de quantidade + FTE estimado — Phase 14
- [x] **REPORT-04**: Dois pie charts (SVG): oportunidades por área e FTE por área — Phase 14

### WIZARD — Novo fluxo de criação

- [x] **WIZARD-01**: Wizard único de 5 steps — Identificação → Processo → Critérios → Benefícios → Priorização (substitui o split persona/formulario)
- [x] **WIZARD-02**: Step "Priorização" coleta os 5 fatores de score, incluindo o bucket de FTE, com os pesos visíveis ao usuário
- [x] **WIZARD-03**: Step "Benefícios" coleta os 8 benefícios (escala 1–5) + estimativa de FTE em horas/mês
- [x] **WIZARD-04**: Step "Critérios" coleta os 8 critérios (SIM/NÃO/PARCIAL); validações por step (nome+área obrigatórios; processo obrigatório)

### VIEW — Atualizações das telas existentes

- [x] **VIEW-01**: KPI bar inclui FTE Total/mês + contadores Novos/Produção/Concluídos
- [x] **VIEW-02**: Tabela inclui colunas Frequência, Pessoas, Complexidade, FTE/mês e RPA Fit
- [x] **VIEW-03**: Ordenação disponível por FTE e pelo novo score
- [x] **VIEW-04**: Kanban (Gestão à Vista) soma e exibe FTE por coluna de status
- [x] **VIEW-05**: Modal exibe as 8 abas alinhadas ao novo modelo (Processo/Critérios/Automação/Benefícios/Score/Fases/Risco/Observação) + edição global (Editar/Salvar/Cancelar) com derivados read-only

### DATA — Dados reais Workshop I

- [x] **DATA-01**: As 64 oportunidades do Workshop I são importadas como seed de um tenant "Unidasul" (migration de dados isolada por tenant)

### CONTRACT — Fonte da verdade

- [ ] **CONTRACT-01**: `_giba_wsi-dashboard.html` documentado como a fonte da verdade visual + modelo; docs/PROJETO.md atualizado (nova fórmula de score, novo modelo de dados, novo wizard)
- [ ] **CONTRACT-02**: `fgcoop-coe-v2.html` marcado como deprecated (não mais contrato)

## v0.5 Requirements

Milestone **v0.5 — Execução: Tarefas e Subtarefas por Oportunidade**. Adicionado em 2026-08-04 a pedido do PO. Decisões de produto travadas na abertura (ver Phase 16 no ROADMAP).

### TASK — Tarefas e subtarefas de uma oportunidade

- [x] **TASK-01**: Uma oportunidade tem tarefas (atividades do mapeamento) com título, descrição, status, data de início, data de fim e responsável
- [x] **TASK-02**: Uma tarefa tem subtarefas — hierarquia de **exatamente 2 níveis**; uma subtarefa nunca pode ter filhas (garantido no banco, não só na UI)
- [x] **TASK-03**: Cada tarefa/subtarefa é atribuída a **no máximo um** usuário, obrigatoriamente do **mesmo tenant** da oportunidade; o seletor de responsável só lista usuários daquele tenant
- [x] **TASK-04**: Tarefas são isoladas por tenant — `opportunity_tasks` com `tenant_id not null` + RLS e as 4 policies padrão; tenant A não enxerga tarefas do tenant B
- [x] **TASK-05**: O usuário cria uma tarefa e, a partir dela, adiciona subtarefas, preenchendo todos os campos da tarefa/subtarefa em uma interface dedicada (form/modal)
- [x] **TASK-06**: O usuário edita e remove tarefas e subtarefas; remover uma tarefa-pai remove suas subtarefas, com confirmação explícita
- [x] **TASK-07**: View **Lista** das atividades da oportunidade, com expandir/comprimir (show/hide) das subtarefas de cada tarefa
- [x] **TASK-08**: View **Kanban** das atividades com exatamente 4 colunas na ordem Backlog → Em Andamento → Bloqueio → Finalizado, com drag-and-drop para mudar o status
- [x] **TASK-09**: Mover uma tarefa para **Bloqueio** exige informar o motivo do bloqueio; o motivo fica visível no card e no detalhe da tarefa
- [ ] **TASK-10**: View **Gantt** das atividades no tempo, com barras por tarefa/subtarefa e expandir/comprimir das subtarefas
- [x] **TASK-11**: No Gantt e na Lista, a tarefa-pai exibe o **span agregado** (menor início / maior fim das subtarefas) e o **% de conclusão agregado** — ambos **calculados em runtime, nunca persistidos** (mesma regra do score)

### ACCESS — Acesso multi-tenant do staff PSW por atribuição

Adicionado em 2026-08-06 a pedido do PO. Problema estrutural: hoje uma pessoa da PSW precisa ser cadastrada **dentro** do tenant do cliente (e aí vê tudo daquele cliente), e cadastrá-la num segundo tenant falha porque o e-mail já existe em `auth.users`. Decisões travadas: ver Phase 17 no ROADMAP.

- [x] **ACCESS-01**: Existe o papel `psw_staff` no enum `tenant_role` — pessoa lotada no tenant da PSW cujo acesso **não** é o tenant inteiro, e sim o conjunto de oportunidades atribuídas a ela
- [x] **ACCESS-02**: Uma pessoa da PSW é cadastrada **uma única vez** (um `auth.users`, um `profiles`) e atende N empresas — cadastrar a mesma pessoa duas vezes deixa de ser necessário
- [x] **ACCESS-03**: Um `psw_staff` é atribuído a oportunidades de tenants diferentes ao mesmo tempo; `opportunity_assignees` aceita esse vínculo cross-tenant **apenas** para `psw_staff` e continua rejeitando os demais no banco
- [x] **ACCESS-04**: Ao logar, o `psw_staff` enxerga **somente** as oportunidades atribuídas a ele — nem as demais oportunidades do mesmo tenant, nem as de tenants onde não tem atribuição
- [x] **ACCESS-05**: A visibilidade por atribuição se propaga para todas as tabelas filhas da oportunidade (fases, riscos, tarefas, notas, documentos, histórico, atribuições), de modo que a oportunidade atribuída abre completa
- [x] **ACCESS-06**: O `psw_staff` **escreve** nas oportunidades atribuídas com os poderes de um `member` (tarefas, notas, documentos, riscos, campos/status da oportunidade); escrita fora do escopo é barrada pelo banco
- [x] **ACCESS-07**: O usuário do cliente segue com acesso a **um único** tenant e com o isolamento inalterado — a mudança não abre nenhuma porta cross-tenant para papéis de cliente
- [x] **ACCESS-08**: A listagem de oportunidades do `psw_staff` é **unificada cross-tenant**, com coluna de empresa e filtro por empresa; para os demais papéis a listagem não muda
- [x] **ACCESS-09**: Apenas o `platform_admin` cadastra/convida uma pessoa como `psw_staff` e a atribui a oportunidades de qualquer empresa; `tenant_admin` de cliente não vê nem atribui gente da PSW
- [x] **ACCESS-10**: `psw_staff` e `platform_admin` são papéis distintos — o `platform_admin` continua com visão total (0021), o `psw_staff` só com o que lhe foi atribuído
- [x] **ACCESS-11**: Um `psw_staff` atribuído a uma oportunidade pode ser **responsável de tarefa** dentro dela — o trigger de coerência de tenant de `opportunity_tasks` aceita esse caso e o select de responsável o lista

### GRANT — Staff PSW como admin de tenant (concessão pessoa × empresa)

Adicionado em 2026-08-07 a pedido do PO. Problema estrutural: `profiles` tem **um** `role` e **um** `tenant_id`, o que codifica "esta pessoa tem este papel nesta empresa". O requisito novo — "é admin nas empresas A e C, e nas demais só vê o atribuído" — é um par (pessoa × empresa) que se repete: cardinalidade, não valor novo de enum. A concessão sai de `profiles` e vira tabela. Decisões travadas: ver Phase 18 no ROADMAP.

- [x] **GRANT-01**: Existe uma concessão N:N (pessoa × empresa) que registra de quais tenants um `psw_staff` é admin — um mesmo staff é admin de N empresas simultaneamente, sem duplicar `profiles` nem alterar `profiles.tenant_id`
- [x] **GRANT-02**: Um `psw_staff` **sem** nenhuma concessão continua enxergando **somente** as oportunidades atribuídas a ele — o comportamento entregue pela `0044` não muda em nada
- [x] **GRANT-03**: Um `psw_staff` **com** concessão no tenant A enxerga todas as oportunidades de A **mais** as atribuídas a ele em qualquer outra empresa, numa mesma listagem unificada
- [x] **GRANT-04**: Dentro de um tenant onde tem concessão, o `psw_staff` exerce os **mesmos poderes de um `tenant_admin`** daquele tenant — convites/allowlist, equipe, configurações/branding e logs
- [x] **GRANT-05**: As Server Actions de admin operam sobre um **tenant-alvo explícito**, validado contra a concessão, em vez de derivá-lo de `profile.tenant_id` — nenhuma escrita grava no tenant errado nem responde sucesso tendo afetado zero linhas
- [x] **GRANT-06**: Apenas o `platform_admin` concede e revoga a condição de admin de tenant; um `psw_staff` com concessão **não** promove outra pessoa, no seu tenant nem em nenhum outro
- [x] **GRANT-07**: Existe uma tela `/admin/staff`, restrita ao `platform_admin`, onde ele concede e revoga a concessão e vê, por pessoa, as **duas origens de acesso separadas** — empresas onde é admin e atribuições individuais (indicando quantas são redundantes por já estarem em empresa administrada)
- [x] **GRANT-08**: Revogar uma concessão exige confirmação explícita que informa **quantas oportunidades** a pessoa deixará de enxergar; a atribuição individual sobrevive à revogação
- [x] **GRANT-09**: A atribuição de oportunidade continua sendo editada **somente** na própria oportunidade (`AssigneesPanel`) — a tela de admin exibe atribuições em leitura, com link, e nunca escreve nelas
- [x] **GRANT-10**: Nenhum papel existente muda de comportamento — `member`, `viewer`, `tenant_admin` e `platform_admin` mantêm visibilidade e poderes byte-idênticos, provado por teste de não-regressão

## Future Requirements (deferred)

- **AI-GEN**: Geração por IA dos campos derivados (`fteHoras`, `rpaScore`, `prioridade.fte`, `ferramenta`, `riscos`, score) a partir do input bruto — "2º momento", estende a Phase 7.6. Adiado por decisão do PO (2026-06-04); v0.2 entrega preenchimento manual sobre schema já compatível (MODEL-10).
- **DEPLOY**: Deploy de produção do novo modelo (antiga Phase 8 do v0.1). Não selecionado para o v0.2; será milestone/fase própria quando o modelo estabilizar.
- **REALIGN-7.6**: Realinhar os 9 campos-alvo do enrichment da Phase 7.6 ao novo conjunto de campos do v0.2 antes de executá-la.

## Out of Scope

- **IA generativa como feature do produto** — mantido fora (decisão herdada do v0.1); IA só como auxiliar interno invisível.
- **Painel admin / cross-tenant** — adiado para pós-MVP.
- **Integração viva com n8n/RPA** — `ferramenta` segue sendo classificação.
- **Notificações, mobile nativo, importação CSV genérica** — herdados do Out of Scope do v0.1.

## Traceability

<!-- Preenchido pelo roadmapper (2026-06-04): REQ-ID → Phase. Cobertura 35/35. -->

| REQ-ID | Phase |
|--------|-------|
| MODEL-01 | 9 |
| MODEL-02 | 9 |
| MODEL-03 | 9 |
| MODEL-04 | 9 |
| MODEL-05 | 9 |
| MODEL-06 | 9 |
| MODEL-07 | 9 |
| MODEL-08 | 9 |
| MODEL-09 | 9 |
| MODEL-10 | 9 (compat) / 10 (verificado) |
| SCORE-01 | 9 |
| SCORE-02 | 9 |
| SCORE-03 | 9 |
| SCORE-04 | 10 |
| RISK-01 | 12 |
| RISK-02 | 12 |
| RISK-03 | 12 |
| RISK-04 | 9 |
| RISK-05 | 12 |
| REPORT-01 | 14 |
| REPORT-02 | 14 |
| REPORT-03 | 14 |
| REPORT-04 | 14 |
| WIZARD-01 | 11 |
| WIZARD-02 | 11 |
| WIZARD-03 | 11 |
| WIZARD-04 | 11 |
| VIEW-01 | 13 |
| VIEW-02 | 13 |
| VIEW-03 | 13 |
| VIEW-04 | 13 |
| VIEW-05 | 13 |
| DATA-01 | 15 |
| CONTRACT-01 | 9 |
| CONTRACT-02 | 9 |
| TASK-01 | 16 |
| TASK-02 | 16 |
| TASK-03 | 16 |
| TASK-04 | 16 |
| TASK-05 | 16 |
| TASK-06 | 16 |
| TASK-07 | 16 |
| TASK-08 | 16 |
| TASK-09 | 16 |
| TASK-10 | 16 |
| TASK-11 | 16 |
| ACCESS-01 | 17 |
| ACCESS-02 | 17 |
| ACCESS-03 | 17 |
| ACCESS-04 | 17 |
| ACCESS-05 | 17 |
| ACCESS-06 | 17 |
| ACCESS-07 | 17 |
| ACCESS-08 | 17 |
| ACCESS-09 | 17 |
| ACCESS-10 | 17 |
| ACCESS-11 | 17 |
| GRANT-01 | 18 |
| GRANT-02 | 18 |
| GRANT-03 | 18 |
| GRANT-04 | 18 |
| GRANT-05 | 18 |
| GRANT-06 | 18 |
| GRANT-07 | 18 |
| GRANT-08 | 18 |
| GRANT-09 | 18 |
| GRANT-10 | 18 |

**Cobertura:** 35/35 REQ-IDs do v0.2 mapeados, cada um a exatamente uma fase. (MODEL-10 é uma restrição de compatibilidade satisfeita pelo schema da Phase 9 e verificada na Phase 10 — sem duplicação de entrega.) **v0.5:** 11/11 REQ-IDs `TASK-*` mapeados à Phase 16; 11/11 REQ-IDs `ACCESS-*` mapeados à Phase 17; 10/10 REQ-IDs `GRANT-*` mapeados à Phase 18.
