---
phase: 01-modelagem-banco
status: complete
completed_at: 2026-05-21
---

# Phase 1 — Modelagem do Banco · SUMMARY

## Goal

Schema multi-tenant em Supabase com RLS, fórmula de score como função SQL, seed do FGCoop. **Atingido.**

## O que foi entregue

| Artefato | Onde |
|---|---|
| Documentação do modelo | [.planning/DATA-MODEL.md](../../DATA-MODEL.md) |
| Migration de schema | [supabase/migrations/0001_init.sql](../../../supabase/migrations/0001_init.sql) |
| Tenant + admin user seed | [supabase/migrations/0002_seed_tenant_and_admin.sql](../../../supabase/migrations/0002_seed_tenant_and_admin.sql) |
| 29 oportunidades do FGCoop | [supabase/migrations/0003_seed_fgcoop_opportunities.sql](../../../supabase/migrations/0003_seed_fgcoop_opportunities.sql) |

## Schema

- 4 tabelas: `tenants`, `profiles`, `opportunities`, `opportunity_phases`
- 8 enums: `opportunity_source`, `opportunity_status`, `automation_tool`, `effort_level`, `complexity_level`, `time_bucket`, `phase_key`, `tenant_role`
- 1 função: `opportunity_score(esforco, complexidade, tempo, objetivo)` reproduz a fórmula do mockup
- 1 helper SECURITY DEFINER: `current_tenant_id()` para RLS
- 1 view: `opportunities_with_score` (security_invoker = true)
- 3 triggers: `set_updated_at`, `set_opportunity_seq_id`, `handle_new_user`
- RLS habilitado em todas as tabelas com policies de isolamento por tenant

## Decisões consolidadas

- ✅ 1 projeto Supabase compartilhado entre todos os tenants
- ✅ Isolamento via Row Level Security (não schema-per-tenant)
- ✅ Persona e formulário na mesma tabela (`source` discriminator + 2 JSONBs)
- ✅ Score nunca persistido — sempre calculado via função SQL
- ✅ `seq_id` por tenant via trigger
- ✅ `responsavel` e `notas` como colunas (operacionais, comuns aos dois tipos)
- ✅ Schema review honesto realizado: filtros/sort/views do mockup NÃO tocam JSONBs → JSONB confirmado como escolha certa para os campos exclusivos

## Dados de partida disponíveis

- Tenant `fgcoop` (UUID `11111111-1111-1111-1111-111111111111`)
- Admin user `admin.fgcoop@pswdigital.com.br` / `0123456789` (UUID `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)
- 29 oportunidades (9 personas + 20 formulários), todas com `status = 'novo'`
- 0 linhas em `opportunity_phases` (nada começou ainda — esperado)

## Verificação (manual, feita pelo dev)

- [x] `0001_init.sql` aplicado sem erro no Supabase (depois de bypass do read-only)
- [x] `0002_seed_tenant_and_admin.sql` aplicado — tenant + auth user + identity + profile criados
- [x] `0003_seed_fgcoop_opportunities.sql` aplicado — 29 linhas em `opportunities`
- [ ] Smoke test RLS com 2 tenants (deixado para Phase 2 quando tiver app pra logar)
- [ ] Login real testado (Phase 2)

## Pendências para fases futuras

- **Phase 8**: trigger `sync_opportunity_phase` para manter `opportunity_phases` em sincronia automaticamente quando `opportunities.status` muda. Já desenhado, esboçado em mensagem da sessão, será arquivo `0004_phase_sync_trigger.sql`.

---
*Phase encerrada em 2026-05-21.*
