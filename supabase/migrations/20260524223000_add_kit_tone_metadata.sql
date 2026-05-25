alter table public.kits
  add column if not exists original_tone text,
  add column if not exists default_tone text,
  add column if not exists allow_pitch_shift boolean not null default true,
  add column if not exists max_pitch_shift_semitones integer not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kits_max_pitch_shift_semitones_check'
  ) then
    alter table public.kits
      add constraint kits_max_pitch_shift_semitones_check
      check (max_pitch_shift_semitones >= 0 and max_pitch_shift_semitones <= 12);
  end if;
end $$;

comment on column public.kits.original_tone is 'Tom original oficial do arranjo.';
comment on column public.kits.default_tone is 'Tom inicial preferencial do player.';
comment on column public.kits.allow_pitch_shift is 'Define se o kit permite modulação inteligente via pitch shifting.';
comment on column public.kits.max_pitch_shift_semitones is 'Limite máximo de semitons para modulação inteligente.';

create index if not exists idx_kits_tone_metadata
  on public.kits(original_tone, default_tone, allow_pitch_shift);
