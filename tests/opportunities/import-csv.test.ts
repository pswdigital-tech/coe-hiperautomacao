// =============================================================================
// parseImportCsv — parser puro da importação em massa (migration 0059).
//
// Este módulo é a ÚNICA validação do caminho de importação (a Server Action
// reparseia o texto cru com ele antes de chamar a RPC), então o que não estiver
// coberto aqui não está coberto em lugar nenhum.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseImportCsv,
  importTemplateCsv,
  parseCsv,
  IMPORT_COLUMNS,
  CRITERIO_KEYS,
  MAX_IMPORT_ROWS,
} from '@/lib/opportunities/import-csv';

/** Monta um CSV a partir de um objeto coluna→valor (só as colunas usadas). */
function csv(rows: Record<string, string>[], sep = ';'): string {
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: string) =>
    new RegExp(`[${sep === '\t' ? '\\t' : sep}"\n\r]`).test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const head = cols.join(sep);
  const body = rows.map((r) => cols.map((c) => escape(r[c] ?? '')).join(sep));
  return [head, ...body].join('\r\n');
}

const minima = {
  solicitante: 'Arley Costa',
  area: 'Tecnologia da Informação',
  processo: 'Gestão de Custo da Plataforma de Dados',
};

describe('cabeçalho', () => {
  it('recusa arquivo sem as colunas obrigatórias e não devolve linha nenhuma', () => {
    const r = parseImportCsv(csv([{ solicitante: 'Ana', area: 'TI' }]));
    expect(r.rows).toHaveLength(0);
    expect(r.missingColumns).toEqual(['processo']);
    expect(r.issues[0].message).toContain('processo');
  });

  it('ignora coluna desconhecida sem transformar em erro', () => {
    const r = parseImportCsv(csv([{ ...minima, coluna_do_excel: 'anotação' }]));
    expect(r.unknownColumns).toEqual(['coluna_do_excel']);
    expect(r.rows).toHaveLength(1);
    expect(r.issues).toHaveLength(0);
  });

  it('aceita cabeçalho com caixa e espaço acidentais', () => {
    const texto = ' Solicitante ;AREA;Processo\r\nAna;TI;Conciliação diária';
    const r = parseImportCsv(texto);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].payload.solicitante).toBe('Ana');
  });

  it('usa a primeira ocorrência quando a coluna vem repetida, e avisa', () => {
    const texto = 'solicitante;area;processo;processo\r\nAna;TI;Primeiro;Segundo';
    const r = parseImportCsv(texto);
    expect(r.rows[0].payload.processo).toBe('Primeiro');
    expect(r.issues.some((i) => i.message.startsWith('coluna repetida'))).toBe(true);
  });
});

describe('dialeto do arquivo', () => {
  it('detecta vírgula como separador', () => {
    const r = parseImportCsv(csv([minima], ','));
    expect(r.delimiter).toBe(',');
    expect(r.rows).toHaveLength(1);
  });

  it('detecta tab', () => {
    const r = parseImportCsv(csv([minima], '\t'));
    expect(r.delimiter).toBe('\t');
    expect(r.rows).toHaveLength(1);
  });

  it('come o BOM do Excel sem estragar a primeira coluna', () => {
    const r = parseImportCsv('﻿' + csv([minima]));
    expect(r.rows[0].payload.solicitante).toBe(minima.solicitante);
  });

  it('preserva quebra de linha e ponto-e-vírgula dentro de célula com aspas', () => {
    const texto =
      'solicitante;area;processo;notas\r\n' +
      'Ana;TI;Conciliação;"Linha 1\nLinha 2; com ponto-e-vírgula"';
    const r = parseImportCsv(texto);
    expect(r.rows[0].payload.notas).toBe('Linha 1\nLinha 2; com ponto-e-vírgula');
  });

  it('descarta a linha vazia que o Excel deixa no fim', () => {
    const r = parseImportCsv(csv([minima]) + '\r\n\r\n');
    expect(r.totalRows).toBe(1);
    expect(r.rows).toHaveLength(1);
  });

  it('parseCsv devolve matriz crua com aspas duplicadas resolvidas', () => {
    expect(parseCsv('a;b\r\n"x""y";z')).toEqual([
      ['a', 'b'],
      ['x"y', 'z'],
    ]);
  });
});

describe('domínios de enum', () => {
  it('normaliza acento e caixa (Diário → diario, Concluído → concluido)', () => {
    const r = parseImportCsv(
      csv([{ ...minima, tempo: 'Diário', status: 'Concluído', fte: 'Muito Baixo' }])
    );
    expect(r.issues).toHaveLength(0);
    expect(r.rows[0].payload.tempo).toBe('diario');
    expect(r.rows[0].payload.status).toBe('concluido');
    expect(r.rows[0].payload.fte).toBe('muito_baixo');
  });

  it('valor fora do domínio vira ERRO e derruba a linha — nunca null silencioso', () => {
    const r = parseImportCsv(csv([{ ...minima, esforco: 'gigante' }]));
    expect(r.rows).toHaveLength(0);
    expect(r.issues[0].column).toBe('esforco');
    expect(r.issues[0].message).toContain('gigante');
  });

  it('aplica os defaults de source/request_type/status quando a coluna vem vazia', () => {
    const r = parseImportCsv(csv([minima]));
    const p = r.rows[0].payload;
    expect(p.source).toBe('formulario');
    expect(p.request_type).toBe('nova_oportunidade');
    expect(p.status).toBe('novo');
  });
});

describe('critérios e benefícios', () => {
  const todos = Object.fromEntries(
    CRITERIO_KEYS.map((k) => [`criterios.${k}`, 'sim'])
  ) as Record<string, string>;

  it('aceita os 8 critérios e monta o objeto', () => {
    const r = parseImportCsv(csv([{ ...minima, ...todos }]));
    expect(r.issues).toHaveLength(0);
    expect(Object.keys(r.rows[0].payload.criterios ?? {})).toHaveLength(8);
  });

  it('recusa preenchimento parcial dos critérios (CHECK do banco exige os 8)', () => {
    const r = parseImportCsv(
      csv([{ ...minima, 'criterios.regrasClaras': 'sim', 'criterios.schedulable': 'nao' }])
    );
    expect(r.rows).toHaveLength(0);
    const issue = r.issues.find((i) => i.column === 'criterios');
    expect(issue?.message).toContain('faltam');
  });

  it('deixa criterios null quando nenhuma das 8 colunas vem preenchida', () => {
    const r = parseImportCsv(csv([minima]));
    expect(r.rows[0].payload.criterios).toBeNull();
  });

  it('aceita benefício parcial, mas recusa nota fora de 1–5', () => {
    const ok = parseImportCsv(csv([{ ...minima, 'beneficios.reducaoTempo': '4' }]));
    expect(ok.rows[0].payload.beneficios).toEqual({ reducaoTempo: 4 });

    const ruim = parseImportCsv(csv([{ ...minima, 'beneficios.compliance': '9' }]));
    expect(ruim.rows).toHaveLength(0);
    expect(ruim.issues[0].column).toBe('beneficios.compliance');
  });
});

describe('listas, números e datas', () => {
  it('quebra listas por | e transforma ferramenta em slug do catálogo', () => {
    const r = parseImportCsv(
      csv([
        {
          ...minima,
          ferramenta: 'n8n | Databricks',
          escopo_automacao: 'Painel de custo | Consumo ocioso',
          tipo_processo: 'automacao',
        },
      ])
    );
    const p = r.rows[0].payload;
    expect(p.ferramentas).toEqual(['n8n', 'databricks']);
    expect(p.escopo_automacao).toEqual(['Painel de custo', 'Consumo ocioso']);
    expect(p.tipo_processo).toEqual(['automacao']);
  });

  it('não repete ferramenta quando o nome aparece duas vezes', () => {
    const r = parseImportCsv(csv([{ ...minima, ferramenta: 'Databricks | databricks' }]));
    expect(r.rows[0].payload.ferramentas).toEqual(['databricks']);
  });

  it('aceita vírgula decimal em fte_horas', () => {
    const r = parseImportCsv(csv([{ ...minima, fte_horas: '7,5' }]));
    expect(r.rows[0].payload.fte_horas).toBe(7.5);
  });

  it('recusa execucoes_mes não inteiro ou negativo', () => {
    expect(parseImportCsv(csv([{ ...minima, execucoes_mes: '-3' }])).rows).toHaveLength(0);
    expect(parseImportCsv(csv([{ ...minima, execucoes_mes: '2,5' }])).rows).toHaveLength(0);
  });

  it('converte dd/mm/aaaa e ISO nas datas', () => {
    const r = parseImportCsv(
      csv([
        {
          ...minima,
          data_abertura_coe: '2026-08-17T13:57:47.686185+00:00',
          data_fechamento_coe: '17/08/2026',
          data_conclusao: '17/08/2026',
        },
      ])
    );
    const p = r.rows[0].payload;
    expect(p.data_abertura_coe).toBe('2026-08-17T13:57:47.686Z');
    expect(p.data_fechamento_coe).toBe('2026-08-17T00:00:00.000Z');
    expect(p.data_conclusao).toBe('2026-08-17');
  });

  it('recusa data que não reconhece em vez de gravar null em silêncio', () => {
    const r = parseImportCsv(csv([{ ...minima, data_conclusao: 'agosto de 2026' }]));
    expect(r.rows).toHaveLength(0);
    expect(r.issues[0].column).toBe('data_conclusao');
  });
});

describe('linhas', () => {
  it('numera o problema pela linha do ARQUIVO (cabeçalho = 1)', () => {
    const r = parseImportCsv(
      csv([minima, { ...minima, processo: 'Outro', objetivo: '9' }])
    );
    expect(r.issues[0].line).toBe(3);
  });

  it('importa a primeira e avisa quando o mesmo processo se repete no arquivo', () => {
    const r = parseImportCsv(csv([minima, { ...minima }]));
    expect(r.rows).toHaveLength(1);
    expect(r.issues[0].message).toContain('repete o processo da linha 2');
  });

  it('recusa o arquivo inteiro acima do teto de linhas', () => {
    const linhas = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({
      ...minima,
      processo: `Processo ${i}`,
    }));
    const r = parseImportCsv(csv(linhas));
    expect(r.rows).toHaveLength(0);
    expect(r.issues[0].message).toContain(String(MAX_IMPORT_ROWS));
  });

  it('exige os obrigatórios em cada linha', () => {
    const r = parseImportCsv(csv([{ ...minima, solicitante: 'A', area: '', processo: 'Processo válido' }]));
    expect(r.rows).toHaveLength(0);
    expect(r.issues.map((i) => i.column).sort()).toEqual(['area', 'solicitante']);
  });

  it('recusa e-mail malformado, mas aceita a coluna vazia', () => {
    expect(parseImportCsv(csv([{ ...minima, email: 'arroba-faltando' }])).rows).toHaveLength(0);
    const vazio = parseImportCsv(csv([{ ...minima, email: '' }]));
    expect(vazio.rows[0].payload.email).toBeNull();
  });

  it('arquivo vazio vira issue, não exceção', () => {
    expect(() => parseImportCsv('')).not.toThrow();
    expect(parseImportCsv('').issues[0].message).toBe('Arquivo vazio.');
  });
});

describe('modelo baixável', () => {
  it('é aceito pelo próprio parser, sem nenhum problema', () => {
    const r = parseImportCsv(importTemplateCsv());
    expect(r.issues).toEqual([]);
    expect(r.unknownColumns).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it('traz todas as colunas conhecidas no cabeçalho', () => {
    const [header] = importTemplateCsv().replace(/^﻿/, '').split('\r\n');
    expect(header.split(';')).toHaveLength(IMPORT_COLUMNS.length);
  });
});
