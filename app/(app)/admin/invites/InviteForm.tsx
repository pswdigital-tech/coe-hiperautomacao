'use client';

import { useState, useTransition } from 'react';
import { createInvite } from './actions';
import { CARGOS, CARGO_LABEL } from '@/lib/security/cargo';

type TenantOption = { id: string; name: string };

type Role = 'member' | 'tenant_admin' | 'viewer' | 'psw_staff';

// Dica POR PAPEL. O texto era fixo e descrevia o Leitor mesmo com "Membro"
// selecionado — quem lia a tela via a descrição do papel errado.
const ROLE_HINT: Record<Role, string> = {
  member: 'Cria e edita oportunidades da empresa, mas não gerencia pessoas nem configurações.',
  tenant_admin: 'Além de criar e editar, gerencia pessoas, visibilidade e configurações da empresa.',
  viewer: 'Enxerga tudo da empresa, mas não cria, edita nem muda status de oportunidades.',
  psw_staff: 'Ganha acesso a demandas de qualquer empresa por atribuição, não por pertencer a ela.',
};

export function InviteForm({ tenants }: { tenants: TenantOption[] }) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    tenants.length > 0 ? 'existing' : 'new'
  );
  // psw_staff (Phase 17, D-02/D-08): a pessoa é lotada no tenant da PSW,
  // derivado no servidor — o seletor de empresa some para não sugerir que a
  // escolha do formulário importa.
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createInvite(formData);
      if ('error' in result) setError(result.error);
      else {
        setNotice(
          result.emailSent
            ? { kind: 'ok', text: 'Convite criado e e-mail enviado com o link de cadastro.' }
            : {
                kind: 'warn',
                text: 'Convite criado, mas o e-mail NÃO foi enviado. Use “Reenviar” na lista abaixo ou avise a pessoa manualmente.',
              }
        );
        // limpa o form em caso de sucesso
        const form = document.getElementById('invite-form') as HTMLFormElement | null;
        form?.reset();
        setRole('member');
        setMode(tenants.length > 0 ? 'existing' : 'new');
      }
    });
  }

  const inputCls =
    'w-full h-10 px-3 border border-bdr rounded-lg text-sm bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20';
  const labelCls = 'text-xs font-bold uppercase tracking-wide text-mut';
  // Faixa do rótulo com ALTURA FIXA. É o que mantém os quatro controles na
  // mesma linha de base mesmo com "Empresa" carregando os rádios no rótulo —
  // sem isso o select de Empresa desce e a linha fica torta.
  const labelRowCls = 'h-7 flex items-center justify-between gap-3';
  const hintCls = 'mt-1.5 text-xs leading-relaxed text-mut';

  return (
    <form
      id="invite-form"
      action={onSubmit}
      className="bg-wh rounded-xl border border-bdr p-5"
    >
      <h2 className="text-sm font-bold text-txt">Liberar novo e-mail</h2>

      {/* Os quatro campos numa linha só em tela larga — é o que "distribuir na
          página" quer dizer aqui. Empilham em 2 colunas no md e em 1 no mobile. */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4 items-start">
        <div>
          <div className={labelRowCls}>
            <label htmlFor="invite-email" className={labelCls}>
              E-mail autorizado
            </label>
          </div>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="pessoa@empresa.com.br"
            className={inputCls}
          />
        </div>

        {/* Empresa: existente ou nova — some quando o papel é Staff PSW (D-02/D-08),
            porque o tenant é derivado no servidor, nunca escolhido aqui. Os rádios
            vivem NO RÓTULO: é o que faz este campo ter a mesma altura dos outros
            três e a linha inteira ficar alinhada. */}
        {role !== 'psw_staff' ? (
          <div>
            <div className={labelRowCls}>
              <span className={labelCls}>Empresa</span>
              <span className="flex items-center gap-3 text-xs text-txt shrink-0">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="tenant_mode"
                    value="existing"
                    checked={mode === 'existing'}
                    onChange={() => setMode('existing')}
                    disabled={tenants.length === 0}
                  />
                  Existente
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="tenant_mode"
                    value="new"
                    checked={mode === 'new'}
                    onChange={() => setMode('new')}
                  />
                  Nova
                </label>
              </span>
            </div>

            {mode === 'existing' ? (
              <select name="tenant_id" required={mode === 'existing'} className={inputCls}>
                <option value="">Selecione…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="new_company"
                type="text"
                required={mode === 'new'}
                placeholder="Nome da nova empresa"
                className={inputCls}
              />
            )}
          </div>
        ) : (
          <div>
            <div className={labelRowCls}>
              <span className={labelCls}>Empresa</span>
            </div>
            <p className="text-xs leading-relaxed text-mut bg-bg border border-bdr rounded-lg px-3 py-2.5">
              Staff PSW é cadastrado no tenant da PSW, não no de uma empresa
              cliente — o acesso a demandas de qualquer empresa é dado depois,
              por atribuição, na tela da própria oportunidade.
            </p>
          </div>
        )}

        <div>
          <div className={labelRowCls}>
            <label htmlFor="invite-role" className={labelCls}>
              Papel
            </label>
          </div>
          <select
            id="invite-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputCls}
          >
            <option value="member">Membro</option>
            <option value="tenant_admin">Admin da empresa</option>
            <option value="viewer">Leitor (somente leitura)</option>
            <option value="psw_staff">Staff PSW</option>
          </select>
          <p className={hintCls}>{ROLE_HINT[role]}</p>
        </div>

        <div>
          <div className={labelRowCls}>
            <label htmlFor="invite-cargo" className={labelCls}>
              Cargo
            </label>
          </div>
          <select id="invite-cargo" name="cargo" defaultValue="" className={inputCls}>
            <option value="">Não informado</option>
            {CARGOS.map((c) => (
              <option key={c} value={c}>
                {CARGO_LABEL[c]}
              </option>
            ))}
          </select>
          <p className={hintCls}>Só descritivo — quem pode editar é definido pelo Papel.</p>
        </div>
      </div>

      {(notice || error) && (
        <div className="mt-4 flex flex-col gap-2">
          {notice && (
            <div
              role="status"
              className={
                notice.kind === 'ok'
                  ? 'text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                  : 'text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
              }
            >
              {notice.text}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
            >
              {error}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-5 bg-pri hover:bg-pril text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? 'Liberando...' : 'Liberar e-mail'}
        </button>
      </div>
    </form>
  );
}
