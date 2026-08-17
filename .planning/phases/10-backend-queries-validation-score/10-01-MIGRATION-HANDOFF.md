# 10-01 — Migration 0012 Handoff (apply manual)

**Migration:** `supabase/migrations/0012_public_rpc_frequency.sql`
**Modo:** write-only (apply manual no Supabase Cloud SQL Editor — NÃO `supabase db push`).
**Projeto:** `vxgthycrjetniejsjmee`
**Pré-requisitos:** 0001..0011 aplicadas (confirmado: 0011 vivo, `opportunities.tempo` é `frequency_bucket`).

## Por quê

0011 mudou `opportunities.tempo` de `time_bucket` → `frequency_bucket`. A RPC pública
`create_public_opportunity` (definição **viva** confirmada por introspecção — 18 params,
herdada de 0005 + hardening de 0007) ainda mapeava `p_tempo` no domínio antigo:

```sql
case when p_tempo in ('pequeno','medio','grande') then p_tempo::time_bucket else null end
```

Pós-0011 isso grava **NULL silencioso** para qualquer valor de frequência → regressão
latente do formulário público anônimo (Phase 7.5). 0012 recria a função com assinatura e
corpo idênticos, mudando só a linha de `p_tempo` para o domínio de frequência.

> **Correção pós-apply (descoberta no smoke):** existiam **DOIS overloads** —
> 18 params (legado) e 21 params (de 0009, com `p_request_type/p_observacao/p_risco`
> DEFAULT). A app chama o de 21 params. Como o de 21 tem defaults, uma chamada de 18 args
> casava com ambos → `42725 function is not unique`, e o de 21 ainda tinha o mapeamento
> antigo. **0012 (revisado)** agora: (1) DROP do overload de 18 params; (2) `create or
> replace` do de 21 params com `p_tempo`→`frequency_bucket`. Resolve a ambiguidade E corrige
> a regressão no overload que a app usa.

## Como aplicar

1. Supabase Dashboard → projeto `vxgthycrjetniejsjmee` → **SQL Editor**.
2. Colar o conteúdo **inteiro** de `supabase/migrations/0012_public_rpc_frequency.sql` e **Run**.
3. Smoke (substituir `<slug>` por um tenant ativo, ex. o slug FGCoop):

```sql
select public.create_public_opportunity(
  '<slug>', 'smoke', 'smoke@x.z', 'TI', '', 'proc smoke',
  '', '', '', '', '', '{}'::text[], '{}'::text[],
  'medio', 'medio', 'mensal', 3::smallint, '{}'::jsonb);
-- deve retornar um uuid

select tempo from opportunities where solicitante='smoke';  -- deve mostrar 'mensal'

delete from opportunities where solicitante='smoke';        -- limpar
```

4. Responder ao agente com **"applied"** (ou colar o erro do SQL Editor).

> Tipos: 0012 não muda Row types (só o corpo da função), então **não** é preciso
> regenerar `lib/database.types.ts` após o apply.
