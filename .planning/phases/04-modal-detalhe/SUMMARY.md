---
phase: 04-modal-detalhe
status: complete
completed_at: 2026-05-21
plans_completed: 4
---

# Phase 4 — Modal de Detalhe (read-only) · SUMMARY

## Goal atingido

Click numa linha da tabela → modal lateral sobre a lista (URL muda pra `/opportunities/[id]`) com 6 abas adaptadas por `source`. Refresh nessa URL mostra fullscreen. Voltar (browser back) fecha. Tudo read-only.

## Plans entregues

| Plan | Entrega | Status |
|---|---|---|
| **04-01** Foundation | parallel + intercepting routes, ModalShell, Header, TabsNav, 3 tabs comuns (Automação/Fases/Score) | ✅ |
| **04-02** Tabs Persona | PerfilTab, DesafiosTab, CoeTab + helper Field | ✅ |
| **04-03** Tabs Formulário | ProcessoTab, CriteriosTab, BeneficiosTab | ✅ |
| **04-04** Link + Checkpoint | Botão da tabela → Link interceptado | ✅ aprovado |

## Estrutura resultante

```
app/(app)/
├── @modal/
│   ├── default.tsx                            ← null (slot vazio)
│   └── (.)opportunities/[id]/page.tsx         ← interceptor: ModalShell + OpportunityDetail
├── layout.tsx                                 ← LayoutProps<'/'> com slot modal
└── opportunities/
    ├── page.tsx
    └── [id]/page.tsx                          ← fullscreen fallback

components/opportunities/modal/
├── ModalShell.tsx                  ← client: overlay/ESC/click-outside
├── Header.tsx                      ← gradient + avatar + status badge + score circle
├── TabsNav.tsx                     ← client: nav de tabs
├── OpportunityDetail.tsx           ← client: orquestra activeTab → renderiza tab content
├── types.ts                        ← TabId, TabDef
└── tabs/
    ├── Field.tsx                   ← helper label/value/multiline/hideIfEmpty
    ├── AutomacaoTab.tsx            ← comum
    ├── FasesTab.tsx                ← comum (timeline read-only, vazia hoje)
    ├── ScoreTab.tsx                ← comum (4 componentes + banner)
    ├── PerfilTab.tsx               ← persona
    ├── DesafiosTab.tsx             ← persona
    ├── CoeTab.tsx                  ← persona
    ├── ProcessoTab.tsx             ← formulário
    ├── CriteriosTab.tsx            ← formulário (10 critérios)
    └── BeneficiosTab.tsx           ← formulário (8 benefícios)

lib/opportunities/
├── queries.ts                      ← + fetchOpportunityById(id)
└── utils.ts                        ← getInitials, scoreColor (extraídos pra DRY)
```

## Descobertas técnicas

- **`LayoutProps<'/'>`** é tipo gerado pelo Next 16 em `.next/dev/types/routes.d.ts` — inclui automaticamente o slot `modal` porque a pasta `@modal/` existe. Tentar tipar manualmente o slot quebra build.
- **Intercepting routes** (`(.)`) do Next 16 funcionam com slots paralelos pra abrir modal sobre listas sem perder o histórico
- **`router.back()`** no fechar do modal preserva scroll da lista (vs. usar `<Link href="/opportunities">` que limparia o estado)
- **Tabs renderizadas server-side** quando possível — apenas o wrapper que troca tab é client (`OpportunityDetail`)
- **Helper `Field`** centraliza tratamento de em-dash/multiline/hideIfEmpty — 4 tabs (Perfil, Desafios, CoE, Processo) reusam

## Must-haves verificados

- ✅ Click em qualquer linha abre modal com URL atualizada
- ✅ Modal de persona com 6 abas e dados corretos (cargo, tempo_funcao, papel, etc.)
- ✅ Modal de formulário com 6 abas e dados corretos (critérios + benefícios renderizados)
- ✅ Score = 100 em #0001 Inez Passos (banner azul + pill Alta)
- ✅ ESC / X / overlay fecham
- ✅ Refresh em `/opportunities/[id]` mostra fullscreen
- ✅ Back do browser fecha sem perder lista
- ✅ /opportunities/<id-invalido> retorna 404

## Pendências carregadas para próxima fase

- **Dropdown de status no header do modal** — slot visual já existe (`StatusBadge`); falta interatividade. **Phase 5.**
- **Botão "Editar"** — placeholder no header; ativa edit mode inline. **Phase 6.**
- **Aba "Fases"** com datas reais — depende do trigger `sync_opportunity_phase`. **Phase 5/8.**

## Próximo

**Phase 5 — Cards + Kanban + Mudança de Status**.
