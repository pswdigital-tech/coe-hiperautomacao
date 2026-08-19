-- Contagem de linhas de TODAS as tabelas de public/auth/storage.
-- query_to_xml permite contar dinamicamente sem precisar listar tabela a tabela,
-- então o resultado acompanha qualquer evolução futura do schema.
select
  table_schema || '.' || table_name                             as tabela,
  (xpath('/row/cnt/text()', xml_count))[1]::text::bigint        as linhas
from (
  select
    table_schema,
    table_name,
    query_to_xml(
      format('select count(*) as cnt from %I.%I', table_schema, table_name),
      false, true, ''
    ) as xml_count
  from information_schema.tables
  where table_schema in ('public', 'auth', 'storage')
    and table_type = 'BASE TABLE'
) t
order by 1;
