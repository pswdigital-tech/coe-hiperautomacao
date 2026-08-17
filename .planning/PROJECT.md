# CoE Hiperautomação — Plataforma de Gestão de Demandas

## What This Is

Plataforma SaaS multi-tenant que permite ao cliente (empresa contratante do CoE de Hiperautomação) acompanhar o pipeline de demandas de automação e solicitar novas oportunidades. Cada cliente acessa apenas as suas próprias demandas via login; a empresa provedora (PSW) entrega o produto como serviço e, futuramente, terá um painel administrativo para gerenciar todos os tenants.

O esqueleto visual e o modelo de dados já foram validados no protótipo `fgcoop-coe-v2.html` (29 itens mockados, 9 personas + 20 formulários). Este projeto transforma o mockup em sistema real com banco, backend e frontend.

## Core Value

**O cliente final consegue, em um único lugar, ver o status real de cada demanda de automação que pediu e cadastrar novas oportunidades — sem depender de planilhas, e-mails ou reuniões com o CoE.**

Se tudo mais falhar, esta jornada (login → ver minhas demandas → cadastrar nova) precisa funcionar.

## Current Milestone: v0.2 — Evolução do Modelo (Workshop I / Unidasul)

**Goal:** Evoluir o produto do contrato `fgcoop-coe-v2.html` para o novo contrato `_giba_wsi-dashboard.html` — score de 5 fatores, FTE, RPA Fit, registro de riscos e view de relatório — aplicado globalmente a todos os tenants.

**Target features:**
- Modelo de dados evoluído: `fteHoras`, `rpaScore`, `fonte`, `tipoProcesso`, `beneficioQualitativo` + critérios 8 first-class
- Score reescrito para 5 fatores × 20 (esforço + complexidade + tempo[frequência] + objetivo + **fte**) — função SQL `opportunity_score()` + view `opportunities_with_score`
- Registro de Riscos — nova tabela `opportunity_risks` (tenant_id + RLS), prioridade auto-calculada por matriz impacto×probabilidade
- View "Relatório" — dashboard analítico (cards de portfólio, barras por área, 2 pie charts SVG)
- Wizard de fluxo único de 5 steps (substitui split persona/formulario)
- Atualizações de tela: KPI FTE Total/mês, colunas de tabela (Frequência/Pessoas/Complexidade/FTE/RPA Fit), FTE somado por coluna no kanban
- `_giba_wsi-dashboard.html` vira a fonte da verdade visual + modelo; `fgcoop-coe-v2.html` aposentado; docs/PROJETO.md atualizado

**Key context:**
- **2º momento (fora deste escopo)**: gerar `fteHoras`/`rpaScore`/`fte`/`ferramenta`/`riscos`/score por IA a partir do input — estende a Phase 7.6 já planejada. v0.2 só precisa deixar o schema **compatível** com isso (campos preenchíveis manualmente agora, por IA depois).
- Phase 7.6 (Enriquecimento por IA) do v0.1 permanece pendente e será realinhada ao novo conjunto de campos.
- Deploy de produção (antiga Phase 8 do v0.1) é absorvido ao final deste milestone, pois o schema muda por baixo.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(Nenhum ainda — em pré-MVP. O mockup `fgcoop-coe-v2.html` valida fluxo visual mas não a entrega real.)

### Active

<!-- Current scope. Building toward these. -->

- [ ] **Autenticação por tenant**: cliente faz login e só enxerga dados da sua empresa (isolamento via RLS)
- [ ] **Listagem de oportunidades** em 3 visualizações: Tabela, Cards, Gestão à Vista (Kanban por status)
- [ ] **CRUD de oportunidades** via wizard multi-step (fluxo "Nova Oportunidade" do mockup)
- [ ] **Dois tipos de origem**: `persona` (entrevista qualitativa) e `formulario` (autoatendimento), com schemas próprios
- [ ] **Pipeline de 8 status**: Novo → Em Análise → Planejamento → Backlog → Desenvolvimento → Homologação → Produção → Concluído
- [ ] **Score de priorização** calculado a partir de esforço × complexidade × tempo × objetivo (fórmula do mockup, linhas 410-413)
- [ ] **Fases com datas de início/fim** por etapa do pipeline (para gestão à vista)
- [ ] **Filtros + busca + ordenação** (por nome, processo, área, ferramenta, prioridade, status)
- [ ] **KPIs no topo**: total, por tipo, por prioridade, por status, por ferramenta (RPA / n8n / ambos)
- [ ] **Modal de detalhe** com edição inline (header com troca rápida de status)
- [ ] **Deploy em produção** com acesso por domínio próprio

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Painel administrativo (super-admin / cross-tenant)** — adiado para milestone posterior; foco do MVP é entrega ao cliente final
- **Integração viva com n8n / RPA** — `ferramenta` é apenas um campo de classificação; orquestração real fica para depois
- **IA generativa como feature do produto** (minutas, análise de contratos, etc. mencionadas nas personas) — fora do escopo; é demanda dos clientes, não da plataforma. *(Nota: IA como auxiliar interno invisível — enrichment server-side dos campos de oportunidade — foi reintroduzida escopadamente na Phase 7.6 do v0.1 e estendida no "2º momento" do v0.2.)*
- **Geração por IA dos campos derivados** (`fteHoras`, `rpaScore`, `fte`, `ferramenta`, `riscos`, score a partir do input bruto) — adiada para o "2º momento" (estende Phase 7.6). No v0.2 esses campos são preenchidos manualmente; o schema apenas fica compatível.
- **Notificações por e-mail / push** — não no MVP; usuário consulta sob demanda
- **Audit log / histórico de alterações por campo** — adiar até existir cliente que peça compliance
- **Importação em massa (CSV / Excel)** — adiar; cadastro manual via wizard cobre o início
- **Mobile nativo** — apenas web responsivo

## Context

**Origem do projeto:**
- PSW está construindo um CoE de Hiperautomação como produto/serviço.
- Primeiro cliente piloto: **FGCoop** (Fundo Garantidor do Cooperativismo).
- O mockup `fgcoop-coe-v2.html` (1798 linhas, dados estáticos) foi validado com o cliente e serve como contrato visual + modelo de dados.

**Modelo de dados extraído do mockup** (`DATA[]` em linha 408):
- Campos comuns: `id`, `seq_id`, `tipo` (persona|formulario), `solicitante`, `email`, `area`, `subarea`, `processo`, `frequencia`, `volumeMedio`, `tempoExecucao`, `numPessoas`, `ferramenta` (RPA|n8n|ambos), `escopoAutomacao[]`, `beneficiosEsperados[]`, `prioridade{esforco,complexidade,tempo,objetivo}`, `status`, `fases{emAnalise{ini,fim},...}`.
- Campos só de persona: `cargo`, `tempo_funcao`, `local`, `papel`, `sistemas`, `objetivos`, `metricas`, `desafios`, `dados`, `automacao_atual`, `expectativas`, `processos_detalhados`.
- Campos só de formulário: `criterios_objetivos{}`, `beneficios_mensuraveis{}`.

**Conhecimento prévio do time:**
- Stack preferencial é Vercel + Next.js + Supabase (skills auto-injetados nesta sessão sugerem isso).
- n8n já é usado internamente — pode virar canal de automação operacional pós-MVP.

**Risco-chave:**
- Vazamento entre tenants é o risco existencial — qualquer query que esqueça `tenant_id` quebra o produto. RLS no Postgres é a defesa em profundidade.

## Constraints

- **Tech stack**: Next.js 16 (App Router) + Tailwind + shadcn/ui no frontend; Supabase (Postgres + Auth + Storage) no backend; deploy na Vercel — alinha com o ecossistema já licenciado pela PSW e elimina infra customizada
- **Multi-tenancy**: isolamento obrigatório por Row Level Security do Postgres — toda tabela de domínio carrega `tenant_id` com policy `auth.uid() → tenant_id`
- **Idioma**: UI 100% pt-BR; identificadores de código em inglês (`opportunity`, `tenant`, `phase`)
- **Compatibilidade visual**: a nova UI deve replicar o esqueleto do mockup (tabela / cards / kanban + modal multi-aba + wizard 5–6 steps) antes de evoluir
- **Sem painel admin no MVP**: economiza ~30% do escopo e permite ir ao ar rápido com 1 cliente
- **Segurança**: nenhum endpoint público pode retornar dados de oportunidade sem sessão autenticada + verificação de tenant

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase + Vercel como stack base | Stack já dominada pelo time, multi-tenant via RLS é nativo, deploy é trivial | — Pending |
| **Um único projeto Supabase compartilhado entre todos os tenants** | Migrations e operação centralizadas; custo controlado; RLS faz o isolamento. Confirmado pelo time em 2026-05-20 | ✓ Decidido |
| Multi-tenancy via RLS (não schema-per-tenant) | RLS escala melhor para muitos clientes pequenos e simplifica migrations | ✓ Decidido |
| Score calculado em runtime (não persistido) | Fórmula pode mudar; persistir vira fonte de bug. Recalcula via função SQL `opportunity_score()` | ✓ Decidido |
| `tipo` (persona/formulario) como discriminator com campos opcionais na mesma tabela | Compartilham 80% dos campos; tabelas separadas duplicariam JOIN. JSONB para campos exclusivos | ✓ Decidido |
| Pipeline de status fixo no código (não configurável por tenant) | MVP não precisa flexibilidade; muda quando segundo cliente pedir | — Pending |
| Admin panel adiado para pós-MVP | PSW pode operar via Supabase Studio enquanto não há volume de tenants | — Pending |
| **Começar pela modelagem do banco antes de qualquer código de app** | Schema é o contrato; corrigir migration depois é caro. Front e back se encaixam sobre ele | ✓ Decidido (2026-05-20) |
| **`_giba_wsi-dashboard.html` é o novo contrato visual/modelo global** (v0.2) | Modelo evoluiu substancialmente (FTE, RPA Fit, riscos, score 5-fatores, relatório); aplica a todos os tenants, não só Unidasul | ✓ Decidido (2026-06-04) |
| **Score reescrito para 5 fatores × 20 = 100** (v0.2) | Adiciona FTE como 5º fator e muda `tempo` para frequência; substitui a fórmula 3-fatores+objetivo do mockup antigo | ✓ Decidido (2026-06-04) |
| **Registro de Riscos em tabela própria `opportunity_risks`** (v0.2) | Risco deixa de ser texto livre e vira registro estruturado N:1 com prioridade por matriz; tenant_id + RLS como toda tabela de domínio | ✓ Decidido (2026-06-04) |
| **Geração por IA dos campos derivados adiada para o "2º momento"** (v0.2) | Entregar primeiro o modelo/UI com preenchimento manual; IA enrichment estende a Phase 7.6 depois, sobre schema já compatível | ✓ Decidido (2026-06-04) |
| **Pacote v0.3 implementado direto, sem ceremonial GSD** (discuss/plan/execute por fase) | Escopo levantado por comparação com um inventário de referência externo (COE — COPA ENERGIA); o PO pediu implementação direta para velocidade, mantendo os não-negociáveis deste arquivo (RLS em toda tabela nova, migration write-only, Zod strict, teste de isolamento tenant A≠B) | ✓ Decidido (2026-07-15) |
| **RBAC somente-leitura por usuário** (`profiles.role='viewer'`, v0.3) | Perfil de visualização sem poder editar, bloqueado por RLS de verdade (não só UI) — `current_user_role()` nas policies de write, espelha `current_tenant_id()` | ✓ Decidido (2026-07-15) |
| **Pipeline de 8 → 11 status** (`gestao`/`manutencao`/`descontinuado`, v0.3) | Cobre automações já em manutenção e descontinuadas, fora do fluxo linear datado; `sync_opportunity_phase()` (0004) ajustado para não abrir phase row para esses 3 | ✓ Decidido (2026-07-15) |
| **Documentos/Anotações/Histórico como tabelas próprias, não JSONB** (v0.3) | `opportunity_documents` (upload real via Supabase Storage), `opportunity_notes`, `opportunity_history` (append-only, sem policy de update/delete) — tenant_id + RLS como toda tabela de domínio | ✓ Decidido (2026-07-15) |
| **Excel import/export, campo `vp`, `economiaFinanceira`, botão "restaurar base" e 2º sistema de login: fora do pacote v0.3** | Import/export e os 2 campos ficaram de fora por escolha do PO; o botão de restaurar dados-seed e um login paralelo foram descartados por enfraquecerem a auth Supabase+RLS já existente | ✓ Decidido (2026-07-15) |
| **Shell definitivo passa a ser sidebar esquerda (não topbar)**, identidade visual PSW Digital (azul `#183799`/`#2341e1` + Poppins) | PO apontou uma sidebar que já existia numa branch paralela (`feat/v0.3-produtizacao`, nunca mesclada); portada manualmente sem a parte de admin. Cores/fonte extraídas do site pswdigital.com.br, aplicadas por cima da sidebar (que era navy/verde genérico + Inter). KPI 9-cells e cabeçalho gradiente da tabela confirmados fiéis ao mockup recuperado — não trocados pela versão simplificada da outra branch | ✓ Decidido (2026-07-16) |
| **`feat/v0.3-produtizacao` (branch remota não mesclada) não é trazida por inteiro** | Tem admin panel (`platform_admin`, contradiz "sem painel admin no MVP"), CSV export, overlay de IA — todos fora do escopo atual. Migrations dela (0014-0019) já foram aplicadas no MESMO banco Supabase por outra sessão, com números colididos (conteúdo diferente) com as migrations 0014-0019 do pacote v0.3 do `main`. Só a sidebar (sem admin) foi portada; resto fica disponível na branch pra portar sob demanda | ✓ Decidido (2026-07-16) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-15 — Pacote v0.3 (ad-hoc, fora do fluxo GSD) implementado em código: RBAC viewer, pipeline de 11 status, documentos/anotações/histórico, criticidade + campos operacionais, guia de ajuda, segmentação de portfólio, filtro de área no Relatório. 5 migrations novas (`0014`-`0018`) escritas mas NÃO aplicadas — handoff em `supabase/migrations/0014-0018_HANDOFF.md`, ver `.planning/STATE.md` → Pending Todos. Nada commitado ainda. Previous: 2026-06-05 Phase 15 (Seed Unidasul) completa — **última fase do milestone v0.2** (pendente audit/ship formal do milestone); 2026-06-05 Phase 12 (registro de riscos); 2026-06-04 milestone v0.2 started; 2026-05-20 bootstrap.*
