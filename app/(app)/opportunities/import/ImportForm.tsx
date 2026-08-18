'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { TenantSummary } from '@/lib/tenants/queries';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import { assigneeName } from '@/lib/opportunities/assignee-types';
import {
  importOpportunitiesFromCsv,
  listImportAssignees,
  type ImportResult,
} from '@/lib/opportunities/import-actions';
import {
  parseImportCsv,
  importTemplateCsv,
  IMPORT_COLUMNS,
  REQUIRED_COLUMNS,
  MAX_IMPORT_ROWS,
} from '@/lib/opportunities/import-csv';

// =============================================================================
// Formulário da importação em massa. A PRÉ-VISUALIZAÇÃO é local: o mesmo parser
// puro que o servidor usa (`parseImportCsv`) roda aqui a cada tecla, sem
// round-trip — a pessoa corrige a planilha vendo o erro na hora. O que vai para
// a Server Action é o TEXTO CRU, nunca as linhas já parseadas: assim existe um
// único caminho de validação, e ele é o do servidor (ver import-actions.ts).
// =============================================================================

type Props = { tenants: TenantSummary[] };

export function ImportForm({ tenants }: Props) {
  const [tenantId, setTenantId] = useState<string>(
    tenants.length === 1 ? tenants[0].id : ''
  );
  const [pessoas, setPessoas] = useState<AssignableProfile[]>([]);
  const [carregandoPessoas, setCarregandoPessoas] = useState(false);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [csvText, setCsvText] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Pessoas da empresa escolhida. Trocar de empresa zera a seleção — manter
  // alguém de outra empresa marcado só produziria um erro no submit.
  useEffect(() => {
    if (!tenantId) {
      setPessoas([]);
      setResponsaveis([]);
      return;
    }
    let ativo = true;
    setCarregandoPessoas(true);
    setResponsaveis([]);
    listImportAssignees(tenantId)
      .then((lista) => {
        if (ativo) setPessoas(lista);
      })
      .finally(() => {
        if (ativo) setCarregandoPessoas(false);
      });
    return () => {
      ativo = false;
    };
  }, [tenantId]);

  const preview = useMemo(
    () => (csvText.trim() === '' ? null : parseImportCsv(csvText)),
    [csvText]
  );

  const bloqueiam = useMemo(
    () =>
      (preview?.issues ?? []).filter(
        (i) =>
          !i.message.startsWith('repete o processo da linha') &&
          !i.message.startsWith('coluna repetida')
      ),
    [preview]
  );

  const podeImportar =
    Boolean(tenantId) &&
    Boolean(preview) &&
    preview!.rows.length > 0 &&
    bloqueiam.length === 0 &&
    !pending;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setResultado(null);
    setCsvText(await file.text());
  }

  function baixarModelo() {
    const blob = new Blob([importTemplateCsv()], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-importacao-oportunidades.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importar() {
    if (!podeImportar) return;
    setResultado(null);
    startTransition(async () => {
      const r = await importOpportunitiesFromCsv({
        tenantId,
        assigneeIds: responsaveis,
        csvText,
      });
      setResultado(r);
      if (r.ok) {
        setCsvText('');
        setNomeArquivo(null);
        if (fileRef.current) fileRef.current.value = '';
      }
    });
  }

  const empresa = tenants.find((t) => t.id === tenantId) ?? null;

  // ── sucesso: a tela vira o recibo da operação ────────────────────────────
  if (resultado?.ok) {
    return (
      <div className="max-w-3xl rounded-xl border border-bdr bg-wh p-6">
        <h2 className="text-[17px] font-extrabold text-txt">
          {resultado.inseridas} oportunidade{resultado.inseridas === 1 ? '' : 's'}{' '}
          importada{resultado.inseridas === 1 ? '' : 's'}
          {empresa ? ` em ${empresa.name}` : ''}
        </h2>
        <p className="text-sm text-mut mt-2">
          {resultado.atribuicoes > 0
            ? `${resultado.atribuicoes} atribuição(ões) de responsável criada(s).`
            : 'Nenhum responsável foi atribuído.'}
        </p>

        {resultado.puladas.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[13px] font-bold text-txt">
              {resultado.puladas.length} linha(s) pulada(s) — já existiam na empresa
            </h3>
            <ul className="mt-2 text-[13px] text-mut space-y-1">
              {resultado.puladas.map((p) => (
                <li key={`${p.linha}-${p.processo}`}>
                  Linha {p.linha}: “{p.processo}”
                  {p.seqId ? ` já está lá como CHM-${String(p.seqId).padStart(4, '0')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-7 flex gap-3">
          <Link
            href="/opportunities"
            className="px-5 py-2.5 bg-pri hover:bg-pril text-white text-sm font-bold rounded-lg"
          >
            Ver oportunidades
          </Link>
          <button
            type="button"
            onClick={() => setResultado(null)}
            className="px-5 py-2.5 border border-bdr text-txt text-sm font-bold rounded-lg hover:bg-bg"
          >
            Importar outro arquivo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* 1 — empresa ------------------------------------------------------- */}
      <section className="rounded-xl border border-bdr bg-wh p-5">
        <h2 className="text-[15px] font-bold text-txt">1. Empresa</h2>
        <p className="text-[13px] text-mut mt-1">
          As oportunidades entram no pipeline dessa empresa.
        </p>
        <select
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setResultado(null);
          }}
          className="mt-3 w-full max-w-md rounded-lg border border-bdr bg-wh px-3 py-2 text-sm text-txt"
        >
          <option value="">Escolha a empresa…</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>

      {/* 2 — responsáveis --------------------------------------------------- */}
      <section className="rounded-xl border border-bdr bg-wh p-5">
        <h2 className="text-[15px] font-bold text-txt">2. Responsáveis</h2>
        <p className="text-[13px] text-mut mt-1">
          Quem for marcado aqui fica atribuído a <strong>todas</strong> as
          oportunidades deste arquivo. Pode ficar sem ninguém.
        </p>

        {!tenantId ? (
          <p className="text-[13px] text-mut mt-3">Escolha a empresa primeiro.</p>
        ) : carregandoPessoas ? (
          <p className="text-[13px] text-mut mt-3">Carregando pessoas…</p>
        ) : pessoas.length === 0 ? (
          <p className="text-[13px] text-mut mt-3">
            Nenhuma pessoa disponível nesta empresa.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pessoas.map((p) => {
              const marcado = responsaveis.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={
                    'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ' +
                    (marcado
                      ? 'border-pri bg-pri/5'
                      : 'border-bdr hover:bg-bg')
                  }
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setResponsaveis((atual) =>
                        atual.includes(p.id)
                          ? atual.filter((id) => id !== p.id)
                          : [...atual, p.id]
                      )
                    }
                    className="accent-pri"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-txt truncate">
                      {assigneeName(p)}
                    </span>
                    <span className="block text-[11px] text-mut truncate">
                      {p.email}
                      {p.role === 'psw_staff' ? ' · staff PSW' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* 3 — arquivo -------------------------------------------------------- */}
      <section className="rounded-xl border border-bdr bg-wh p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-bold text-txt">3. Planilha</h2>
            <p className="text-[13px] text-mut mt-1">
              Suba um arquivo <code>.csv</code> ou cole o conteúdo. Separador{' '}
              <code>;</code> ou <code>,</code> — detectado automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={baixarModelo}
            className="shrink-0 px-4 py-2 border border-bdr text-txt text-[13px] font-bold rounded-lg hover:bg-bg"
          >
            Baixar modelo
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="mt-4 block w-full text-[13px] text-mut file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-bdr file:bg-bg file:text-txt file:text-[13px] file:font-bold"
        />
        {nomeArquivo && (
          <p className="mt-2 text-[12px] text-mut">Arquivo: {nomeArquivo}</p>
        )}

        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setNomeArquivo(null);
            setResultado(null);
          }}
          rows={8}
          spellCheck={false}
          placeholder={`solicitante;email;area;subarea;processo;…`}
          className="mt-3 w-full rounded-lg border border-bdr bg-wh px-3 py-2 text-[12px] font-mono text-txt"
        />

        <details className="mt-3">
          <summary className="text-[12px] text-mut cursor-pointer">
            Colunas aceitas ({IMPORT_COLUMNS.length}) — obrigatórias:{' '}
            {REQUIRED_COLUMNS.join(', ')}
          </summary>
          <p className="mt-2 text-[12px] text-mut leading-relaxed font-mono break-words">
            {IMPORT_COLUMNS.join(' · ')}
          </p>
          <p className="mt-2 text-[12px] text-mut">
            Listas (ferramenta, escopo_automacao, benefícios esperados,
            tipo_processo, linguagem) usam <code>|</code> como separador. Datas
            aceitam <code>dd/mm/aaaa</code> ou ISO. Coluna desconhecida é
            ignorada, não é erro. Máximo de {MAX_IMPORT_ROWS} linhas por arquivo.
          </p>
        </details>
      </section>

      {/* 4 — pré-visualização ---------------------------------------------- */}
      {preview && (
        <section className="rounded-xl border border-bdr bg-wh p-5">
          <h2 className="text-[15px] font-bold text-txt">4. Conferência</h2>
          <p className="text-[13px] text-mut mt-1">
            {preview.rows.length} de {preview.totalRows} linha(s) prontas para
            importar · separador detectado “{preview.delimiter === '\t' ? 'tab' : preview.delimiter}”
          </p>

          {preview.unknownColumns.length > 0 && (
            <p className="mt-3 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800">
              Colunas ignoradas (não são do sistema):{' '}
              {preview.unknownColumns.join(', ')}
            </p>
          )}

          {preview.issues.length > 0 && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-bdr">
              <table className="w-full text-[12px]">
                <thead className="bg-bg sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-txt w-20">Linha</th>
                    <th className="text-left px-3 py-2 font-bold text-txt w-56">Coluna</th>
                    <th className="text-left px-3 py-2 font-bold text-txt">Problema</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.issues.map((i, idx) => (
                    <tr key={idx} className="border-t border-bdr">
                      <td className="px-3 py-1.5 text-mut">{i.line || '—'}</td>
                      <td className="px-3 py-1.5 text-mut font-mono">{i.column ?? '—'}</td>
                      <td className="px-3 py-1.5 text-txt">{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-bdr">
              <table className="w-full text-[12px]">
                <thead className="bg-bg">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-txt">Linha</th>
                    <th className="text-left px-3 py-2 font-bold text-txt">Processo</th>
                    <th className="text-left px-3 py-2 font-bold text-txt">Área</th>
                    <th className="text-left px-3 py-2 font-bold text-txt">Status</th>
                    <th className="text-left px-3 py-2 font-bold text-txt">Ferramentas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r) => (
                    <tr key={r.line} className="border-t border-bdr">
                      <td className="px-3 py-1.5 text-mut">{r.line}</td>
                      <td className="px-3 py-1.5 text-txt">{r.payload.processo}</td>
                      <td className="px-3 py-1.5 text-mut">{r.payload.area}</td>
                      <td className="px-3 py-1.5 text-mut">{r.payload.status}</td>
                      <td className="px-3 py-1.5 text-mut">
                        {r.payload.ferramentas.join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 10 && (
                <p className="px-3 py-2 text-[12px] text-mut border-t border-bdr">
                  … e mais {preview.rows.length - 10} linha(s).
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* erro do servidor --------------------------------------------------- */}
      {resultado && !resultado.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800">
          {resultado.error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={importar}
          disabled={!podeImportar}
          className="px-6 py-2.5 bg-pri hover:bg-pril disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg"
        >
          {pending
            ? 'Importando…'
            : `Importar ${preview?.rows.length ?? 0} oportunidade(s)`}
        </button>
        {!tenantId && (
          <span className="text-[13px] text-mut">Escolha a empresa para continuar.</span>
        )}
        {tenantId && bloqueiam.length > 0 && (
          <span className="text-[13px] text-mut">
            Corrija {bloqueiam.length} problema(s) antes de importar.
          </span>
        )}
      </div>
    </div>
  );
}
