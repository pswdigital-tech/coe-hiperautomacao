---
phase: 06-wizard-crud
plan: 01
status: complete
completed_at: 2026-05-21
---

# 06-01 — Server Actions + Zod Schemas · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `package.json` | + `zod ^4.4.3` |
| `lib/opportunities/schema.ts` | Zod schemas: enums + persona/formulario extras + `opportunityInputSchema` (discriminated union por `source`) |
| `lib/opportunities/actions.ts` | + `createOpportunity`, `updateOpportunity` (Server Actions com validação Zod, RLS implícito, revalidatePath) |

## Decisões

- **Discriminated union em `source`** — exclui `formulario_extras` quando persona e vice-versa, garantia de tipo
- **`status` excluído do update** — mudança de status passa por `updateOpportunityStatus` (separação + trigger SQL)
- **`tenant_id` e `created_by`** injetados server-side a partir do `auth.uid()` → RLS protege; client não pode forjar
- **Strings vazias aceitas** em campos opcionais via `.or(z.literal(''))` — UX melhor que forçar `null`/`undefined`
- **Result type** com `ok: boolean` + `fieldErrors` — caminhos de sucesso/erro tipados

## Validação

- `npm run typecheck` ✅
- Pronto pro plan 06-02 consumir
