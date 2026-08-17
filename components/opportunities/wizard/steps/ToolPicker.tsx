'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  listAutomationTools,
  createAutomationTool,
} from '@/lib/opportunities/tools-actions';
import {
  toolIcon,
  toolLabel,
  normalizeToolSlugs,
  slugifyTool,
  MAX_TOOL_NAME_LENGTH,
  MAX_TOOLS_PER_OPPORTUNITY,
  type AutomationToolOption,
} from '@/lib/opportunities/tools';

type Props = {
  /** Slugs selecionados (`opportunities.ferramentas`). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Oportunidade em edição — usada para registrar a ferramenta no tenant DELA
   *  quando quem edita é da PSW (ver `createAutomationTool`). */
  opportunityId?: string;
};

/**
 * Seletor multi-ferramenta do catálogo `automation_tools` (0055).
 *
 * O catálogo é carregado por Server Action em vez de descer como prop: este
 * step só existe no modo edição, e puxá-lo aqui evita atravessar `WizardShell`
 * — que também serve o formulário público (anônimo) e a tela de registro do
 * staff, onde este componente nunca aparece.
 *
 * Um slug já gravado que não esteja no catálogo (ferramenta desativada, ou de
 * um tenant que este usuário não enxerga) NÃO é descartado: entra na lista como
 * opção extra, marcada. Sumir com o dado gravado no meio de uma edição seria
 * apagá-lo silenciosamente no próximo save.
 */
export function ToolPicker({ value, onChange, opportunityId }: Props) {
  const [catalog, setCatalog] = useState<AutomationToolOption[] | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    listAutomationTools().then((tools) => {
      if (alive) setCatalog(tools);
    });
    return () => {
      alive = false;
    };
  }, []);

  const selected = value ?? [];
  const known = new Set((catalog ?? []).map((t) => t.slug));
  const orphans: AutomationToolOption[] = selected
    .filter((s) => catalog !== null && !known.has(s))
    .map((s) => ({
      id: `orphan:${s}`,
      slug: s,
      nome: toolLabel(s),
      icone: null,
      global: false,
    }));
  const options = [...(catalog ?? []), ...orphans];

  function toggle(slug: string) {
    setErro(null);
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
      return;
    }
    if (selected.length >= MAX_TOOLS_PER_OPPORTUNITY) {
      setErro(`Máximo de ${MAX_TOOLS_PER_OPPORTUNITY} ferramentas por oportunidade.`);
      return;
    }
    onChange(normalizeToolSlugs([...selected, slug]));
  }

  function registrar() {
    const nome = novoNome.trim();
    setErro(null);
    if (nome.length < 2) {
      setErro('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    if (!slugifyTool(nome)) {
      setErro('Use letras ou números no nome da ferramenta.');
      return;
    }
    startTransition(async () => {
      const res = await createAutomationTool(nome, opportunityId);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setCatalog((prev) => {
        const base = prev ?? [];
        return base.some((t) => t.slug === res.tool.slug)
          ? base
          : [...base, res.tool];
      });
      // Registrar já marca — foi o motivo de registrar.
      if (!selected.includes(res.tool.slug)) {
        onChange(normalizeToolSlugs([...selected, res.tool.slug]));
      }
      setNovoNome('');
      setRegistrando(false);
      if (res.alreadyExisted) {
        setErro(`"${res.tool.nome}" já estava no catálogo — foi marcada.`);
      }
    });
  }

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
        Ferramentas Sugeridas
        <span className="ml-1.5 font-normal normal-case tracking-normal">
          (pode marcar mais de uma)
        </span>
      </div>

      {catalog === null ? (
        <div className="text-[12px] text-mut py-3">Carregando ferramentas…</div>
      ) : options.length === 0 ? (
        <div className="text-[12px] text-mut py-3">
          Nenhuma ferramenta cadastrada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options.map((t) => {
            const active = selected.includes(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggle(t.slug)}
                className={
                  'p-2.5 text-left rounded-lg border-2 transition-all flex items-center gap-2 ' +
                  (active
                    ? 'border-pri bg-pri/5'
                    : 'border-bdr bg-wh hover:border-pril')
                }
              >
                <span
                  aria-hidden
                  className={
                    'flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] leading-none ' +
                    (active
                      ? 'bg-pri border-pri text-white'
                      : 'border-bdr bg-bg text-transparent')
                  }
                >
                  ✓
                </span>
                <span className="text-[13px] font-bold truncate">
                  {toolIcon(t.slug, catalog)} {t.nome}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {erro && (
        <div className="mt-2 text-[11px] text-red-700 dark:text-red-400">{erro}</div>
      )}

      <div className="mt-2.5">
        {registrando ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  registrar();
                }
                if (e.key === 'Escape') {
                  setRegistrando(false);
                  setNovoNome('');
                  setErro(null);
                }
              }}
              maxLength={MAX_TOOL_NAME_LENGTH}
              placeholder="Nome da ferramenta (ex: Power Automate)"
              aria-label="Nome da nova ferramenta"
              className="flex-1 min-w-[200px] px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-bg focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15"
            />
            <button
              type="button"
              onClick={registrar}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-pri text-white disabled:opacity-50"
            >
              {pending ? 'Salvando…' : 'Registrar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRegistrando(false);
                setNovoNome('');
                setErro(null);
              }}
              className="px-2 py-1.5 rounded-lg text-[12px] text-mut hover:text-fg"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRegistrando(true);
              setErro(null);
            }}
            className="text-[12px] font-bold text-pri hover:underline"
          >
            + Registrar nova ferramenta
          </button>
        )}
        <p className="mt-1 text-[10px] text-mut leading-snug">
          A ferramenta registrada fica disponível para todas as oportunidades
          desta empresa.
        </p>
      </div>
    </div>
  );
}
