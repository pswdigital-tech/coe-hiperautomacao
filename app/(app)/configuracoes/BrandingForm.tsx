'use client';

import { useState, useTransition } from 'react';
import { updateBrandColor, updateTenantLogo, removeTenantLogo } from './actions';
import {
  DEFAULT_BRAND_COLOR,
  brandTokens,
  isValidHexColor,
  readableOn,
} from '@/lib/branding/theme';

// =============================================================================
// BrandingForm — cor principal + logo, com preview antes de salvar
// -----------------------------------------------------------------------------
// O preview usa `brandTokens()`, a MESMA derivação que o layout injeta no
// <style> — então o que se vê aqui é exatamente o que o app vai ficar, nos dois
// temas. Nada de reimplementar a paleta em CSS de preview.
// =============================================================================

const SUGGESTIONS = [
  DEFAULT_BRAND_COLOR, // PSW
  '#0f766e',
  '#047857',
  '#b45309',
  '#be123c',
  '#7c3aed',
  '#0891b2',
  '#334155',
];

export function BrandingForm({
  brandColor,
  logoUrl,
  tenantName,
}: {
  brandColor: string | null;
  logoUrl: string | null;
  tenantName: string | null;
}) {
  const [color, setColor] = useState(brandColor ?? DEFAULT_BRAND_COLOR);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = isValidHexColor(color);
  const light = valid ? brandTokens(color, 'light') : null;
  const dark = valid ? brandTokens(color, 'dark') : null;

  function run(fn: () => Promise<{ error: string } | { ok: true }>, okMsg: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if ('error' in result) setFeedback({ kind: 'err', msg: result.error });
      else setFeedback({ kind: 'ok', msg: okMsg });
    });
  }

  const cardCls = 'bg-wh rounded-xl border border-bdr p-5 flex flex-col gap-4';
  const labelCls = 'text-xs font-bold uppercase tracking-wide text-mut';
  const btnCls =
    'px-4 py-2 rounded-lg bg-pril text-white text-xs font-bold hover:opacity-90 disabled:opacity-50';

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <p
          className={`text-xs font-semibold ${
            feedback.kind === 'ok' ? 'text-grn' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {feedback.msg}
        </p>
      )}

      {/* Cor principal ------------------------------------------------------ */}
      <form
        className={cardCls}
        action={(fd) => run(() => updateBrandColor(fd), 'Cor principal atualizada.')}
      >
        <div>
          <h2 className="text-sm font-bold text-txt">Cor principal</h2>
          <p className="text-xs text-mut mt-0.5">
            Uma cor só. O sistema deriva dela os tons do menu, dos botões e dos
            destaques — e ajusta o brilho automaticamente no modo escuro.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="brand-color-picker" className={labelCls}>
              Escolher
            </label>
            <input
              id="brand-color-picker"
              type="color"
              value={valid ? color : DEFAULT_BRAND_COLOR}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 block w-14 h-10 rounded-lg border border-bdr bg-wh cursor-pointer"
            />
          </div>
          <div>
            <label htmlFor="brand_color" className={labelCls}>
              Hex
            </label>
            <input
              id="brand_color"
              name="brand_color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              spellCheck={false}
              className="mt-1 w-32 px-3 py-2 border border-bdr rounded-lg text-sm font-mono bg-wh focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/20"
            />
          </div>
          <button type="submit" disabled={pending || !valid} className={btnCls}>
            {pending ? 'Salvando…' : 'Salvar cor'}
          </button>
          {color.toLowerCase() !== DEFAULT_BRAND_COLOR && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setColor(DEFAULT_BRAND_COLOR)}
              className="px-3 py-2 text-xs font-semibold text-mut hover:text-txt"
            >
              Voltar ao padrão
            </button>
          )}
        </div>

        {!valid && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            Use o formato #RRGGBB.
          </p>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {SUGGESTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              aria-label={`Usar ${c}`}
              className={`w-7 h-7 rounded-full border-2 ${
                color.toLowerCase() === c ? 'border-txt' : 'border-transparent'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>

        {light && dark && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Preview label="Modo claro" tokens={light} surface="#f8fafc" card="#ffffff" text="#0f172a" />
            <Preview label="Modo escuro" tokens={dark} surface="#0b1220" card="#1e293b" text="#f1f5f9" />
          </div>
        )}
      </form>

      {/* Logo -------------------------------------------------------------- */}
      <form
        className={cardCls}
        action={(fd) => run(() => updateTenantLogo(fd), 'Logo atualizada.')}
      >
        <div>
          <h2 className="text-sm font-bold text-txt">Logo</h2>
          <p className="text-xs text-mut mt-0.5">
            Aparece no menu lateral{tenantName ? `, junto ao nome ${tenantName}` : ''}.
            PNG, JPG, WEBP ou SVG, até 512 KB. Prefira imagem quadrada com fundo
            transparente.
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-xl bg-white border border-bdr flex items-center justify-center overflow-hidden shrink-0">
            {/* <img> em vez de next/image: a URL vem do Storage do tenant, host
                dinâmico — não vale configurar remotePatterns pra uma logo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl ?? '/brand/psw-icone.png'}
              alt="Logo atual"
              className="max-w-[80%] max-h-[80%] object-contain"
            />
          </div>
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            required
            className="text-xs text-mut file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-pri/5 file:text-pri file:text-xs file:font-bold"
          />
          <button type="submit" disabled={pending} className={btnCls}>
            {pending ? 'Enviando…' : 'Enviar logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(removeTenantLogo, 'Logo removida.')}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              Remover
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Miniatura do shell com os tokens derivados aplicados via `style` inline —
 * inclusive as superfícies do tema oposto, pra dar pra conferir os dois modos
 * sem trocar o tema do app.
 */
function Preview({
  label,
  tokens,
  surface,
  card,
  text,
}: {
  label: string;
  tokens: Record<string, string>;
  surface: string;
  card: string;
  text: string;
}) {
  const nav = tokens['--color-nav'];
  const nav2 = tokens['--color-nav-2'];
  const active = tokens['--color-nav-active'];
  const action = tokens['--color-pril'];

  return (
    <div className="rounded-lg border border-bdr overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-mut bg-bg">
        {label}
      </div>
      <div className="flex h-28" style={{ background: surface }}>
        <div
          className="w-16 p-2 flex flex-col gap-1.5"
          style={{ background: `linear-gradient(${nav2}, ${nav})` }}
        >
          <div className="h-4 rounded" style={{ background: active }} />
          <div className="h-4 rounded bg-white/10" />
          <div className="h-4 rounded bg-white/10" />
        </div>
        <div className="flex-1 p-3 flex flex-col gap-2">
          <div
            className="rounded-md p-2 flex items-center justify-between"
            style={{ background: card }}
          >
            <span className="text-[10px] font-bold" style={{ color: text }}>
              Oportunidade
            </span>
            <span
              className="text-[9px] font-bold px-2 py-1 rounded"
              style={{ background: action, color: readableOn(action) }}
            >
              Nova
            </span>
          </div>
          <div className="text-[10px] font-semibold" style={{ color: tokens['--color-pri'] }}>
            link de exemplo
          </div>
        </div>
      </div>
    </div>
  );
}
