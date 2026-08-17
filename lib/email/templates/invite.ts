import 'server-only';

/**
 * Template do e-mail de convite. HTML inline com tabelas — clientes de e-mail
 * (Outlook em especial) não suportam flexbox/grid nem <style> externo, então
 * nada de Tailwind aqui. Sempre acompanhado de uma versão texto puro.
 */

const BRAND = '#183799'; // --color-pri

const ROLE_LABEL: Record<string, string> = {
  member: 'Membro',
  tenant_admin: 'Admin da empresa',
  viewer: 'Leitor (somente leitura)',
};

export type InviteEmailParams = {
  email: string;
  companyName: string;
  role: string;
  signupUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inviteEmailSubject(companyName: string): string {
  return `Seu acesso ao CoE Hiperautomação — ${companyName}`;
}

export function inviteEmailText(p: InviteEmailParams): string {
  return [
    `Você foi liberado para criar sua conta no CoE Hiperautomação.`,
    ``,
    `Empresa: ${p.companyName}`,
    `Perfil de acesso: ${ROLE_LABEL[p.role] ?? p.role}`,
    `E-mail autorizado: ${p.email}`,
    ``,
    `Crie sua conta neste link:`,
    p.signupUrl,
    ``,
    `Use exatamente o e-mail acima — o cadastro só é aceito para e-mails liberados.`,
    ``,
    `CoE Hiperautomação · PSW Digital`,
  ].join('\n');
}

export function inviteEmailHtml(p: InviteEmailParams): string {
  const company = escapeHtml(p.companyName);
  const email = escapeHtml(p.email);
  const role = escapeHtml(ROLE_LABEL[p.role] ?? p.role);
  const url = escapeHtml(p.signupUrl);

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.12);">
          <tr>
            <td style="background:${BRAND};padding:24px;color:#ffffff;">
              <div style="font-size:17px;font-weight:700;">CoE Hiperautomação</div>
              <div style="font-size:12px;opacity:0.8;margin-top:2px;">Gestão de Automações · PSW Digital</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px 24px;color:#0f172a;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">
                Você foi liberado para criar sua conta no <strong>CoE Hiperautomação</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 22px 0;">
                <tr><td style="padding:12px 14px;font-size:13px;color:#475569;">Empresa</td><td style="padding:12px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${company}</td></tr>
                <tr><td style="padding:0 14px 12px 14px;font-size:13px;color:#475569;">Perfil de acesso</td><td style="padding:0 14px 12px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${role}</td></tr>
                <tr><td style="padding:0 14px 12px 14px;font-size:13px;color:#475569;">E-mail autorizado</td><td style="padding:0 14px 12px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${email}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 24px 24px;">
              <a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:10px;">
                Criar minha conta
              </a>
              <p style="margin:16px 0 0 0;font-size:11px;color:#64748b;line-height:1.5;">
                Se o botão não funcionar, copie e cole este endereço no navegador:<br>
                <span style="color:${BRAND};word-break:break-all;">${url}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
                Use exatamente o e-mail acima — o cadastro só é aceito para e-mails liberados pelo administrador.
                Se você não esperava este convite, pode ignorar esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
