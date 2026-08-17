import { redirect } from 'next/navigation';
import { getCurrentProfile, writesCrossTenant } from '@/lib/security/role';
import { fetchStaffWritableTenants } from '@/lib/tenants/queries';
import { StaffRegisterForm } from './StaffRegisterForm';

export const metadata = {
  title: 'Registrar Nova Oportunidade',
};

// =============================================================================
// /opportunities/register — registro de oportunidade EM NOME de uma empresa
// cliente. Exclusiva de quem é da PSW: `platform_admin` (carteira inteira) e
// `psw_staff` (empresas administradas ∪ empresas onde tem atribuição).
//
// Papéis de cliente (`member`, `tenant_admin`, `viewer`) NÃO chegam aqui — e
// nem precisariam: `/opportunities/new` já registra no tenant deles, que é o
// único que lhes interessa. O redirect abaixo é UX; a autorização REAL é do
// banco (`create_staff_opportunity` valida o tenant-alvo contra
// `staff_writable_tenant_ids()`, migration 0051), então chamar a action por
// fora da tela não contorna nada.
// =============================================================================
export default async function RegisterOpportunityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // `writesCrossTenant()` = `platform_admin` ∪ `psw_staff` — o mesmo predicado
  // que manda esses papéis para cá em `/opportunities/new`. Fonte única de
  // propósito: as duas telas são o verso e o anverso da mesma decisão, e foi
  // exatamente a divergência desse predicado (o `platform_admin` de fora) que
  // produziu o bug de tenant de 2026-08-13.
  if (!writesCrossTenant(profile)) {
    redirect('/opportunities');
  }

  // MESMA fonte que autoriza a escrita — a UI não pode oferecer uma empresa
  // que o banco recusaria, nem esconder uma que ele aceitaria.
  const tenants = await fetchStaffWritableTenants();

  return (
    <div className="p-6 md:p-8">
      <header className="mb-7">
        <h1 className="text-2xl font-extrabold text-txt tracking-tight">
          Registrar nova oportunidade
        </h1>
        <p className="text-sm text-mut mt-1">
          Mesmo formulário que o cliente preenche — registrado por você, em nome
          da empresa escolhida.
        </p>
      </header>

      {tenants.length === 0 ? (
        // Staff sem nenhuma empresa alcançável: nem administra nenhuma, nem tem
        // oportunidade atribuída. Não é erro — é estado inicial de quem acabou
        // de entrar no time.
        <div className="max-w-lg rounded-xl border border-bdr bg-wh p-6">
          <h2 className="text-[15px] font-bold text-txt">
            Nenhuma empresa disponível
          </h2>
          <p className="text-sm text-mut mt-2 leading-relaxed">
            Você ainda não administra nenhuma empresa nem tem oportunidades
            atribuídas. Assim que receber a primeira atribuição — ou a concessão
            de admin de uma empresa — ela aparece aqui.
          </p>
        </div>
      ) : (
        <StaffRegisterForm tenants={tenants} />
      )}
    </div>
  );
}
