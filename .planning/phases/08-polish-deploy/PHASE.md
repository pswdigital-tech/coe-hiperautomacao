---
phase: 08-polish-deploy
status: ready_to_execute
total_plans: 3
waves: 3
---

# Phase 8 — Polish + Deploy (última fase do MVP)

## Goal

MVP em produção na Vercel, acessível por URL pública, com:
- Loading states (`loading.tsx`) nas páginas que fazem fetch
- Error boundaries (`error.tsx`) capturando falhas sem derrubar a app
- Página 404 customizada (`not-found.tsx`)
- Responsividade mobile básica (header, toolbar, tabela com scroll horizontal já existe)
- Estados vazios consistentes em todas as views
- Smoke test em produção com cliente piloto

## Por que esta fatia agora

Sistema **funcional** desde Phase 7 — falta polir antes de mostrar pro cliente:
- Sem loading visual, o usuário acha que travou em queries lentas
- Sem error boundary, qualquer erro de fetch derruba a página inteira (UX ruim)
- Mobile responsivo é mandatório (gerentes acessam do celular)
- Deploy é o que torna o produto **real** pro cliente piloto

## Estrutura de execução (3 plans, 3 waves)

```
Wave 1  ──────────────────►  08-01: Loading + Error + Not Found boundaries
                              (app/(app)/loading.tsx, error.tsx, not-found.tsx)

Wave 2  ──────────────────►  08-02: Mobile/UX polish
                              (responsivo na toolbar, modal mobile-friendly,
                               estados vazios padronizados, ajustes Tailwind)

Wave 3  ──────────────────►  08-03: Deploy Vercel + smoke produção (CHECKPOINT FINAL)
                              (vercel.json se necessário, env vars no Vercel,
                               primeiro deploy, smoke test, URL final)
```

## Must-haves

**Truths observáveis:**
- Navegação entre páginas mostra spinner/skeleton (não tela em branco)
- Erros de fetch mostram tela "Algo deu errado" com botão "Tentar novamente" (não tela branca)
- URL inválida (`/opportunities/abc`) mostra página 404 customizada coerente com o tema (não 404 default do Next)
- App utilizável em viewport mobile (375x667) — toolbar quebra em linhas, tabela tem scroll horizontal, modal ocupa tela toda
- Deploy na Vercel com URL pública (preview e production)
- Login + listagem + modal + criação funcionam em produção

**Artifacts:**
- `app/(app)/loading.tsx` — skeleton genérico
- `app/(app)/opportunities/loading.tsx` — skeleton da listagem
- `app/(app)/error.tsx` — error boundary com retry
- `app/(app)/not-found.tsx` — 404 customizado
- `app/global-error.tsx` — fallback no nível root
- Toolbar / Modal mobile adjustments
- Deploy: vercel projeto criado, env vars setadas

## User setup

```yaml
user_setup:
  - service: vercel
    why: "Deploy precisa de conta Vercel + project link"
    dashboard_config:
      - task: "Login na Vercel via CLI (vercel login)"
      - task: "Link do projeto local com Vercel (vercel link ou import via dashboard)"
    env_vars:
      - name: NEXT_PUBLIC_SUPABASE_URL
        source: "Mesmo do .env.local — colar no Vercel Project Settings → Environment Variables"
      - name: NEXT_PUBLIC_SUPABASE_ANON_KEY
        source: "Mesmo do .env.local — colar no Vercel"
    local_dev: []
```

## Out of scope (pós-MVP)

- **Lighthouse score otimização** — focar em "funciona", não em "perfeito"
- **Service Worker / PWA**
- **A11y full audit** — garantir que ARIA básico está OK (modal `role="dialog"` já tem)
- **i18n / internacionalização** — fica pt-BR fixo
- **Analytics / telemetry** — Vercel Analytics fica como opção do cliente
- **Domínio custom** — usa `*.vercel.app` por enquanto; cliente decide depois
- **CI/CD** — Vercel já faz preview automático no PR; sem ações extras

## Decisões prévias

- **Não migrar pra Lucide/shadcn agora** — emojis seguem servindo perfeitamente como ícones; trocar atrasa o deploy sem ganho UX significativo
- **Mobile usa media queries do Tailwind** (sm/md/lg) — já implícito em várias classes existentes; só ajustar pontos críticos
- **Deploy sem CI** — `vercel` CLI faz deploy direto; PR-based ficará pra quando for haver mais devs

## Após esta fase

**MVP fechado.** Próxima milestone (v0.2 ou Phase 9+) é deixar plano:
- Painel admin cross-tenant (já listado em PROJECT.md)
- Audit log (se cliente pedir)
- Notificações por e-mail (se cliente pedir)
- Importação CSV

Tudo isso depende do feedback do piloto.
