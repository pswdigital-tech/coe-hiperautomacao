import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/security/role';
import { fetchImportableTenants } from '@/lib/tenants/queries';
import { ImportForm } from './ImportForm';

export const metadata = {
  title: 'Importar Oportunidades',
};

// =============================================================================
// /opportunities/import — importação em massa a partir de uma planilha CSV
// (migration 0059).
//
// QUEM CHEGA AQUI: `platform_admin` (carteira inteira), `tenant_admin` (a
// própria empresa) e `psw_staff` COM concessão de admin (`psw_tenant_admins`,
// 0045). `member`/`viewer` não — e o gate não é um teste de papel escrito aqui:
// é a lista devolvida por `import_writable_tenant_ids()`, a MESMA função que a
// RPC consulta para autorizar a escrita. Lista vazia ⇒ a pessoa não pode
// importar em lugar nenhum ⇒ redirect. Assim UI e banco não têm como divergir.
//
// O redirect é UX; a autorização REAL é do banco (a RPC revalida o tenant-alvo),
// então chamar a Server Action por fora da tela não contorna nada.
// =============================================================================
export default async function ImportOpportunitiesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const tenants = await fetchImportableTenants();
  if (tenants.length === 0) redirect('/opportunities');

  return (
    <div className="p-6 md:p-8">
      <header className="mb-7">
        <h1 className="text-2xl font-extrabold text-txt tracking-tight">
          Importar oportunidades
        </h1>
        <p className="text-sm text-mut mt-1">
          Suba de uma vez o levantamento que já está em planilha — escolha a
          empresa, quem fica responsável e confira antes de gravar.
        </p>
      </header>

      <ImportForm tenants={tenants} />
    </div>
  );
}
