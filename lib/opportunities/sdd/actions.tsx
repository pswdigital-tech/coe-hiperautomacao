'use server';

// =============================================================================
// sdd/actions.ts — geração e download do Documento de Desenho da Solução
// -----------------------------------------------------------------------------
// Modela lib/opportunities/document-actions.ts, e reusa a infraestrutura dele
// de ponta a ponta: mesmo bucket privado, mesmo formato de path, mesma tabela,
// mesmo signed URL. A migration 0065 não criou tabela nova justamente para que
// este arquivo não precisasse recriar nenhuma dessas camadas.
//
// AS DUAS PERMISSÕES SÃO DIFERENTES, de propósito (decisão do PO):
//   • GERAR  — `requireEditorRole()`: bloqueia `viewer`, libera member,
//     tenant_admin, psw_staff e platform_admin. Gerar escreve uma versão nova,
//     carimba um número e produz a peça que vai ao cliente.
//   • BAIXAR — nenhum gate de papel. A visibilidade da oportunidade JÁ é a
//     permissão: quem enxerga a linha (RLS) enxerga o botão. É o que permite ao
//     perfil somente-leitura do cliente pegar o próprio documento sem depender
//     de alguém mandar por e-mail.
// Fundir as duas daria ou um cliente sem acesso ao próprio documento, ou um
// cliente emitindo versões que ninguém revisou.
//
// O CONTEÚDO NUNCA VEM DO CLIENTE. A action recebe só o `opportunityId`; todo
// o resto é relido no servidor por `buildSddData`. Aceitar payload do navegador
// aqui seria o caminho mais curto para imprimir dado de outra empresa num PDF
// entregue ao cliente errado.
// =============================================================================

import { renderToBuffer } from '@react-pdf/renderer';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  requireEditorRole,
  getCurrentProfile,
  resolveWriteTenantId,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';
import { buildSddData, SDD_GERADO_TIPO } from './data';
import { SddDocument } from './document';

export type SddActionResult =
  | { ok: true; documentId: string; versao: number }
  | { ok: false; error: string };

/** Colisão de índice único no Postgres. A 0065 criou um em (oportunidade, tipo, versão). */
const UNIQUE_VIOLATION = '23505';

/**
 * Quantas vezes tentar quando duas gerações concorrentes disputam o mesmo
 * número de versão. Três é folgado: a corrida só existe entre cliques quase
 * simultâneos, e cada tentativa relê o `max` do banco.
 */
const MAX_TENTATIVAS = 3;

// =============================================================================
// generateSdd — emite uma versão nova
// =============================================================================
export async function generateSdd(opportunityId: string): Promise<SddActionResult> {
  const roleCheck = await requireEditorRole();
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada.' };

  // Escopo de escrita RESOLVIDO NO SERVIDOR (Phase 17, D-11): para papéis de
  // cliente é o tenant do profile; para `psw_staff` é o tenant da
  // OPORTUNIDADE-ALVO, nunca o do profile. É o mesmo valor usado no filtro da
  // tabela e no 1º segmento do path do Storage — usar o tenant errado ali
  // gravaria no caminho errado e quebraria o download (T-17-33).
  const tenantId = await resolveWriteTenantId(profile, opportunityId);
  if (!tenantId) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  const supabase = await createClient();
  const geradoPor = profile.fullName?.trim() || profile.email;

  let ultimoErro = 'Não foi possível gerar o documento.';

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const versao = (await maxVersao(opportunityId)) + 1;
    // Carimbado UMA vez por tentativa e passado adiante, em vez de o template
    // chamar `new Date()`: a data impressa na capa e a data gravada na linha
    // precisam ser a mesma, e duas leituras do relógio podem cair em minutos
    // diferentes numa geração lenta.
    const geradoEm = new Date().toISOString();

    const data = await buildSddData(opportunityId, { geradoPor, geradoEm, versao });
    if (!data) return { ok: false, error: 'Oportunidade não encontrada.' };

    let buffer: Buffer;
    try {
      buffer = await renderToBuffer(<SddDocument data={data} />);
    } catch (e) {
      // Falha de layout (campo com conteúdo inesperado, por exemplo) não deve
      // vazar stack para a tela — mas precisa ser distinguível de falha de
      // permissão, senão a pessoa fica tentando de novo achando que é acesso.
      const detalhe = e instanceof Error ? e.message : 'erro desconhecido';
      return { ok: false, error: `Falha ao montar o PDF: ${detalhe}` };
    }

    const nome = nomeArquivo(data.opportunity.seq_id, versao);
    const storagePath = `${tenantId}/${opportunityId}/${Date.now()}-${nome}`;

    const { error: uploadError } = await supabase.storage
      .from('opportunity-documents')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return { ok: false, error: `Falha ao guardar o arquivo: ${uploadError.message}` };
    }

    const { data: inserted, error } = await supabase
      .from('opportunity_documents')
      .insert({
        opportunity_id: opportunityId,
        tenant_id: tenantId,
        kind: 'arquivo',
        nome,
        storage_path: storagePath,
        tipo: 'application/pdf',
        size_bytes: buffer.byteLength,
        gerado_tipo: SDD_GERADO_TIPO,
        gerado_versao: versao,
        created_by: profile.id,
      })
      .select('id')
      .single();

    if (!error && inserted) {
      revalidatePath(`/opportunities/${opportunityId}`);
      return { ok: true, documentId: inserted.id, versao };
    }

    // A linha falhou depois do upload — o objeto no Storage vira órfão se
    // ficar. Mesmo tratamento de `uploadDocumentFile`.
    await supabase.storage.from('opportunity-documents').remove([storagePath]);

    // Corrida de duplo clique: outra geração gravou esta versão entre o nosso
    // `max()` e o nosso insert. O índice único da 0065 é o que transforma isso
    // num erro em vez de em duas "v2" — aqui a gente relê o max e repete.
    if (error?.code === UNIQUE_VIOLATION) {
      ultimoErro = 'Outra geração ocorreu ao mesmo tempo. Tente novamente.';
      continue;
    }

    return {
      ok: false,
      error: `Erro ao registrar o documento: ${error?.message ?? 'desconhecido'}`,
    };
  }

  return { ok: false, error: ultimoErro };
}

// =============================================================================
// getSddDownloadUrl — signed URL da versão pedida
// -----------------------------------------------------------------------------
// SEM gate de papel, por decisão explícita (ver cabeçalho): quem enxerga a
// oportunidade baixa o documento dela. O bloqueio real é a RLS —
// `.eq('opportunity_id', ...)` devolve zero linhas para quem não pode ver, e
// as policies de `storage.objects` (0018/0041/0047/0057) recusam assinar um
// path fora do alcance de quem pediu.
//
// A busca é pelo ID do documento, não pelo path recebido do cliente: aceitar
// um path arbitrário do navegador transformaria esta action numa máquina de
// assinar URL para qualquer objeto do bucket que a RLS de storage deixasse
// passar. Aqui, o path sempre sai do banco.
// =============================================================================
export async function getSddDownloadUrl(
  opportunityId: string,
  documentId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: doc, error } = await supabase
    .from('opportunity_documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('opportunity_id', opportunityId)
    .eq('gerado_tipo', SDD_GERADO_TIPO)
    .maybeSingle();

  if (error || !doc?.storage_path) {
    return { ok: false, error: 'Documento não encontrado.' };
  }

  const { data, error: signError } = await supabase.storage
    .from('opportunity-documents')
    .createSignedUrl(doc.storage_path, 60);

  if (signError || !data) {
    return { ok: false, error: 'Não foi possível gerar o link de download.' };
  }
  return { ok: true, url: data.signedUrl };
}

// =============================================================================
// Auxiliares
// =============================================================================

/** Maior versão já emitida para esta oportunidade; 0 quando nunca foi gerada. */
async function maxVersao(opportunityId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('opportunity_documents')
    .select('gerado_versao')
    .eq('opportunity_id', opportunityId)
    .eq('gerado_tipo', SDD_GERADO_TIPO)
    .order('gerado_versao', { ascending: false })
    .limit(1);

  return data?.[0]?.gerado_versao ?? 0;
}

/**
 * Nome visível do arquivo — é o que aparece na aba Documentos e o que o
 * cliente vê ao salvar. A versão vai NO NOME de propósito: quando três PDFs
 * circulam por e-mail, o nome do arquivo é a única coisa que viaja junto.
 */
function nomeArquivo(seqId: number, versao: number): string {
  return `SDD_Oportunidade-${String(seqId).padStart(4, '0')}_v${versao}.pdf`;
}
