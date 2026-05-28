alter table public.kit_audio_files
  add column if not exists source_type text not null default 'original';

alter table public.kit_audio_files
  add column if not exists generated_from_file_id uuid references public.kit_audio_files(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kit_audio_files_source_type_check'
  ) then
    alter table public.kit_audio_files
      add constraint kit_audio_files_source_type_check
      check (source_type in ('original', 'generated'));
  end if;
end $$;

comment on column public.kit_audio_files.source_type is 'Origem do arquivo: original para arquivos enviados/sincronizados manualmente do R2, generated para arquivos criados por audio_generation_jobs.';
comment on column public.kit_audio_files.generated_from_file_id is 'Arquivo original usado como origem quando o áudio foi gerado por IA.';

create index if not exists kit_audio_files_source_type_idx
  on public.kit_audio_files(kit_id, source_type);

create index if not exists kit_audio_files_generated_from_idx
  on public.kit_audio_files(generated_from_file_id)
  where generated_from_file_id is not null;

create or replace function public.preview_kit_audio_source_type_reconciliation(
  kit_slugs text[] default array['tudo-e-perda', '1000-graus']::text[]
)
returns table (
  kit_slug text,
  tone text,
  voice text,
  r2_key text,
  current_source_type text,
  suggested_source_type text
)
language sql
stable
as $$
  with target_kits as (
    select id, slug
    from public.kits
    where slug = any(kit_slugs)
  )
  select
    k.slug as kit_slug,
    f.tone,
    f.name as voice,
    f.r2_key,
    f.source_type as current_source_type,
    case
      when exists (
        select 1
        from public.audio_generation_jobs j
        where j.kit_id = f.kit_id
          and j.status = 'completed'
          and (
            j.generated_audio_file_id = f.id
            or j.target_r2_key = f.r2_key
          )
      ) then 'generated'
      else 'original'
    end as suggested_source_type
  from target_kits k
  join public.kit_audio_files f on f.kit_id = k.id
  order by k.slug, f.tone, f.name, f.r2_key;
$$;

create or replace function public.reconcile_kit_audio_source_type(
  kit_slugs text[] default array['tudo-e-perda', '1000-graus']::text[]
)
returns table (
  kit_slug text,
  tone text,
  voice text,
  r2_key text,
  previous_source_type text,
  new_source_type text
)
language sql
as $$
  with preview as (
    select *
    from public.preview_kit_audio_source_type_reconciliation(kit_slugs)
  ), changed as (
    select *
    from preview
    where current_source_type is distinct from suggested_source_type
  ), updated as (
    update public.kit_audio_files f
    set source_type = c.suggested_source_type,
        updated_at = now()
    from changed c
    join public.kits k on k.slug = c.kit_slug
    where f.kit_id = k.id
      and f.r2_key = c.r2_key
    returning f.kit_id, f.tone, f.name, f.r2_key, f.source_type
  )
  select
    k.slug as kit_slug,
    u.tone,
    u.name as voice,
    u.r2_key,
    c.current_source_type as previous_source_type,
    u.source_type as new_source_type
  from updated u
  join public.kits k on k.id = u.kit_id
  join changed c on c.kit_slug = k.slug and c.r2_key = u.r2_key
  order by kit_slug, tone, voice, r2_key;
$$;
