// =============================================================================
// Restritiva `_psw_staff_only_assigned` (migration 0044) — invariante estrutural
// =============================================================================
// Spec PURO (sem banco, roda em modo unit-only): lê o texto da 0044 do disco e
// trava os dois disjuntos originais que fazem `psw_staff` só enxergar/escrever
// o que lhe foi atribuído. Não substitui um teste de banco (exigiria
// `.env.test`), mas é o único detector do caso "alguém simplificou a
// restritiva ao reemitir a policy" — os planos 18-02 e 18-03 REEMITEM estas
// mesmas policies com um terceiro disjunto (a concessão de admin), e se ao
// reemitir perderem qualquer um dos dois disjuntos abaixo, o `psw_staff` sem
// concessão passa a ver mais do que via hoje (regressão de GRANT-02/GRANT-10).
//
// Este arquivo afirma sobre a 0044, que é IMUTÁVEL — os planos seguintes que
// reemitirem a restritiva acrescentam suas PRÓPRIAS asserções sobre os
// arquivos novos (0045/0046), sem precisar tocar aqui.
//
// Precedente de forma: tests/schema/audit-log-rules.test.ts (readFileSync +
// normalizador de espaços + asserções por regex sobre o SQL bruto).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/0044_psw_staff_only_assigned.sql'),
  'utf8',
);

// As sete tabelas filhas do laço da 0044 — fora dela, de propósito:
// `opportunities` (tem policy própria, chave `id`, fora do laço),
// `profiles`/`tenants`/`audit_log`/`invited_emails`/`storage.objects` (a 0044
// declara explicitamente que NÃO toca nelas).
const CHILD_TABLES = [
  'opportunity_phases',
  'opportunity_risks',
  'opportunity_notes',
  'opportunity_documents',
  'opportunity_history',
  'opportunity_tasks',
  'opportunity_assignees',
];

/** Colapsa espaços em branco (incl. quebras de linha) para tornar as
 * asserções de substring resilientes a reindentação. Comentários `--` não
 * precisam ser removidos: nenhuma asserção depende de código comentado, e o
 * SQL comentado deste arquivo (bloco de verificação pós-apply / ROLLBACK)
 * nunca colide com os predicados ativos que os testes abaixo procuram. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const NORMALIZED = normalize(SQL);

describe('restritiva `_psw_staff_only_assigned` (0044) — policy raiz de `opportunities`', () => {
  it('é declarada `as restrictive` e `for all`', () => {
    const policy = SQL.match(
      /create\s+policy\s+opportunities_psw_staff_only_assigned\s+on\s+opportunities[\s\S]*?;/i,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(normalize(policy!)).toMatch(/as restrictive/i);
    expect(normalize(policy!)).toMatch(/for all/i);
  });

  it('o curto-circuito por papel aparece pelo menos duas vezes — uma no `using`, uma no `with check`', () => {
    const policy = SQL.match(
      /create\s+policy\s+opportunities_psw_staff_only_assigned\s+on\s+opportunities[\s\S]*?;/i,
    )?.[0];
    expect(policy).toBeTruthy();
    const occurrences =
      normalize(policy!).match(/current_user_role\(\)\s+is distinct from\s+'psw_staff'/gi) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('o disjunto por atribuição usa a chave `id` (raiz), não `opportunity_id`', () => {
    const policy = SQL.match(
      /create\s+policy\s+opportunities_psw_staff_only_assigned\s+on\s+opportunities[\s\S]*?;/i,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(normalize(policy!)).toMatch(
      /id in \(select current_assigned_opportunity_ids\(\)\)/i,
    );
  });
});

describe('restritiva `_psw_staff_only_assigned` (0044) — laço das 7 tabelas filhas', () => {
  function childrenBlock(): string {
    const block = SQL.match(/foreach\s+t\s+in\s+array\s+array\[([\s\S]*?)\]/i)?.[1];
    if (!block) throw new Error('laço de tabelas filhas não encontrado na 0044');
    return block;
  }

  function loopedTables(): string[] {
    return [...childrenBlock().matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it('cobre exatamente as sete tabelas filhas esperadas — nem uma a menos, nem a mais', () => {
    expect(loopedTables().sort()).toEqual([...CHILD_TABLES].sort());
  });

  it('o disjunto por atribuição, dentro do laço, usa a chave `opportunity_id` (não `id`)', () => {
    const loopBody = SQL.match(/do \$\$[\s\S]*?end \$\$;/i)?.[0];
    expect(loopBody).toBeTruthy();
    expect(normalize(loopBody!)).toMatch(
      /opportunity_id in \(select current_assigned_opportunity_ids\(\)\)/i,
    );
  });

  it('o curto-circuito por papel também aparece no laço — using E with check', () => {
    const loopBody = SQL.match(/do \$\$[\s\S]*?end \$\$;/i)?.[0];
    expect(loopBody).toBeTruthy();
    const occurrences =
      normalize(loopBody!).match(/current_user_role\(\)\s+is distinct from\s+'psw_staff'/gi) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sanidade do arquivo lido', () => {
  it('o texto normalizado não está vazio (proteção contra path errado / arquivo vazio)', () => {
    expect(NORMALIZED.length).toBeGreaterThan(100);
  });
});
