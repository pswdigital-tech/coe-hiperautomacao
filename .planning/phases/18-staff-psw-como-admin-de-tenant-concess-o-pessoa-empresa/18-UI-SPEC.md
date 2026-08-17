---
phase: 18
slug: staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
status: approved
reviewed_at: 2026-08-07
revisions: 1
shadcn_initialized: false
preset: none
created: 2026-08-07
---

# Phase 18 — UI Design Contract

> Contrato visual e de interação para a tela `/admin/staff` (concessão pessoa × empresa) e para
> a mudança de significado do seletor de empresa nas 4 telas de admin existentes (`/team`,
> `/configuracoes`, `/admin/invites`, `/logs`). Gerado por gsd-ui-researcher, verificado por
> gsd-ui-checker.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — sem shadcn/ui, `components.json` não existe no repo (verificado 2026-08-07) |
| Preset | not applicable |
| Component library | none — primitivos HTML + Tailwind v4 (CSS-first, tema em `app/globals.css` via `@theme`), sem Radix/Base UI |
| Icon library | none externa — SVGs próprios em `components/shell/icons.tsx` (`Icon.Invites`, `Icon.Audit`, `Icon.Settings`, `Icon.Chevron`, …) + glifos emoji inline já usados no app (`✓ ⏳ ⚠️ 🗑️ 📈 ⏸`) |
| Font | Poppins (`var(--font-poppins)`), fallback `'Segoe UI', system-ui, -apple-system, sans-serif` — definida em `body` de `app/globals.css` |

**Nota de gate shadcn:** este projeto está na v0.5, maduro, com um sistema de design próprio já estabelecido em produção (Tailwind v4 tokens + primitivos HTML). Introduzir shadcn agora fragmentaria o visual (dois vocabulários de componente coexistindo). Decisão: **não inicializar shadcn nesta fase** — toda a UI de `/admin/staff` e das mudanças nas 4 telas existentes é composta a partir dos primitivos e padrões já em produção, replicando `app/(app)/admin/invites/` (tabela + form + botão de ação por linha) e `components/opportunities/modal/risk/DeleteRiskButton.tsx` (diálogo de confirmação).

---

## Spacing Scale

| Token | Valor | Uso |
|-------|-------|-----|
| 2xs | 4px (`gap-1`, `px-1`) | Espaço entre glifo/badge e texto vizinho |
| xs | 6px (`gap-1.5`, `py-1.5`) | Espaçamento interno de badges/pills, botões de linha |
| sm | 8px (`gap-2`, `p-2`) | Espaçamento entre controles compactos |
| sm+ | 10px (`px-2.5`, `py-2.5`) | Padding de botão/linha de tabela |
| md | 16px (`px-4`, `gap-4`) | Padding de célula de tabela, gap entre campos de form |
| lg | 20-24px (`p-5`, `gap-6`) | Padding de card/painel (`bg-wh rounded-xl border border-bdr p-5`) |
| xl | 24px (`gap-6`) | Espaço entre blocos de página (header / form / tabela) |

`/admin/staff` deve usar os mesmos valores exatos do `admin/invites`: container `px-6 py-6 max-w-4xl mx-auto flex flex-col gap-6`; card `bg-wh rounded-xl border border-bdr p-5 flex flex-col gap-4`; tabela `px-4 py-2.5` por célula.

### ⚠️ Exceção formal ao grid de 4/8px (aprovada pelo PO — 2026-08-07)

Os valores **6px** (`gap-1.5`, `py-1.5`), **10px** (`px-2.5`, `py-2.5`) e **14px** acima **não são múltiplos de 4** e por padrão violariam o contrato de design system do GSD. Isto foi **verificado e formalmente aprovado como exceção pelo PO em 2026-08-07** — não é um descuido, é uma decisão registrada:

- **O que:** manter 6px/10px/14px exatamente como especificado, sem arredondar para 8px/16px.
- **Por quê:** esses valores são a convenção real, em produção, das telas irmãs de admin (`/admin/invites`, `/team`) — badges, botões de ação por linha e padding de célula de tabela já usam esses meios-passos do Tailwind hoje. O `docs/PROJETO.md` deste projeto exige replicar a estrutura existente antes de melhorá-la ("Antes de evoluir/melhorar UI, replique a estrutura exibida ali. Mudanças de layout só após paridade"). `/admin/staff` é uma tela nova que fica lado a lado com essas telas na navegação de admin; migrá-la sozinha para um grid de 4/8px puro a deixaria visualmente estranha ao lado das irmãs.
- **Escopo da exceção:** apenas 6px, 10px e 14px. Todo o restante do espaçamento desta fase segue múltiplos de 4 normalmente (4, 8, 16, 24, 32...), conforme a tabela acima.

---

## Typography

Verificado contra o código real de `app/(app)/admin/invites/page.tsx` e `app/(app)/team/page.tsx` nesta revisão (2026-08-07) — convergido para exatamente **4 tamanhos** e **2 pesos**.

**Tamanhos.** A versão anterior deste contrato declarava um `text-[13px]` para "Body" que **não existe em lugar nenhum do código real** — foi um valor inventado. As células de tabela de `admin/invites`/`team` herdam `text-sm` (14px) do elemento pai (`<table className="w-full text-sm">`), o mesmo tamanho já usado no H2 de seção (`<h2 className="text-sm font-bold">`). Corrigido: **Body agora é 14px** (o valor real, `text-sm`), o que elimina o 13px fabricado. O antigo "texto auxiliar 12px", que vivia como prosa solta fora da tabela principal, volta como uma linha explícita do papel **Auxiliary** — o próprio código mostra que 12px (`text-xs`) já é a convenção real e recorrente para esse papel (subtítulo de página, link "← Voltar", nota de rodapé em `/team`), então foi mantido como está, e não fundido para 13px. Resultado: exatamente 4 tamanhos distintos — **11 / 12 / 14 / 18** — todos extraídos diretamente dos componentes reais, nenhum inventado, todos numa única tabela.

| Role | Size | Weight | Line Height | Uso |
|------|------|--------|-------------|-----|
| Label | 11px (`text-[11px]`, `uppercase tracking-wide` quando aplicável) | 700 (bold) | 1.3 | Cabeçalho de tabela (`th`), badges/pills de status, ações de linha (Revogar/Reenviar/Ver oportunidade), badge "Órfã", badge de escopo "Agindo em" |
| Auxiliary | 12px (`text-xs`) | 400 (regular) | 1.4 | Subtítulo de página, link "← Voltar", notas de rodapé, texto dentro de chips ("Admin nas empresas") |
| Body | 14px (`text-sm`) | 400 (regular) | 1.5 | Célula de tabela, linha de lista, corpo de texto padrão |
| Heading | 14px (`text-sm`) | 700 (bold) | 1.3 | Título de seção (H2 — ex. "Liberar novo e-mail", "Convites pendentes") |
| Display | 18px (`text-lg`) | 700 (bold) | 1.2 | Título de página (H1) |

**Pesos.** Exatamente 2 pesos reais: **400 (regular)** para corpo de texto e texto auxiliar; **700 (bold)** para toda ênfase (headings, `th` de tabela, badges, ações de linha, chips). A versão anterior declarava 3 pesos (400/600/700) e a própria prosa já admitia que isso era indesejado ("2 pesos na prática... não 3") sem de fato convergir a tabela para 2 — corrigido aqui: a tabela agora reflete exatamente o que a prosa sempre quis dizer.

No código real hoje, alguns elementos legados usam `font-semibold` (600) em vez de `font-bold` (700) — os badges `✓ Usado`/`⏳ Pendente`, o botão "Revogar" de linha e o link "← Voltar" em `admin/invites`/`team`. Esse código é **legado, fora do escopo desta fase** (não é reescrito por ela) e permanece como está até ser tocado por uma fase futura. O contrato aqui declarado vale para o que **esta fase constrói**: todo elemento **novo** introduzido pela fase 18 — badge "Órfã", badge de escopo "Agindo em: {Empresa}", chips "Admin nas empresas", botão "Revogar" e cabeçalhos da nova tabela de `/admin/staff` — usa `font-bold` (700), não `font-semibold`, mesmo onde a classe irmã em código legado ainda usa 600. Isso evita introduzir um terceiro peso na única tela nova desta fase.

---

## Color

Todos os valores vêm de `app/globals.css` (`@theme`) — **tokens curtos existentes, não hex novos.**

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `bg-bg` (`#f8fafc`) | Fundo de página, canvas por trás dos cards |
| Secondary (30%) | `bg-wh` (`#ffffff`) + `border-bdr` (`#e2e8f0`) | Cards, tabela, painéis, linhas de conteúdo |
| Accent (10%) | `bg-pri` / `hover:bg-pril` (`#183799` / `#2341e1`) | **Apenas:** botão primário "Conceder acesso de admin", item ativo da Sidebar, avatares/iniciais (círculo `bg-pri`), links de navegação (`text-pri hover:underline`), anel de foco (`focus:ring-pril/20`) |
| Destructive | `bg-red-600` / `hover:bg-red-700` (Tailwind), texto `text-red-600`/`text-red-700` | **Apenas:** botão "Revogar acesso" no diálogo de confirmação e o link inline "Revogar" nas listas |

Accent reserved for: botão de submit do formulário de concessão, item ativo de navegação na Sidebar, círculo de iniciais/avatar, links de texto (`← Voltar`, nomes clicáveis de oportunidade), anel de foco de inputs. **Nunca** para badges informativos (empresas administradas, contagem de atribuições) nem para o banner de "sem contexto de escrita" — esses usam a paleta neutra (`bg-bg`/`border-bdr`/`text-mut`) para não competir visualmente com as duas únicas ações que importam na tela (conceder / revogar).

Cor adicional usada só nesta fase, **dentro da paleta semântica já existente** (não é marca):
- Âmbar (`text-amber-700 bg-amber-50` / dark `text-amber-300 bg-amber-950/40`) — mesmo token já usado para "⏳ Pendente" em `admin/invites` — reservado ao banner "sem empresa selecionada" (aviso, não erro, não destrutivo).
- Verde esmeralda (`text-emerald-700 bg-emerald-50` / dark equivalentes) — mesmo token de "✓ Usado" — **não** usado nesta fase (não há estado de sucesso persistente a badge aqui).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (form de concessão) | **"Conceder acesso de admin"** (botão de submit, mesmo papel visual de "Liberar e-mail" em `InviteForm.tsx`) |
| Empty state heading/body (lista de staff PSW) | **"Nenhum staff PSW cadastrado ainda."** / corpo: **"Convide uma pessoa em Convites de acesso primeiro — depois volte aqui para conceder admin de empresa."** (link para `/admin/invites`) |
| Empty state (pessoa sem nenhuma concessão nem atribuição) | **"Sem admin em nenhuma empresa e sem atribuições individuais."** (texto mut, dentro do bloco expandido da pessoa) |
| Empty state (bloco "Admin nas empresas" vazio) | **"Não é admin de nenhuma empresa."** |
| Empty state (bloco "Atribuições individuais" vazio) | **"Nenhuma atribuição individual."** |
| Loading (tabela de staff) | Reusa o padrão existente — sem skeleton dedicado; Server Component busca antes de renderizar (mesmo padrão de `admin/invites/page.tsx`, sem loading client-side) |
| Error state (concessão falhou) | **"Não foi possível conceder o acesso. Tente novamente."** — banner `role="alert"` vermelho, mesmo componente visual de `InviteForm.tsx:182-189` |
| Error state (tenant-alvo fora de escopo, servidor) | **"Empresa não encontrada ou fora do seu escopo de administração."** — copiar literalmente `ADMIN_SCOPE_DENIED_MESSAGE` (RESEARCH §6), mesmo texto em toda superfície de admin que usar `resolveAdminTenantId()` |
| Banner de escrita desabilitada (D-R, "Todas as empresas" selecionado) | **"Selecione uma empresa na barra lateral para editar."** — banner âmbar acima do formulário/ações de escrita das 4 telas afetadas (`/team`, `/configuracoes`, `/admin/invites`, `/logs`), com os controles de escrita (`disabled`) |
| Destructive confirmation — título | **"Revogar acesso de admin em {empresa}?"** |
| Destructive confirmation — subtítulo | **"Esta ação não pode ser desfeita."** (idêntico a `DeleteRiskButton`/`DeleteTaskButton`) |
| Destructive confirmation — corpo quantificado (D-G) | **"{pessoa} vai deixar de enxergar {N} {oportunidade/oportunidades} de {empresa} que não {está/estão} atribuída(s) a ela diretamente. Atribuições individuais continuam valendo."** — `{N}` sempre calculado em runtime (nunca hardcoded, nunca omitido) |
| Destructive confirmation — botão de confirmar | **"Revogar acesso"** (vermelho, `bg-red-600 hover:bg-red-700`) |
| Destructive confirmation — botão de cancelar | **"Cancelar"** (neutro, mesmo estilo de `DeleteRiskButton`) |
| Origem 1 — rótulo de bloco (D-F) | **"Admin nas empresas"** seguido da lista de nomes/chips |
| Origem 2 — rótulo de bloco (D-F) | **"Atribuições individuais"** seguido de **"{N} ({M} redundantes)"** quando `M > 0`, ou só **"{N}"** quando `M = 0` |
| Badge de concessão órfã (D-S) | **"Órfã — pessoa não é mais Staff PSW"** — chip neutro (não vermelho), ver seção Color |
| Link de leitura para atribuição individual (D-C) | **"Ver oportunidade →"** — nunca "Editar" |

---

## UI Considerations

Cobertura de estados verificada pelo `ui-consideration-probe` em 2026-08-07, sobre 8 elementos/
superfícies desta fase (E1 lista de staff, E2 form de concessão, E3 bloco "Admin nas empresas",
E4 bloco "Atribuições individuais", E5 diálogo de revogação, E6 badge de concessão órfã,
E7 banner de escrita desabilitada, E8 badge de escopo).

**Correção de classificação aplicada (mitigação partial-cue).** O classificador heurístico do probe
detectou `interactive-control` apenas para E5 e **nenhum** kind para E6/E7/E8. Isso é falso-negativo:
E6/E7/E8 são `static-content` e E5 é também `form` (tem pending e erro). Os kinds foram sobrescritos
com a união detectado + identificado antes de gerar o relatório — sem isso, 4 dos 8 elementos não
teriam nenhuma categoria levantada e a cobertura leria verde sem ter checado nada.

**Resultado: 39 considerações aplicáveis (pares elemento × categoria), 0 sem resolução** — 26
`covered` + 5 `backstop`, em **31 linhas** de tabela. A tabela tem menos linhas que considerações
porque algumas cobrem mais de um elemento na mesma linha (ex. "E3 / E4"); nenhuma consideração foi
descartada. Quando várias colapsam na mesma resposta (o estado de loading de um bloco dentro de uma
página server-rendered É o da página), a linha é registrada como *covered-by-reference* nomeando a
referência — nunca omitida, nunca `dismiss` silencioso.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Lista de pessoas staff PSW (`list-collection`) | ✅ covered | Zero staff cadastrado renderiza "Nenhum staff PSW cadastrado ainda." + link para `/admin/invites` (linha da Copywriting Contract) |
| empty | Bloco "Admin nas empresas" por pessoa (`list-collection`) | ✅ covered | Renderiza "Não é admin de nenhuma empresa." — nunca omite o bloco (D-F exige os dois blocos sempre visíveis) |
| empty | Bloco "Atribuições individuais" por pessoa (`list-collection`) | ✅ covered | Renderiza "Nenhuma atribuição individual." pelo mesmo motivo |
| zero-one-many | Contagem "{N} oportunidades" no diálogo de revogação (`interactive-control`) | ✅ covered | Singular "1 oportunidade" / plural "N oportunidades"; `N=0` renderiza "nenhuma oportunidade" e o botão de confirmar permanece habilitado (revogar continua válido mesmo sem impacto visível) |
| zero-one-many | "{M} redundantes" no bloco de atribuições individuais | ✅ covered | `M=0` omite o parêntese inteiro ("{N}" sozinho), nunca mostra "(0 redundantes)" |
| loading | Tabela de staff PSW (`list-collection`) | ✅ covered | Server Component busca antes de renderizar — sem estado de loading client-side a desenhar (mesmo padrão de `admin/invites`) |
| loading | Form de concessão / diálogo de revogação (`form`, `interactive-control`) | ✅ covered | Botão de submit troca para texto "Concedendo..." / "Revogando..." e fica `disabled` durante `pending` — mesmo padrão de `InviteForm`/`DeleteRiskButton` (`useTransition`) |
| error | Form de concessão (`form`) | ✅ covered | Banner vermelho `role="alert"` (linha da Copywriting Contract), sem `alert()` nativo |
| error | Diálogo de revogação (`interactive-control`) | ✅ covered | Mesmo padrão de banner de erro dentro do diálogo, modelado em `DeleteRiskButton.tsx:89-93` |
| overflow | Bloco "Admin nas empresas" com muitas empresas (`list-collection`) | 🧪 backstop | Chips com `flex-wrap`, mesma técnica de `AssigneesPanel.tsx:74` (`flex items-center gap-1.5 flex-wrap`) — sem paginação nesta fase; validar visualmente com uma pessoa administrando 5+ empresas |
| overflow | Nome longo de oportunidade no link de leitura (`static-content`) | 🧪 backstop | `truncate` com `title` completo no atributo (mesmo padrão de `Sidebar.tsx:209` `truncate`) — validar com nome de oportunidade > 60 caracteres |
| long-text | Nome de empresa/pessoa nos chips e badges (`static-content`) | 🧪 backstop | `truncate` + `title` no elemento pai — mesma técnica acima |
| partial | Concessão órfã (D-S) — pessoa sem `role='psw_staff'` mas com linha em `psw_tenant_admins` | ✅ covered | Renderizada com o badge "Órfã" (neutro, opacity reduzida na linha) em vez de omitida ou tratada como erro — comportamento exigido por D-S |
| populated | Tabela de staff PSW em volume típico (dezenas de linhas, conforme RESEARCH §4) | ✅ covered | Tabela simples sem virtualização — volume é "dezenas", mesmo raciocínio de índice da RESEARCH (`psw_tenant_admins` é pequena) |
| empty | E2 form de concessão — nenhuma empresa restante para conceder | ✅ covered | Quando a pessoa selecionada já é admin de **todas** as empresas, o select de empresa fica vazio: renderiza a opção desabilitada **"Esta pessoa já é admin de todas as empresas."** e o botão de submit fica `disabled`. Nunca um select vazio silencioso. |
| empty | E2 form de concessão — nenhum staff PSW cadastrado | ✅ covered | *Covered-by-reference:* o form inteiro não é renderizado quando E1 está vazio; vale o empty state de E1 ("Nenhum staff PSW cadastrado ainda." + link para `/admin/invites`). |
| error | E1 lista de staff PSW (falha de leitura server-side) | ✅ covered | Erro na busca do Server Component renderiza o banner vermelho `role="alert"` com **"Não foi possível carregar a lista de staff PSW. Recarregue a página."** — a página não renderiza uma lista vazia, que seria indistinguível de "não há staff". |
| error | E3 / E4 blocos de origem de acesso | ✅ covered | *Covered-by-reference:* os dois blocos são buscados junto com E1 no mesmo Server Component; a falha é a de E1, acima. Não existe fetch independente por bloco. |
| loading | E3 / E4 blocos de origem de acesso | ✅ covered | *Covered-by-reference:* idem — server-rendered junto com E1, sem estado de loading próprio a desenhar. |
| populated | E3 "Admin nas empresas" / E4 "Atribuições individuais" em volume típico | ✅ covered | Chips em `flex-wrap` sem paginação; volume típico é unidades por pessoa (uma pessoa administra poucas empresas). O caso de volume alto está coberto pelo backstop de `overflow`. |
| partial | E2 form com pessoa escolhida e empresa ainda não | ✅ covered | Botão de submit `disabled` até os dois selects terem valor — mesmo padrão de `InviteForm.tsx`. Sem submit parcial. |
| partial | E3 / E4 — pessoa com uma origem preenchida e a outra vazia | ✅ covered | Exigido por D-F: os **dois** blocos aparecem sempre, o vazio com seu próprio texto ("Não é admin de nenhuma empresa." / "Nenhuma atribuição individual."). Nunca esconder o bloco vazio — esconder faria o leitor concluir que aquela origem não existe. |
| partial | E7 banner / E8 badge de escopo — empresa selecionada mas sem concessão nela | ✅ covered | O badge mostra a empresa e as ações de escrita ficam desabilitadas com o mesmo banner âmbar; o servidor ainda valida (`ADMIN_SCOPE_DENIED_MESSAGE`). UI e servidor concordam, mas o servidor é o bloqueio real. |
| overflow | E1 lista de staff PSW com muitas pessoas | ✅ covered | Volume é "dezenas" (RESEARCH §4); tabela simples sem virtualização nem paginação, mesmo raciocínio de `admin/invites`. |
| overflow | E6 badge órfã / E7 banner / E8 badge de escopo | ✅ covered | Elementos de linha única com texto curto e fixo; sem transbordo possível além do nome de empresa, coberto pelo backstop de `long-text`. |
| zero-one-many | E1 contagem de staff PSW | ✅ covered | *Covered-by-reference:* a lista não exibe contagem agregada — D-F proíbe número único de alcance. As contagens que existem (N/M em E4, N em E5) já estão resolvidas acima. |
| long-text | E5 título do diálogo "Revogar acesso de admin em {empresa}?" | 🧪 backstop | `truncate` no nome da empresa com `title` completo; validar visualmente com nome de empresa > 40 caracteres. |
| long-text | E7 banner de escrita desabilitada | ✅ covered | Texto fixo, sem interpolação — não há transbordo possível. |
| long-text | E8 badge "Agindo em: {Empresa}" | 🧪 backstop | `truncate` + `title`; validar com nome de empresa longo no cabeçalho das 4 telas de admin. |
| long-text | E2 selects do form de concessão | ✅ covered | `<option>` nativo trunca por conta do browser; sem tratamento adicional. |
| long-text | E1 nome/e-mail da pessoa na linha | ✅ covered | *Covered-by-reference:* mesma técnica `truncate` + `title` do backstop de nomes já registrado acima. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | nenhum — shadcn não inicializado nesta fase | not applicable |
| terceiros | nenhum | not applicable |

---

## Screens & Flows

> Seção adicional além do template-base — necessária porque a tela `/admin/staff` é nova e as
> outras 4 telas mudam de contrato sem mudar de layout. Consumida diretamente pelo planner
> (inventário de componentes) e pelo executor (fonte visual).

### 1. `/admin/staff` — layout

Herda o guard de `app/(app)/admin/layout.tsx` (D-N — zero plumbing novo). Estrutura idêntica ao
"esqueleto" de `admin/invites/page.tsx`: container `px-6 py-6 max-w-4xl mx-auto flex flex-col gap-6`,
header com H1 + subtítulo + link "← Voltar", depois o formulário, depois a lista.

**Decisão de layout (Executor's Discretion no CONTEXT.md, resolvida aqui): lista de pessoas com
expansão por linha**, não uma tabela pessoa × empresa. Motivo: D-F exige exibir os DOIS blocos de
origem sempre juntos por pessoa; uma matriz pessoa × empresa fragmentaria essa leitura e obrigaria
scroll horizontal. Uma linha por pessoa, expansível, mantém "Admin nas empresas" e "Atribuições
individuais" adjacentes — a pergunta que a tela responde ("por que fulano vê isto?", RESEARCH
§Architectural Responsibility Map) fica legível numa única leitura vertical.

```
┌─────────────────────────────────────────────────────────────┐
│ Staff PSW como admin de tenant                    ← Voltar   │
│ Conceda e revogue admin de empresa para pessoas da PSW.      │
├─────────────────────────────────────────────────────────────┤
│ [Formulário: Conceder acesso — pessoa (select) + empresa     │
│  (select) + botão "Conceder acesso de admin"]                │
├─────────────────────────────────────────────────────────────┤
│ ▸ Ana Souza · ana@psw.com.br         2 empresas · 3 atrib.   │  ← linha colapsada
│ ▾ Bruno Lima · bruno@psw.com.br      1 empresa  · 1 atrib.   │  ← linha expandida
│   ┌─ Admin nas empresas ──────────────────────────────────┐ │
│   │ [FGCoop ✕ Revogar]                                     │ │
│   └─────────────────────────────────────────────────────────┘ │
│   ┌─ Atribuições individuais (1, 1 redundante) ────────────┐ │
│   │ Oportunidade #042 · FGCoop · já coberta pelo admin      │ │
│   │                                        Ver oportunidade →│ │
│   └─────────────────────────────────────────────────────────┘ │
│ ▸ Carla Dias (órfã) ⏸ · carla@ex-psw.com  1 empresa · 0 atrib.│  ← linha inerte
└─────────────────────────────────────────────────────────────┘
```

Componentes:

- **Tabela raiz** (`bg-wh rounded-xl border border-bdr overflow-hidden`, mesma casca de
  `admin/invites`): colunas Pessoa, Admin nas empresas (contagem/chips resumidos), Atribuições
  individuais (contagem), Ação (chevron de expandir — reusa `Icon.Chevron`).
- **Linha expandida**: os dois blocos (D-F) como sub-painéis dentro da própria linha (`<tr>` extra
  com `colSpan`), não um modal — mantém contexto da lista visível, sem navegação.
- **Bloco "Admin nas empresas"**: chips neutros (`bg-bg border border-bdr rounded-full px-2.5 py-1
  text-[12px]`, mesmo padrão de `AssigneesPanel.tsx:79`) cada um com um botão "Revogar" pequeno
  (texto vermelho, mesma classe do link "Revogar" de `admin/invites/page.tsx:110`). Clicar abre o
  diálogo de confirmação quantificado (ver seção 3).
- **Bloco "Atribuições individuais"**: tabela simples somente-leitura (sem `<select>`, sem
  checkbox — nunca escreve, D-C/GRANT-09), cada linha com nome da oportunidade (truncado + link
  "Ver oportunidade →" para `/opportunities/[id]`) e um marcador textual mut "já coberta pelo
  admin" quando a oportunidade está numa empresa onde a pessoa já é admin (a redundância que D-F
  pede sinalizada).
- **Linha órfã (D-S)**: `opacity-60` na linha inteira + badge "Órfã — pessoa não é mais Staff PSW"
  (chip neutro `bg-bg border-bdr text-mut`, ícone `⏸`) ao lado do nome. Os chips de "Admin nas
  empresas" continuam visíveis (a linha em `psw_tenant_admins` sobrevive) mas sem botão de
  "Revogar" funcionalmente diferente — revogar uma concessão órfã ainda é uma ação válida
  (limpeza manual), então o botão continua ativo; o que muda é só a leitura visual de "isto não
  está concedendo nada agora".

### 2. Formulário de concessão

Modelado em `InviteForm.tsx`: card branco (`bg-wh rounded-xl border border-bdr p-5 flex flex-col
gap-4`), dois selects — **Pessoa** (lista de `profiles` com `role='psw_staff'`, mostrando nome +
e-mail) e **Empresa** (lista de `tenants`, mesma fonte de `admin/invites`) — e o botão primário
"Conceder acesso de admin" (`bg-pri hover:bg-pril text-white`). Sem seletor de "cargo" (não se
aplica aqui). Erro e sucesso seguem o padrão de banner de `InviteForm` (`role="alert"` /
`role="status"`).

### 3. Diálogo de revogação (D-G, quantificado)

**Reusa literalmente o componente-padrão** `DeleteRiskButton.tsx`/`DeleteTaskButton.tsx`: overlay
`fixed inset-0 z-[60] bg-black/60`, card `bg-wh rounded-2xl shadow-2xl max-w-md`, cabeçalho
vermelho claro com ícone `⚠️`, corpo com a contagem quantificada (linha da Copywriting Contract),
rodapé com "Cancelar" (neutro) e "Revogar acesso" (vermelho). Único elemento novo em relação ao
padrão: a contagem `{N}` é buscada no momento em que o diálogo abre (não é uma prop estática do
componente pai) — o clique em "Revogar" no chip dispara a query de contagem antes de abrir o
diálogo, e o diálogo mostra um estado de cálculo curto ("Calculando impacto…") se a resposta não
for imediata, nunca abrindo já com "{N}" desatualizado.

### 4. Contexto de escrita nas 4 telas de admin (D-R) — banner + badge de escopo

Nenhuma tela ganha um segundo seletor. O seletor de empresa da Sidebar (`CompanySelector.tsx`,
`?empresa=` + cookie `coe_empresa`) já existe e passa a ser o contexto de escrita.
**Tratamento proposto (decisão desta fase): badge de escopo no cabeçalho da página + banner de
aviso quando não há empresa selecionada.**

- **Badge de escopo** — no cabeçalho de `/team`, `/configuracoes`, `/admin/invites`, `/logs`
  (mesma linha do H1, ao lado do link "← Voltar"), um chip neutro `bg-bg border border-bdr
  rounded-full px-2.5 py-1 text-[12px] text-txt` com um ícone de prédio/empresa e o texto
  **"Agindo em: {Empresa}"**. Some quando a rota é acessada por um `tenant_admin` comum (ele só
  tem uma empresa possível — o badge só aparece para `platform_admin`/`psw_staff` com concessão em
  mais de uma empresa, onde a ambiguidade existe de fato).
- **Banner de bloqueio** — quando `?empresa=` resolve para "Todas as empresas" (ou não resolve
  para nenhuma concessão do staff-admin), um banner âmbar (`bg-amber-50 border border-amber-200
  text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 rounded-lg px-4
  py-3 text-sm`) acima do formulário/tabela de ações, com a copy "Selecione uma empresa na barra
  lateral para editar." **Todos os controles de escrita da tela** (formulário de convite, upload
  de logo, revogar convite, etc.) recebem `disabled` nesse estado — nunca escondidos (esconder
  sugeriria que a funcionalidade não existe; desabilitado com explicação é mais honesto). A
  leitura (tabela/lista) continua visível normalmente quando aplicável.
- **Por que não um segundo componente**: o CompanySelector já é visível e persistente na Sidebar
  (expande no hover); duplicá-lo por tela adicionaria uma segunda fonte de verdade visual para o
  mesmo estado. O badge de escopo é só eco do estado já selecionado, nunca um controle novo.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS — 4 tamanhos (11/12/14/18), 2 pesos (400/700), verificados contra o codigo real
- [x] Dimension 5 Spacing: PASS — com excecao formal ao grid de 4/8px, aprovada pelo PO em 2026-08-07
- [x] Dimension 6 Registry Safety: PASS — shadcn nao inicializado, com rationale

**Approval:** approved 2026-08-07 (gsd-ui-checker, revisao 1 de 2)

**Historico de verificacao:**
- Revisao 0 — BLOCKED nas dimensoes 4 (5 tamanhos / 3 pesos) e 5 (meios-passos fora do grid de 4).
- Revisao 1 — APPROVED 6/6. Tipografia corrigida na substancia: o "13px Body" da revisao 0 era
  fabricado (nao existe no codigo; as celulas de tabela herdam `text-sm` = 14px). Espacamento
  preservado por decisao do PO, registrado como excecao formal.
