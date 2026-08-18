'use server';

// =============================================================================
// import-actions.ts — importação em massa de oportunidades (migration 0059)
// -----------------------------------------------------------------------------
// Camadas de defesa (mesmo padrão de assignee-actions.ts):
//   1. Guard aqui — `platform_admin` OU o par pessoa × empresa
//      (`isTenantAdminOf`) contra o tenant-ALVO escolhido no formulário.
//   2. O TEXTO CRU do CSV é reparseado AQUI, no servidor, pelo mesmo módulo puro
//      que a tela usou na pré-visualização. A action nunca aceita linhas já
//      parseadas: fosse assim, um cliente forjado escolheria `status`, datas e
//      qualquer campo sem passar por validação nenhuma.
//   3. `tenant_id` e `created_by` são decididos pelo BANCO dentro da RPC
//      (`import_opportunities`, SECURITY DEFINER), que revalida a autorização.
//      A RLS não é o bloqueio aqui — a RPC é definidora de propósito, porque um
//      `psw_staff` não tem INSERT direto em `opportunities` (ver 0051 §POR QUE
//      UMA RPC E NÃO UMA POLICY).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  ADMIN_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import {
  parseImportCsv,
  MAX_IMPORT_ROWS,
  type ImportIssue,
} from '@/lib/opportunities/import-csv';
import { fetchAssignableProfiles } from '@/lib/opportunities/assignees';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';

/** Linha que já existia na empresa e por isso não foi criada de novo. */
export type SkippedRow = {
  linha: number;
  processo: string;
  seqId: number | null;
};

export type ImportResult =
  | {
      ok: true;
      inseridas: number;
      atribuicoes: number;
      puladas: SkippedRow[];
      /** Avisos que NÃO impediram a importação (coluna ignorada, linha repetida…). */
      avisos: ImportIssue[];
    }
  | {
      ok: false;
      error: string;
      /** Problemas por linha/coluna, quando a recusa veio da validação do arquivo. */
      issues?: ImportIssue[];
    };

/**
 * Importa o CSV inteiro numa empresa, atribuindo as pessoas escolhidas a todas
 * as oportunidades criadas.
 *
 * Tudo ou nada: a RPC roda numa transação só, então um erro de banco na linha
 * 300 desfaz as 299 anteriores. Linha cujo `processo` já existe na empresa não é
 * erro — é pulada e devolvida em `puladas` (só cria, nunca atualiza).
 */
export async function importOpportunitiesFromCsv(input: {
  tenantId: string;
  assigneeIds: string[];
  csvText: string;
}): Promise<ImportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  if (!input.tenantId) {
    return { ok: false, error: 'Escolha a empresa que vai receber as oportunidades.' };
  }

  const canImport =
    isPlatformAdmin(profile) || (await isTenantAdminOf(profile, input.tenantId));
  if (!canImport) return { ok: false, error: ADMIN_SCOPE_DENIED_MESSAGE };

  // Fonte única de validação — a mesma função que desenhou a pré-visualização.
  const parsed = parseImportCsv(input.csvText ?? '');

  const bloqueiam = parsed.issues.filter((i) => !isAviso(i));
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error:
        parsed.missingColumns.length > 0
          ? `O arquivo não tem as colunas obrigatórias: ${parsed.missingColumns.join(', ')}.`
          : 'Nenhuma linha válida para importar.',
      issues: parsed.issues,
    };
  }
  if (bloqueiam.length > 0) {
    return {
      ok: false,
      error: `${bloqueiam.length} linha(s) com problema. Corrija o arquivo e envie de novo.`,
      issues: parsed.issues,
    };
  }
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `Máximo de ${MAX_IMPORT_ROWS} linhas por importação.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_opportunities', {
    p_tenant_id: input.tenantId,
    // `linha` viaja junto para que "pulada" e "erro" possam apontar a linha do
    // arquivo que a pessoa vê no Excel, não um índice interno.
    p_rows: parsed.rows.map((r) => ({ linha: r.line, ...r.payload })),
    p_assignee_ids: Array.from(new Set(input.assigneeIds.filter(Boolean))),
  });

  if (error) {
    console.error('[import] import_opportunities:', error.message);
    return { ok: false, error: traduzErroDoBanco(error.message) };
  }

  const resumo = (data ?? {}) as {
    inseridas?: number;
    atribuicoes?: number;
    puladas?: { linha?: number; processo?: string; seq_id?: number }[];
  };

  revalidatePath('/opportunities');

  return {
    ok: true,
    inseridas: resumo.inseridas ?? 0,
    atribuicoes: resumo.atribuicoes ?? 0,
    puladas: (resumo.puladas ?? []).map((p) => ({
      linha: p.linha ?? 0,
      processo: p.processo ?? '',
      seqId: p.seq_id ?? null,
    })),
    avisos: parsed.issues,
  };
}

/**
 * Candidatos a responsável na empresa escolhida — o seletor "atribuir a" da
 * tela, recarregado a cada troca de empresa.
 *
 * A regra espelha `check_assignee_tenant()` (0040) e a validação da própria RPC:
 * pessoas do tenant-alvo sempre; `psw_staff` de fora também, porque é o único
 * vínculo cruzado que o banco aceita — e é justamente o caso de uso ("subir como
 * responsável alguém da PSW no acervo do cliente").
 */
export async function listImportAssignees(
  tenantId: string
): Promise<AssignableProfile[]> {
  const profile = await getCurrentProfile();
  if (!profile || !tenantId) return [];

  const canImport = isPlatformAdmin(profile) || (await isTenantAdminOf(profile, tenantId));
  if (!canImport) return [];

  const doTenant = await fetchAssignableProfiles(tenantId);

  // Staff da PSW: vem do tenant de quem opera quando quem opera é da PSW. Um
  // `tenant_admin` de cliente não recebe essa lista — cliente nunca vincula
  // gente de fora (D-05), e a RPC recusaria de qualquer forma se ele forçasse.
  if (profile.tenantId === tenantId) return doTenant;

  const daPsw = (await fetchAssignableProfiles(profile.tenantId)).filter(
    (p) => p.role === 'psw_staff'
  );

  const porId = new Map(doTenant.map((p) => [p.id, p]));
  for (const p of daPsw) if (!porId.has(p.id)) porId.set(p.id, p);

  return Array.from(porId.values()).sort((a, b) =>
    (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, 'pt-BR')
  );
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/** Problema que NÃO impede a importação: linha repetida dentro do arquivo e
 *  cabeçalho duplicado — nos dois casos a primeira ocorrência entra e a segunda
 *  é descartada, o que é o comportamento desejado, não um erro. */
function isAviso(issue: ImportIssue): boolean {
  return (
    issue.message.startsWith('repete o processo da linha') ||
    issue.message.startsWith('coluna repetida')
  );
}

/** Erro cru do Postgres → frase que a pessoa entende. O texto das exceções vem
 *  da própria RPC (já em pt-BR); o que sobra são violações de constraint. */
function traduzErroDoBanco(message: string): string {
  if (message.includes('opportunities_criterios_chk')) {
    return 'Alguma linha tem os critérios preenchidos pela metade — preencha os 8 ou nenhum.';
  }
  if (message.includes('opportunities_beneficios_chk')) {
    return 'Alguma linha tem benefício fora da escala de 1 a 5.';
  }
  if (message.includes('opportunities_ferramentas_chk')) {
    return 'Alguma linha tem mais ferramentas do que o permitido (máximo 12).';
  }
  if (message.includes('Atribuição cruzada')) {
    return 'Uma das pessoas escolhidas não pertence à empresa e não é staff da PSW.';
  }
  return message;
}
