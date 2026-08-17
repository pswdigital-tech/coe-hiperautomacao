# CoE Hiperautomação

Plataforma SaaS multi-tenant pra gestão de pipeline de demandas de automação. Cada cliente loga e enxerga **apenas** os dados da sua empresa. Construída pela PSW pra o cliente piloto **FGCoop**.

Convenções de engenharia: [docs/PROJETO.md](docs/PROJETO.md) · Visão completa: [.planning/PROJECT.md](.planning/PROJECT.md) · Roadmap: [.planning/ROADMAP.md](.planning/ROADMAP.md) · Estado: [.planning/STATE.md](.planning/STATE.md)

## Stack

- **Next.js 16** (App Router + Turbopack)
- **React 19**
- **Tailwind CSS v4** (com paleta do mockup em `@theme`)
- **Supabase**: Postgres + Auth + RLS (multi-tenancy via Row Level Security)
- **@dnd-kit** (drag-and-drop no kanban)
- **Zod** (validação dos forms)
- **Deploy**: Vercel

## Setup local

### Pré-requisitos
- Node.js 20+ (recomendado 22+)
- Conta Supabase com projeto criado e migrations aplicadas

### Passos

1. **Instalar dependências**
   ```bash
   npm install
   ```

2. **Criar `.env.local`** (copia de `.env.example`):
   ```bash
   cp .env.example .env.local
   ```
   Preenche com:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key>
   SUPABASE_PROJECT_REF=<ref-do-projeto>
   # opcional, apenas pra regenerar types:
   # SUPABASE_ACCESS_TOKEN=<token-de-pessoa>
   ```

3. **Aplicar migrations no Supabase** — execute na ordem, no SQL Editor:
   - [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) — schema + RLS + funções
   - [supabase/migrations/0002_seed_tenant_and_admin.sql](supabase/migrations/0002_seed_tenant_and_admin.sql) — tenant FGCoop + admin user
   - [supabase/migrations/0003_seed_fgcoop_opportunities.sql](supabase/migrations/0003_seed_fgcoop_opportunities.sql) — 29 oportunidades do mockup
   - [supabase/migrations/0004_phase_sync_trigger.sql](supabase/migrations/0004_phase_sync_trigger.sql) — trigger de sincronia das fases

4. **Rodar dev server**
   ```bash
   npm run dev
   ```
   App em [http://localhost:3000](http://localhost:3000).

5. **Login de teste**
   - E-mail: `admin.fgcoop@pswdigital.com.br`
   - Senha: `0123456789`

## Scripts

| Comando | Faz |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run gen:types` | Regenera `lib/database.types.ts` a partir do Supabase (precisa `SUPABASE_ACCESS_TOKEN` no env) |

## Estrutura

```
app/                                  — Next.js App Router
├── (app)/                            — grupo de rotas autenticadas
│   ├── opportunities/                — listagem + detail + edit + new
│   ├── @modal/                       — slot pra modais via intercepting routes
│   ├── layout.tsx
│   ├── loading.tsx / error.tsx       — boundaries
│   └── ...
├── login/
└── ...

components/opportunities/             — UI da feature principal
├── cells.tsx                         — badges (source, ferramenta, status, score, etc.)
├── table.tsx / cards.tsx / kanban/   — 3 views
├── modal/                            — Header + StatusSelector + EditButton + DeleteButton + tabs/
└── wizard/                           — multi-step CRUD (create + edit)

lib/
├── supabase/                         — clients server/browser/session helpers
├── opportunities/                    — queries, actions, schema, types, filters, utils
└── database.types.ts                 — types do Supabase (regenerar via gen:types)

proxy.ts                              — Next 16 Proxy (substitui middleware) com route guard

supabase/migrations/                  — SQL versionado

docs/PROJETO.md                       — convenções, princípios não-negociáveis, modelo de dados
.planning/                            — docs do projeto (PROJECT.md, ROADMAP.md, STATE.md, phases/)
```

## Deploy

```bash
npm i -g vercel       # se não tem
vercel                # primeiro deploy (preview)
vercel --prod         # promove pra production
```

No dashboard da Vercel, **adicionar env vars** em `Project Settings → Environment Variables`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No Supabase `Authentication → URL Configuration`, **adicionar a URL Vercel** em **Site URL** + **Additional Redirect URLs**.

## Multi-tenancy & segurança

Todas as tabelas de domínio têm `tenant_id` + Row Level Security ativado. O helper SQL `current_tenant_id()` filtra implicitamente todas as queries pelo tenant do usuário logado. Detalhes em [.planning/DATA-MODEL.md](.planning/DATA-MODEL.md).
