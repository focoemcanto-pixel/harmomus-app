-- Mantém kit_access_logs compatível com o limite Free por VISITAS válidas.
--
-- A regra de negócio é contar cada registro da janela móvel de 24h (count(*)),
-- inclusive visitas repetidas ao mesmo kit. Portanto esta migração não remove
-- duplicidades por kit nem cria restrição única em (user_id, kit_id).

begin;

-- Limpa apenas registros órfãos/sem kit, que não representam visita válida.
delete from public.kit_access_logs
where kit_id is null;

-- Índices auxiliares para acelerar a leitura cronológica e a contagem do limite free.
create index if not exists kit_access_logs_user_accessed_at_idx
on public.kit_access_logs (user_id, accessed_at desc);

create index if not exists kit_access_logs_user_kit_accessed_at_idx
on public.kit_access_logs (user_id, kit_id, accessed_at desc)
where kit_id is not null;

commit;
