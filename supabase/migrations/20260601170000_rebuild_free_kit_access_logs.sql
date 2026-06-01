-- Corrige o histórico de acessos do plano Free.
--
-- Antes, cada reload/entrada no mesmo kit gerava um novo registro em kit_access_logs.
-- A regra correta é contar kits únicos por usuário dentro da janela móvel de 24h.
-- Esta migração remove duplicidades mantendo o primeiro acesso de cada usuário/kit nas últimas 24h
-- e cria um índice parcial para evitar novas duplicidades simultâneas no mesmo dia.

begin;

with ranked_accesses as (
  select
    id,
    row_number() over (
      partition by user_id, kit_id
      order by accessed_at asc, id asc
    ) as rn
  from public.kit_access_logs
  where kit_id is not null
    and accessed_at >= now() - interval '24 hours'
)
delete from public.kit_access_logs logs
using ranked_accesses ranked
where logs.id = ranked.id
  and ranked.rn > 1;

-- Limpa registros órfãos/sem kit, que não devem consumir limite.
delete from public.kit_access_logs
where kit_id is null;

-- Índice auxiliar para acelerar a leitura do limite free.
create index if not exists kit_access_logs_user_accessed_at_idx
on public.kit_access_logs (user_id, accessed_at desc);

create index if not exists kit_access_logs_user_kit_accessed_at_idx
on public.kit_access_logs (user_id, kit_id, accessed_at desc)
where kit_id is not null;

commit;
