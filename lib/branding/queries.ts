import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { normalizeHexColor } from './theme';

// =============================================================================
// branding/queries.ts — leitura da identidade visual do tenant
// -----------------------------------------------------------------------------
// `logo_path` é um path no bucket PÚBLICO 'tenant-branding' (0033). URL pública
// é montada aqui, sem signed URL: a logo aparece em tela anônima (formulário
// público) e num <img> simples.
// =============================================================================

export const BRANDING_BUCKET = 'tenant-branding';

export type TenantBranding = {
  brandColor: string | null;
  logoPath: string | null;
  logoUrl: string | null;
};

export const EMPTY_BRANDING: TenantBranding = {
  brandColor: null,
  logoPath: null,
  logoUrl: null,
};

/** URL pública da logo no bucket 'tenant-branding' (0033). */
export function publicLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BRANDING_BUCKET}/${logoPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function toBranding(row: { brand_color: string | null; logo_path: string | null }): TenantBranding {
  return {
    brandColor: normalizeHexColor(row.brand_color),
    logoPath: row.logo_path,
    logoUrl: publicLogoUrl(row.logo_path),
  };
}

/**
 * Branding de um tenant por id. Nunca lança: identidade visual é decoração —
 * se a leitura falhar, o app cai no padrão PSW em vez de derrubar a página.
 */
export async function fetchTenantBranding(tenantId: string): Promise<TenantBranding> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('brand_color, logo_path')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data) return EMPTY_BRANDING;
  return toBranding(data);
}
