-- =============================================================================
-- import-copa-opportunities.sql — Inventário de RPAs da COPA (parte 1)
-- Tenant: 89c6ee5a-539c-4fad-b77d-62785d353ba5
-- =============================================================================
-- Rode TUDO de uma vez no Supabase SQL Editor. Sem staging, sem import de CSV:
-- os dados estão embutidos no `values` abaixo.
--
-- COBERTURA: 131 linhas — RPA_COML_01..52, RPA_COMP_01..33, RPA_COTRL_01..49,
--   RPA_FINAN_01..24, RPA_LOGIS_05..09. As linhas de LOGIS a partir da do
--   "Fabio Assencio" NÃO estão aqui (a origem foi truncada) — entram na parte 2.
--
-- IDEMPOTENTE: não reinsere um `ID original: RPA_XXX_NN` que já exista em
--   opportunities.notas deste tenant. Pode rodar duas vezes sem duplicar.
--
-- NUNCA inserimos seq_id (trigger), rpa_score (GENERATED), score/priority_level
--   (view opportunities_with_score) — docs/PROJETO.md §3.
--
-- DE-PARA aplicado (a planilha de origem não segue o schema; ver bloco SELECT):
--   area/subarea   ← derivadas do prefixo do ID (COML→Comercial, COMP→Compras, …)
--   processo       ← descrição da automação (é o que identifica a linha)
--   notas          ← ID original + nome da automação + macroprocesso + transações
--   fonte          = 'Inventário Consolidado 30/06/2026'
--   status         : Descontinuado/Não → descontinuado | Em desenvolvimento →
--                    desenvolvimento | Sim → producao
--   criticidade    ← nível 4→critica 3→alta 2→media 1→baixa
--   fte_horas      ← HH/mês
--   ABREVIAÇÕES no `values` (para encurtar): ling ''→'VBA', exec ''→'Usuário',
--   usr ''→'SAP = usuário da área de negócio', resp ''→'Danilo'
-- =============================================================================

set session characteristics as transaction read write;
set default_transaction_read_only = off;

with src (orig, solic, macro, freq, sap, descr, hh, ativo, nivel, azure, ling, exec, usr, resp, dt) as (
values
-- ─── COMERCIAL ───────────────────────────────────────────────────────────────
('RPA_COML_01','Janaina Nascimento','Roteirização e programação','Descontinuado','XD02','Altera zona de entrega do cliente | RPA_Atualizacao_Zona_Entrega','','Não','2','','','','','','15/04/2024'),
('RPA_COML_02','Janaina Nascimento','Roteirização e programação','Sob demanda','XD02','Altera CPM e zona de entrega via XD02 | RPA_CPM_ZE','','Sim','2','','','','','','24/04/2024'),
('RPA_COML_04','Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Incluir origem e marca em dados da área do cliente | RPA_Incluir_Origem_Marca_por_setor','','Sim','1','','','','','','23/04/2024'),
('RPA_COML_05','Luiz Carlos Guedes Pereira','Gestão da carteira de clientes','Execução única','','Identificar tanques para requalificação pela NF de fornecimento. Fazer uma busca pelos tanques do range de clientes enviados a fim de trazer, entre outras informações, a chave da nf de fornecimento para requalificação | RPA_Requalificação','','Não','','','','','','','26/01/2024'),
('RPA_COML_06','Claudia Luz / Fabiana Castro','Gestão da carteira de clientes','Sob demanda','VA41','Cria os contratos no SAP para que os tanques possam ser requalificados | RPA_Contratos_Requalificacao','','Sim','3','','','','','','14/02/2024'),
('RPA_COML_07','Claudia Luz / Janaina Nascimento','Roteirização e programação','Sob demanda','XD02','Altera a latitude e longitude do cadastro do cliente na XD02 | RPA_Latitude_Longitude','','Sim','1','','','','','','04/03/2024'),
('RPA_COML_08','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera Razão do EO na XD02 | RPA_Razão','','Sim','1','','','','','','06/02/2023'),
('RPA_COML_09','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera data do campo "ClienteDesde" na transação XD02 - "Dados adicionais" | RPA_Atualizacao_ClienteDesde','','Sim','1','','','','','','05/02/2024'),
('RPA_COML_10','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Atualizar cadastro do cliente no SAP | RPA_Atualizacao_RevogacaoANP','','Sim','1','','','','','','05/02/2024'),
('RPA_COML_11','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Inclui os dados da pessoa de contato na XD02 | RPA_Incluir_Pessoa_De_Contato','','Sim','1','','','','','','27/12/2023'),
('RPA_COML_12','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Incluir Cliente Sazonal: os cadastros que foram migrados do SAP Liquigás subiram sem essa informação, precisamos incluir essa informação nos cadastros ativos. | RPA_Incluir_Cliente_Sazonal','','Sim','1','','','','','','22/08/2023'),
('RPA_COML_13','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Inclusão dados bancários: quando precisamos devolver algum valor para o cliente precisamos cadastrar os dados bancários na conta, recentemente uma grande quantidade de cliente realizou o pagamento duplicado do boleto. | RPA_Incluir_Dados_Bancarios','','Sim','2','','','','','','22/08/2023'),
('RPA_COML_14','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD01','Atualizar cadastro do cliente no SAP | RPA_Recebedor_Mercadoria','','Sim','3','','','','','','10/08/2023'),
('RPA_COML_15','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD01','Atualizar cadastro do cliente no SAP | RPA_Emissor_De_Ordem_CPF','','Sim','1','','','','','','22/08/2023'),
('RPA_COML_16','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD01','Criar e ampliar de cadastro de emissor da ordem: foi identificado que alguns clientes corporativos faz o pagamento por um CNPJ que não esta cadastrado no sistema, causando divergências no financeiro. O financeiro esta fazendo um levamento dos clientes e já foi apontado mais de 10 casos. | RPA_Emissor_De_Ordem_CNPJ','','Sim','1','','','','','','22/08/2023'),
('RPA_COML_17','Fabiana Castro','Gestão da carteira de clientes','Sob demanda','ZSD0040','Altera Status dos contratos na transação ZSD 0040 de acordo com a demanda | RPA_Altera_Status_Contrato','','Sim','1','','','','','','14/08/2023'),
('RPA_COML_18','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Atualizar cadastro do cliente no SAP | RPA_Incluir_Parceiro_Empresarial','','Sim','3','','','','','','03/08/2023'),
('RPA_COML_19','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Atualizar cadastro do cliente no SAP | RPA_Incluir_Parceiro_Revenda','','Sim','3','','','','','','17/08/2023'),
('RPA_COML_20','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Atualização Inscrição Estadual: para cada estado existe uma quantidade de caractere diferente (exemplo: SP 12 caracteres, MG 13 caracteres etc), foi identificado mais de 3 mil cadastros que precisam de ajuste. | RPA_Atualização_Inscrição_Estadual','','Sim','1','','','','','','31/07/2023'),
('RPA_COML_21','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD02','Atualizar distância em Km no cadastro do cliente no SAP | RPA_Atualização_Distancia_Km','','Sim','2','','','','','','07/07/2023'),
('RPA_COML_22','Claudia Luz','Gestão da carteira de clientes','Sob demanda','XD01','Amplia os grupos dos clientes no SAP | RPA_Ampliacao_Grupo','','Sim','2','','','','','','23/05/2023'),
('RPA_COML_23','Claudia Luz','Gestão da carteira de clientes','Sob demanda','VA43','Extrai informações de contratos de clientes do SAP | RPA_Dados_Contratos','','Sim','3','','','','','','15/05/2023'),
('RPA_COML_25','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','VDH1N','Atribui um cliente ao grupo no SAP | RPA_VDH1N_Empresarial','','Sim','2','','','','','','08/03/2024'),
('RPA_COML_26','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','VDH1N','Atribui um cliente ao grupo no SAP | RPA_VDH1N_Revenda','','Sim','2','','','','','','02/05/2023'),
('RPA_COML_28','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Atualizar cadastro do cliente no SAP | RPA_Atualizacao_Estrutura_Revenda','','Sim','3','','','','','','04/05/2023'),
('RPA_COML_29','Claudia Luz / Janaina Nascimento','Inteligência de dados','Sob demanda','XD02','Atualizar cadastro do cliente no SAP | RPA_Atualizacao_Estrutura_Empresarial','','Sim','3','','','','','','11/05/2023'),
('RPA_COML_30','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Realiza o cadastramento da classe NN | RPA_Classificacao_NN','','Sim','2','','','','','','28/04/2023'),
('RPA_COML_31','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','Não utiliza SAP','RPA_Cria_Pedido','','Sim','','','','','','','25/04/2023'),
('RPA_COML_32','Claudia Luz','Roteirização e programação','Descontinuado','','Atualização do campo centro para clientes - Empresarial | Filiais Espelho - RPA_Empresarial','','Não','','','','','','','12/04/2023'),
('RPA_COML_33','Claudia Luz','Roteirização e programação','Descontinuado','','Atualização do campo centro para clientes - Revenda | Filiais Espelho - RPA_Revenda','','Não','','','','','','','12/04/2023'),
('RPA_COML_34','Claudia Luz / Fabiana Rodrigues','Roteirização e programação','Descontinuado','','Baixa do SAP as informações dos contratos na origem, cria o contrato no destino com essas informações e altera o status conforme origem | Filiais Espelho - RPA_Contratos_Envasado','','Não','','','','','','','11/04/2023'),
('RPA_COML_35','Claudia Luz / Fabiana Rodrigues','Roteirização e programação','Descontinuado','','Baixa do SAP as informações dos contratos na origem, cria o contrato no destino com essas informações e altera o status conforme origem | Filiais Espelho - RPA_Contratos_Empresarial','','Não','','','','','','','11/04/2023'),
('RPA_COML_36','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Atualiza a Inscrição Estadual de Produtores Rurais via XD02 | RPA_Insc_Est_PR','','Sim','1','','','','','','16/01/2025'),
('RPA_COML_37','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD01','Realiza o cadastro de pontos de venda via XD02 | RPA_Cadastro_PV','','Sim','1','','','','','','22/01/2025'),
('RPA_COML_38','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Exclui Recebedor de Mercadoria da Revenda via XD02 | RPA_Exclui_RM_Revenda','','Sim','1','','','','','','23/01/2025'),
('RPA_COML_39','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD05','Realiza o bloqueio de clientes em todos os setores via XD02 | RPA_Bloqueio_Clientes','','Sim','1','','','','','','28/01/2025'),
('RPA_COML_40','Claudia Luz / Luciana Mormilho','Gestão da carteira de clientes','Sob demanda','ZSD1002','Cria faixas de contrato para as filiais (Consumidor e Revenda) | RPA_Faixas_Contrato','','Sim','3','9541','','','','','10/04/2025'),
('RPA_COML_41','Claudia Luz / Luciana Mormilho','Gestão da carteira de clientes','Sob demanda','VA41','Cria os pedidos antes de cadastrar os contratos para a migração de filiais. Necessário devido à mudança na transação VA41 | RPA_Cadastra_Pedido','','Sim','3','','','VM disponível','','','22/08/2025'),
('RPA_COML_42','Claudia Luz','Gestão da carteira de clientes','Execução única','','Saneamento dos telefones das pessoas de contato no SAP para posterior carga no Salesforce | RPA_Saneamento_Telefone','','Não','','','Python','VM disponível','','','27/08/2025'),
('RPA_COML_44','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Insere a data de reativação do cadastro do cliente no SAP | RPA_Data_Reativação (HH YTD 20.25)','4,5','Sim','1','','','','','','06/03/2026'),
('RPA_COML_45','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o domicílio fiscal do cliente no SAP | RPA_Domicilio_Fiscal (HH YTD 6)','6','Sim','2','23940','','','','','09/04/2026'),
('RPA_COML_46','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera alvará do Corpo de Bombeiro e Prefeitura no SAP | RPA_Alteracao_Alvara_Bombeiro_Prefeitura (HH YTD 4.5)','1,5','Sim','1','25131','','','','','11/05/2026'),
('RPA_COML_47','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o tratamento do cliente no SAP | RPA_Altera_Tratamento_Cliente (HH YTD 12)','4','Sim','1','25280','','','','','15/05/2026'),
('RPA_COML_48','Claudia Luz / Diechile Ribeiro','Gestão da carteira de clientes','Sob demanda','FB75, FB03','Cria Nota de Crédito sem impacto no preço | RPA_NC_Sem_Impacto_Preco (HH YTD 6)','2','Sim','2','25453','','','','','26/05/2026'),
('RPA_COML_49','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o telefone na aba principal do cadastro do cliente | RPA_Telefone','','Sim','2','','','','','','29/02/2024'),
('RPA_COML_50','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o e-mail na aba principal do cadastro do cliente | RPA_Email','','Sim','1','','','','','','21/05/2024'),
('RPA_COML_51','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o centro fornecedor do cliente revenda | RPA_Centro_Fornecedor_Revenda','','Sim','2','','','','','','07/04/2024'),
('RPA_COML_52','Claudia Luz / Janaina Nascimento','Gestão da carteira de clientes','Sob demanda','XD02','Altera o centro fornecedor do cliente empresarial | RPA_Centro_Fornecedor_Empresarial','','Sim','2','','','','','','07/10/2024'),

-- ─── COMPRAS ─────────────────────────────────────────────────────────────────
('RPA_COMP_01','Ricardo Brasil / Jacqueline Beretta','Gestão de fornecedores','Sob demanda','ME32K','Troca o grupo de compradores dos materiais/centros. Cerca de 65500 | RPA_ME32K','','Sim','1','','','','','','19/03/2024'),
('RPA_COMP_02','Ricardo Brasil','Gestão de fornecedores','Sob demanda','ME32K','Atualizar cadastro de fornecedores | RPA_Alt_Grupo_Compradores','','Sim','1','','','','','','13/03/2024'),
('RPA_COMP_03','Ricardo Brasil','Gestão de fornecedores','Sob demanda','MM03','Insere anexo de bloqueio referente ao material | RPA_MM03','','Sim','1','','','','','','22/05/2024'),
('RPA_COMP_04','Ricardo Brasil','Gestão de fornecedores','Sob demanda','MM02','Altera a descrição dos materiais na transação MM02 | RPA_MM02_Alt_descricao','','Sim','1','','','','','','27/05/2024'),
('RPA_COMP_06','Mariana Rodrigues / Rebeca Dias','Gestão de fornecedores','24x7','ME51N, ME3N','Cria a requisição de negociação de reajuste no SAP e envia o aviso para o comprador responsável por aquele contrato para ele finalizar ou negociar o reajuste. Além disso, o robô também cria as requisições de renovação por saldo e/ou validade 150 dias antes do vencimento do contrato | RPA_Requisicao_Contratos','','Sim','4','8243','Python','VM = SDC-VROBO01','SAP = SACONTROL e-mail = rpa@copaenergia.com.br','','31/03/2025'),
('RPA_COMP_07','Ricardo Brasil / Jacqueline Beretta','Gestão de fornecedores','Sob demanda','MM01, MM02','Cadastro de material via transação MM01 | RPA_MM02','','Sim','1','','','','','','08/03/2024'),
('RPA_COMP_09','Mariana Rodrigues','Gestão de fornecedores','Sob demanda','ME32K','Altera o gerente e o fiscal dos contratos | RPA_Altera_Gerente_Fiscal','','Sim','1','','','','','','04/01/2024'),
('RPA_COMP_10','Karen Santos','Gestão de fornecedores','Execução única','','Altera os impostos dos itens de contrato no SAP | RPA_Altera_Imposto','','Não','','','','','','','20/09/2023'),
('RPA_COMP_12','Rebeca Dias','Gestão de fornecedores','Descontinuado','','Extrai os contratos com fornecedores e informações dos SAP Liquigas e Copa para fins de auditoria | RPA_Contratos_Compras','','Não','','','Python','VM disponível','SAP = SACONTROL','','10/05/2023'),
('RPA_COMP_15','Karen Santos','Compra de indiretos','Execução única','','Automação que insere preço, grupo e imposto nos materiais dos contratos de EPI de acordo com a requisição. Os dados a serem inseridos estão em uma planilha de Excel | RPA_Modificação_Contratos_EPI','','Não','','','','','','','25/07/2023'),
('RPA_COMP_16','Felipe de Almeida Passos','Compra de indiretos','Sob demanda','ME32K','Insere os itens em um respectivo contrato no SAP | RPA_Insere_Itens_Contratos_Compras','','Sim','1','','','','','','16/08/2024'),
('RPA_COMP_17','Grasciella Real Rocha','Gestão de fornecedores','Sob demanda','ME21N','Gera o pedido das faturas recebidas dos fornecedores | RPA_ME21N_Pedidos','','Sim','2','','','','','','13/11/2024'),
('RPA_COMP_18','Bianca de Freitas Palomo','Fiscal','Sob demanda','J1B1N','Cria as notas de importação dos outros gases | RPA_Importação_Outros_Gases','','Sim','2','','','','','','09/12/2024'),
('RPA_COMP_19','Rebeca Dias','Gestão de fornecedores','Sob demanda','ME33K','Extrai anexos de contratos | RPA_Extração_Contratos','','Sim','2','','','','','','23/01/2025'),
('RPA_COMP_20','Guilherme Guimarães','Gestão de fornecedores','Execução única','','Insere nos contratos dados de estratégia de SLA, categoria e diretoria via ME32K | RPA_Altera_Dados_Cadastrais','','Não','','8491','','','','','07/03/2025'),
('RPA_COMP_21','Larissa Leonel','Gestão de fornecedores','Execução única','','Alterar a quantidade dos itens de 7 contratos (2809 linhas) | RPA_ME32K_Altera_Qtdd','','Não','','9235','','','','','17/03/2025'),
('RPA_COMP_22','Mariana Rodrigues','Gestão de fornecedores','24x7','SQVI, ME3N','Retorna à Nimbi o status dos pedidos criados no SAP | RPA_Nimbi_Status','','Sim','4','','Python','VM = DDC-VROBO04','SAP = SANIMBI e-mail = sanimbi@copaenergia.com.br','','19/06/2025'),
('RPA_COMP_23','Joannez Fernandez Santos','Gestão de fornecedores','Execução única','','Cria requisições na transação ME32K no SAP | RPA_ME32K_Req','','Não','','','','','','','18/08/2025'),
('RPA_COMP_24','Francinete Da Silva','Gestão de fornecedores','Sob demanda','XK02','Sobe anexo no cadastro do fornecedor | RPA_XK02_Anexos','','Sim','2','','','','','','21/07/2025'),
('RPA_COMP_25','Francinete Da Silva','Gestão de fornecedores','Sob demanda','XK01','A partir da base de dados extraída do Holmes, o robô cadastra os fornecedores no SAP via XK01 e dá baixa no protocolo de cadastro aberto no Holmes | RPA_Cadastro_Fornecedores (HH YTD 66)','44','Sim','3','23963','Python','','','','05/06/2026'),
('RPA_COMP_26','Mariana Rodrigues','Gestão de fornecedores','24x7','ZSD0028, ME21N, MB5B, ZMM0051, MB51, ZMM0045','Recebe a base de pedidos do Nimbi por e-mail e os cadastra no SAP | RPA_Nimbi_Pedidos (HH YTD 191.1)','27,3','Sim','4','','Python','VM','SAP = SACONTROL e-mail = rpa@copaenergia.com.br','','10/01/2026'),
('RPA_COMP_27','Aldair Alves Oliveira da Silva','Aquisição de GLP importado','Sob demanda','J1B1N','Emite as NFs de importação de GLP | RPA_Importação_GLP_Reforma_Tributaria (HH YTD 46.5)','15,5','Sim','3','23965','','','','','13/04/2026'),
('RPA_COMP_28','Aldair Alves Oliveira da Silva','Aquisição de vasilhames','Sob demanda','J1B1N','Emite as NFs de importação de vasilhames | RPA_Importação_Vasilhames (HH YTD 37.5)','12,5','Sim','3','24394','','','','','29/04/2026'),
('RPA_COMP_29','Gisele Cristina Garcia','Gestão de fornecedores','Sob demanda','ME32K','Altera o preço dos itens dos contratos de fornecedores pela ME32K | RPA_ME32K_Altera_Preco (HH YTD 232)','232','Sim','1','26244','','','','','15/06/2026'),
('RPA_COMP_30','Mariana Rodrigues','Gestão de fornecedores','Sob demanda','Não utiliza SAP','A partir do controle de atualizações de contrato em Excel, são enviados e-mails de FUP aos fiscais de contrato | RPA_Emails_Fiscais_Contrato','','Não','2','26847','Python','','Não utiliza SAP','','14/07/2026'),
('RPA_COMP_31','Francinete Da Silva','Gestão de fornecedores','Sob demanda','XK01','A partir da base de postos de combustível, o robô cadastra os mesmos no SAP via XK01 | RPA_Cadastro_XK01 (HH YTD 8)','8','Sim','2','','','','','','03/06/2026'),
('RPA_COMP_32','Rebeca Dias','Gestão de fornecedores','Sob demanda','Não utiliza SAP','A partir do controle de atualizações de contrato em Excel, são enviados e-mails de FUP aos compradores, fiscais e gerentes de contrato. Também é realizado um levantamento dos fiscais e gerentes faltantes com solicitação de responsáveis | RPA_Emails_Fiscais_Contrato - Fase 2','64','Em desenvolvimento','','27571','Python','','Não utiliza SAP','',''),
('RPA_COMP_33','Francinete Da Silva','Gestão de fornecedores','Sob demanda','XK05, XK03','Bloqueio de fornecedores no SAP com mais de 24 meses sem pagamento | RPA_Bloqueio_Fornecedores (HH YTD 169.55)','169,55','Sim','2','27799','','','','','23/07/2026'),

-- ─── CONTROLADORIA ───────────────────────────────────────────────────────────
('RPA_COTRL_01','Erika Alves','Gestão de custos','Sob demanda','ZMM0058','Extração dos estoques de GLP envasado | RPA_ZMM0058_Disponivel','','Sim','2','','Python','','','','16/08/2023'),
('RPA_COTRL_02','Luciana Ribeiro Reis Rodrigues','Gestão de custos','Sob demanda','FB01','Lançamento de documentos | RPA_FB01','','Sim','2','','','','','','11/12/2023'),
('RPA_COTRL_03','Luana Sobral Moreira de Souza','Gestão de custos','Descontinuado','','Mensalmente extrai bases do SAP, trata os dados e consolida em um template informações de perdas e sobras de GLP | RPA_Perdas_Sobras','','Não','','','','','','','02/06/2024'),
('RPA_COTRL_04','Alessandro Pereira / Silmara Tolentino','Granel','Sob demanda','KEU2, FAGLL03','Extrai dados do SAP, consolida, os manipula em Excel e insere esses dados tratados no SAP (Melhorias CO-PA) | RPA_Outras_Receitas_ZVV019','','Sim','1','','','','','','08/03/2024'),
('RPA_COTRL_05','Davi Mariano / Erika Alves','Gestão de custos','Sob demanda','MB11','Registrar movimento de mercadoria | RPA_Ajuste_MB11','','Sim','2','','','','','','23/11/2023'),
('RPA_COTRL_06','Erika Alves / Felipe Campanha','Gestão de custos','Execução única','','Atualizar documento fiscal | RPA_J1B2N','','Não','','','','','','','08/02/2024'),
('RPA_COTRL_07','Michelle Christine Haidar Gmachl','Gestão de custos','Sob demanda','NF-03','Faz a compensação em uma conta através da transação NF-03 via nº do documento | RPA_Compensacao_Frete_Pedagio_nDocumento','','Sim','2','','','','','','09/11/2023'),
('RPA_COTRL_08','Luciana Ribeiro Reis Rodrigues','Gestão de custos','Sob demanda','ME32K','Altera a conta razão dos itens dos contratos de compras | RPA_Altera_Cont_Razao_ME32K','','Sim','1','','','','','','02/02/2024'),
('RPA_COTRL_09','Luciana Ribeiro Reis Rodrigues','Gestão de custos','Execução única','','Altera contas razão na tabela T030 via OBYC e PRT3 | RPA_Altera_OBYC','','Não','','','','','','','23/01/2024'),
('RPA_COTRL_10','Luana Sobral','Gestão de custos','Execução única','','RPA_MB51_Series','','Não','','','','','','','07/02/2024'),
('RPA_COTRL_11','Michelle Christine Haidar Gmachl','Gestão de custos','Sob demanda','NF-03','Faz a compensação em uma conta através da transação NF-03 via atribuição | RPA_Compensacao_WE_Venda','','Sim','2','','','','','','05/09/2023'),
('RPA_COTRL_12','Michelle Christine Haidar Gmachl','Gestão de custos','Sob demanda','MM02','Insere preço e data do item por meio da transação MM02 | RPA_MM02','','Sim','1','','','','','','29/09/2023'),
('RPA_COTRL_13','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Insere volume e tarifa fixa no item por meio da transação KP27 | RPA_Despesas_ZVV027','','Sim','1','','','','','','11/10/2023'),
('RPA_COTRL_14','Michelle Christine Haidar Gmachl','Gestão de custos','Sob demanda','KP26','Insere volume e tarifa fixa no item por meio da transação KP26 | RPA_KP26','','Sim','2','','','','','','26/09/2023'),
('RPA_COTRL_15','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Cria as filiais no ciclo ZVV023 | RPA_Cria_Ciclo_ZVV023','','Sim','1','','','','','','19/09/2023'),
('RPA_COTRL_16','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Cria as filiais no ciclo ZVV019 | RPA_Cria_Ciclo_ZVV019','','Sim','1','','','','','','19/09/2023'),
('RPA_COTRL_17','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Exclui as filiais do ciclo porque estão com os centros antigos (cópia QAS) e cria todas as filiais no ciclo com o centro de custo correto | RPA_Cria_Ciclo_ZVV016','','Sim','1','','','','','','18/09/2023'),
('RPA_COTRL_18','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Cria as filiais no ciclo ZVV027 | RPA_Cria_Ciclo_ZVV027','','Sim','1','','','','','','18/09/2023'),
('RPA_COTRL_19','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Cria as filiais no ciclo ZVV022 | RPA_Cria_Ciclo_ZVV022','','Sim','1','','','','','','15/09/2023'),
('RPA_COTRL_20','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','KEU2','Extrai dados do SAP, consolida e os manipula em Excel e insere esses dados tratados no SAP (Melhorias CO-PA). Insere dados na transação KE24 e alimenta os relatórios de margem do BW | RPA_PDD_ZVV016','','Sim','1','','','','','','19/06/2023'),
('RPA_COTRL_21','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','FAGLL03, KEU2','Extrai dados do SAP, consolida e os manipula em Excel e insere esses dados tratados no SAP (Melhorias CO-PA). Insere dados na transação KE24 e alimenta os relatórios de margem do BW | RPA_Resultado_Financeiro_ZVV023','','Sim','1','','','','','','28/06/2023'),
('RPA_COTRL_22','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','FAGLL03, KEU2','Extrai dados do SAP, consolida e os manipula em Excel e insere esses dados tratados no SAP (Melhorias CO-PA). Insere dados na transação KE24 e alimenta os relatórios de margem do BW | RPA_Depreciacoes_ZVV022','','Sim','1','','','','','','27/06/2023'),
('RPA_COTRL_23','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','FAGLL03, KEU2','Extrai dados do SAP, consolida e os manipula em Excel e insere esses dados tratados no SAP (Melhorias CO-PA). Insere dados na transação KE24 e alimenta os relatórios de margem do BW | RPA_Deducoes_ZVV006','','Sim','1','','','','','','13/06/2023'),
('RPA_COTRL_24','Alessandro Pereira / Silmara Tolentino','Gestão de custos','Sob demanda','GS02, ZSD_VENDAS_001','Atualiza os clientes em seus centros no SAP | RPA_ZSD_GS02_Atualizacao_Cliente','','Sim','1','','','','','','22/05/2023'),
('RPA_COTRL_27','Alexandre Mendes','Controle de vasilhames','Execução única','','Cruza informações de localização da base de tanques do SAP com as bases de inventário SIVA/COMERCIAL/REBRANDING/TECNICA/FILIAL. Identifica se a localização dos tanques que estão na base SAP é a mesma que consta nas bases de inventário | RPA_Tanques','','Não','','','','','','','03/01/2023'),
('RPA_COTRL_28','Erika Alves','Gestão de custos','24x7','ZMM0058','Gera o relatório da transação ZMM0058 conforme período e filiais selecionados | RPA_relgasenv','','Sim','3','','Python','VM disponível / usuário','SAP = SACONTROL','','25/05/2023'),
('RPA_COTRL_29','Erika Alves','Gestão de custos','Sob demanda','ZMM0054O','Gera o relatório da transação ZMM0054N conforme período e filiais selecionados | RPA_movgas','','Sim','3','','Python','','','','25/05/2023'),
('RPA_COTRL_30','Erika Alves','Gestão de custos','Sob demanda','MB51, ME23N','RPA_Controladoria','','Sim','2','','Python','','','','25/04/2023'),
('RPA_COTRL_31','Tatiane Cardoso Rodrigues','Definição dos projetos logísticos','Sob demanda','ZSD0240','Cruza as tabelas de logística (visitas) x Monitor x SAP a fim de comparar e trazer divergências entre dados como NFe, recebedor etc | RPA_SIVA_Filiais','','Sim','3','','Python','','','','01/10/2024'),
('RPA_COTRL_33','Erika Alves','Controle de estoque de GLP','24x7','MB51, SE16N, ZMM0051, ZMM0058','Traz os dados do fechamento diário de estoques de gás e recipientes a fim de identificar diferenças operacionais, auxiliando o responsável pelo controle na correção ou ação sobre as diferenças apontadas | RPA_28_AC','','Sim','4','','Python','VM = SDC-VROBO01','SAP = SACONTROL e-mail = rpa@copaenergia.com.br','','31/10/2024'),
('RPA_COTRL_34','Alessandro Pereira','Gestão de custos','Sob demanda','ZCO110','Traz o CPV por material e tipo de custo | RPA_CPV','','Sim','2','','','','','','15/07/2024'),
('RPA_COTRL_35','Alessandro Pereira','Gestão de custos','Sob demanda','Z1CKMLQS','Traz o custo de produção por produto | RPA_Custo_Producao','','Sim','2','','','','','','12/07/2024'),
('RPA_COTRL_36','Luana Sobral Moreira de Souza','Gestão de custos','Sob demanda','MB51, MB5L','Extrai os dados do SAP referentes a perdas e sobras, consolida e gera um template | RPA_Perdas_Sobras','','Sim','3','','','','','','03/07/2024'),
('RPA_COTRL_37','Silmara Ferreira Barros Tolentino','FP&A','Sob demanda','KS02','Realiza bloqueios e desbloqueios via KS02 | RPA_KS02_BLOQ_DESBLOQ','','Sim','1','','','','','','20/12/2024'),
('RPA_COTRL_38','Uracir de Lima Ranzeiro','Controle de frotas','Sob demanda','ZFI_CARGA_LCTO_CTBL','Recebe todos os arquivos do Sem Parar enviados da Logística, trata os dados, realiza cálculos e lança no SAP | RPA_Lancamentos_Sem_Parar','','Sim','1','','','','','','07/01/2025'),
('RPA_COTRL_39','Luana Sobral Moreira de Souza','Gestão de custos','Sob demanda','MB51, MB5L','Mensalmente extrai bases do SAP, trata os dados e consolida em um template informações de perdas e sobras de outros gases | RPA_Perdas_Sobras_Outros_Gases','','Sim','3','','','','','','03/02/2025'),
('RPA_COTRL_40','Alessandro Pereira','Gestão de custos','24x7','SM37, ZCO0003','Extrai relatórios de envasado e granel de GLP e outros gases e os disponibiliza por e-mail para usuários de logística e da controladoria | RPA_Fretes','','Sim','3','8244','Python','VM = SDC-VROBO01','SAP = SACONTROL e-mail = rpa@copaenergia.com.br','','04/09/2025'),
('RPA_COTRL_42','Erika Alves','Gestão de custos','1 vez por mês após fechamento','ZMM0051, MB5B, MB51, ZMM0045','RPA_ZMM0045_Concialiação','','Sim','3','8246','Python','VM disponível','SAP = SACONTROL e-mail = rpa@copaenergia.com.br','','16/05/2025'),
('RPA_COTRL_43','Fábio Vaz','Fiscal','Descontinuado','','Realiza o débito posterior das importações de propelente | RPA_Debito_Posterior_Importação_Propelente','','Não','','9236','','','','','17/03/2025'),
('RPA_COTRL_44','Felipe de Souza','FP&A','Sob demanda','GR55','Extrai informações relacionadas ao processo de operação de tanques de centros de custos de todas as filiais para transformar a DRE em DRE limpa | RPA_Ext_Oper_Tanq','','Sim','2','9394','','','','','04/04/2025'),
('RPA_COTRL_45','Felipe de Souza','FP&A','Sob demanda','GR55','Extrai informações relacionadas aos gastos gerais com fabricação de centros de custos de todas as filiais para transformar a DRE em DRE limpa | RPA_GGF','','Sim','2','9401','','','','','04/04/2025'),
('RPA_COTRL_46','Felipe de Souza','FP&A','Sob demanda','GR55','Extrai informações relacionadas ao processo de carga e descarga de centros de custos de todas as filiais para transformar a DRE em DRE limpa | RPA_Ext_Carg_Desc','','Sim','2','9237','','','','','02/04/2025'),
('RPA_COTRL_47','Érika Alves','Gestão de custos','24x7','ZMM0054N','Atualização automática de mapas de controle - GLP | RPA_movgas_ZMM0054N','','Sim','3','10246','Python','VM = SDC-VROBO01','SAP = SACONTROL','','09/07/2025'),
('RPA_COTRL_48','Érika Alves','Gestão de custos','1 vez por semana - domingo','ZMM0054O','Atualização automática de mapas de controle - outros gases | RPA_movgas_ZMM0054O','','Sim','3','10248','Python','VM = SDC-VROBO01','SAP = SACONTROL','','24/07/2025'),
('RPA_COTRL_49','Mariana Andrade','FP&A','Sob demanda','KS02','Altera o responsável pelo centro de custo | RPA_Mudança_Responsável_CDC','','Sim','2','','','','','Polyana','20/03/2026'),

-- ─── FINANCEIRO ──────────────────────────────────────────────────────────────
('RPA_FINAN_01','Fabiana Soares Martins','Planejamento financeiro','Sob demanda','FBL5N','Altera data e/ou cabeçalho de título | RPA_FBL5N','','Sim','2','','','','','','26/04/2024'),
('RPA_FINAN_09','Katia Lucinari Teixeira','Planejamento financeiro','Descontinuado','','Baixas financeiras com documento SAP | RPA_Baixa_Com_Desconto','','Não','','','','','','','29/12/2023'),
('RPA_FINAN_12','Sueli Ravelli','Planejamento financeiro','Descontinuado','','Baixas de títulos por banco SAP | RPA_Baixa_Titulo_Conta_Banco','','Não','','','','','','','30/05/2023'),
('RPA_FINAN_20','Sueli Ravelli','Planejamento financeiro','Sob demanda','F-49','Baixas financeiras com partidas memorizadas SAP | RPA_LANCAR_ZH_PARTIDA_MEMO','','Sim','2','','','','','','20/04/2023'),
('RPA_FINAN_24','Fabiana Soares Martins','Planejamento financeiro','Sob demanda','FBL5N','RPA_FBL5N_Compensacao (HH YTD 5)','1,67','Sim','2','24384','','','','','26/04/2026'),

-- ─── LOGÍSTICA ───────────────────────────────────────────────────────────────
('RPA_LOGIS_05','Henrique Rocha Correa','Roteirização e programação','Descontinuado','','Altera zona de transporte | Filiais Espelho - RPA_Altera_ZT','','Não','','','','','','','08/03/2023'),
('RPA_LOGIS_06','Henrique Rocha Correa','Roteirização e programação','Descontinuado','','Altera zona de entrega | Filiais Espelho - RPA_Altera_ZE','','Não','','','','','','','08/03/2023'),
('RPA_LOGIS_07','Henrique Rocha Correa','Roteirização e programação','Descontinuado','','Altera centro no CPR | Filiais Espelho - RPA_Altera_Centro_no_CPR','','Não','','','','','','','08/03/2023'),
('RPA_LOGIS_08','Caio Freitas','Roteirização e programação','Descontinuado','','Associar frota aos COs | Filiais Espelho - RPA_BP_Frota - Granel','','Não','','','','','','','09/03/2023'),
('RPA_LOGIS_09','Caio Freitas','Roteirização e programação','Descontinuado','','Associar motorista aos COs | Filiais Espelho - RPA_BP_Motorista - Granel','','Não','','','','','','','30/03/2023')
)
insert into opportunities (
  tenant_id, source, request_type,
  solicitante, area, subarea, processo,
  frequencia, fonte, tipo_processo, fte_horas,
  status, criticidade, responsavel, notas,
  azure_boards_codigo, linguagem, execucao, usuarios_servico, data_conclusao
)
select
  '89c6ee5a-539c-4fad-b77d-62785d353ba5'::uuid,
  'formulario'::opportunity_source,
  'nova_oportunidade'::opportunity_request_type,

  s.solic,

  -- area / subarea derivadas do prefixo do ID original
  case split_part(s.orig, '_', 2)
    when 'COML'  then 'Comercial'  when 'COMP'  then 'Financeira'
    when 'COTRL' then 'Financeira' when 'FINAN' then 'Financeira'
    when 'LOGIS' then 'Operações'  else 'Não informada' end,
  case split_part(s.orig, '_', 2)
    when 'COML'  then 'Comercial'     when 'COMP'  then 'Compras'
    when 'COTRL' then 'Controladoria' when 'FINAN' then 'Financeiro'
    when 'LOGIS' then 'Logística'     else null end,

  -- processo (NOT NULL): descrição da automação, truncada em 300
  left(s.descr, 300),

  nullif(s.freq, ''),
  'Inventário Consolidado 30/06/2026',

  -- tipo_processo: transações SAP como tags
  case
    when s.sap = '' or s.sap = 'Não utiliza SAP' then '{}'::text[]
    else (select coalesce(array_agg(btrim(t)) filter (where btrim(t) <> ''), '{}')
          from unnest(string_to_array(s.sap, ',')) t)
  end,

  nullif(replace(s.hh, ',', '.'), '')::numeric,

  case
    when s.freq  = 'Descontinuado'      then 'descontinuado'
    when s.ativo = 'Não'                then 'descontinuado'
    when s.ativo = 'Em desenvolvimento' then 'desenvolvimento'
    when s.ativo = 'Sim'                then 'producao'
    else 'novo'
  end::opportunity_status,

  case s.nivel when '4' then 'critica' when '3' then 'alta'
               when '2' then 'media'   when '1' then 'baixa'
               else null end::criticidade_level,

  coalesce(nullif(s.resp, ''), 'Danilo'),

  concat_ws(E'\n',
    'ID original: ' || s.orig,
    'Macroprocesso: ' || s.macro,
    case when s.sap <> '' then 'Transações SAP: ' || s.sap end,
    case when length(s.descr) > 300 then 'Descrição completa: ' || s.descr end
  ),

  nullif(s.azure, ''),
  coalesce(nullif(s.ling, ''), 'VBA'),
  coalesce(nullif(s.exec, ''), 'Usuário'),
  coalesce(nullif(s.usr,  ''), 'SAP = usuário da área de negócio'),
  to_date(nullif(s.dt, ''), 'DD/MM/YYYY')

from src s
where not exists (
  select 1 from opportunities o
  where o.tenant_id = '89c6ee5a-539c-4fad-b77d-62785d353ba5'::uuid
    and o.notas like '%ID original: ' || s.orig || '%'
);

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select count(*) as total_no_tenant
from opportunities where tenant_id = '89c6ee5a-539c-4fad-b77d-62785d353ba5';

select subarea, status, count(*)
from opportunities where tenant_id = '89c6ee5a-539c-4fad-b77d-62785d353ba5'
group by 1, 2 order by 1, 3 desc;

select seq_id, area, subarea, left(processo, 60) as processo, status,
       criticidade, fte_horas, linguagem, data_conclusao
from opportunities where tenant_id = '89c6ee5a-539c-4fad-b77d-62785d353ba5'
order by seq_id limit 30;
