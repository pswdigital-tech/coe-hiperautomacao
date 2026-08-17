---
id: desativar-usuario
created: 2026-08-06
source: pedido do PO durante a execução da Phase 17 (localhost:3000/admin/invites)
status: pending
---

# Revogar acesso de quem já usou o convite (desativar pessoa)

## O que o PO pediu

> "preciso conseguir revogar acesso de quem ta com status de 'Usado'"

## Por que o botão de hoje não serve

`revokeInvite()` (`app/(app)/admin/invites/actions.ts`) faz
`delete from invited_emails`. Para um convite **pendente** isso é a revogação
inteira — sem linha na allowlist, o trigger `handle_new_user` (0022) barra o
signup.

Para um convite **usado** não revoga nada: a pessoa já tem linha em
`auth.users` e em `profiles`, e o convite é só registro histórico. Ela
continuaria logando normalmente. Por isso a UI corretamente não oferece
"Revogar" nas linhas com `used_at` — o botão seria uma mentira sobre o efeito.

O que falta não é uma ação sobre o convite. É uma ação sobre a **pessoa**.

## Decisão do PO (2026-08-06)

**Desativar, reversível** — não apagar. Offboarding raramente é definitivo, e
preservar autoria/histórico vale mais que a simplicidade de um delete.

## Forma decidida

1. Migration: `alter table profiles add column disabled_at timestamptz`.
2. Gate no **banco**, não na UI — acrescentar `and disabled_at is null` às
   quatro funções helper que toda policy do sistema atravessa:
   - `current_tenant_id()` (0001:181)
   - `current_user_role()` (0015:28)
   - `is_platform_admin()` (0021)
   - `current_assigned_opportunity_ids()` (0040 — Phase 17)
3. Server action `disableProfile` / `enableProfile`, guardadas por
   `isPlatformAdmin()`, e a coluna de ação na lista de `/admin/invites`
   (ou numa tela de pessoas, se fizer mais sentido na hora).

### Por que o gate tem que ser no banco

Todas as policies funilam por essas funções. Bloquear só no front deixaria a
pessoa com token válido batendo direto no PostgREST — teatro de segurança, e
`docs/PROJETO.md` trata isolamento como existencial. Enfiar o gate nos helpers faz
a desativação valer em **todas** as policies de uma vez, num ponto só.

Cuidado ao implementar: `current_user_role()` retorna `tenant_role` e
`current_tenant_id()` retorna `uuid` — devolver null numa pessoa desativada
precisa ser conferido policy a policy, porque `tenant_id = null` é `null`, não
`false`. Verificar que nenhuma policy vira permissiva por acidente (o teste
óbvio: pessoa desativada não enxerga nada em nenhuma tabela).

## O que o schema já garante (levantado em 2026-08-06)

Todos os FKs para `profiles` são `on delete set null`, com uma exceção:
`opportunity_assignees.profile_id` é `on delete cascade` (0032:35).

Consequência: mesmo a alternativa de apagar seria sobrevivível — o `audit_log`
preserva `actor_email`/`actor_role` desnormalizados na própria linha (0038:49-51),
e tarefas/notas/documentos sobreviveriam perdendo só a autoria. Isso reforça
que a escolha por desativar é preferência de produto, não obrigação técnica.

## Contexto relevante

- `app/(app)/admin/invites/actions.ts` — `revokeInvite`, `resendInvite`, `createInvite`
- `app/(app)/admin/invites/page.tsx` — a lista com os status Pendente/Usado
- `lib/security/role.ts` — `getCurrentProfile`, `isPlatformAdmin`, `isPswStaff`
- Migration desta tarefa: a próxima livre depois das da Phase 17 (0039..0042)

## Interação com a Phase 17

A Phase 17 introduz `psw_staff`, cujo acesso vem de `opportunity_assignees`.
Desativar um `psw_staff` precisa cortar o acesso dele às oportunidades
atribuídas — o que o gate em `current_assigned_opportunity_ids()` resolve.

Fazer **depois** da Phase 17 foi decisão do PO: mexer nas funções helper de RLS
no meio de uma fase que está justamente alterando policies criaria risco
desnecessário.
