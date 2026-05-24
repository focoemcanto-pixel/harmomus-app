alter table public.kits
  add column if not exists original_tone text,
  add column if not exists default_tone text,
  add column if not exists allow_pitch_shift boolean not null default true,
  add column if not exists max_pitch_shift_semitones integer not null default 2;

comment on column public.kits.original_tone is 'Tom original do arranjo, usado como referência musical e de tessitura.';
comment on column public.kits.default_tone is 'Tom inicial do player. Quando vazio, o player usa original_tone ou o primeiro tom disponível.';
comment on column public.kits.allow_pitch_shift is 'Permite que o kit use modulação artificial quando o tom real não existir.';
comment on column public.kits.max_pitch_shift_semitones is 'Limite máximo de semitons para modulação a partir do áudio real mais próximo.';
