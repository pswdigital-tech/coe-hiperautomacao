import { notFound } from 'next/navigation';
import {
  fetchPublicOpportunities,
  fetchPublicTenantBySlug,
} from '@/lib/tenants/queries';
import { fetchPublicEvent } from '@/lib/events/queries';
import { brandingCss } from '@/lib/branding/theme';
import { PublicForm } from '../PublicForm';

export const metadata = {
  title: 'Registrar Solicitação',
};

// =============================================================================
// /r/<empresa>/<evento> — formulário público POR EVENTO (0066)
// -----------------------------------------------------------------------------
// Mesmo formulário de `/r/<empresa>` (a rota-mãe), com uma diferença: a
// oportunidade nasce vinculada ao evento do slug. Empresa e evento são
// resolvidos por RPCs anônimas (`fetch_public_tenant`, `fetch_public_event`);
// o evento padrão nunca sai por aqui (não tem link público). O slug vai junto
// ao submit e a RPC `create_public_opportunity` REVALIDA — esta página é só a
// experiência, não a autorização.
//
// Evento encerrado NÃO é 404: quem abriu o link antigo precisa saber que o
// levantamento acabou, não que digitou errado.
// =============================================================================
export default async function PublicEventFormPage({
  params,
}: {
  params: Promise<{ slug: string; evento: string }>;
}) {
  const { slug, evento } = await params;
  const tenant = await fetchPublicTenantBySlug(slug);
  if (!tenant) notFound();

  const event = await fetchPublicEvent(slug, evento);
  if (!event) notFound();

  const themeCss = brandingCss(tenant.brandColor);

  if (event.status !== 'active') {
    return (
      <>
        {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
        <main className="min-h-screen bg-bg flex items-center justify-center p-8">
          <div className="bg-wh border border-bdr rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
            <div className="text-5xl mb-3">📅</div>
            <h1 className="text-lg font-bold text-txt mb-2">Levantamento encerrado</h1>
            <p className="text-sm text-mut leading-relaxed">
              O evento <strong>{event.name}</strong> da{' '}
              <strong>{tenant.name}</strong> não recebe mais solicitações por
              este link. Se você ainda precisa registrar uma demanda, fale com o
              time do CoE de Hiperautomação.
            </p>
          </div>
        </main>
      </>
    );
  }

  const projects = await fetchPublicOpportunities(slug);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? '';
  const enableTurnstile = !!siteKey && !!turnstileSecret;
  if (!enableTurnstile) {
    console.warn('Turnstile desabilitado — siteKey ou TURNSTILE_SECRET_KEY ausente.');
  }

  return (
    <>
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <PublicForm
        tenant={tenant}
        siteKey={enableTurnstile ? siteKey : ''}
        projects={projects}
        event={event}
      />
    </>
  );
}
