import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ausente — preencha .env.test`);
  return v;
}

/** Cliente com service role — bypassa RLS. SOMENTE para setup/teardown. */
export function serviceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Cliente autenticado como usuário X — respeita RLS via JWT do usuário. */
export async function authedClient(
  email: string,
  password: string,
): Promise<{
  client: SupabaseClient<Database>;
  userId: string;
  tenantId: string;
}> {
  const client = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`signIn falhou para ${email}: ${error?.message}`);
  }

  // Lê tenant_id do profile via service-role (não disparar RLS aqui)
  const svc = serviceRoleClient();
  const { data: profile } = await svc
    .from('profiles')
    .select('tenant_id')
    .eq('id', data.user.id)
    .single();
  if (!profile) throw new Error(`profile não encontrado para ${email}`);

  return { client, userId: data.user.id, tenantId: profile.tenant_id };
}
