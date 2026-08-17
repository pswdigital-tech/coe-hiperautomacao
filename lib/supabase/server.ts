import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route Handlers.
 * Cookies são lidos/escritos via `next/headers` (assíncrono no Next 16).
 *
 * Respeita RLS (usa anon key + JWT da sessão do usuário pelos cookies).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component (read-only) —
            // o middleware refresca a sessão de qualquer jeito.
          }
        },
      },
    }
  );
}

// ============================================================================
// serviceRoleClient — bypassa RLS para operações server-side onde o usuário
// pode não estar autenticado (ex.: enrichment pós-IA disparado via after()
// num formulário público anônimo).
//
// SEGURANÇA:
//   1. `import 'server-only'` no topo do arquivo IMPEDE inclusão em client bundle.
//   2. SUPABASE_SERVICE_ROLE_KEY NUNCA deve aparecer em código que roda no browser.
//   3. TODA query feita com este client DEVE incluir `.eq('tenant_id', $TENANT_ID)`
//      defensivamente — service role bypassa RLS por design.
//   4. NUNCA chamar com user input que controle o `tenant_id` — sempre derivar
//      server-side a partir de auth.uid() lookup OU de tenants.slug resolvido.
//
// NUANCE (Phase 17, D-11): a regra "toda mutação carrega um filtro defensivo
// de tenant" continua valendo — o que muda, a partir desta fase, é que esse
// `$TENANT_ID` **não pode mais vir de `profile.tenant_id` cru** nas Server
// Actions de escrita de `lib/opportunities/*.ts`. Existe agora um papel
// (`psw_staff`) cujo tenant do profile NÃO é o tenant da linha que ele está
// autorizado a escrever (é multi-tenant por atribuição, via
// `opportunity_assignees`). Essas actions resolvem o tenant do filtro
// chamando `resolveWriteTenantId()` (`lib/security/role.ts`) — o ponto único
// dessa resolução — em vez de ler `profiles.tenant_id` do ator diretamente.
// Este client (`serviceRoleClient`) não foi alterado por essa mudança: ele
// roda fora de sessão de usuário (sem `profile` para resolver), então o
// `$TENANT_ID` aqui continua vindo de onde já vinha (ex.: da própria
// oportunidade sendo processada), nunca de um profile psw_staff.
// ============================================================================

/**
 * Cliente Supabase com service role — bypassa RLS por design.
 *
 * USO RESTRITO:
 *   - Phase 7.6 lib/ai/enrichment.ts: UPDATE pós-IA quando user pode estar deslogado.
 *   - Filtro defensivo OBRIGATÓRIO: `.eq('tenant_id', $TENANT_ID)` em qualquer query.
 *
 * THROW imediato se env vars ausentes — falha visível é melhor que silenciosa.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[supabase/server] SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente — setar em .env.local e via `vercel env add` em production/preview.'
    );
  }
  return createSupabaseAdminClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
