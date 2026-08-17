/**
 * restore-fgcoop-curated.mjs — restaura os campos curados da FGCoop do backup,
 * PRESERVANDO o fte_horas + bucket `fte` calculados pelo backfill de 2026-07-16.
 *
 * Restaura 8 campos: esforco, complexidade, objetivo, ferramenta,
 * escopo_automacao, beneficios_esperados, observacao, risco.
 * NÃO toca: fte_horas, fte, ai_enrichment_status, ai_enriched_at.
 *
 * Uso:  node scripts/backfill/restore-fgcoop-curated.mjs <backup.json> [--dry]
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });

const FGCOOP = '11111111-1111-1111-1111-111111111111';
const BACKUP = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!BACKUP) throw new Error('uso: node restore-fgcoop-curated.mjs <backup.json> [--dry]');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const CURATED = [
  'esforco', 'complexidade', 'objetivo', 'ferramenta',
  'escopo_automacao', 'beneficios_esperados', 'observacao', 'risco',
];

const backup = JSON.parse(readFileSync(BACKUP, 'utf8'));
const rows = backup.filter((r) => r.tenant_id === FGCOOP);
console.log(`Projeto: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(`Backup: ${BACKUP}`);
console.log(`FGCoop no backup: ${rows.length}${DRY ? '  (DRY-RUN, sem gravar)' : ''}\n`);

let ok = 0, fail = 0;
for (const r of rows) {
  const patch = Object.fromEntries(CURATED.map((k) => [k, r[k]]));
  if (DRY) {
    console.log(`~ ${r.id.slice(0, 8)}  esforco=${patch.esforco} complex=${patch.complexidade} obj=${patch.objetivo} ferr=${patch.ferramenta} escopo=${(patch.escopo_automacao||[]).length} benef=${(patch.beneficios_esperados||[]).length}`);
    continue;
  }
  const { error } = await sb
    .from('opportunities')
    .update(patch)
    .eq('id', r.id)
    .eq('tenant_id', FGCOOP);
  if (error) { fail++; console.log(`✗ ${r.id.slice(0, 8)}  ${error.message}`); }
  else { ok++; console.log(`✓ ${r.id.slice(0, 8)}  campos curados restaurados`); }
}
if (!DRY) console.log(`\nConcluído: ${ok} ok, ${fail} falhas de ${rows.length}. (fte_horas/fte/status preservados)`);
