---
status: testing
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
source: [18-VERIFICATION.md, 18-08-SUMMARY.md]
started: 2026-08-07
updated: 2026-08-07
---

## Current Test

number: 1
name: A — Conceder admin de duas empresas pela tela `/admin/staff`
expected: |
  Super-admin abre `/admin/staff` pelo item "Staff PSW" do menu e concede a uma
  pessoa da PSW acesso de admin em DUAS empresas. As duas linhas aparecem, o
  formulário volta ao estado inicial, nenhuma mensagem de erro.
awaiting: user response

## Tests

### 1. A — Conceder
expected: Super-admin concede admin de 2 empresas a uma pessoa da PSW em `/admin/staff`. As duas linhas aparecem; formulário reseta; sem erro.
result: [pending]

### 2. B — Diagnóstico "por que fulano vê isto"
expected: Expandir a linha da pessoa mostra os DOIS blocos separados ("Admin nas empresas" / "Atribuições individuais"). Atribuição numa empresa administrada vem marcada "já coberta pelo admin" com contagem. Bloco vazio mostra texto próprio, nunca some. Atribuições só têm link de leitura, nenhum controle de edição (GRANT-09).
result: [pending]

### 3. C — Ver o que passou a ver  ⭐ prova GRANT-03
expected: |
  Login como a pessoa com concessão → `/opportunities` mostra oportunidades das
  duas empresas administradas (inclusive não atribuídas) + as atribuídas em
  outras empresas; coluna Empresa com os nomes; NADA de empresa sem concessão
  nem atribuição. Abrir uma oportunidade não atribuída de empresa administrada:
  anotações/tarefas/riscos/documentos/histórico CARREGAM (é o que a 0046 entrega).
  Na Sidebar: seletor de empresa listando só administradas + atribuídas; itens
  Equipe/Configurações/Logs presentes; "Staff PSW" AUSENTE (é do super-admin).
result: [pending]

### 4. D — Exercer os poderes  ⭐ prova GRANT-04
expected: Com a empresa A selecionada — Equipe: convidar e revogar convite pendente. Configurações: trocar cor e subir logo. Logs: ver o log de A. Tudo funciona e o efeito é real (recarregar e conferir). ScopeBadge mostra A no cabeçalho das 4 telas.
result: [pending]

### 5. E — Estado sem empresa selecionada  ⭐ prova GRANT-05
expected: Selecionar "todas as empresas" e voltar a Equipe/Configurações. Controles de escrita DESABILITADOS e visíveis, com o aviso em pt-BR. Nada é gravado. Leitura não mostra dados de outra empresa.
result: [pending]

### 6. F — Revogar com impacto quantificado  ⭐ prova GRANT-08
expected: Super-admin revoga uma concessão. O diálogo informa quantas oportunidades a pessoa deixa de enxergar, com concordância singular/plural correta. Cancelar não muda nada; confirmar remove a linha. Login como a pessoa: oportunidades daquela empresa somem, EXCETO as atribuídas nominalmente.
result: [pending]

### 7. G — Não-regressão dos papéis existentes  ⭐ prova GRANT-10 (lado visual)
expected: Login como `member`, `viewer` e `tenant_admin` de cliente. Tudo idêntico a antes da fase — mesma lista, mesmas telas, mesmos menus, SEM ScopeBadge. O `tenant_admin` de cliente ainda gerencia convites/equipe/branding da própria empresa.
result: [pending]

### 8. H — Concessão órfã inerte e sinalizada
expected: Despromover a pessoa de `psw_staff` para outro papel. A linha de concessão PERMANECE em `/admin/staff`, sinalizada como órfã (badge + linha esvaecida); a pessoa deixa de enxergar as oportunidades daquela empresa. Repromover: o acesso volta sozinho, sem reconceder.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
