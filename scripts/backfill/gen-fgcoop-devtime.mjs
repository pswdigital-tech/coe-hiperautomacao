/**
 * gen-fgcoop-devtime.mjs — estimativa DETERMINÍSTICA de tempo de desenvolvimento
 * por oportunidade (tenant FGCoop) → gera um .md com tabela.
 *
 * Método (transparente, reproduzível — NÃO usa IA):
 *   base[complexidade][esforco] = faixa de dias úteis
 *   ajuste por ferramenta: 'ambos' → ×1.25 (RPA + n8n = duas frentes), arredondado
 *
 * Read-only: só LÊ o banco e escreve um arquivo. Nada é persistido no DB.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

config({ path: '.env.local' });

const FG = '11111111-1111-1111-1111-111111111111';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Matriz base: dias úteis [min, max] por complexidade × esforço.
const BASE = {
  baixo: { baixo: [2, 4], medio: [4, 6], alto: [6, 9] },
  medio: { baixo: [5, 8], medio: [8, 13], alto: [13, 18] },
  alto: { baixo: [15, 22], medio: [22, 30], alto: [30, 45] },
};
const TOOL_MULT = { rpa: 1, n8n: 1, ambos: 1.25 };
const COMPLEX_LABEL = { baixo: 'Baixa', medio: 'Média', alto: 'Alta' };

function estimate(complexidade, esforco, ferramenta) {
  const cx = BASE[complexidade] ?? BASE.medio;
  const [lo, hi] = cx[esforco] ?? cx.medio;
  const m = TOOL_MULT[ferramenta] ?? 1;
  const min = Math.round(lo * m);
  const max = Math.round(hi * m);
  const semMin = Math.round((min / 5) * 10) / 10;
  const semMax = Math.round((max / 5) * 10) / 10;
  const sem = semMax < 1 ? '<1 sem' : `~${semMin}–${semMax} sem`;
  return { min, max, texto: `${min}–${max} dias úteis (${sem})` };
}

const { data, error } = await sb
  .from('opportunities')
  .select('seq_id, processo, complexidade, esforco, ferramenta')
  .eq('tenant_id', FG);
if (error) throw new Error(error.message);

// ordena por esforço de dev (usa o ponto médio da faixa, desc)
const rows = data
  .map((r) => ({ ...r, est: estimate(r.complexidade, r.esforco, r.ferramenta) }))
  .sort((a, b) => (b.est.min + b.est.max) - (a.est.min + a.est.max));

const totalMin = rows.reduce((s, r) => s + r.est.min, 0);
const totalMax = rows.reduce((s, r) => s + r.est.max, 0);

let md = `# FGCoop — Estimativa de Tempo de Desenvolvimento por Oportunidade\n\n`;
md += `> Estimativa **determinística** derivada dos campos curados \`complexidade\` e \`esforco\` de cada oportunidade, com ajuste por \`ferramenta\`. Não usa IA — é reproduzível. Valores em **dias úteis** (1 semana = 5 dias úteis).\n\n`;
md += `**Tenant:** FGCoop · **Oportunidades:** ${rows.length} · **Gerado a partir do banco** \`vxgthycrjetniejsjmee\`\n\n`;
md += `## Método\n\n`;
md += `Matriz base (dias úteis) por complexidade × esforço de implementação:\n\n`;
md += `| Complexidade \\ Esforço | Baixo | Médio | Alto |\n|---|---|---|---|\n`;
md += `| **Baixa** | 2–4 | 4–6 | 6–9 |\n| **Média** | 5–8 | 8–13 | 13–18 |\n| **Alta** | 15–22 | 22–30 | 30–45 |\n\n`;
md += `Ajuste por ferramenta: \`ambos\` (RPA + n8n = duas frentes) → **×1,25**; \`rpa\`/\`n8n\` → ×1,0.\n\n`;
md += `## Estimativas\n\n`;
md += `| Oportunidade | Complexidade | Tempo Estimado |\n|---|---|---|\n`;
for (const r of rows) {
  const nome = `#${String(r.seq_id).padStart(4, '0')} ${r.processo}`.replace(/\|/g, '\\|');
  md += `| ${nome} | ${COMPLEX_LABEL[r.complexidade] ?? r.complexidade} | ${r.est.texto} |\n`;
}
md += `\n## Totais (soma das faixas)\n\n`;
md += `- **Esforço agregado:** ${totalMin}–${totalMax} dias úteis (~${Math.round(totalMin/5)}–${Math.round(totalMax/5)} semanas de dev, sem paralelismo).\n`;
md += `\n---\n*Estimativa gerada em ${new Date().toISOString().slice(0,10)} · método determinístico complexidade×esforço×ferramenta · não persistida no banco.*\n`;

const out = 'FGCOOP-estimativa-tempo-dev.md';
writeFileSync(out, md);
console.log(`OK: ${rows.length} oportunidades → ${out}`);
console.log(`Total: ${totalMin}–${totalMax} dias úteis`);
