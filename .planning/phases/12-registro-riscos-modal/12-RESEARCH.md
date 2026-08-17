# Phase 12: Registro de Riscos (UI do modal) — Research

**Researched:** 2026-06-05
**Domain:** Next.js 16 App Router (parallel + intercepting routes, modal stacking) + Supabase Server Actions/queries + shadcn/Tailwind UI
**Confidence:** HIGH (arquitetura verificada contra docs oficiais Next 16.2.7 + código vivo do repo)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A aba "Risco" mantém **tabela de leitura** dos riscos (RISK-05): colunas ID (R001…), descrição, tipo, responsável, impacto, probabilidade, prioridade, status, ações. Layout fiel a `_giba:1198-1232` (badges tipo/prioridade).
- **D-02:** CRUD vive numa **sub-rota dedicada interceptada** (modal aninhado), seguindo o padrão `@modal` atual. Botões "+ Adicionar"/✏️/🗑️ abrem a sub-rota. **Acesso direto via URL deve renderizar fullscreen.** ⚠️ Aninhar intercepting route sobre modal já interceptado é não-trivial — researcher deve investigar mecanismo exato e validar fullscreen no acesso direto.
- **D-03:** `RiscoTab.tsx` deixa de exibir o campo legado `risco` (texto livre) e passa a renderizar a tabela estruturada. Aba pode permanecer Server Component para leitura; interatividade de escrita fica na sub-rota.
- **D-04:** Prioridade exibida **somente após salvar** — sem espelho ao vivo. Fonte da verdade é o trigger SQL `set_risk_priority()` (coluna GENERATED `priority`). No formulário, "Prioridade" é read-only.
- **D-05:** Mutação via **server actions** (`'use server'`), padrão de `lib/opportunities/actions.ts`: validação `riskInputSchema.safeParse`, tenant/`opportunity_id` server-derived, `revalidatePath` + `router.refresh()`. Modal/aba permanece aberto após operação.
- **D-06:** **Excluir pede confirmação** antes de remover. Após confirmar, lista reflete a remoção.
- **D-07:** Enums internos sempre **minúsculos** (DB): `tipo`/`impacto`/`probabilidade`/`status`. **Camada de labels** mapeia para PT Title-Case (módulo único reusado por tabela e formulário).
- **D-08:** **Responsável = texto livre com sugestões** (PSW/UnidaSul como hints), não dropdown fixo. Tenant-agnóstico.

### Executor's Discretion
- Estilo visual fino dos badges, espaçamentos, ícones (seguir `_giba`, compor com primitivos).
- Tratamento de erros de validação/servidor no formulário (`fieldErrors`/mensagem) — seguir padrão do wizard.
- Ordenação default da tabela (sugestão: prioridade desc, depois criação).
- Geração do rótulo "Rxxx" (índice 1-based zero-padded como no mockup, ou derivado).

### Deferred Ideas (OUT OF SCOPE)
- Preview ao vivo da prioridade (espelho da matriz em TS) — descartado (D-04).
- Destino do campo legado `risco` (texto livre, ≠ `opportunity_risks`) — Phase 13.
- Exibir riscos/prioridade em KPI, tabela, Relatório — Phases 13/14.
- Tabela/RLS de `opportunity_risks` (Phase 9), `riskInputSchema` (Phase 10) — já entregues.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RISK-01 | Cadastrar risco com descrição, tipo, responsável, impacto, probabilidade, status, resposta, descrição do impacto | `createRisk` server action (modelo `createOpportunity`) + `riskInputSchema` (já existe) + formulário client na sub-rota |
| RISK-02 | Prioridade **auto-calculada** pela matriz impacto×probabilidade | Trigger SQL `set_risk_priority()` já existe (Phase 9). Cliente NÃO calcula nada (D-04). `fetchRisksForOpportunity` lê a coluna `priority` GENERATED |
| RISK-03 | Editar e remover riscos | `updateRisk(riskId, input)` + `deleteRisk(riskId)` server actions; confirmação de exclusão (D-06) reusa o padrão de `DeleteButton.tsx` |
| RISK-05 | Aba "Risco" lista riscos em tabela | `RiscoTab.tsx` reescrito (Server Component) consumindo `fetchRisksForOpportunity(id)`; layout `_giba:1198-1232` |

> RISK-04 (tabela + RLS) já foi entregue na Phase 9 — fora do escopo desta fase.
</phase_requirements>

---

## Summary

A fase é majoritariamente **reuso de padrões já consolidados** no repo (server actions estilo `actions.ts`, query whitelisted estilo `queries.ts`, schema Zod `riskInputSchema` pronto, trigger de prioridade pronto). O único ponto genuinamente não-trivial é a **arquitetura de roteamento da sub-rota de formulário de risco**, porque ela precisa aparecer "por cima" de um modal de oportunidade que **já é uma intercepting route** dentro do slot paralelo `@modal`.

A descoberta decisiva: **um slot paralelo (`@modal`) só renderiza UMA subpágina ativa por vez.** O slot rastreia um único "active state". Confirmado pelo código vivo: `@modal/(.)opportunities/[id]`, `@modal/(.)opportunities/[id]/edit` e `@modal/(.)opportunities/new` já coexistem no MESMO slot e são **mutuamente exclusivos** — navegar para `/edit` *substitui* o conteúdo do slot, não empilha. Portanto **não existe** uma forma de empilhar uma segunda intercepting route DENTRO do mesmo `@modal` por cima da primeira: a segunda rota tomaria o lugar da primeira. Empilhar via um *segundo* slot paralelo (`@riskModal`) é teoricamente possível mas exige editar o layout, criar `default.tsx` + catch-all de fechamento, e ainda assim o modal de oportunidade subjacente é um client component com `useState` (perde a aba ativa num re-render do slot). É a opção mais frágil.

**Recomendação primária:** **Opção (c) — formulário de risco como rota fullscreen normal (não-interceptada) + diálogo client-side empilhado dentro da própria sub-rota interceptada do modal.** Concretamente: a aba Risco renderiza um *client component* `RiskFormDialog` (shadcn-style Dialog hand-rolled como o `DeleteButton` já faz, `z-[60]` sobre o `z-50` do modal) controlado por **search param** (`?risco=new` / `?risco=<id>`), de modo que o estado do modal de oportunidade é 100% preservado (mesma árvore client, sem troca de slot). Para o **contrato fullscreen no acesso direto via URL**, criar rotas reais não-interceptadas `app/(app)/opportunities/[id]/riscos/new/page.tsx` e `.../riscos/[riskId]/edit/page.tsx` que renderizam o mesmo formulário em layout de página. Isso satisfaz D-02 (acesso direto fullscreen) sem a fragilidade de empilhar interceptações.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Listar riscos da oportunidade | API/Backend (RSC query) | — | Leitura tenant-scoped via RLS; RSC busca server-side (`fetchRisksForOpportunity`) |
| Renderizar tabela de riscos | Frontend Server (RSC) | — | `RiscoTab` pode ser Server Component (D-03) — só leitura |
| Formulário de risco (inputs, validação client) | Browser/Client | — | Interatividade (`'use client'`); usa `useTransition` + server action |
| Cálculo da prioridade | Database/Storage | — | Trigger `set_risk_priority()` — GENERATED, nunca client (D-04, RISK-02) |
| Create/Update/Delete risco | API/Backend (Server Action) | Database (RLS) | `'use server'`, tenant/opportunity_id server-derived, RLS defesa em profundidade |
| Abrir/fechar form (modal aninhado) | Browser/Client | Frontend Server (rota fullscreen fallback) | Dialog client p/ soft-nav; rota real p/ deep-link fullscreen |

---

## PRIMARY: Arquitetura da sub-rota de formulário de risco

### Como funciona o roteamento HOJE (verificado no código)

```
app/(app)/
├── layout.tsx                                  # recebe { children, modal }; renderiza {children} + {modal}
├── @modal/
│   ├── default.tsx                             # return null (slot vazio)
│   ├── (.)opportunities/new/page.tsx           # wizard create interceptado
│   └── (.)opportunities/[id]/
│       ├── page.tsx                            # modal de detalhe (ModalShell > OpportunityDetail)
│       └── edit/page.tsx                       # wizard edit interceptado
└── opportunities/
    ├── page.tsx                                # lista
    ├── new/page.tsx                            # wizard create fullscreen (fallback)
    └── [id]/
        ├── page.tsx                            # detalhe fullscreen (fallback)
        └── edit/page.tsx                       # wizard edit fullscreen (fallback)
```

**Matcher semantics (Next 16.2.7, docs oficiais):**
- `(.)` = segmentos no **mesmo nível** de segmentos de rota.
- `(..)` = **um nível acima**, etc.
- **Crítico:** "`(..)` convention is based on *route segments*, not the file-system... it does not consider `@slot` folders" e route groups `(app)` também não contam como segmento. Por isso o repo usa `(.)opportunities` de dentro de `@modal`: `@modal` é slot (não conta), `(app)` é group (não conta) → `opportunities` está no **mesmo nível de segmento** que o slot. `(.)` está correto. [CITED: nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes]

**Comportamento de slot (a descoberta que decide tudo):**
> "By default, Next.js keeps track of the active *state* (or subpage) for each slot."
> "During client-side navigation, Next.js will perform a partial render, **changing the subpage within the slot**..." [CITED: nextjs.org/docs/app/api-reference/file-conventions/parallel-routes]

→ Um slot tem **um** active subpage. As três rotas em `@modal` hoje são alternativas mutuamente exclusivas. Navegar de `/opportunities/[id]` para `/opportunities/[id]/riscos/new` dentro do MESMO `@modal` **trocaria** o conteúdo do slot (sai o detalhe, entra o form) — não empilha. [VERIFIED: repo — `@modal` contém 3 subárvores intercept que nunca renderizam juntas]

**Direct URL / hard navigation:** sem `default.tsx`/page que case, o slot não-casado renderiza **404** no refresh. O fullscreen "real" continua vindo da rota não-interceptada em `opportunities/[id]/...`. [CITED: parallel-routes — "render a default.js for unmatched slots, or 404"]

### As 3 opções comparadas

#### (a) Intercepting route filha sob o segmento já interceptado
Ex.: `app/(app)/@modal/(.)opportunities/[id]/riscos/new/page.tsx`.
- **Viabilidade:** funciona como rota, MAS como está no MESMO slot `@modal`, **substitui** o modal de detalhe em vez de empilhar (slot = 1 active subpage). O usuário perderia a tabela atrás do form. Para "voltar" teria que re-montar o detalhe.
- **Matcher:** `(.)opportunities` ainda (mesmo cálculo de segmento; `riscos/new` é aprofundamento dentro da própria subárvore, não muda o prefixo intercept).
- **Fullscreen direto:** exige rota gêmea não-interceptada `opportunities/[id]/riscos/new/page.tsx`. OK.
- **Veredito:** **NÃO empilha** — quebra a UX de "modal sobre modal". Rejeitada para o objetivo de aninhamento.

#### (b) Segundo slot paralelo dedicado (`@riskModal`)
Ex.: novo slot `app/(app)/@riskModal/(.)...` + editar `layout.tsx` para receber e renderizar `{riskModal}`.
- **Viabilidade:** tecnicamente possível — dois slots renderizam em paralelo, então o form empilharia sobre o detalhe.
- **Custo/fragilidade:** exige (1) editar `layout.tsx` (server) para o novo slot; (2) `@riskModal/default.tsx` → null; (3) catch-all de fechamento (`@riskModal/[...catchAll]/page.tsx` → null) — senão o form "gruda" ao navegar (doc: "client-side navigations to a route that no longer match the slot will remain visible"); (4) o detalhe subjacente (`OpportunityDetail`) é **client component com `useState(activeTab)`** — um re-render do tronco do slot pode resetar a aba ativa. Muitas peças móveis para um ganho que a opção (c) entrega com menos risco.
- **Fullscreen direto:** idem — precisa das rotas reais não-interceptadas.
- **Veredito:** funciona, porém é a opção de **maior superfície de bug**. Reserva apenas se houver requisito forte de deep-link com a tabela visível atrás (não há — D-02 só exige que o acesso direto renderize fullscreen).

#### (c) ★ RECOMENDADA — Dialog client-side dentro da sub-rota + rota fullscreen real para deep-link
- **Mecanismo:** A aba Risco já vive dentro de uma árvore client (`ModalShell` > `OpportunityDetail`, ambos `'use client'`). O form de risco é um `RiskFormDialog` client (overlay `z-[60]` sobre o `z-50` do `ModalShell`) — **exatamente** o padrão que `DeleteButton.tsx` já usa hoje (overlay próprio empilhado, sem rota). Aberto/fechado por **search param** (`?risco=new` ou `?risco=<riskId>`) via `useRouter().push`/`useSearchParams` (shallow-ish) OU por estado local — recomendo search param para preservar back-button e deep-link parcial.
- **Empilhamento real:** garantido por z-index/portal client. O modal de oportunidade NÃO é desmontado (mesma árvore React) → **a aba ativa e o scroll são preservados** (resolve o ponto fraco de (a)/(b)).
- **Fullscreen no acesso direto (D-02):** criar rotas **não-interceptadas** reais:
  - `app/(app)/opportunities/[id]/riscos/new/page.tsx`
  - `app/(app)/opportunities/[id]/riscos/[riskId]/edit/page.tsx`
  Ambas RSC que buscam o necessário e renderizam o **mesmo** componente de formulário em layout de página (espelhando `opportunities/[id]/edit/page.tsx`). Hit direto na URL ⇒ fullscreen, contrato idêntico ao do modal de oportunidade. ✅
- **Custo:** **zero edição em `layout.tsx`**, **zero novo slot**, **zero catch-all**. Reusa o pattern de overlay que o time já mantém. Menor superfície de bug.
- **Trade-off honesto:** o "modal aninhado" do soft-path não é uma intercepting route — é um Dialog client. Mas D-02 pede o *comportamento* (modal sobre o modal + fullscreen no acesso direto), não a *implementação* por intercept. O CONTEXT.md flagou o risco de aninhamento exatamente para podermos escolher o caminho menos frágil — e este é ele. [ASSUMED→recomendação de design; o requisito comportamental é satisfeito]

### File tree a criar (Opção c)

```
app/(app)/opportunities/[id]/riscos/
├── new/page.tsx                 # RSC fullscreen: <RiskFormPage opportunityId={id} mode="create" />
└── [riskId]/edit/page.tsx       # RSC fullscreen: busca risco + <RiskFormPage ... mode="edit" initial={...} />

components/opportunities/modal/
├── tabs/RiscoTab.tsx            # REESCRITO — RSC: fetchRisksForOpportunity + <RiskTable> + botão "+ Adicionar"
└── risk/                        # NOVO subdir
    ├── RiskTable.tsx            # client (botões ✏️/🗑️ + abre dialog/nav) OU server p/ tabela + client p/ ações
    ├── RiskFormDialog.tsx       # 'use client' — overlay z-[60], usado no soft-path (dentro do modal)
    ├── RiskForm.tsx             # 'use client' — campos + useTransition + chama server action; reusado por dialog E pela página fullscreen
    ├── DeleteRiskButton.tsx     # 'use client' — confirmação (D-06), modela DeleteButton.tsx
    └── RiskFormPage.tsx         # wrapper p/ uso fullscreen (layout de página + <RiskForm>)

lib/opportunities/
├── risk-actions.ts             # NOVO 'use server' — createRisk / updateRisk / deleteRisk
├── risk-labels.ts             # NOVO — mapa enum lowercase → PT Title-Case (D-07), + matriz de badge
└── queries.ts                  # + fetchRisksForOpportunity(id) + fetchRiskById(riskId) (whitelist §29)
```

> Observação: como `RiscoTab` é renderizado por `OpportunityDetail` (client, via `switch`), a parte RSC da tabela exige cuidado — ver Pitfall 5. Caminho mais simples: manter `RiscoTab` como **client** que recebe `risks` já buscados por props do RSC pai, OU buscar no `(.)opportunities/[id]/page.tsx` (que é RSC) e passar `risks` para `OpportunityDetail`. Recomendo **passar `risks` por props** (RSC pai busca, client renderiza) — alinhado a como `phases` já flui hoje.

---

## Standard Stack

### Core (já no repo — nada a instalar para a arquitetura)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | App Router, parallel/intercepting routes, server actions | Stack-alvo do projeto [VERIFIED: package.json] |
| react / react-dom | 19.2.4 | RSC + client components, `useTransition` | [VERIFIED: package.json] |
| zod | (já usado) | `riskInputSchema` validação | Entregue na Phase 10 [VERIFIED: lib/opportunities/risk-schema.ts] |
| @supabase/* | (já usado) | queries tenant-scoped + RLS | `lib/supabase/server` `createClient()` [VERIFIED: actions.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind | (já usado) | estilos dos badges/tabela/form | inline classes como no resto do modal |

**shadcn/ui NÃO está instalado** — não existe `components/ui/`. O docs/PROJETO.md cita shadcn como alvo, mas o repo **hand-rolla** overlays (ver `DeleteButton.tsx`, `ModalShell.tsx`). [VERIFIED: `ls components/ui` → não existe]. **Recomendação:** seguir o padrão vivo (overlays hand-rolled) em vez de introduzir shadcn nesta fase — menor risco, consistência. AlertDialog/Dialog/Combobox do shadcn **não** são pré-requisito.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dialog hand-rolled (c) | shadcn `Dialog`/`AlertDialog` | Introduz dependência + setup (`components.json`, cn util) não presentes; inconsistente com o resto do modal. Adiar. |
| Search param p/ abrir form | `useState` local no client | Search param dá back-button + deep-link parcial; `useState` é mais simples mas perde URL state. Discrição. |
| Responsável `<input list>` (datalist) | shadcn Combobox | `<input>` + `<datalist>` nativo cobre "texto livre + sugestões" (D-08) com zero deps. Recomendado. |

**Installation:** nenhuma dependência nova necessária. [VERIFIED]

---

## Architecture Patterns

### System Architecture Diagram (fluxo do CRUD de risco)

```
[Aba Risco no modal de oportunidade]
   │ (RSC pai busca risks → props)
   ▼
RiscoTab (renderiza RiskTable)
   │
   ├──"+ Adicionar"/"✏️"──► soft-path: seta ?risco=new|<id>
   │                          ▼
   │                    RiskFormDialog (overlay z-[60], client)
   │                          │ submit
   │                          ▼
   │                    createRisk/updateRisk (server action)
   │                          │ Zod safeParse → auth.getUser → tenant_id
   │                          │ → insert/update escopado por tenant
   │                          ▼
   │                    [DB trigger set_risk_priority() calcula priority]
   │                          │ revalidatePath(/opportunities/[id]) + (/opportunities)
   │                          ▼
   │                    client: router.refresh() → RSC re-busca → tabela atualiza, modal segue aberto
   │
   ├──"🗑️"──► DeleteRiskButton: confirmação (D-06) → deleteRisk → refresh
   │
   └──[acesso direto à URL /opportunities/[id]/riscos/new]
        ▼
      RSC fullscreen page.tsx → RiskFormPage → RiskForm (mesmo componente)
```

### Pattern 1: Server action de risco (modela `actions.ts`)
**What:** `createRisk(opportunityId, input)` valida com `riskInputSchema.safeParse`, deriva `tenant_id` de `auth.getUser → profiles`, insere SEM `priority`/`id`/`tenant_id`/`opportunity_id` vindos do client.
**When:** create/update/delete.
**Example:**
```typescript
// Source: modela lib/opportunities/actions.ts (createOpportunity / updateOpportunity / deleteOpportunity)
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { riskInputSchema } from './risk-schema';

export type CreateRiskResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createRisk(
  opportunityId: string,
  input: unknown,
): Promise<CreateRiskResult> {
  const parsed = riskInputSchema.safeParse(input);            // .strict() rejeita priority/id/tenant_id/opportunity_id
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: 'Dados inválidos.', fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }
  const data = parsed.data;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada.' };
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
  if (!profile) return { ok: false, error: 'Profile não encontrado.' };

  const { data: inserted, error } = await supabase
    .from('opportunity_risks')
    .insert({
      opportunity_id: opportunityId,        // server-derived (do arg, não do payload)
      tenant_id: profile.tenant_id,         // server-derived
      descricao: data.descricao,
      tipo: data.tipo,
      responsavel: data.responsavel || null,
      impacto: data.impacto,
      probabilidade: data.probabilidade,
      status: data.status,
      resposta: data.resposta || null,
      descricao_impacto: data.descricao_impacto || null,
      created_by: user.id,
      // priority NÃO enviado — trigger set_risk_priority() calcula (RISK-02 / D-04)
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, error: `Erro ao criar risco: ${error?.message ?? 'desconhecido'}` };

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true, id: inserted.id };
}
```
- `updateRisk(riskId, input)`: idem + `.eq('id', riskId).eq('tenant_id', profile.tenant_id)` (defesa em profundidade, como `updateOpportunity`). Trigger recalcula `priority` no UPDATE.
- `deleteRisk(riskId)`: `.delete().eq('id', riskId)` (RLS filtra tenant; opcional `.eq('tenant_id', ...)`), depois `revalidatePath`.

### Pattern 2: Refresh sem fechar (D-05)
**What:** server action faz `revalidatePath`; o client chama `router.refresh()` após `result.ok`. O modal/aba permanece montado (não há navegação para fora).
**Example:** copiar o miolo de `DeleteButton.confirm()`: `startTransition(async () => { const r = await deleteRisk(id); if (r.ok) router.refresh(); })`. Para create/update no Dialog: após `ok`, limpar `?risco` (fechar dialog) + `router.refresh()`.

### Pattern 3: Read query whitelisted (§29)
**Example:**
```typescript
// Source: modela lib/opportunities/queries.ts (whitelist HARDEN-E-06, sem select('*'))
const RISK_COLUMNS =
  'id, opportunity_id, tenant_id, descricao, tipo, responsavel, ' +
  'impacto, probabilidade, status, resposta, descricao_impacto, ' +
  'priority, created_by, created_at, updated_at';

export async function fetchRisksForOpportunity(opportunityId: string): Promise<OpportunityRisk[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_risks')
    .select(RISK_COLUMNS)
    .eq('opportunity_id', opportunityId)
    .order('priority', { ascending: true })       // ver Pitfall 6 — ordenar por enum não dá ordem semântica
    .order('created_at', { ascending: true })
    .returns<OpportunityRisk[]>();
  if (error) throw new Error(`Erro ao buscar riscos: ${error.message}`);
  return data ?? [];
}
```
> Colunas verificadas contra `lib/database.types.ts` §362-414 (`opportunity_risks.Row`). [VERIFIED]

### Pattern 4: Camada de labels (D-07) — módulo único
```typescript
// lib/opportunities/risk-labels.ts — enum lowercase (DB) → PT Title-Case (UI)
export const TIPO_LABEL = { impedimento: 'Impedimento', risco: 'Risco', oportunidade: 'Oportunidade' } as const;
export const IMPACTO_LABEL = { alto: 'Alto', significativo: 'Significativo', moderado: 'Moderado', baixo: 'Baixo' } as const;
export const PROBABILIDADE_LABEL = { provavel: 'Provável', possivel: 'Possível', improvavel: 'Improvável', remota: 'Remota' } as const;
export const STATUS_LABEL = { novo: 'Risco Novo', gerenciado: 'Risco Gerenciado', mitigado: 'Risco Mitigado', ocorrido: 'Risco Ocorrido' } as const;
export const PRIORITY_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;
// badges de tipo (_giba:1191-1195): impedimento 🚧 / oportunidade 💡 / risco ⚠️
// badges de prioridade (_giba:1187-1189): critica/alta/media/baixa → cores
```
> Valores de enum confirmados em `risk-schema.ts` (D-07). `priority` enum (`critica|alta|media|baixa`) vem da migration 0011 / `RiskPriority` type. [VERIFIED: risk-schema.ts; database.types.ts]

### Anti-Patterns to Avoid
- **Empilhar 2ª intercepting route no mesmo `@modal`** — o slot só tem 1 active subpage; substitui em vez de empilhar (ver opção (a)).
- **Calcular `priority` no client** — viola D-04/RISK-02; a verdade é o trigger SQL. Nem espelho de preview (deferido).
- **Spread cego do payload no insert/update** — usar enumeração explícita de colunas (defesa mass-assignment, como `actions.ts`).
- **`select('*')` na query de riscos** — usar whitelist `RISK_COLUMNS` (§29).
- **Enviar `priority`/`tenant_id`/`opportunity_id` do client** — `riskInputSchema.strict()` já rejeita; reforçar server-derived.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cálculo de prioridade | Matriz TS no client | Trigger `set_risk_priority()` (DB) | Já existe, é a fonte da verdade (D-04). Espelho diverge quando a matriz mudar |
| Validação de input | Checagens manuais | `riskInputSchema.safeParse` | Entregue Phase 10, `.strict()` defende mass-assignment |
| Tipos da tabela | Tipos ad-hoc | `database.types.ts` `opportunity_risks.Row/Insert` | Já gerados/derivados (Phase 9/10) |
| Tenant scoping | Filtro manual frágil | RLS + `.eq('tenant_id', profile.tenant_id)` | Padrão do projeto (defesa em profundidade) |
| Overlay/confirmação de exclusão | Novo widget | Padrão de `DeleteButton.tsx` | Já implementado e testado no repo |

**Key insight:** quase tudo já existe. A fase é "fiação" (wiring) de peças prontas + a decisão de roteamento. O maior risco é *over-engineering* a arquitetura de modal aninhado.

---

## Common Pitfalls

### Pitfall 1: Achar que dá pra empilhar intercept dentro do mesmo slot
**What goes wrong:** Cria-se `@modal/(.)opportunities/[id]/riscos/new` esperando empilhar; em vez disso o detalhe some.
**Why:** slot = 1 active subpage (doc oficial).
**Avoid:** usar opção (c) (dialog client) para o empilhamento; rota real só para deep-link fullscreen.
**Warning sign:** ao abrir o form, a tabela atrás desaparece.

### Pitfall 2: Matcher errado contando `@modal`/`(app)` como segmento
**What goes wrong:** usa `(..)` "porque o arquivo está 2 níveis acima".
**Why:** matcher conta **segmentos de rota**, não pastas; `@modal` (slot) e `(app)` (group) não contam.
**Avoid:** para qualquer intercept de `opportunities/...` de dentro de `@modal`, o prefixo é `(.)opportunities` (como o repo já faz). [CITED: intercepting-routes]

### Pitfall 3: Rota fullscreen ausente → 404 no acesso direto
**What goes wrong:** só a versão soft existe; deep-link/refresh dá 404 (D-02 quebrado).
**Why:** sem page real não-interceptada, o slot não-casado cai em default/404.
**Avoid:** criar `opportunities/[id]/riscos/new/page.tsx` e `.../[riskId]/edit/page.tsx` reais (RSC fullscreen).

### Pitfall 4: `priority` enviado/calculado no client
**What goes wrong:** insert com `priority` → `riskInputSchema.strict()` rejeita (ou, se passasse, conflita com trigger).
**Avoid:** nunca incluir `priority` no payload; lê-se só após salvar via `fetchRisksForOpportunity`.

### Pitfall 5: RSC dentro de árvore client (`OpportunityDetail` é client)
**What goes wrong:** tentar fazer `RiscoTab` async/RSC enquanto `OpportunityDetail` (`'use client'`) o importa por `switch` → não é possível renderizar Server Component como filho direto de client component sem passá-lo por `children`/props.
**Why:** `OpportunityDetail` tem `'use client'` e renderiza tabs via função `renderTab`.
**Avoid:** buscar `risks` no **RSC pai** (`(.)opportunities/[id]/page.tsx` e o fullscreen `[id]/page.tsx`, ambos RSC) e **passar `risks` por props** até `RiscoTab` (que então pode ser client puro renderizando dados). É exatamente como `phases` já flui. **Não** transformar `RiscoTab` em async.
**Warning sign:** erro "Cannot use async Server Component inside Client Component".

### Pitfall 6: Ordenação por enum não dá ordem semântica
**What goes wrong:** `.order('priority')` ordena alfabeticamente (`alta, baixa, critica, media`), não por severidade.
**Avoid:** ordenar no client por um rank explícito (`critica>alta>media>baixa`) após buscar, OU aceitar criação-asc como default (discrição D). Documentar a escolha.

### Pitfall 7: `revalidatePath` sem `router.refresh()` (ou vice-versa)
**What goes wrong:** lista não atualiza, ou atualiza só após navegar.
**Avoid:** server action faz `revalidatePath('/opportunities/[id]')`; client faz `router.refresh()` após `ok` (padrão de `DeleteButton`/`updateOpportunityStatus`). Ambos.

---

## Code Examples

### Responsável texto-livre-com-sugestões (D-08) sem deps
```tsx
// 'use client' — datalist nativo cobre "texto livre + hints"
<input list="resp-hints" name="responsavel" defaultValue={initial.responsavel ?? ''} />
<datalist id="resp-hints">
  <option value="PSW" />
  <option value="UnidaSul" />
</datalist>
```

### Form: validação + submit (modela WizardShell)
```tsx
// 'use client'
const [errors, setErrors] = useState<Record<string, string[]>>({});
const [pending, startTransition] = useTransition();
function onSubmit(formData: RiskInput) {
  startTransition(async () => {
    const r = mode === 'create'
      ? await createRisk(opportunityId, formData)
      : await updateRisk(riskId!, formData);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); /* + mensagem */ return; }
    closeDialog();          // limpa ?risco
    router.refresh();       // re-busca a tabela; modal segue aberto
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal aninhado via 2ª intercept no mesmo slot | Dialog client + rota fullscreen real | — (sempre foi limitação de slot) | Evita o anti-pattern; menos frágil |
| `RiscoTab` exibe campo legado `risco` (texto) | `RiscoTab` renderiza tabela de `opportunity_risks` | Phase 12 (D-03) | Campo legado `risco` decidido na Phase 13 |

**Deprecated/outdated:** o mockup `_giba` calcula prioridade em JS no client (`calcRiskPrio`) e exclui sem confirmação — **não** replicar: prioridade é DB-trigger (D-04) e exclusão pede confirmação (D-06). O mockup também usa enums Title-Case e form **inline na aba** (não em sub-rota) — adaptar para enums lowercase + camada de labels (D-07) e sub-rota/dialog (D-02).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Trigger `set_risk_priority()` recalcula `priority` também em UPDATE (não só INSERT) | Pattern 1 | Se for INSERT-only, editar impacto/probabilidade não recalcula prioridade — verificar a definição do trigger na migration 0011 antes de planejar `updateRisk` |
| A2 | `RiscoTab`/`OpportunityDetail` aceitam `risks` por props sem refactor grande (espelhando `phases`) | Pitfall 5 | Se a árvore exigir mais mudança, +1 task no plano |
| A3 | Search param `?risco=` é o gatilho preferido do dialog (vs `useState`) | Recomendação (c) | Decisão de UX; ambos viáveis — discrição |
| A4 | Enum `priority` no DB é `critica|alta|media|baixa` (lowercase) | Pattern 4 | Confirmar contra `RiskPriority` em database.types.ts; se Title-Case, ajustar labels |

> **Nota:** A1 é a única assunção com risco de execução real — o planner deve incluir uma verificação da definição do trigger (UPDATE recalc) antes de finalizar `updateRisk`. As demais são decisões de design de baixo risco.

## Open Questions (RESOLVED)

1. **Trigger recalcula priority no UPDATE? → RESOLVIDO: SIM.**
   - `set_risk_priority()` é a fonte da verdade (D-04, Phase 9).
   - Verificado no planning: `supabase/migrations/0011_schema_evolution_v02.sql:294` define o trigger como `before insert or update on opportunity_risks` → editar impacto/probabilidade recalcula `priority` automaticamente.
   - Consequência: **nenhuma migration/ajuste de DB é necessário** nesta fase. RISK-02 e RISK-03 são puramente app-layer.

2. **`created_by` é obrigatório/NOT NULL? → RESOLVIDO:** `database.types.ts` mostra `created_by: string | null` (nullable). Enviar `user.id` é seguro. Sem risco.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js dev (`next dev`) | toda a fase | ✓ | 16.2.6 | — |
| Supabase Cloud + tabela `opportunity_risks` + trigger | actions/queries | ✓ (Phase 9 aplicada — migration 0011 "applied" pelo PO) | — | — |
| shadcn/ui | (não usado) | ✗ | — | overlays hand-rolled (padrão do repo) |

**Missing dependencies with no fallback:** nenhuma.
**Note:** `npm run gen:types` segue bloqueado (sem token) — `database.types.ts` é hand-maintained e **já contém** `opportunity_risks` Row/Insert/Update (§362-414). Não bloqueia. [VERIFIED: MEMORY.md + database.types.ts]

## Validation Architecture

> `.planning/config.json` não foi localizado no caminho padrão; trato `nyquist_validation` como habilitado (default). A suíte do projeto é **Vitest** (pool=forks, singleFork) — ver STATE.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x (pool='forks', singleFork=true) |
| Config file | `vitest.config.ts` (alias `server-only`→stub) |
| Quick run | `npm run test` (unit + skipIf integração) |
| Full suite | `npm run test` / `npm run test:security` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RISK-02 | matriz impacto×prob → prioridade (paridade c/ trigger) | unit (pura) + skipIf SQL | `vitest run tests/...risk-priority` | ❌ Wave 0 |
| RISK-01/03 | createRisk/updateRisk rejeitam `priority`/`tenant_id` (strict) | unit | `vitest run tests/...risk-schema` | parcial (schema testável; mass-assignment idem opportunities) |
| RISK-01/03/04 | isolamento tenant em risk-actions (A não vê/edita risco de B) | integration skipIf | `vitest run tests/...risk-isolation` | ❌ Wave 0 (skipIf sem .env.test, como demais) |

### Sampling Rate
- **Per task commit:** `tsc --noEmit` + `vitest run` dos arquivos tocados.
- **Per wave merge:** `npm run test` (suite completa).
- **Phase gate:** suite verde + `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Teste puro de paridade da matriz de prioridade (espelha `_giba:1180-1185` / trigger) — segue o padrão de `tests/schema/score-rule.test.ts` (paridade pura + skipIf SQL).
- [ ] (Opcional) spec de isolamento tenant para `risk-actions` — espelha `tenant-isolation.test.ts`, modo skipIf.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | RLS por `tenant_id` (4 policies, Phase 9) + `.eq('tenant_id', profile.tenant_id)` nos UPDATE/DELETE |
| V5 Input Validation | yes | `riskInputSchema.strict()` (Zod) em toda mutação |
| V1 Mass Assignment | yes | `priority`/`id`/`tenant_id`/`opportunity_id` server-derived; enumeração explícita de colunas |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forjar `tenant_id`/`opportunity_id` no payload p/ escrever risco em outro tenant | Tampering / Elevation | server-derived + `.strict()` + RLS WITH CHECK |
| Ler riscos de outro tenant via id direto | Information Disclosure | RLS USING filtra; query não passa tenant_id (RLS resolve) |
| Setar `priority` manualmente | Tampering | `.strict()` rejeita; trigger é autoridade |

## Project Constraints (from docs/PROJETO.md)
- Toda tabela de domínio: `tenant_id` + RLS + filtro explícito. `opportunity_risks` já cumpre (Phase 9).
- Score/prioridade **calculados, nunca persistidos como input** — `priority` é GENERATED/trigger; cliente nunca escolhe (RISK-02/D-04).
- UI pt-BR, código/identificadores em inglês; enums DB em lowercase + camada de labels (D-07).
- `_giba_wsi-dashboard.html` é o contrato visual (§1178-1260 para a aba Risco) — replicar estrutura antes de evoluir.
- Sem rotas cross-tenant/admin no MVP.
- Server Components por padrão; `'use client'` só onde necessário (form, dialog, botões de ação).

## Sources

### Primary (HIGH confidence)
- nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes (v16.2.7) — matchers `(.)`/`(..)`/`(...)`, "based on route segments, not file-system; does not consider @slot"; comportamento de acesso direto.
- nextjs.org/docs/app/api-reference/file-conventions/parallel-routes (v16.2.7) — slot = 1 active subpage; `default.js`/404 em hard nav; close via `router.back()`/catch-all.
- Repo (código vivo): `app/(app)/layout.tsx`, `@modal/(.)opportunities/[id]/page.tsx` + `/edit`, `@modal/default.tsx`, `opportunities/[id]/page.tsx` + `/edit`, `ModalShell.tsx`, `OpportunityDetail.tsx`, `DeleteButton.tsx`, `lib/opportunities/actions.ts`, `queries.ts`, `risk-schema.ts`, `database.types.ts` §362-414, `_giba_wsi-dashboard.html` §1178-1266.

### Secondary (MEDIUM confidence)
- vercel-labs/nextgram (exemplo oficial de modal intercept) — referenciado pelos docs.

### Tertiary (LOW confidence)
- nenhuma claim crítica depende de fonte não-verificada.

## Metadata
**Confidence breakdown:**
- Arquitetura de roteamento: HIGH — docs oficiais v16.2.7 + 3 precedentes no código vivo.
- Server actions/queries: HIGH — modela código existente verificado linha-a-linha.
- Trigger recalc em UPDATE (A1): MEDIUM — assunção a verificar na migration.
- Pitfalls: HIGH — derivados de docs + leitura do código.

**Research date:** 2026-06-05
**Valid until:** ~2026-07-05 (Next App Router conventions são estáveis; revalidar se houver upgrade major de Next).

---

## RESEARCH COMPLETE

**Recomendação de uma linha:** Form de risco como **Dialog client-side empilhado** (padrão `DeleteButton`, `z-[60]`, gatilho por `?risco=`) dentro da sub-rota interceptada do modal **+ rotas fullscreen reais não-interceptadas** `opportunities/[id]/riscos/{new,[riskId]/edit}` para o deep-link — evita o anti-pattern de empilhar 2ª intercept no mesmo slot `@modal`, satisfaz D-02 (fullscreen no acesso direto) e preserva a aba/scroll do modal. Tudo o mais (actions, query, schema, trigger, labels) é wiring de peças já existentes.
