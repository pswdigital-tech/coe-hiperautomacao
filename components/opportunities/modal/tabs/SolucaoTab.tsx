import type { Opportunity } from '@/lib/opportunities/types';
import { ToolBadges } from '@/components/opportunities/cells';
import {
  scoredBenefits,
  benefitsAverage,
  benefitColor,
} from '@/lib/opportunities/benefit-labels';

// =============================================================================
// SolucaoTab — "o que será construído". Substitui a aba "Automação", cujo nome
// não distinguia nada numa plataforma em que tudo é automação.
//
// LAYOUT — por que CARTÕES e não uma pilha de seções:
// esta seção reúne conteúdos de naturezas muito diferentes (um parágrafo,
// selos, duas listas contrapostas, uma checklist e um painel de métricas).
// Numa pilha de títulos sublinhados, todos com o mesmo peso, o olho não acha
// as fronteiras — foi o que aconteceu quando o bloco de benefícios entrou.
// Cada bloco ganha o próprio contêiner, e por isso a seção é montada FORA da
// casca branca padrão das abas de ficha (ver OpportunityDetail): cartão dentro
// de cartão seria a mesma confusão com uma borda a mais.
//
// SEM SUB-NAVEGAÇÃO, de propósito: isto se lê de cima a baixo uma vez, não se
// consulta repetidamente. Sub-abas otimizam para voltar a um ponto conhecido —
// e escondem escopo de benefício, que é justamente o par que o leitor precisa
// ver junto para julgar a proposta.
//
// BENEFÍCIOS moram aqui (PO, 2026-08-19), não em "Processo Atual": benefício é
// propriedade do que a solução ENTREGA — "redução de tempo" é o depois, não o
// antes. O antigo `BeneficiosTab` foi absorvido; o bloco "Top 3" dele saiu
// porque a lista aqui é ordenada pela nota, e as três primeiras linhas JÁ são
// o top 3 (mostrar as duas coisas era dizer o mesmo duas vezes na mesma tela).
//
// CAMPOS SEM TELA (PO, 2026-08-19): `azure_boards_codigo`, `linguagem`,
// `execucao`, `usuarios_servico` e `data_conclusao` não aparecem em lugar
// nenhum da interface. As colunas seguem no banco, com conteúdo, e continuam
// no CSV. Não recriar um bloco para elas sem decidir antes onde moram.
// =============================================================================

type Props = { opportunity: Opportunity };

export function SolucaoTab({ opportunity: o }: Props) {
  const escopo = (o.escopo_automacao ?? []).filter((s) => s.trim() !== '');
  const fora = (o.fora_escopo ?? []).filter((s) => s.trim() !== '');
  const aceite = (o.criterios_aceite ?? []).filter((s) => s.trim() !== '');
  const objetivo = (o.objetivo_projeto ?? '').trim();
  const descritos = (o.beneficios_esperados ?? []).filter((s) => s.trim() !== '');
  const qualitativo = (o.beneficio_qualitativo ?? '').trim();
  const pontuados = scoredBenefits(o.beneficios);
  const media = benefitsAverage(o.beneficios);

  return (
    <div className="flex flex-col gap-4">
      {/* ── O que é ────────────────────────────────────────────────────── */}
      {/* Objetivo em largura TOTAL, com as ferramentas como faixa de selos no
          rodapé do mesmo cartão. Ferramenta é ATRIBUTO da solução — um ou dois
          selos curtos —, não um bloco de peso igual ao do objetivo: numa coluna
          própria ao lado de três parágrafos, o cartão virava uma caixa quase
          vazia. Mesmo padrão dos selos de complexidade/esforço sob o objetivo
          na Visão Geral. */}
      <Card title="Objetivo do projeto">
        {objetivo !== '' ? (
          <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap">
            {objetivo}
          </p>
        ) : (
          <Empty>
            Nenhum objetivo descrito. Use “Editar” para escrever — o mesmo texto
            aparece na Visão Geral.
          </Empty>
        )}

        <div className="mt-3 pt-3 border-t border-bdr flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
            Ferramentas
          </span>
          {(o.ferramentas ?? []).length > 0 ? (
            <ToolBadges tools={o.ferramentas} />
          ) : (
            <span className="text-[11px] text-mut italic">
              nenhuma definida ainda
            </span>
          )}
        </div>
      </Card>

      {/* ── Fronteiras: o par que evita conflito com o cliente ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card title="Está no escopo" count={escopo.length}>
          {escopo.length > 0 ? (
            <ul className="flex flex-col divide-y divide-bdr/60">
              {escopo.map((item, i) => (
                <li key={i} className="py-2 flex gap-2.5 items-start">
                  <span
                    className="text-emerald-600 dark:text-emerald-400 text-[13px] leading-none mt-0.5 flex-shrink-0"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span className="text-[13px] text-txt leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum item de escopo definido ainda.</Empty>
          )}
        </Card>

        <Card title="Fora do escopo" count={fora.length} muted>
          {fora.length > 0 ? (
            <ul className="flex flex-col divide-y divide-bdr/60">
              {fora.map((item, i) => (
                <li key={i} className="py-2 flex gap-2.5 items-start">
                  <span
                    className="text-mut text-[13px] leading-none mt-0.5 flex-shrink-0"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <span className="text-[13px] text-mut leading-relaxed line-through decoration-bdr">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              Nada declarado como fora do escopo. É o registro que mais evita
              divergência com o cliente depois.
            </Empty>
          )}
        </Card>
      </div>

      {/* ── Como se aceita ─────────────────────────────────────────────── */}
      <Card title="Critérios de aceite" count={aceite.length}>
        {aceite.length > 0 ? (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
            {aceite.map((item, i) => (
              <li
                key={i}
                className="py-2 border-b border-bdr/60 last:border-b-0 flex gap-2.5 items-start"
              >
                <span
                  className="w-4 h-4 rounded border-[1.5px] border-bdr flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span className="text-[13px] text-txt leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            Nenhum critério de aceite definido. São as condições verificáveis para a
            entrega ser aceita.
          </Empty>
        )}
      </Card>

      {/* ── O que se ganha ─────────────────────────────────────────────── */}
      <Card title="Valor esperado">
        {pontuados.length === 0 && o.fte_horas == null && descritos.length === 0 ? (
          <Empty>Benefícios ainda não descritos nem pontuados.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Os dois números que resumem o bloco */}
            <div className="grid grid-cols-2 gap-3 sm:max-w-[420px]">
              <Metric
                value={o.fte_horas != null ? `${o.fte_horas}h` : '—'}
                label="economizadas por mês"
              />
              <Metric
                value={media != null ? String(media) : '—'}
                label="média dos benefícios (1–5)"
              />
            </div>

            {/* Pontuados — ordenados pela nota, então as 3 primeiras linhas já
                são o "top 3" e nenhum bloco extra precisa repeti-lo. */}
            {pontuados.length > 0 && (
              <Block label={`Benefícios pontuados · ${pontuados.length} de 8`}>
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2.5">
                  {pontuados.map((b) => (
                    <li key={b.key} className="flex items-center gap-3">
                      <span className="text-[12px] text-txt w-[168px] flex-shrink-0 truncate">
                        {b.label}
                      </span>
                      <span className="flex-1 h-1.5 bg-bdr rounded-full overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(b.value / 5) * 100}%`,
                            background: benefitColor(b.value),
                          }}
                        />
                      </span>
                      <span
                        className="text-[12px] font-bold tabular-nums w-6 text-right flex-shrink-0"
                        style={{ color: benefitColor(b.value) }}
                      >
                        {b.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {/* Texto livre — coisa DIFERENTE das notas acima, e por isso com
                rótulo que as distingue ("descritos" × "pontuados"). */}
            {descritos.length > 0 && (
              <Block label="Benefícios descritos">
                <ul className="flex flex-col divide-y divide-bdr/60">
                  {descritos.map((b, i) => (
                    <li key={i} className="py-2 flex gap-2.5 items-start">
                      <span className="text-pri flex-shrink-0" aria-hidden="true">
                        →
                      </span>
                      <span className="text-[13px] text-txt leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {qualitativo !== '' && (
              <Block label="Benefício qualitativo">
                <p className="text-[13px] text-txt leading-relaxed whitespace-pre-wrap">
                  {qualitativo}
                </p>
              </Block>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Primitivos ──────────────────────────────────────────────────────────────

function Card({
  title,
  count,
  muted,
  children,
}: {
  title: string;
  /** Contagem ao lado do título — só quando > 0. */
  count?: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        // Sem `h-full`: dentro de um grid ele resolve contra a altura da
        // LINHA (definida pelo cartão mais alto), não contra o conteúdo — o
        // cartão curto estica e sobra um vazio enorme. O grid já usa
        // `items-start`, então cada cartão tem a própria altura.
        'border border-bdr rounded-xl shadow-sm px-4 py-3.5 ' +
        (muted ? 'bg-bg' : 'bg-wh')
      }
    >
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2.5 flex items-center gap-2">
        {title}
        {count != null && count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-bg border border-bdr text-[10px] tabular-nums normal-case tracking-normal">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** Subdivisão DENTRO de um cartão — rótulo mais fraco que o do cartão, para a
 *  hierarquia não empatar (o erro da versão anterior desta tela). */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-txt mb-2">{label}</div>
      {children}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-bg rounded-lg px-3.5 py-3">
      <div className="text-[26px] font-black text-txt leading-none tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-mut mt-1 leading-tight">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-mut italic leading-relaxed">{children}</p>;
}
