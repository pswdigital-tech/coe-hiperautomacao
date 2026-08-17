import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type LogStatus = 'success' | 'rate_limited' | 'invalid' | 'captcha_failed';

// As RPCs `log_public_form_attempt` e `update_public_form_attempt` foram criadas em
// `0007_public_form_hardening.sql`. `lib/database.types.ts` ainda NÃO conhece elas
// (regenerar via `npm run gen:types` depois de aplicar 0007 no Cloud). Até lá,
// fazemos cast pontual para `any` para evitar erro de typecheck — runtime já
// funciona porque o Postgres aceita as funções com o nome literal.
// Mesmo escape hatch usado em `tests/security/atomicity.test.ts` para `tenant_sequences`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;

/**
 * Loga uma tentativa de submissão do formulário público em `public_form_submissions`
 * com status `pending`. Retorna o `id` da row ou `null` se a RPC falhar.
 *
 * É best-effort: se falhar, o Server Action continua (não bloqueia o fluxo). O log
 * existe para auditoria forense — não para correctness. Erro vai para `console.error`.
 *
 * RPC `log_public_form_attempt` é SECURITY DEFINER (migration 0007), com grant
 * para `anon` e `authenticated`. Resolve `tenant_id` a partir do slug.
 */
export async function logPublicFormAttempt(params: {
  slug: string;
  ipHash: string;
  userAgent: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (supabase.rpc as unknown as AnyRpc).bind(supabase);
  const { data, error } = await rpc('log_public_form_attempt', {
    p_slug: params.slug,
    p_ip_hash: params.ipHash,
    p_user_agent: params.userAgent ?? null,
  });
  if (error || !data) {
    console.error('[public-form/log] log falhou:', error?.message);
    return null;
  }
  return data as unknown as string;
}

/**
 * Atualiza o status final de uma row em `public_form_submissions` (success | invalid
 * | captcha_failed | rate_limited). `logId` null é no-op — defensivo para quando o
 * insert original falhou.
 *
 * Mensagem de erro completa (`error.message` da RPC ou códigos do Turnstile) vai
 * para o `error_message` da row — para o cliente, o Server Action retorna pt-BR
 * genérico (CONTEXT.md Falha Segura, T-07.5-D-06).
 */
export async function updatePublicFormAttempt(
  logId: string | null,
  status: LogStatus,
  error?: string,
): Promise<void> {
  if (!logId) return;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (supabase.rpc as unknown as AnyRpc).bind(supabase);
  const { error: rpcError } = await rpc('update_public_form_attempt', {
    p_log_id: logId,
    p_status: status,
    p_error: error ?? null,
  });
  if (rpcError) console.error('[public-form/log] update falhou:', rpcError.message);
}
