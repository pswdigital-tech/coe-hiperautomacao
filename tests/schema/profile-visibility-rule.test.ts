// =============================================================================
// Restritiva `_profile_visibility` (migration 0053) — invariante estrutural
// =============================================================================
// Spec PURO (sem banco, roda em modo unit-only): lê o texto da 0053 do disco e
// trava as propriedades das quais o recorte por pessoa depende. Não substitui
// um teste de banco (exigiria `.env.test`), mas pega as duas regressões que
// mais doem:
//
//   1. Alguém perde um dos dois disjuntos de escape (papel não-cliente,
//      interruptor <> 'restricted') ao reemitir a policy — e passa a recortar
//      quem nunca foi restringido, ou o `platform_admin`.
//   2. Uma tabela filha some do laço — e a pessoa restrita continua lendo
//      riscos/tarefas/anotações de oportunidades que ela não pode ver.
//
// Precedente de forma: tests/schema/psw-staff-restrictive-rule.test.ts.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/0053_profile_opportunity_visibility.sql'),
  'utf8',
);

// As mesmas sete filhas da 0044 — o recorte novo tem que cobrir exatamente o
// mesmo alcance, senão sobra caminho lateral para os dados da oportunidade.
const CHILD_TABLES = [
  'opportunity_phases',
  'opportunity_risks',
  'opportunity_notes',
  'opportunity_documents',
  'opportunity_history',
  'opportunity_tasks',
  'opportunity_assignees',
];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const NORMALIZED = normalize(SQL);

function rootPolicy(): string {
  const policy = SQL.match(
    /create\s+policy\s+opportunities_profile_visibility\s+on\s+opportunities[\s\S]*?;/i,
  )?.[0];
  if (!policy) throw new Error('policy raiz não encontrada na 0053');
  return normalize(policy);
}

function loopBody(): string {
  const body = SQL.match(/do \$\$[\s\S]*?end \$\$;/i)?.[0];
  if (!body) throw new Error('laço de tabelas filhas não encontrado na 0053');
  return normalize(body);
}

describe('restritiva `_profile_visibility` (0053) — policy raiz de `opportunities`', () => {
  it('é declarada `as restrictive` e `for all`', () => {
    expect(rootPolicy()).toMatch(/as restrictive/i);
    expect(rootPolicy()).toMatch(/for all/i);
  });

  it('escapa papéis não-clientes — `platform_admin` e `psw_staff` nunca são recortados aqui', () => {
    const occurrences =
      rootPolicy().match(
        /current_user_role\(\) not in \('member', 'viewer', 'tenant_admin'\)/gi,
      ) ?? [];
    // uma no `using`, uma no `with check`
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('escapa quem não está restrito — o disjunto do interruptor está nos dois lados', () => {
    const occurrences =
      rootPolicy().match(/current_visibility_scope\(\) <> 'restricted'/gi) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('o disjunto da lista usa a chave `id` (raiz), não `opportunity_id`', () => {
    expect(rootPolicy()).toMatch(/id in \(select current_allowed_opportunity_ids\(\)\)/i);
  });
});

describe('restritiva `_profile_visibility` (0053) — laço das 7 tabelas filhas', () => {
  function loopedTables(): string[] {
    const block = SQL.match(/foreach\s+t\s+in\s+array\s+array\[([\s\S]*?)\]/i)?.[1];
    if (!block) throw new Error('array do laço não encontrado na 0053');
    return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it('cobre exatamente as sete tabelas filhas — nem uma a menos, nem a mais', () => {
    expect(loopedTables().sort()).toEqual([...CHILD_TABLES].sort());
  });

  it('o disjunto da lista, dentro do laço, usa `opportunity_id` (não `id`)', () => {
    expect(loopBody()).toMatch(
      /opportunity_id in \(select current_allowed_opportunity_ids\(\)\)/i,
    );
  });

  it('os dois disjuntos de escape também aparecem no laço — using E with check', () => {
    const papel =
      loopBody().match(/current_user_role\(\) not in \('member', 'viewer', 'tenant_admin'\)/gi) ??
      [];
    const escopo = loopBody().match(/current_visibility_scope\(\) <> 'restricted'/gi) ?? [];
    expect(papel.length).toBeGreaterThanOrEqual(2);
    expect(escopo.length).toBeGreaterThanOrEqual(2);
  });
});

describe('helpers e tabelas de controle (0053)', () => {
  it('os dois helpers são SECURITY DEFINER — sem isso a policy recursaria na própria tabela', () => {
    for (const fn of ['current_visibility_scope', 'current_allowed_opportunity_ids']) {
      const decl = SQL.match(
        new RegExp(`create or replace function ${fn}\\(\\)[\\s\\S]*?\\$\\$`, 'i'),
      )?.[0];
      expect(decl, `${fn} não encontrada`).toBeTruthy();
      expect(normalize(decl!)).toMatch(/security definer/i);
      expect(normalize(decl!)).toMatch(/set search_path = public/i);
    }
  });

  it('ausência de linha em `profile_visibility` significa "vê tudo" — o coalesce para `all`', () => {
    expect(NORMALIZED).toMatch(/coalesce\( \(select scope from profile_visibility[\s\S]*?'all' \)/i);
  });

  it('as tabelas de CONTROLE ficam fora do recorte que elas controlam', () => {
    // Se uma restritiva `_profile_visibility` fosse criada sobre elas, um admin
    // que se restringisse a si mesmo não conseguiria mais desfazer o recorte.
    expect(NORMALIZED).not.toMatch(/create policy profile_visibility_profile_visibility/i);
    expect(NORMALIZED).not.toMatch(/create policy profile_opportunity_access_profile_visibility/i);
  });

  it('escrita nas tabelas de controle exige admin — nunca o próprio dono da linha', () => {
    for (const policy of ['profile_visibility_write', 'profile_opportunity_access_write']) {
      const decl = SQL.match(new RegExp(`create policy ${policy}[\\s\\S]*?;`, 'i'))?.[0];
      expect(decl, `${policy} não encontrada`).toBeTruthy();
      expect(normalize(decl!)).toMatch(/is_platform_admin\(\) or is_tenant_admin_of\(tenant_id\)/i);
      expect(normalize(decl!)).not.toMatch(/profile_id = \(select auth\.uid\(\)\)/i);
    }
  });
});

describe('caminho lateral fechado — `opportunity_audit_trail` (item 7)', () => {
  function auditFn(): string {
    const decl = SQL.match(
      /create or replace function opportunity_audit_trail\(p_opportunity_id uuid\)[\s\S]*?\$body\$;/i,
    )?.[0];
    if (!decl) throw new Error('opportunity_audit_trail não reemitida na 0053');
    return normalize(decl);
  }

  it('o gate passa a exigir a lista para quem está restrito', () => {
    expect(auditFn()).toMatch(/current_visibility_scope\(\) = 'restricted'/i);
    expect(auditFn()).toMatch(
      /p_opportunity_id not in \(select current_allowed_opportunity_ids\(\)\)/i,
    );
  });

  it('os dois caminhos anteriores continuam intactos — platform_admin e psw_staff atribuído', () => {
    expect(auditFn()).toMatch(/not is_platform_admin\(\)/i);
    expect(auditFn()).toMatch(
      /p_opportunity_id not in \(select current_assigned_opportunity_ids\(\)\)/i,
    );
    expect(auditFn()).toMatch(/v_tenant is distinct from current_tenant_id\(\)/i);
  });

  it('os grants são reemitidos — `create or replace function` os reseta', () => {
    expect(NORMALIZED).toMatch(
      /grant execute on function opportunity_audit_trail\(uuid\) to authenticated/i,
    );
  });
});

// =============================================================================
// 0054 — o recorte pendurado no convite e herdado no signup
// =============================================================================
const SQL_54 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0054_invite_opportunity_visibility.sql'),
  'utf8',
);
const NORMALIZED_54 = normalize(SQL_54);

describe('herança do recorte no signup (0054)', () => {
  function handleNewUser(): string {
    const fn = SQL_54.match(
      /create or replace function handle_new_user\(\)[\s\S]*?\n\$\$;/i,
    )?.[0];
    if (!fn) throw new Error('handle_new_user não reemitida na 0054');
    return normalize(fn);
  }

  it('o caminho antigo é preservado — convite define tenant/role/cargo e o profile nasce igual', () => {
    // Se qualquer um destes sumir na reemissão, o cadastro quebra para TODO
    // mundo, não só para quem tem recorte.
    expect(handleNewUser()).toMatch(/from invited_emails where lower\(email\) = lower\(new\.email\)/i);
    expect(handleNewUser()).toMatch(/update invited_emails set used_at = now\(\)/i);
    expect(handleNewUser()).toMatch(/raw_app_meta_data->>'tenant_id'/i);
    expect(handleNewUser()).not.toMatch(/raw_user_meta_data->>'tenant_id'/i);
    expect(handleNewUser()).toMatch(
      /insert into profiles \(id, tenant_id, email, full_name, role, cargo\)/i,
    );
  });

  it('a herança só roda para papel de cliente e só quando o recorte é `restricted`', () => {
    expect(handleNewUser()).toMatch(/v_role in \('member', 'viewer', 'tenant_admin'\)/i);
    expect(handleNewUser()).toMatch(/v_vis\.scope = 'restricted'/i);
  });

  it('a cópia da lista filtra por `join opportunities` — oportunidade excluída não trava o cadastro', () => {
    // Um insert às cegas do array violaria a FK e impediria a pessoa de criar
    // conta por causa de uma demanda apagada meses antes.
    expect(handleNewUser()).toMatch(
      /join opportunities o on o\.id = sel\.id and o\.tenant_id = v_tenant_id/i,
    );
  });

  it('grava nas tabelas da 0053 — não cria um segundo mecanismo de autorização', () => {
    expect(handleNewUser()).toMatch(/insert into profile_visibility/i);
    expect(handleNewUser()).toMatch(/insert into profile_opportunity_access/i);
  });
});

describe('coerência do recorte pendente (0054)', () => {
  it('`tenant_id` é DERIVADO do convite, nunca aceito do insert', () => {
    expect(NORMALIZED_54).toMatch(/new\.tenant_id := v_tenant;/i);
  });

  it('todo id do array é verificado contra o tenant do convite', () => {
    expect(NORMALIZED_54).toMatch(/from unnest\(new\.opportunity_ids\)/i);
    expect(NORMALIZED_54).toMatch(/o\.id is null or o\.tenant_id is distinct from v_tenant/i);
  });

  it('a escrita exige admin — mesmo predicado da 0053', () => {
    const decl = SQL_54.match(/create policy invite_visibility_write[\s\S]*?;/i)?.[0];
    expect(decl).toBeTruthy();
    expect(normalize(decl!)).toMatch(/is_platform_admin\(\) or is_tenant_admin_of\(tenant_id\)/i);
  });

  it('nenhuma policy de `opportunities` é tocada aqui — o recorte continua sendo o da 0053', () => {
    expect(NORMALIZED_54).not.toMatch(/create policy \w* ?on opportunities/i);
    expect(NORMALIZED_54).not.toMatch(/as restrictive/i);
  });
});

describe('sanidade do arquivo lido', () => {
  it('o texto normalizado não está vazio (proteção contra path errado / arquivo vazio)', () => {
    expect(NORMALIZED.length).toBeGreaterThan(100);
  });
});
