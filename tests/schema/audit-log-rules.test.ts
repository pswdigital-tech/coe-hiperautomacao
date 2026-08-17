// =============================================================================
// audit_log (migration 0038) — invariantes estruturais da rastreabilidade
// =============================================================================
// Spec PURO: lê o SQL da migration e trava as propriedades das quais toda a
// garantia de auditoria depende. Não substitui um teste de banco (que exigiria
// .env.test), mas pega a regressão que mais dói: alguém "consertar" um erro de
// permissão dando grant de insert/update na tabela, e o log virar forjável.
//
// As três propriedades:
//   1. Append-only — nenhum grant/policy de escrita para a app.
//   2. Cobertura — a trigger está plugada em TODAS as tabelas de domínio.
//   3. Isolamento — a leitura é admin-only e filtrada por tenant.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/0038_audit_log.sql'),
  'utf8'
);

// As tabelas de domínio que precisam estar auditadas. Fora da lista, de
// propósito: opportunity_phases (derivada de opportunities.status pela trigger
// 0004 — auditá-la triplicaria o log de cada troca de status),
// opportunity_history (log legado congelado), public_form_submissions (já é
// log), tenant_sequences (contador interno).
const AUDITED_TABLES = [
  'opportunities',
  'opportunity_tasks',
  'opportunity_risks',
  'opportunity_notes',
  'opportunity_documents',
  'opportunity_assignees',
  'profiles',
  'invited_emails',
  'tenants',
];

describe('audit_log — append-only', () => {
  it('não concede insert/update/delete para authenticated nem anon', () => {
    const grants = SQL.match(/grant\s+[^;]*\s+on\s+audit_log\s+to\s+[^;]+;/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g.toLowerCase()).not.toMatch(/\b(insert|update|delete|all)\b/);
    }
  });

  it('revoga tudo antes de conceder o select', () => {
    expect(SQL).toMatch(/revoke\s+all\s+on\s+audit_log\s+from\s+authenticated,\s*anon;/i);
  });

  it('não cria policy de escrita em audit_log', () => {
    const policies =
      SQL.match(/create\s+policy\s+\w+\s+on\s+audit_log\s+for\s+(\w+)/gi) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p.toLowerCase()).toMatch(/for\s+select$/);
    }
  });

  it('mantém RLS ligada', () => {
    expect(SQL).toMatch(/alter\s+table\s+audit_log\s+enable\s+row\s+level\s+security/i);
  });
});

/**
 * Extrai o array literal sobre o qual a migration monta os triggers. Procurar
 * o nome da tabela solto no arquivo não serve: `opportunity_phases` aparece em
 * comentário e num `drop trigger`, e um teste ingênuo daria falso positivo
 * justamente no caso que interessa vigiar.
 */
function triggeredTables(): string[] {
  const block = SQL.match(/foreach\s+t\s+in\s+array\s+array\[([\s\S]*?)\]/i)?.[1];
  if (!block) throw new Error('loop de triggers não encontrado na 0038');
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('audit_log — cobertura', () => {
  it('a lista de tabelas com trigger é exatamente a esperada', () => {
    expect(triggeredTables().sort()).toEqual([...AUDITED_TABLES].sort());
  });

  // Regressão: uma troca de status dispara sync_opportunity_phase (0004), que
  // fecha a fase antiga e abre a nova. Auditar opportunity_phases faria UMA
  // ação do usuário virar TRÊS linhas de log, duas delas repetindo o status.
  it('opportunity_phases NÃO é auditada (é derivada de opportunities.status)', () => {
    expect(triggeredTables()).not.toContain('opportunity_phases');
    // E a trigger é removida explicitamente, para o caso de uma versão anterior
    // desta migration já ter sido aplicada com ela na lista.
    expect(SQL).toMatch(
      /drop\s+trigger\s+if\s+exists\s+audit_opportunity_phases\s+on\s+opportunity_phases;/i
    );
  });

  it('a trigger cobre insert, update E delete', () => {
    expect(SQL).toMatch(/after\s+insert\s+or\s+update\s+or\s+delete/i);
  });

  it('é FOR EACH ROW — statement-level não veria OLD/NEW', () => {
    expect(SQL).toMatch(/for\s+each\s+row\s+execute\s+function\s+audit_trigger\(\)/i);
  });
});

describe('audit_log — isolamento', () => {
  it('o select é admin-only e escopado por tenant', () => {
    const policy = SQL.match(
      /create\s+policy\s+audit_log_select\s+on\s+audit_log[\s\S]*?;/i
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy!).toMatch(/is_platform_admin\(\)/);
    expect(policy!).toMatch(/tenant_id\s*=\s*current_tenant_id\(\)/);
    expect(policy!).toMatch(/current_user_role\(\)\s*=\s*'tenant_admin'/);
  });

  // Dentro de uma função SECURITY DEFINER o RLS das outras tabelas é bypassado
  // — sem este gate explícito, qualquer usuário autenticado leria a trilha de
  // qualquer oportunidade de qualquer empresa só passando o UUID.
  it('opportunity_audit_trail tem gate de tenant EXPLÍCITO', () => {
    const fn = SQL.match(
      /create\s+or\s+replace\s+function\s+opportunity_audit_trail[\s\S]*?\$\$;/i
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn!).toMatch(/security\s+definer/i);
    expect(fn!).toMatch(
      /if\s+not\s+is_platform_admin\(\)\s+and\s+v_tenant\s+is\s+distinct\s+from\s+current_tenant_id\(\)/i
    );
  });
});
