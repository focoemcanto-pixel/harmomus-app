update public.kit_audio_files af
set
  source_type = case
    when af.tone in ('C#', 'D', 'D#') then 'original'
    else 'generated'
  end,
  updated_at = now()
from public.kits k
where k.id = af.kit_id
  and k.slug = 'tudo-e-perda';

-- Validation query for production checks:
-- select
--   k.name as kit_name,
--   k.slug,
--   af.tone,
--   af.name as voice_name,
--   af.source_type,
--   af.r2_key
-- from public.kit_audio_files af
-- join public.kits k on k.id = af.kit_id
-- where k.slug = 'tudo-e-perda'
-- order by af.tone, af.name;
