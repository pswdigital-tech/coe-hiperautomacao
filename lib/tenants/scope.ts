import { cookies } from 'next/headers';

/**
 * Empresa selecionada no seletor da barra lateral (platform_admin / psw_staff).
 *
 * A URL (`?empresa=<slug>`) continua sendo a fonte primária — é o que torna o
 * recorte compartilhável e o que os links internos carregam. O problema é que
 * qualquer navegação que NÃO recarrega a query (redirect após mutação, link
 * "limpo" do menu, refresh de rota) perdia o recorte e jogava o admin de volta
 * em "Todas as empresas". O cookie é a memória dessa escolha: só entra em cena
 * quando a URL não diz nada.
 *
 * Escolher "Todas as empresas" APAGA o cookie — sem isso não haveria como
 * voltar ao consolidado.
 */
export const EMPRESA_COOKIE = 'coe_empresa';

/** Resolve o slug de empresa: `?empresa=` na URL, senão o cookie. */
export async function resolveEmpresaSlug(
  sp: URLSearchParams,
): Promise<string | undefined> {
  const fromUrl = sp.get('empresa')?.trim();
  if (fromUrl) return fromUrl;
  const store = await cookies();
  return store.get(EMPRESA_COOKIE)?.value?.trim() || undefined;
}
