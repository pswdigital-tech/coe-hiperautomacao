# FGCoop — Estimativa de Tempo de Desenvolvimento por Oportunidade

> Estimativa **determinística** derivada dos campos curados `complexidade` e `esforco` de cada oportunidade, com ajuste por `ferramenta`. Não usa IA — é reproduzível. Valores em **dias úteis** (1 semana = 5 dias úteis).

**Tenant:** FGCoop · **Oportunidades:** 29 · **Gerado a partir do banco** `vxgthycrjetniejsjmee`

## Método

Matriz base (dias úteis) por complexidade × esforço de implementação:

| Complexidade \ Esforço | Baixo | Médio | Alto |
|---|---|---|---|
| **Baixa** | 2–4 | 4–6 | 6–9 |
| **Média** | 5–8 | 8–13 | 13–18 |
| **Alta** | 15–22 | 22–30 | 30–45 |

Ajuste por ferramenta: `ambos` (RPA + n8n = duas frentes) → **×1,25**; `rpa`/`n8n` → ×1,0.

## Estimativas

| Oportunidade | Complexidade | Tempo Estimado |
|---|---|---|
| #0027 Controles e Gerações Automáticas (Contabilidade) | Alta | 38–56 dias úteis (~7.6–11.2 sem) |
| #0028 Assistência Financeira às Cooperativas | Alta | 38–56 dias úteis (~7.6–11.2 sem) |
| #0029 Classificação de Riscos de Cooperativas | Alta | 30–45 dias úteis (~6–9 sem) |
| #0026 Engenharia de Dados: dbt + Orquestração de Pipelines | Alta | 30–45 dias úteis (~6–9 sem) |
| #0024 Verificação de Fornecedores (Compliance) | Média | 16–23 dias úteis (~3.2–4.6 sem) |
| #0025 Relatório ESG | Média | 16–23 dias úteis (~3.2–4.6 sem) |
| #0020 Atualização de Bases para Dashboards | Média | 10–16 dias úteis (~2–3.2 sem) |
| #0015 Estruturação de Dados não Estruturados e APIs | Média | 10–16 dias úteis (~2–3.2 sem) |
| #0022 Automação de Compras, Viagens e Eventos | Média | 10–16 dias úteis (~2–3.2 sem) |
| #0023 Hiperautomação – Contas a Pagar | Média | 10–16 dias úteis (~2–3.2 sem) |
| #0019 Automação de Governança e Gestão de Atas | Média | 8–13 dias úteis (~1.6–2.6 sem) |
| #0021 Monitoramento de Normas e Regulações | Média | 8–13 dias úteis (~1.6–2.6 sem) |
| #0018 Proposição Normativa – Consulta via IA | Média | 8–13 dias úteis (~1.6–2.6 sem) |
| #0017 Gestão de Riscos Corporativos | Média | 8–13 dias úteis (~1.6–2.6 sem) |
| #0007 Automação de Contribuições e Orçamento | Média | 6–10 dias úteis (~1.2–2 sem) |
| #0014 Due Diligence para Contratações | Baixa | 5–8 dias úteis (~1–1.6 sem) |
| #0011 Automação Contábil: Conciliações e Fechamento | Média | 5–8 dias úteis (~1–1.6 sem) |
| #0009 Atividades Rotineiras de TI (Scripts PowerShell) | Baixa | 5–8 dias úteis (~1–1.6 sem) |
| #0010 Automação Jurídica e Monitoramento Normativo | Média | 5–8 dias úteis (~1–1.6 sem) |
| #0013 Conferências de Folha, Impostos e eSocial | Baixa | 4–6 dias úteis (~0.8–1.2 sem) |
| #0016 Repositório de Documentos Institucionais | Baixa | 4–6 dias úteis (~0.8–1.2 sem) |
| #0005 Automação de NFs e Acompanhamento de Investimentos | Baixa | 3–5 dias úteis (~0.6–1 sem) |
| #0008 Automação RH: Folha, Relatórios e Aprovações | Baixa | 2–4 dias úteis (<1 sem) |
| #0001 Acompanhamento de Projetos do Planejamento Estratégico | Baixa | 2–4 dias úteis (<1 sem) |
| #0006 Redigir Ata de Reunião | Baixa | 2–4 dias úteis (<1 sem) |
| #0012 Inclusão de Notas Fiscais no Protheus | Baixa | 2–4 dias úteis (<1 sem) |
| #0004 Acompanhamento de Prazos (Normativos e Planos de Ação) | Baixa | 2–4 dias úteis (<1 sem) |
| #0002 Atualização de Ficha Gráfica das Cooperativas | Baixa | 2–4 dias úteis (<1 sem) |
| #0003 Cadastro de Fornecedor no ERP Protheus | Baixa | 2–4 dias úteis (<1 sem) |

## Totais (soma das faixas)

- **Esforço agregado:** 291–451 dias úteis (~58–90 semanas de dev, sem paralelismo).

---
*Estimativa gerada em 2026-07-16 · método determinístico complexidade×esforço×ferramenta · não persistida no banco.*
