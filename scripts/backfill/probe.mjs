import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('Target project URL:', url);

const sb = createClient(url, key, { auth: { persistSession: false } });

// total
const { count: total } = await sb
  .from('opportunities')
  .select('*', { count: 'exact', head: true });

// fte_horas null
const { count: nullFte } = await sb
  .from('opportunities')
  .select('*', { count: 'exact', head: true })
  .is('fte_horas', null);

console.log('Total opportunities:', total);
console.log('fte_horas IS NULL:', nullFte);

// breakdown of the null rows by tenant + status
const { data: rows, error } = await sb
  .from('opportunities')
  .select('tenant_id, ai_enrichment_status')
  .is('fte_horas', null);

if (error) { console.error('ERROR:', error.message); process.exit(1); }

const byStatus = {};
const byTenant = {};
for (const r of rows) {
  byStatus[r.ai_enrichment_status ?? 'null'] = (byStatus[r.ai_enrichment_status ?? 'null'] ?? 0) + 1;
  byTenant[r.tenant_id] = (byTenant[r.tenant_id] ?? 0) + 1;
}
console.log('\nNull-FTE rows by ai_enrichment_status:', byStatus);
console.log('Null-FTE rows by tenant_id:', byTenant);

// tenant names for context
const tenantIds = Object.keys(byTenant);
const { data: tenants } = await sb.from('tenants').select('id, name, slug').in('id', tenantIds);
console.log('\nTenants:', tenants);
