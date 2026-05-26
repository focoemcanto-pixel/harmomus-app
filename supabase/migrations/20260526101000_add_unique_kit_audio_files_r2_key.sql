create unique index if not exists kit_audio_files_kit_id_r2_key_unique
on public.kit_audio_files (kit_id, r2_key)
where r2_key is not null;
